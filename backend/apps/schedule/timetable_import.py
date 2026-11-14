"""Impor jadwal pelajaran mingguan dari file JSON (hasil olahan dokumen jadwal & distribusi JP).

Satu kali jalan mengisi mapel, kelas, akun guru, pengampu, slot waktu, dan isi jadwal untuk SATU
sekolah. Semua data dicari dan dibuat di sekolah itu saja (sekolah lain tidak tersentuh). Aman
dijalankan ulang: data yang sudah ada dicocokkan dulu, bukan dibuat dobel.
"""

import re
from collections import Counter, defaultdict
from datetime import date, time

from django.db import transaction

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.accounts.user_import import generate_password, hash_initial_password

from .models import Day, Semester, SlotKind, TimeSlot, Timetable, TimetableEntry
from .services import find_conflicts

DAYS = {label.lower(): value for value, label in Day.choices} | {"minggu": Day.SUNDAY}


ACRONYMS = {"KBM", "PKL", "BK"}


class TimetableImportError(Exception):
    """Data tidak bisa diimpor. `messages` berisi daftar masalah untuk ditampilkan."""

    def __init__(self, messages):
        super().__init__("\n".join(messages))
        self.messages = messages


def class_key(name):
    """'X-TKJ 1', 'x tkj 1', dan 'X TKJ1' dianggap kelas yang sama."""
    return re.sub(r"[^A-Z0-9]", "", name.upper())


def name_key(full_name):
    """Nama tanpa gelar dan tanda baca, untuk mencocokkan guru yang belum punya kode guru."""
    words = full_name.split(",")[0].split()
    # Gelar seperti "S.Kom." punya titik di tengah; singkatan nama seperti "Moh." tidak.
    words = [w for w in words if not re.fullmatch(r"[A-Za-z]{1,3}\.[A-Za-z.]+", w)]
    return re.sub(r"[^a-z]", "", "".join(words).lower())


def parse_time(text):
    hour, minute = text.split(":")
    return time(int(hour), int(minute))


def activity_label(text):
    """'KBM DINIYAH' -> 'KBM Diniyah', "SHOLAT DHUHUR BERJAMA'AH" -> "Sholat Dhuhur Berjama'ah"."""
    return " ".join(word if word in ACRONYMS else word.capitalize() for word in text.split())


def slot_text(row):
    return f"{row['hari']} jam ke-{row['jam_ke']}"


def _check(data):
    """Periksa isi file sebelum menyentuh database."""
    errors = []
    teachers = {t["kode"] for t in data["guru"]}
    classrooms = {c["nama"] for c in data["kelas"]}
    slots = {(s["hari"], s["mulai"]) for s in data["slot_waktu"]}
    for row in data["jadwal"]:
        where = f"Jadwal {slot_text(row)} kelas {row['kelas']}"
        if row["hari"].lower() not in DAYS:
            errors.append(f"{where}: hari '{row['hari']}' tidak dikenal.")
        if (row["hari"], row["mulai"]) not in slots:
            errors.append(f"{where}: slot waktu {row['mulai']} tidak ada di daftar slot.")
        if row["kode_guru"] not in teachers:
            errors.append(f"{where}: kode guru {row['kode_guru']} tidak ada di daftar guru.")
        if row["kelas"] not in classrooms:
            errors.append(f"{where}: kelas tidak ada di daftar kelas.")
    for row in data.get("distribusi_jp", []):
        if row["kode_guru"] not in teachers:
            errors.append(f"Distribusi JP: kode guru {row['kode_guru']} tidak ada di daftar guru.")
        if row["kelas"] not in classrooms:
            errors.append(f"Distribusi JP: kelas {row['kelas']} tidak ada di daftar kelas.")
    errors += find_conflicts(
        {"slot": slot_text(r), "classroom": r["kelas"], "teacher": r["kode_guru"], "subject": r["kode_mapel"]}
        for r in data["jadwal"]
    )
    if errors:
        raise TimetableImportError(errors)


