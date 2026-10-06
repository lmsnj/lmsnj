"""Tahun ajaran baru: kenaikan kelas seluruh siswa di SATU sekolah.

Aturan (tingkat mengikuti jenjang sekolah, lihat `School.grades`; contoh di bawah untuk SMA/SMK):
- Kelas X naik ke XI, XI naik ke XII: dibuat kelas baru di tahun ajaran baru dengan nama yang
  tingkatnya diganti ("X RPL 1" -> "XI RPL 1"), lalu siswanya dipindahkan ke sana.
- Siswa tingkat terakhir (XII, IX, atau VI) lulus: dikeluarkan dari kelas; akunnya dinonaktifkan
  atau dibiarkan aktif.
- Siswa yang "tinggal kelas" dipindah ke kelas bernama sama (tingkat sama) di tahun ajaran baru.
- Kelas tingkat pertama (X, VII, atau I) bisa dibuat ulang dalam keadaan kosong, siap diisi siswa baru.
- Pengampu kelas baru bisa disalin dari kelas bernama sama di tahun ajaran lama (guru biasanya
  mengajar mapel yang sama di tingkat yang sama). Wali kelas bisa ikut naik bersama siswanya.
- Data tahun ajaran lama (kelas, pengampu, materi, tugas, nilai) TIDAK dihapus.
- Kelas yang sudah ada di tahun ajaran baru dipakai ulang, jadi proses aman diulang.
"""

import re

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Role, User

from .models import TeachingAssignment, validate_academic_year

# Angka romawi di awal nama kelas. Yang lebih panjang ditulis lebih dulu (XII sebelum XI sebelum X).
GRADE_PREFIX = re.compile(r"^\s*(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b", re.IGNORECASE)

# Pilihan untuk siswa kelas XII yang lulus.
GRADUATE_DEACTIVATE = "deactivate"
GRADUATE_KEEP = "keep"


def next_grade(grade, grades):
    """Dengan grades = ["X", "XI", "XII"]: X -> XI, XI -> XII, XII -> None (lulus)."""
    index = grades.index(grade)
    return grades[index + 1] if index + 1 < len(grades) else None


def renamed(name, grade):
    """Ganti tingkat di awal nama kelas: ('X RPL 1', 'XI') -> 'XI RPL 1'.
    Nama tanpa tingkat di depan diberi awalan tingkat baru: ('RPL A', 'XI') -> 'XI RPL A'."""
    if GRADE_PREFIX.match(name):
        return GRADE_PREFIX.sub(grade, name, count=1).strip()
    return f"{grade} {name.strip()}"


def suggest_next_year(year):
    """'2026/2027' -> '2027/2028'."""
    start = int(year.split("/")[0]) + 1
    return f"{start}/{start + 1}"


def latest_academic_year(school):
    return school.classrooms.order_by("-academic_year").values_list("academic_year", flat=True).first()


def check_years(school, from_year, to_year):
    from django.core.exceptions import ValidationError as DjangoValidationError

    for field, value in (("from_year", from_year), ("to_year", to_year)):
        try:
            validate_academic_year(value or "")
        except DjangoValidationError as error:
            raise ValidationError({field: error.messages})
    if to_year <= from_year:
        raise ValidationError({"to_year": "Tahun ajaran baru harus setelah tahun ajaran asal."})
    if not school.classrooms.filter(academic_year=from_year).exists():
        raise ValidationError({"from_year": f"Tidak ada kelas di tahun ajaran {from_year}."})


def _source_classrooms(school, from_year):
    return (
        school.classrooms.filter(academic_year=from_year)
        .select_related("homeroom_teacher")
        .prefetch_related("students")
        .order_by("grade", "name")
    )


