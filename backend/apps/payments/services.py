"""Status pembayaran: baca (dipakai juga syarat kartu ujian), simpan, dan impor Excel."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.academics.models import validate_academic_year
from apps.accounts.models import Role
from apps.common.excel import Column, build_template, read_rows

from .models import QUARTERS, PaymentStatus


def paid_quarters(student_ids, academic_year):
    """{student_id: lunas sampai triwulan ke-N}. Siswa tanpa catatan = 0."""
    found = dict(
        PaymentStatus.objects.filter(student_id__in=student_ids, academic_year=academic_year).values_list(
            "student_id", "paid_quarter"
        )
    )
    return {student_id: found.get(student_id, 0) for student_id in student_ids}


@transaction.atomic
def save_statuses(academic_year, records, updated_by):
    """records = [{student, paid_quarter, note}]. Membuat atau mengubah catatan tahun ajaran itu."""
    for record in records:
        PaymentStatus.objects.update_or_create(
            student=record["student"],
            academic_year=academic_year,
            defaults={
                "paid_quarter": record["paid_quarter"],
                "note": record.get("note", ""),
                "updated_by": updated_by,
            },
        )
    return len(records)


# ---------------------------------------------------------------- impor Excel

QUARTER_CHOICES = [str(n) for n in range(QUARTERS + 1)]
COLUMNS = [
    Column("nis", "NIS", required=True, width=14, text=True),
    Column("full_name", "Nama Siswa", width=30),
    Column("academic_year", "Tahun Ajaran", width=14, text=True),
    Column("paid_quarter", "Lunas Sampai Triwulan", required=True, width=22, choices=QUARTER_CHOICES),
    Column("note", "Keterangan", width=30),
]


def current_year(school):
    return school.classrooms.order_by("-academic_year").values_list("academic_year", flat=True).first()


def template(school):
    year = current_year(school) or "2026/2027"
    return build_template(
        "Pembayaran",
        COLUMNS,
        "Template Impor Status Pembayaran",
        [
            "NIS: NIS siswa di sekolah ini. Nama Siswa hanya pengingat (tidak dipakai untuk mencocokkan).",
            f"Tahun Ajaran: kosongkan untuk memakai tahun ajaran terbaru ({year}).",
            "Lunas Sampai Triwulan: 0 (belum ada yang lunas) sampai 4 (lunas satu tahun).",
        ],
        [["26001", "Muhammad Rizki", "", "2", ""], ["26002", "Aisyah Putri", year, "4", "Lunas"]],
    )


def check_import(file, school):
    """Periksa file. Mengembalikan (baris pratinjau, fungsi simpan)."""
    default_year = current_year(school)
    students = {s.nis: s for s in school.members.filter(role=Role.STUDENT).exclude(nis=None)}
    rows, records, seen = [], [], {}
    for item in read_rows(file, "Pembayaran", COLUMNS):
        data, errors = item["data"], []
        student = students.get(data["nis"])
        if student is None:
            errors.append(f"Siswa dengan NIS {data['nis']} tidak ditemukan di sekolah ini.")
        year = data["academic_year"] or default_year
        try:
            validate_academic_year(year or "")
        except DjangoValidationError as error:
            errors.extend(error.messages)
        if data["paid_quarter"] not in QUARTER_CHOICES:
            errors.append(f"Lunas Sampai Triwulan harus angka 0 sampai {QUARTERS}.")
        key = (data["nis"], year)
        if key in seen:
            errors.append(f"NIS & tahun ajaran sama dengan baris {seen[key]}.")
        seen.setdefault(key, item["row"])
        rows.append(
            {
                "row": item["row"],
                "nis": data["nis"],
                "full_name": student.full_name if student else data["full_name"],
                "academic_year": year,
                "paid_quarter": data["paid_quarter"],
                "errors": errors,
            }
        )
        if not errors:
            records.append(
                {
                    "student": student,
                    "year": year,
                    "paid_quarter": int(data["paid_quarter"]),
                    "note": data["note"],
                }
            )

    def save(updated_by=None):
        with transaction.atomic():
            for record in records:
                save_statuses(record["year"], [record], updated_by)
        return len(records)

    return rows, save


def validate_records(records, school):
    """Siswa di records harus siswa sekolah ini."""
    allowed = set(school.members.filter(role=Role.STUDENT).values_list("id", flat=True))
    outsiders = [r["student"].full_name for r in records if r["student"].id not in allowed]
    if outsiders:
        raise ValidationError({"records": f"Bukan siswa sekolah ini: {', '.join(outsiders)}."})
