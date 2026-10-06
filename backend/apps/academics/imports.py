"""Impor mata pelajaran, kelas, dan pengampu dari Excel (khusus admin).

Setiap baris diperiksa dengan serializer yang sama dengan form tambah data. Impor hanya
dijalankan jika SEMUA baris benar (lihat apps/common/excel.py).
"""

from django.db import transaction

from apps.accounts.models import Role
from apps.common.excel import Column, build_template, first_errors, normalize, read_rows

from .serializers import ClassroomSerializer, SubjectSerializer, TeachingAssignmentSerializer


def current_academic_year(school):
    year = school.classrooms.order_by("-academic_year").values_list("academic_year", flat=True).first()
    if year:
        return year
    from django.utils import timezone

    now = timezone.localdate()
    start = now.year if now.month >= 7 else now.year - 1
    return f"{start}/{start + 1}"


def teacher_usernames(school):
    return list(
        school.members.filter(role=Role.TEACHER, is_active=True)
        .order_by("username")
        .values_list("username", flat=True)
    )


def _check_all(items, make_serializer, labels):
    """items: [{"row", "data", "errors"}]. Mengembalikan baris pratinjau + serializer siap simpan."""
    rows = []
    for item in items:
        serializer = make_serializer(item["data"])
        errors = list(item["errors"])
        if serializer is not None and not errors and not serializer.is_valid():
            errors += first_errors(serializer.errors, labels)
        rows.append(
            {"preview": {"row": item["row"], **item["preview"], "errors": errors}, "serializer": serializer}
        )
    return rows


@transaction.atomic
def _save_all(rows):
    for row in rows:
        row["serializer"].save()
    return len(rows)


def _duplicates(items, key_of, label):
    seen = {}
    for item in items:
        key = key_of(item)
        if not key:
            continue
        if key in seen:
            item["errors"].append(f"{label} sama dengan {seen[key]}.")
        else:
            seen[key] = f"baris {item['row']}"


# ---------------------------------------------------------------- mata pelajaran

SUBJECT_COLUMNS = [
    Column("code", "Kode", required=True, width=14, text=True),
    Column("name", "Nama Mapel", required=True, width=40),
]


def subject_template():
    return build_template(
        "Mapel",
        SUBJECT_COLUMNS,
        "Template Impor Mata Pelajaran",
        ["Kode: singkat & unik, huruf besar otomatis (mis. PWEB, MTK, BARAB)."],
        [["PWEB", "Pemrograman Web"], ["MTK", "Matematika"], ["BARAB", "Bahasa Arab"]],
    )


def check_subjects(file, school):
    items = [
        {"row": r["row"], "data": r["data"], "preview": r["data"], "errors": []}
        for r in read_rows(file, "Mapel", SUBJECT_COLUMNS)
    ]
    _duplicates(items, lambda i: i["data"]["code"].upper(), "Kode")
    labels = {"code": "Kode", "name": "Nama mapel"}
    rows = _check_all(items, lambda d: SubjectSerializer(data=d, context={"school": school}), labels)
    return [r["preview"] for r in rows], lambda: _save_all(rows)


# ---------------------------------------------------------------- kelas


def classroom_columns(school):
    return [
        Column("name", "Nama Kelas", required=True, width=16),
        Column("grade", "Tingkat", required=True, width=10, choices=school.grades),
        Column("major", "Jurusan", required=True, width=12),
        Column("academic_year", "Tahun Ajaran", required=True, width=14, text=True),
        Column("homeroom", "Username Wali Kelas", width=22, choices=teacher_usernames(school) or None),
    ]


def classroom_template(school):
    year = current_academic_year(school)
    first, second = school.grades[0], school.grades[1]
    return build_template(
        "Kelas",
        classroom_columns(school),
        "Template Impor Kelas",
        [
            f"Tingkat: {', '.join(school.grades)}. Tahun Ajaran: format 2026/2027.",
            "Username Wali Kelas: username akun guru (opsional). Buat akun guru lebih dulu di menu Pengguna.",
        ],
        [[f"{first} A", first, "UMUM", year, "guru.rpl"], [f"{second} B", second, "UMUM", year, ""]],
    )


