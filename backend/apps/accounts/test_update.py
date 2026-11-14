import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from openpyxl import load_workbook
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom
from apps.common.testing import default_school
from apps.schools.models import Level, School

from .models import Role, User


def member(username, role, school, **extra):
    extra.setdefault("full_name", username.title())
    user = User.objects.create(username=username, role=role, **extra)
    user.schools.add(school)
    return user


class UserUpdateExcelTests(APITestCase):
    template_url = reverse("user-update-template")
    import_url = reverse("user-update-import")

    def setUp(self):
        self.school = default_school()
        self.admin = member("admin1", Role.ADMIN, self.school)
        room = Classroom.objects.create(
            school=self.school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )
        self.empty = member("budi", Role.STUDENT, self.school, classroom=room)
        self.filled = member("sari", Role.STUDENT, self.school, classroom=room, nis="1001")
        self.teacher = member("guru1", Role.TEACHER, self.school)
        self.client.force_authenticate(self.admin)

    def template(self, role="student", **params):
        response = self.client.get(self.template_url, {"role": role, **params})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return load_workbook(io.BytesIO(response.content))

    def upload(self, rows, role="student", dry_run=True):
        """rows: daftar baris lembar Perbarui (tanpa judul kolom); judul diambil dari template."""
        workbook = self.template(role)
        sheet = workbook["Perbarui"]
        sheet.delete_rows(2, sheet.max_row)
        for row in rows:
            sheet.append(row)
        buffer = io.BytesIO()
        workbook.save(buffer)
        file = SimpleUploadedFile("perbarui.xlsx", buffer.getvalue())
        return self.client.post(
            self.import_url,
            {"file": file, "role": role, "dry_run": "true" if dry_run else "false"},
            format="multipart",
        )

    def test_template_lists_accounts_and_filters_missing(self):
        sheet = self.template()["Perbarui"]
        self.assertEqual([c.value for c in sheet[1]], ["Username*", "Nama Lengkap", "Kelas", "NIS"])
        self.assertEqual({row[0] for row in sheet.iter_rows(min_row=2, values_only=True)}, {"budi", "sari"})
        missing = self.template(kosong="1")["Perbarui"]
        self.assertEqual([row[0] for row in missing.iter_rows(min_row=2, values_only=True)], ["budi"])
        teacher_sheet = self.template("teacher")["Perbarui"]
        self.assertEqual([c.value for c in teacher_sheet[1]][3:], ["NIP", "Kode Guru"])

    def test_dry_run_then_update(self):
        rows = [["budi", "Budi", "X RPL 1", "1002"], ["sari", "Sari", "X RPL 1", "1001"]]
        check = self.upload(rows)
        self.assertEqual(check.status_code, status.HTTP_200_OK)
        self.assertEqual(check.data["summary"]["invalid"], 0)
        self.assertEqual([r["changed"] for r in check.data["rows"]], [True, False])
        self.empty.refresh_from_db()
        self.assertIsNone(self.empty.nis)
        saved = self.upload(rows, dry_run=False)
        self.assertEqual(saved.status_code, status.HTTP_201_CREATED)
        self.assertEqual(saved.data["created"], 1)
        self.empty.refresh_from_db()
        self.assertEqual(self.empty.nis, "1002")

    def test_blank_cell_keeps_old_value(self):
        self.upload([["sari", "", "", ""]], dry_run=False)
        self.filled.refresh_from_db()
        self.assertEqual(self.filled.nis, "1001")

    def test_duplicates_and_unknown_accounts_are_rejected(self):
        response = self.upload(
            [["budi", "", "", "1001"], ["tidakada", "", "", "9"], ["guru1", "", "", "7"]], dry_run=False
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = [" ".join(r["errors"]) for r in response.data["rows"]]
        self.assertIn("sudah dipakai akun lain", errors[0])
        self.assertIn("tidak ditemukan", errors[1])
        self.assertIn("tidak ditemukan", errors[2])  # guru tidak bisa diubah lewat file siswa
        self.empty.refresh_from_db()
        self.assertIsNone(self.empty.nis)

    def test_same_value_twice_in_file(self):
        other = member("andi", Role.STUDENT, self.school)
        response = self.upload([["budi", "", "", "2000"], ["andi", "", "", "2000"]])
        self.assertIn("sama dengan baris 2", " ".join(response.data["rows"][1]["errors"]))
        self.assertTrue(other.pk)

    def test_teacher_nip_and_code(self):
        member("guru2", Role.TEACHER, self.school, nip="555", teacher_code="A0001")
        response = self.upload([["guru1", "", "", "555", "a0001"]], role="teacher", dry_run=False)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = " ".join(response.data["rows"][0]["errors"])
        self.assertIn("NIP 555", errors)
        self.assertIn("Kode Guru A0001", errors)
        ok = self.upload([["guru1", "", "", "777", "a0002"]], role="teacher", dry_run=False)
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED)
        self.teacher.refresh_from_db()
        self.assertEqual((self.teacher.nip, self.teacher.teacher_code), ("777", "A0002"))

    def test_other_school_accounts_are_invisible(self):
        mts = School.objects.create(code="mts", name="MTs", level=Level.MTS)
        member("luar", Role.STUDENT, mts)
        response = self.upload([["luar", "", "", "3000"]])
        self.assertIn("tidak ditemukan", " ".join(response.data["rows"][0]["errors"]))

    def test_admin_only_and_role_required(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(
            self.client.get(self.template_url, {"role": "student"}).status_code, status.HTTP_403_FORBIDDEN
        )
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.template_url, {"role": "admin"}).status_code, 400)
