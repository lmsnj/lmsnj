"""Perbarui NIS / NIP / kode guru akun yang SUDAH ADA lewat Excel (khusus admin).

Impor pengguna (user_import.py) hanya membuat akun baru. Di sini admin mengunduh daftar akun
sekolahnya (bisa hanya yang datanya masih kosong), mengisi kolom yang kurang, lalu mengunggahnya.
Akun dicocokkan lewat username. Sel kosong = tidak diubah (data yang sudah ada tidak terhapus).
Pola sama dengan impor lain: Periksa dulu, lalu Perbarui jika SEMUA baris benar.
"""

import io

from django.db import transaction
from django.db.models import Q
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

from apps.common.excel import HEADER_FILL, Column, read_rows

from .models import Role, User

SHEET = "Perbarui"
MAX_ROWS = 2000
INFO_FILL = PatternFill("solid", fgColor="E2E8F0")  # kolom keterangan (tidak dibaca saat impor)

# Kolom yang bisa diisi per peran: (kunci field, judul kolom).
FIELDS = {
    Role.STUDENT: [("nis", "NIS")],
    Role.TEACHER: [("nip", "NIP"), ("teacher_code", "Kode Guru")],
}
LABELS = {"nis": "NIS", "nip": "NIP", "teacher_code": "Kode Guru"}
MAX_LENGTH = {"nis": 20, "nip": 30, "teacher_code": 20}


def columns_for(role):
    return [
        Column("username", "Username", required=True, text=True),
        Column("full_name", "Nama Lengkap"),
        Column("classroom", "Kelas"),
        *[Column(key, label, text=True) for key, label in FIELDS[role]],
    ]


def accounts_for(school, role, only_missing):
    users = User.objects.filter(schools=school, role=role, is_active=True).select_related("classroom")
    if only_missing:
        empty = Q()
        for key, _label in FIELDS[role]:
            empty |= Q(**{f"{key}__isnull": True}) | Q(**{key: ""})
        users = users.filter(empty)
    return users.order_by("classroom__name", "full_name")


def build_template(school, role, only_missing):
    """Daftar akun berisi data saat ini. Kolom Nama & Kelas hanya keterangan (abu-abu)."""
    columns = columns_for(role)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = SHEET
    for index, column in enumerate(columns, start=1):
        cell = sheet.cell(row=1, column=index, value=f"{column.label}*" if column.required else column.label)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")
        sheet.column_dimensions[cell.column_letter].width = 36 if column.key == "full_name" else 18
    for row, user in enumerate(accounts_for(school, role, only_missing), start=2):
        values = {
            "username": user.username,
            "full_name": user.full_name,
            "classroom": user.classroom.name if user.classroom else "",
            "nis": user.nis,
            "nip": user.nip,
            "teacher_code": user.teacher_code,
        }
        for index, column in enumerate(columns, start=1):
            cell = sheet.cell(row=row, column=index, value=values[column.key] or None)
            cell.number_format = "@"  # NIS/NIP panjang tidak berubah menjadi angka ilmiah
            if column.key in ("full_name", "classroom"):
                cell.fill = INFO_FILL
    sheet.freeze_panes = "B2"

    guide = workbook.create_sheet("Petunjuk")
    lines = [
        "Perbarui Data Pengguna",
        "",
        f"Isi kolom {', '.join(label for _key, label in FIELDS[role])} di lembar '{SHEET}'.",
        "Username dipakai untuk mencari akun: jangan diubah.",
        "Kolom Nama Lengkap dan Kelas (abu-abu) hanya keterangan; perubahannya tidak disimpan.",
        "Sel yang dikosongkan tidak mengubah data lama. Baris yang tidak perlu boleh dihapus.",
        "NIS harus unik di sekolah ini; NIP unik di seluruh aplikasi; kode guru unik di sekolah ini.",
    ]
    for row, text in enumerate(lines, start=1):
        guide.cell(row=row, column=1, value=text).font = Font(bold=row == 1, size=13 if row == 1 else 11)
    guide.column_dimensions["A"].width = 90

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def check_rows(file, school, role):
    """Periksa file. Mengembalikan baris pratinjau: {row, username, full_name, changes, errors}
    + `updates` (internal, dipakai saat menyimpan)."""
    rows = read_rows(file, SHEET, columns_for(role), max_rows=MAX_ROWS)
    fields = [key for key, _label in FIELDS[role]]
    members = User.objects.filter(schools=school)
    accounts = {u.username.lower(): u for u in members.filter(role=role)}
    # Nilai yang sudah dipakai akun lain: {field: {nilai: id akun}}.
    taken = {
        "nis": dict(members.exclude(nis=None).values_list("nis", "id")),
        "nip": dict(User.objects.exclude(nip=None).values_list("nip", "id")),
        "teacher_code": {
            code.upper(): pk
            for code, pk in members.filter(role=Role.TEACHER)
            .exclude(teacher_code=None)
            .values_list("teacher_code", "id")
        },
    }
    seen = {field: {} for field in fields}
    seen_users = {}
    results = []
    for item in rows:
        data, errors, changes, updates = item["data"], [], [], {}
        user = accounts.get(data["username"].lower())
        if user is None:
            errors.append(f"Akun '{data['username']}' tidak ditemukan di sekolah ini (peran {role.label}).")
        elif user.pk in seen_users:
            errors.append(f"Akun ini sudah ada di baris {seen_users[user.pk]}.")
        else:
            seen_users[user.pk] = item["row"]
        for field in fields:
            value = data[field].upper() if field == "teacher_code" else data[field]
            if not value or user is None:
                continue
            label = LABELS[field]
            if len(value) > MAX_LENGTH[field]:
                errors.append(f"{label} terlalu panjang (maks. {MAX_LENGTH[field]} karakter).")
                continue
            owner = taken[field].get(value)
            if owner is not None and owner != user.pk:
                errors.append(f"{label} {value} sudah dipakai akun lain.")
            if value in seen[field]:
                errors.append(f"{label} {value} sama dengan baris {seen[field][value]}.")
            seen[field][value] = item["row"]
            if value != (getattr(user, field) or ""):
                changes.append(f"{label}: {getattr(user, field) or '-'} → {value}")
                updates[field] = value
        results.append(
            {
                "row": item["row"],
                "username": data["username"],
                "full_name": user.full_name if user else data["full_name"],
                "changes": "; ".join(changes) or "Tidak ada perubahan",
                "errors": errors,
                "user": user,
                "updates": updates,
            }
        )
    return results


@transaction.atomic
def save_updates(results):
    """Simpan perubahan (dipanggil hanya jika semua baris benar). Mengembalikan jumlah akun diubah."""
    changed = 0
    for result in results:
        if not result["updates"]:
            continue
        for field, value in result["updates"].items():
            setattr(result["user"], field, value)
        result["user"].save(update_fields=list(result["updates"]))
        changed += 1
    return changed


def preview(results):
    """Baris yang dikirim ke frontend (tanpa objek internal)."""
    return [
        {
            **{key: r[key] for key in ("row", "username", "full_name", "changes", "errors")},
            "changed": bool(r["updates"]),
        }
        for r in results
    ]