def check_classrooms(file, school):
    teachers = {
        u.username.lower(): u for u in school.members.filter(role=Role.TEACHER)
    }  # termasuk nonaktif, agar pesannya jelas
    items = []
    for r in read_rows(file, "Kelas", classroom_columns(school)):
        data, errors = dict(r["data"]), []
        homeroom = data.pop("homeroom")
        teacher = teachers.get(homeroom.lower()) if homeroom else None
        if homeroom and teacher is None:
            errors.append(f"Guru dengan username '{homeroom}' tidak ditemukan.")
        data["homeroom_teacher"] = teacher.id if teacher else None
        items.append({"row": r["row"], "data": data, "preview": r["data"], "errors": errors})
    _duplicates(
        items, lambda i: (normalize(i["data"]["name"]), i["data"]["academic_year"]), "Kelas & tahun ajaran"
    )
    labels = {"name": "Nama kelas", "grade": "Tingkat", "major": "Jurusan", "academic_year": "Tahun ajaran",
              "homeroom_teacher": "Wali kelas"}  # fmt: skip
    rows = _check_all(items, lambda d: ClassroomSerializer(data=d, context={"school": school}), labels)
    return [r["preview"] for r in rows], lambda: _save_all(rows)


# ---------------------------------------------------------------- pengampu


def assignment_columns(school):
    year = current_academic_year(school)
    classrooms = list(
        school.classrooms.filter(academic_year=year).order_by("grade", "name").values_list("name", flat=True)
    )
    subjects = list(school.subjects.order_by("code").values_list("code", flat=True))
    return [
        Column("classroom", "Kelas", required=True, width=16, choices=classrooms or None),
        Column("academic_year", "Tahun Ajaran", width=14, text=True),
        Column("subject", "Kode Mapel", required=True, width=14, text=True, choices=subjects or None),
        Column(
            "teacher", "Username Guru", required=True, width=22, choices=teacher_usernames(school) or None
        ),
    ]


def assignment_template(school):
    year = current_academic_year(school)
    return build_template(
        "Pengampu",
        assignment_columns(school),
        "Template Impor Pengampu (Guru - Mapel - Kelas)",
        [
            f"Tahun Ajaran: kosongkan untuk memakai tahun ajaran terbaru ({year}).",
            "Kelas, mapel, dan akun guru harus sudah ada. Pilih dari dropdown agar tidak salah ketik.",
        ],
        [["XI RPL 1", "", "PWEB", "guru.rpl"], ["X RPL 1", year, "BINDO", "bu.siti"]],
    )


def check_assignments(file, school):
    year = current_academic_year(school)
    # Hanya data sekolah ini, agar pengampu tidak tersambung ke kelas/mapel/guru sekolah lain.
    classrooms = {(normalize(c.name), c.academic_year): c for c in school.classrooms.all()}
    subjects = {s.code.upper(): s for s in school.subjects.all()}
    teachers = {u.username.lower(): u for u in school.members.filter(role=Role.TEACHER)}
    items = []
    for r in read_rows(file, "Pengampu", assignment_columns(school)):
        data, errors = r["data"], []
        row_year = data["academic_year"] or year
        classroom = classrooms.get((normalize(data["classroom"]), row_year))
        subject = subjects.get(data["subject"].upper())
        teacher = teachers.get(data["teacher"].lower())
        if classroom is None:
            errors.append(f"Kelas '{data['classroom']}' ({row_year}) tidak ditemukan.")
        if subject is None:
            errors.append(f"Mapel dengan kode '{data['subject']}' tidak ditemukan.")
        if teacher is None:
            errors.append(f"Guru dengan username '{data['teacher']}' tidak ditemukan.")
        payload = {
            "classroom": classroom.id if classroom else None,
            "subject": subject.id if subject else None,
            "teacher": teacher.id if teacher else None,
        }
        items.append(
            {
                "row": r["row"],
                "data": payload,
                "preview": {**data, "academic_year": row_year},
                "errors": errors,
            }
        )
    _duplicates(
        items,
        lambda i: tuple(i["data"].values()) if all(i["data"].values()) else None,
        "Pengampu",
    )
    labels = {"classroom": "Kelas", "subject": "Mapel", "teacher": "Guru"}
    rows = _check_all(
        items, lambda d: TeachingAssignmentSerializer(data=d, context={"school": school}), labels
    )
    return [r["preview"] for r in rows], lambda: _save_all(rows)
