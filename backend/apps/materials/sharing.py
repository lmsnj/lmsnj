"""Berbagi materi antar guru.

- Tim pengampu (beberapa guru satu mapel di kelas yang sama) otomatis memakai materi yang sama; lihat
  TeachingAssignment.team dan progress.py. Modul ini menangani dua hal lain:
- `copy_materials`: menyalin materi ke kelas-mapel LAIN (kelas paralel atau kelas tahun ajaran baru).
  Salinan selalu DRAF, jadi guru kelas tujuan memeriksa lalu menerbitkannya sendiri. Siswanya berbeda,
  jadi progres tidak ikut disalin.
- `merge_materials`: menggabungkan materi kembar di SATU kelas-mapel (terlanjur diunggah dua guru).
  Siswa yang sudah menuntaskan materi yang dihapus dianggap tuntas di materi yang dipertahankan.
"""

from django.core.files import File
from django.db import transaction
from django.db.models import Max
from rest_framework.exceptions import ValidationError

from apps.academics.models import TeachingAssignment

from .models import Chapter, CodeExercise, Material, MaterialItem, MaterialProgress
from .progress import progress_table, sort_key

# Kolom materi yang ikut disalin apa adanya. Syarat tugas/asesmen TIDAK disalin karena tugas & asesmen
# milik kelas asal.
COPIED_FIELDS = [
    "title",
    "description",
    "material_type",
    "original_filename",
    "url",
    "objectives",
    "concepts",
    "objective_quizzes",
    "practice_quiz",
    "require_teacher_approval",
    "require_reflection",
]
ITEM_FIELDS = ["title", "material_type", "original_filename", "url", "order"]
EXERCISE_FIELDS = ["order", "title", "language", "instructions", "starter_code", "checks", "variables"]


def copy_targets(source, school):
    """Kelas-mapel tujuan salinan: mapel yang sama di kelas lain sekolah ini (satu baris per kelas)."""
    assignments = (
        TeachingAssignment.objects.filter(subject_id=source.subject_id, classroom__school=school)
        .exclude(classroom_id=source.classroom_id)
        .select_related("classroom", "teacher")
        .order_by("-classroom__academic_year", "classroom__name", "id")
    )
    targets = {}
    for assignment in assignments:
        target = targets.setdefault(
            assignment.classroom_id,
            {
                "teaching_assignment": assignment.id,
                "classroom_name": assignment.classroom.name,
                "academic_year": assignment.classroom.academic_year,
                "teachers": [],
            },
        )
        target["teachers"].append(assignment.teacher.full_name)
    return list(targets.values())


def _copy_file(source, target, saved):
    """Salin isi file ke nama acak baru (file asal tetap milik materi asal)."""
    try:
        with source.open("rb") as handle:
            target.save(source.name, File(handle), save=False)
    except FileNotFoundError:
        raise ValidationError(
            {"detail": "Ada file materi yang hilang dari server sehingga tidak bisa disalin."}
        )
    saved.append(target)


def _target_chapter(chapter, target, cache):
    """Bab tujuan dengan judul sama (dibuat jika belum ada, tanpa Post Test)."""
    if chapter is None:
        return None
    if chapter.title not in cache:
        team = target.team()
        found = Chapter.objects.filter(teaching_assignment__in=team, title=chapter.title).first()
        if found is None:
            last = Chapter.objects.filter(teaching_assignment__in=team).aggregate(last=Max("order"))["last"]
            found = Chapter.objects.create(
                teaching_assignment=target,
                title=chapter.title,
                description=chapter.description,
                order=(last or 0) + 1,
            )
        cache[chapter.title] = found
    return cache[chapter.title]


def copy_materials(materials, target, user):
    """Salin materi (beserta konten tambahan, capaian, kuis, latihan, soal praktik, dan babnya) ke kelas-mapel `target`.
    Mengembalikan daftar materi baru."""
    team = target.team()
    last = Material.objects.filter(teaching_assignment__in=team).aggregate(last=Max("order"))["last"] or 0
    chapters = {}  # judul bab asal -> bab tujuan
    saved_files = []
    copies = []
    try:
        with transaction.atomic():
            for number, material in enumerate(sorted(materials, key=sort_key), start=1):
                copy = Material(
                    teaching_assignment=target,
                    chapter=_target_chapter(material.chapter, target, chapters),
                    is_published=False,
                    order=last + number,
                    created_by=user,
                    **{field: getattr(material, field) for field in COPIED_FIELDS},
                )
                if material.file:
                    _copy_file(material.file, copy.file, saved_files)
                copy.save()
                for item in material.items.all():
                    new_item = MaterialItem(
                        material=copy, **{field: getattr(item, field) for field in ITEM_FIELDS}
                    )
                    if item.file:
                        _copy_file(item.file, new_item.file, saved_files)
                    new_item.save()
                # Soal Praktik ikut (pekerjaan siswa tidak).
                CodeExercise.objects.bulk_create(
                    CodeExercise(
                        material=copy, **{field: getattr(exercise, field) for field in EXERCISE_FIELDS}
                    )
                    for exercise in material.exercises.all()
                )
                copies.append(copy)
    except Exception:
        # Data dibatalkan transaksi; file yang sudah tersalin dihapus agar tidak menjadi sampah.
        for field_file in saved_files:
            field_file.storage.delete(field_file.name)
        raise
    return copies


@transaction.atomic
def merge_materials(keep, duplicate, user):
    """Gabungkan `duplicate` ke `keep` (satu kelas-mapel), lalu hapus `duplicate`.

    Capaian kedua materi bisa berbeda, jadi progres tidak dipindah satu per satu: siswa yang sudah
    MENUNTASKAN materi kembar ditandai tercapai di materi yang dipertahankan (`unlocked`), cerita
    reflektifnya dipindah jika belum ada, dan pengesahan guru ikut. Mengembalikan jumlah siswa yang
    ditandai tercapai."""
    if keep.id == duplicate.id:
        raise ValidationError({"duplicate": "Pilih materi lain yang akan digabungkan."})
    if keep.teaching_assignment.class_subject != duplicate.teaching_assignment.class_subject:
        raise ValidationError({"duplicate": "Materi yang digabung harus dari kelas-mapel yang sama."})

    old = list(MaterialProgress.objects.filter(material=duplicate))
    table = progress_table([duplicate], [p.student_id for p in old])
    note = f"Tercapai lewat materi yang digabung: {duplicate.title}"[:200]
    completed = 0
    for previous in old:
        progress, _ = MaterialProgress.objects.get_or_create(material=keep, student_id=previous.student_id)
        if table[(duplicate.id, previous.student_id)]["completed"] and not progress.unlocked:
            progress.unlocked = True
            progress.note = progress.note or note
            completed += 1
        if not progress.reflection.strip() and previous.reflection.strip():
            progress.reflection = previous.reflection
            progress.reflected_at = previous.reflected_at
        progress.teacher_approved = progress.teacher_approved or previous.teacher_approved
        progress.updated_by = user
        progress.save()
    duplicate.delete()
    return completed