def build_plan(school, from_year, to_year, recreate_first_grade=True):
    """Rencana kenaikan kelas untuk pratinjau (belum mengubah data)."""
    check_years(school, from_year, to_year)
    grades = school.grades
    existing = set(school.classrooms.filter(academic_year=to_year).values_list("name", flat=True))
    assignment_counts = {}
    for classroom_id in TeachingAssignment.objects.filter(
        classroom__school=school, classroom__academic_year=from_year
    ).values_list("classroom_id", flat=True):
        assignment_counts[classroom_id] = assignment_counts.get(classroom_id, 0) + 1

    classes, new_first_grade = [], []
    for classroom in _source_classrooms(school, from_year):
        target_grade = next_grade(classroom.grade, grades)
        target_name = renamed(classroom.name, target_grade) if target_grade else None
        students = sorted(classroom.students.all(), key=lambda s: s.full_name)
        classes.append(
            {
                "id": classroom.id,
                "name": classroom.name,
                "grade": classroom.grade,
                "major": classroom.major,
                "homeroom_teacher_name": getattr(classroom.homeroom_teacher, "full_name", None),
                "assignment_count": assignment_counts.get(classroom.id, 0),
                "action": "promote" if target_grade else "graduate",
                "target_name": target_name,
                "target_grade": target_grade,
                "target_exists": target_name in existing if target_name else False,
                "students": [{"id": s.id, "full_name": s.full_name, "nis": s.nis} for s in students],
            }
        )
        if recreate_first_grade and classroom.grade == grades[0]:
            new_first_grade.append(
                {"name": classroom.name, "major": classroom.major, "exists": classroom.name in existing}
            )

    return {
        "from_year": from_year,
        "to_year": to_year,
        "classes": classes,
        "new_first_grade": new_first_grade,
        "summary": {
            "promoted": sum(len(c["students"]) for c in classes if c["action"] == "promote"),
            "graduated": sum(len(c["students"]) for c in classes if c["action"] == "graduate"),
            "classrooms": len(classes),
        },
    }


@transaction.atomic
def run_promotion(
    school,
    from_year,
    to_year,
    *,
    hold_back=(),
    graduate=GRADUATE_DEACTIVATE,
    copy_homeroom=True,
    copy_assignments=True,
    recreate_first_grade=True,
):
    """Jalankan kenaikan kelas. `hold_back` = id siswa yang tinggal kelas. Mengembalikan ringkasan."""
    check_years(school, from_year, to_year)
    grades = school.grades
    hold_back = set(hold_back)
    sources = list(_source_classrooms(school, from_year))
    old_by_name = {c.name: c for c in sources}
    targets = {c.name: c for c in school.classrooms.filter(academic_year=to_year)}
    created = []

    def target(name, grade, major, homeroom=None):
        if name not in targets:
            targets[name] = school.classrooms.create(
                name=name, grade=grade, major=major, academic_year=to_year, homeroom_teacher=homeroom
            )
            created.append(targets[name])
        return targets[name]

    # 1. Kelas tujuan: kelas naik tingkat (wali kelas ikut siswanya jika dipilih) dan kelas
    #    tingkat pertama yang baru.
    for classroom in sources:
        grade = next_grade(classroom.grade, grades)
        if grade:
            homeroom = classroom.homeroom_teacher if copy_homeroom else None
            target(renamed(classroom.name, grade), grade, classroom.major, homeroom)
    if recreate_first_grade:
        for classroom in sources:
            if classroom.grade == grades[0]:
                target(classroom.name, grades[0], classroom.major)

    # 2. Pindahkan siswa.
    moved = graduated = held = 0
    graduates = []
    for classroom in sources:
        grade = next_grade(classroom.grade, grades)
        for student in classroom.students.all():
            if student.id in hold_back:
                student.classroom = target(classroom.name, classroom.grade, classroom.major)
                held += 1
            elif grade:
                student.classroom = targets[renamed(classroom.name, grade)]
                moved += 1
            else:
                student.classroom = None
                if graduate == GRADUATE_DEACTIVATE:
                    student.is_active = False
                graduates.append(student)
                graduated += 1
                continue
            student.save(update_fields=["classroom"])
    if graduates:
        User.objects.bulk_update(graduates, ["classroom", "is_active"])

    # 3. Salin pengampu dari kelas bernama sama di tahun ajaran lama (hanya untuk kelas yang baru dibuat).
    copied = 0
    if copy_assignments:
        for classroom in created:
            old = old_by_name.get(classroom.name)
            if old is None:
                continue
            for assignment in old.teaching_assignments.select_related("teacher"):
                if assignment.teacher.role != Role.TEACHER or not assignment.teacher.is_active:
                    continue
                _, was_created = TeachingAssignment.objects.get_or_create(
                    teacher=assignment.teacher, subject_id=assignment.subject_id, classroom=classroom
                )
                copied += was_created

    return {
        "from_year": from_year,
        "to_year": to_year,
        "promoted": moved,
        "graduated": graduated,
        "held_back": held,
        "classrooms_created": len(created),
        "assignments_copied": copied,
    }