def subject_key(name):
    """'Mapel. Pilihan (Digital Marketing)' dan 'Mapel Pilihan (Digital Marketing)' dianggap sama."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _import_subjects(data, school, used_codes, report):
    """Cocokkan mapel dengan KODE + NAMA, agar kode yang dipakai untuk mapel lain tidak salah tempel.

    - kode ada & nama sama  -> pakai mapel itu
    - kode ada, nama beda   -> berhenti (kode lama perlu diganti dulu, mis. G -> G-LAMA)
    - kode belum ada        -> pakai mapel bernama sama jika tepat satu (tidak dobel); jika lebih dari
                               satu, berhenti; jika tidak ada, buat mapel baru
    """
    names = {m["kode"].upper(): m["nama"] for m in data.get("mapel", [])}
    for row in data.get("distribusi_jp", []):
        names.setdefault(row["kode_mapel"].upper(), row.get("mapel") or row["kode_mapel"])
    school_subjects = list(Subject.objects.filter(school=school))
    by_code = {s.code.upper(): s for s in school_subjects}
    by_name = defaultdict(list)
    for subject in school_subjects:
        by_name[subject_key(subject.name)].append(subject)

    subjects, errors = {}, []
    for code in sorted(used_codes):
        key = code.upper()
        name = names.get(key, key)
        found = by_code.get(key)
        if found is not None:
            if subject_key(found.name) != subject_key(name):
                errors.append(
                    f"Mapel {key} di file = '{name}', tetapi kode {key} di sekolah ini sudah dipakai "
                    f"'{found.name}'. Ganti kode mapel lama itu (mis. {key}-LAMA), lalu ulangi."
                )
                continue
        else:
            same_name = by_name.get(subject_key(name), [])
            if len(same_name) > 1:
                codes = ", ".join(s.code for s in same_name)
                errors.append(
                    f"Mapel {key} '{name}': ada {len(same_name)} mapel bernama sama ({codes}). "
                    f"Ubah kode salah satunya menjadi {key}, lalu ulangi."
                )
                continue
            if same_name:
                found = same_name[0]
                report["subjects"]["matched"].append(f"{key} - {name} -> {found.code} (nama sama)")
            else:
                found = Subject.objects.create(school=school, code=key, name=name)
                report["subjects"]["created"].append(f"{key} - {found.name}")
            by_code[key] = found
        subjects[code] = found
    if errors:
        raise TimetableImportError(errors)
    matched, created = len(report["subjects"]["matched"]), len(report["subjects"]["created"])
    report["subjects"]["existing"] = len(subjects) - created - matched
    return subjects


def _import_classrooms(data, school, year, report):
    existing = {class_key(c.name): c for c in Classroom.objects.filter(school=school, academic_year=year)}
    classrooms, claimed = {}, {}
    for item in data["kelas"]:
        name = item["nama"]
        key = class_key(name)
        # "X-RPL" boleh cocok dengan "X RPL 1", dan "X-TKJ 1" dengan "X TKJ".
        candidates = [key, f"{key}1"] + ([key[:-1]] if key.endswith("1") else [])
        found = next((existing[k] for k in candidates if k in existing), None)
        if found is None:
            if item["tingkat"] not in school.grades:
                raise TimetableImportError(
                    [
                        f"Kelas {name}: tingkat {item['tingkat']} tidak ada di jenjang {school.get_level_display()}."
                    ]
                )
            major = re.split(r"[-\s]+", name.strip())[1].upper()
            found = Classroom.objects.create(
                school=school, name=name, grade=item["tingkat"], major=major, academic_year=year
            )
            report["classrooms"]["created"].append(name)
        else:
            if found.pk in claimed:
                raise TimetableImportError(
                    [
                        f"Kelas {name} dan {claimed[found.pk]} sama-sama cocok dengan '{found.name}' di database."
                    ]
                )
            if found.name != name:
                report["classrooms"]["matched"].append(f"{name} -> {found.name}")
        claimed[found.pk] = name
        classrooms[name] = found
    report["classrooms"]["existing"] = len(classrooms) - len(report["classrooms"]["created"])
    return classrooms


def _import_teachers(data, school, used_codes, dry_run, report):
    # Hanya guru yang terdaftar di sekolah ini: kode guru tidak unik antarsekolah.
    members = User.objects.filter(role=Role.TEACHER, schools=school)
    by_code = {u.teacher_code.upper(): u for u in members.exclude(teacher_code=None)}
    by_name = defaultdict(list)
    for user in members.filter(teacher_code=None):
        by_name[name_key(user.full_name)].append(user)
    taken = {u.lower() for u in User.objects.values_list("username", flat=True)}

    teachers, errors = {}, []
    for item in data["guru"]:
        code = item["kode"].upper()
        if code not in used_codes:
            continue
        user = by_code.get(code)
        if user is None:
            same_name = by_name.get(name_key(item["nama"]), [])
            if len(same_name) > 1:
                usernames = ", ".join(u.username for u in same_name)
                errors.append(
                    f"Guru {code} {item['nama']}: ada {len(same_name)} akun bernama sama ({usernames}). "
                    "Isi kode guru pada akun yang benar, lalu ulangi."
                )
                continue
            if same_name:
                user = same_name[0]
                user.teacher_code = code
                user.save(update_fields=["teacher_code"])
                report["teachers"]["linked"].append(f"{code} -> {user.username} ({user.full_name})")
            else:
                # Username = kode guru. Username unik di seluruh aplikasi, jadi jika sudah dipakai
                # (mis. kode yang sama di sekolah lain) diberi akhiran kode sekolah: a0372.smknj.
                candidates = [code.lower(), f"{code.lower()}.{school.code}"]
                username = next((name for name in candidates if name not in taken), None)
                if username is None:
                    errors.append(
                        f"Guru {code} {item['nama']}: username '{candidates[0]}' dan '{candidates[1]}' "
                        "sudah dipakai akun lain."
                    )
                    continue
                password = generate_password()
                user = User(username=username, full_name=item["nama"], role=Role.TEACHER, teacher_code=code)
                # Saat uji coba (dry run) tidak perlu menghitung hash yang lambat.
                user.password = "!" if dry_run else hash_initial_password(password)
                user.save()
                user.schools.add(school)  # guru baru langsung terdaftar di sekolah ini
                taken.add(username)
                report["teachers"]["created"].append(
                    {"code": code, "name": item["nama"], "username": username, "password": password}
                )
        teachers[code] = user
    if errors:
        raise TimetableImportError(errors)
    created, linked = len(report["teachers"]["created"]), len(report["teachers"]["linked"])
    report["teachers"]["existing"] = len(teachers) - created - linked
    return teachers


def _import_assignments(data, subjects, classrooms, teachers, report):
    hours = Counter()
    for row in data.get("distribusi_jp", []):
        hours[(row["kode_guru"].upper(), row["kode_mapel"], row["kelas"])] += row["jp"]
    keys = set(hours) | {(r["kode_guru"].upper(), r["kode_mapel"], r["kelas"]) for r in data["jadwal"]}

    assignments = {}
    for key in sorted(keys):
        code, subject, classroom = key
        assignment, created = TeachingAssignment.objects.get_or_create(
            teacher=teachers[code], subject=subjects[subject], classroom=classrooms[classroom]
        )
        report["assignments"]["created" if created else "existing"] += 1
        official = hours.get(key)
        if official is not None and assignment.weekly_hours != official:
            assignment.weekly_hours = official
            assignment.save(update_fields=["weekly_hours"])
            report["assignments"]["hours_set"] += 1
        assignments[key] = assignment
    return assignments


def _import_timetable(data, school, year, assignments, activate, report):
    meta = data["meta"]
    semester = Semester.EVEN if meta["semester"].lower().startswith("genap") else Semester.ODD
    timetable, created = Timetable.objects.update_or_create(
        school=school,
        code=meta["kode_jadwal"],
        defaults={
            "academic_year": year,
            "semester": semester,
            "effective_from": date.fromisoformat(meta["berlaku_sejak"]),
        },
    )
    # Isi versi jadwal ini diganti seluruhnya; versi jadwal lain tidak disentuh.
    timetable.slots.all().delete()
    slots = {}
    for item in data["slot_waktu"]:
        is_lesson = item["jenis"] == "KBM"
        period = item["jam_ke"]
        slots[(item["hari"], item["mulai"])] = TimeSlot(
            timetable=timetable,
            day=DAYS[item["hari"].lower()],
            period=int(period) if str(period).isdigit() else None,
            starts_at=parse_time(item["mulai"]),
            ends_at=parse_time(item["selesai"]),
            kind=SlotKind.LESSON if is_lesson else SlotKind.ACTIVITY,
            label="" if is_lesson else activity_label(item.get("kegiatan") or ""),
        )
    TimeSlot.objects.bulk_create(slots.values())
    entries = [
        TimetableEntry(
            time_slot=slots[(row["hari"], row["mulai"])],
            teaching_assignment=assignments[(row["kode_guru"].upper(), row["kode_mapel"], row["kelas"])],
        )
        for row in data["jadwal"]
    ]
    TimetableEntry.objects.bulk_create(entries)
    if activate:
        # Satu jadwal aktif per sekolah; jadwal sekolah lain tidak disentuh.
        Timetable.objects.filter(school=school).exclude(pk=timetable.pk).update(is_active=False)
        timetable.is_active = True
        timetable.save(update_fields=["is_active"])
    report["timetable"] = {
        "code": timetable.code,
        "created": created,
        "slots": len(slots),
        "entries": len(entries),
        "active": timetable.is_active,
    }


def import_timetable(data, *, school, dry_run=False, all_teachers=False, activate=True):
    """Impor seluruh isi `data` ke `school`. Mengembalikan laporan; dengan `dry_run` tidak ada yang
    disimpan."""
    _check(data)
    year = data["meta"]["tahun_pelajaran"]
    rows = data["jadwal"] + data.get("distribusi_jp", [])
    teacher_codes = {r["kode_guru"].upper() for r in rows}
    if all_teachers:
        teacher_codes |= {t["kode"].upper() for t in data["guru"]}
    report = {
        "dry_run": dry_run,
        "school": school.name,
        "subjects": {"created": [], "matched": [], "existing": 0},
        "classrooms": {"created": [], "matched": [], "existing": 0},
        "teachers": {"created": [], "linked": [], "existing": 0},
        "assignments": {"created": 0, "existing": 0, "hours_set": 0},
    }
    with transaction.atomic():
        subjects = _import_subjects(data, school, {r["kode_mapel"] for r in rows}, report)
        classrooms = _import_classrooms(data, school, year, report)
        teachers = _import_teachers(data, school, teacher_codes, dry_run, report)
        assignments = _import_assignments(data, subjects, classrooms, teachers, report)
        _import_timetable(data, school, year, assignments, activate, report)
        if dry_run:
            transaction.set_rollback(True)
    return report
