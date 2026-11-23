"""Aturan penilaian langsung: siapa saja siswanya, KKM yang berlaku, dan menyimpan nilai per sel."""

from django.db import transaction
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import Role, User
from apps.school_settings.services import SettingReader, feature_enabled

from .models import EntryStatus, GradeEntry, GradeType
from .scales import ScaleError, clean_value

FEATURE = "penilaian_langsung"

# Jenis penilaian awal (spesifikasi Mapel Umum Tahap 3); admin bebas mengubah setelah dibuat.
STARTER_TYPES = [
    ("Tugas Kertas", "formatif"),
    ("Ulangan Kertas", "sumatif"),
    ("Lisan", "formatif"),
    ("Praktik di Kelas", "formatif"),
    ("Sikap", "formatif"),
    ("Kuis QR", "formatif"),
]


def ensure_enabled(school):
    """Menulis penilaian hanya jika fitur menyala; data yang sudah ada tetap bisa dibaca."""
    if not feature_enabled(school, FEATURE):
        raise PermissionDenied("Fitur Penilaian Langsung belum diaktifkan untuk sekolah ini.")


def create_starter_types(school):
    """Buat jenis penilaian awal jika sekolah belum punya satu pun. Mengembalikan jumlah yang dibuat."""
    if GradeType.objects.filter(school=school).exists():
        raise ValidationError({"detail": "Sekolah ini sudah punya jenis penilaian."})
    GradeType.objects.bulk_create(
        GradeType(school=school, name=name, group=group, order=order)
        for order, (name, group) in enumerate(STARTER_TYPES, start=1)
    )
    return len(STARTER_TYPES)


def scale_snapshot(school):
    """(skala, rentang predikat) sekolah saat kegiatan dibuat (skala hanya diatur per sekolah)."""
    reader = SettingReader(school)
    scale = reader.get("nilai.skala")
    bands = reader.get("nilai.predikat") if scale == "predikat" else None
    return scale, bands


def kkm_for(activity):
    assignment = activity.teaching_assignment
    reader = SettingReader(assignment.classroom.school)
    return reader.get("nilai.kkm", classroom=assignment.classroom_id, subject=assignment.subject_id)


def students_of(activity):
    """Siswa aktif di kelas itu + siswa yang sudah punya nilai (mis. sudah pindah kelas), urut nama."""
    classroom_id = activity.teaching_assignment.classroom_id
    graded = activity.entries.values("student_id")
    return (
        User.objects.filter(role=Role.STUDENT)
        .filter(Q(classroom_id=classroom_id, is_active=True) | Q(pk__in=graded))
        .distinct()
        .order_by("full_name", "id")
    )


def score_rows(activity):
    kkm = kkm_for(activity)
    entries = {e.student_id: e for e in activity.entries.all()}
    rows = []
    for student in students_of(activity):
        entry = entries.get(student.pk)
        score = entry.score if entry else None
        rows.append(
            {
                "student": student.pk,
                "full_name": student.full_name,
                "nis": student.nis,
                "value": entry.value if entry else "",
                "score": score,
                "status": entry.status if entry else EntryStatus.PRESENT,
                "note": entry.note if entry else "",
                "below_kkm": score is not None and score < kkm,
            }
        )
    return {"kkm": kkm, "rows": rows}


@transaction.atomic
def save_scores(activity, records, user):
    """Simpan banyak sel sekaligus (semua atau tidak sama sekali). Sel kosong + hadir + tanpa catatan
    = nilai dihapus. Error dikembalikan per siswa: {"records": {id_siswa: pesan}}."""
    allowed = set(students_of(activity).values_list("pk", flat=True))
    errors = {}
    cleaned = []
    for record in records:
        student_id = record["student"]
        if student_id not in allowed:
            errors[str(student_id)] = "Siswa ini bukan anggota kelas."
            continue
        status = record.get("status", EntryStatus.PRESENT)
        raw = str(record.get("value", "") or "").strip()
        note = record.get("note", "")
        value, score = "", None
        if status == EntryStatus.PRESENT and raw:
            try:
                value, score = clean_value(activity.scale, raw, activity.bands)
            except ScaleError as error:
                errors[str(student_id)] = str(error)
                continue
        cleaned.append((student_id, status, value, score, note))
    if errors:
        raise ValidationError({"records": errors})

    for student_id, status, value, score, note in cleaned:
        if status == EntryStatus.PRESENT and not value and not note:
            GradeEntry.objects.filter(activity=activity, student_id=student_id).delete()
            continue
        GradeEntry.objects.update_or_create(
            activity=activity,
            student_id=student_id,
            defaults={"status": status, "value": value, "score": score, "note": note, "updated_by": user},
        )
    return len(cleaned)
