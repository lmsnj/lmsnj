"""Peran admin yayasan: kelola sekolah, buka sekolah mana pun, ringkasan lintas sekolah."""

import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom
from apps.accounts.models import Role, User
from apps.chat.rules import can_chat, contacts_for

from .models import Level, School

TEMP_MEDIA = tempfile.mkdtemp()
PNG = bytes.fromhex("89504e470d0a1a0a") + b"0" * 32
PASSWORD = "RahasiaKuat#2026"


def make_user(username, role, *schools, **extra):
    user = User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )
    user.schools.add(*schools)
    return user


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class FoundationTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        self.smk = School.objects.create(code="smknj", name="SMKS Nurul Jadid", level=Level.SMK)
        self.mi = School.objects.create(code="minj", name="MI Nurul Jadid", level=Level.MI)
        self.closed = School.objects.create(code="lama", name="Sekolah Lama", level=Level.SD, is_active=False)
        self.foundation = make_user("yayasan", Role.FOUNDATION)
        self.admin_smk = make_user("admin.smk", Role.ADMIN, self.smk)
        self.teacher_mi = make_user("guru.mi", Role.TEACHER, self.mi)
        self.mi_class = Classroom.objects.create(
            school=self.mi, name="I A", grade="I", major="UMUM", academic_year="2026/2027"
        )
        self.student_mi = make_user("siswa.mi", Role.STUDENT, self.mi, classroom=self.mi_class)
        self.list_url = reverse("school-list")

    def detail(self, school):
        return reverse("school-detail", args=[school.id])

    def test_foundation_sees_all_schools_and_opens_any(self):
        self.client.force_authenticate(self.foundation)
        codes = {s["code"] for s in self.client.get(self.list_url).data}
        self.assertEqual(codes, {"smknj", "minj", "lama"})
        res = self.client.get(reverse("classroom-list"), headers={"X-School": str(self.mi.id)})
        self.assertEqual([c["name"] for c in res.data["results"]], ["I A"])
        # Sekolah nonaktif tidak bisa dibuka.
        res = self.client.get(reverse("classroom-list"), headers={"X-School": str(self.closed.id)})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.get(reverse("dashboard"), headers={"X-School": str(self.mi.id)})
        self.assertEqual(res.data["stats"]["classrooms"], 1)

    def test_foundation_creates_school_and_school_admin(self):
        self.client.force_authenticate(self.foundation)
        res = self.client.post(
            self.list_url, {"code": "MTSNJ", "name": "MTs Nurul Jadid", "level": "mts"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["code"], "mtsnj")
        self.assertEqual(res.data["grades"], ["VII", "VIII", "IX"])
        mts = School.objects.get(code="mtsnj")

        res = self.client.post(
            reverse("user-list"),
            {"username": "admin.mts", "full_name": "Admin MTs", "role": "admin", "password": PASSWORD},
            format="json",
            headers={"X-School": str(mts.id)},
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(list(User.objects.get(username="admin.mts").schools.all()), [mts])

    def test_school_admin_cannot_manage_schools(self):
        self.client.force_authenticate(self.admin_smk)
        self.assertEqual([s["code"] for s in self.client.get(self.list_url).data], ["smknj"])
        res = self.client.post(self.list_url, {"code": "x", "name": "X", "level": "sd"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.delete(self.detail(self.smk)).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse("school-summary")).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.patch(self.detail(self.mi), {"slogan": "x"}, format="json").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_school_admin_edits_own_identity_only(self):
        self.client.force_authenticate(self.admin_smk)
        res = self.client.patch(
            self.detail(self.smk),
            {"slogan": "  Unggul  ", "level": "sd", "code": "ganti", "is_active": False, "logo": SimpleUploadedFile("logo.png", PNG)},
            format="multipart",
        )  # fmt: skip
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.smk.refresh_from_db()
        self.assertEqual((self.smk.slogan, self.smk.level, self.smk.code), ("Unggul", Level.SMK, "smknj"))
        self.assertTrue(self.smk.is_active)
        logo = self.client.get(res.data["logo_url"])
        self.assertEqual(logo.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(logo.streaming_content), PNG)

    def test_level_locked_and_delete_protected_when_school_has_classes(self):
        self.client.force_authenticate(self.foundation)
        res = self.client.patch(self.detail(self.mi), {"level": "sd"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)  # MI -> SD: tingkatnya sama (I-VI)
        self.mi.refresh_from_db()
        self.assertEqual(self.mi.level, Level.SD)
        res = self.client.patch(self.detail(self.mi), {"level": "smp"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.delete(self.detail(self.mi)).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.delete(self.detail(self.closed)).status_code, status.HTTP_204_NO_CONTENT)

    def test_only_foundation_can_grant_foundation_role(self):
        payload = {"username": "baru", "full_name": "Baru", "role": "foundation", "password": PASSWORD}
        self.client.force_authenticate(self.admin_smk)
        res = self.client.post(reverse("user-list"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", res.data)

        self.client.force_authenticate(self.foundation)
        res = self.client.post(reverse("user-list"), payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertFalse(User.objects.get(username="baru").schools.exists())
        usernames = {u["username"] for u in self.client.get(reverse("user-list")).data["results"]}
        self.assertIn("baru", usernames)  # admin yayasan lain tampil untuk admin yayasan

        self.client.force_authenticate(self.admin_smk)
        usernames = {u["username"] for u in self.client.get(reverse("user-list")).data["results"]}
        self.assertNotIn("yayasan", usernames)
        res = self.client.post(reverse("user-join"), {"username": "yayasan"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_summary_per_school(self):
        self.client.force_authenticate(self.foundation)
        res = self.client.get(reverse("school-summary"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mi = next(row for row in res.data if row["code"] == "minj")
        self.assertEqual((mi["students"], mi["teachers"], mi["classrooms"]), (1, 1, 1))
        self.assertEqual(mi["academic_year"], "2026/2027")
        self.assertEqual(
            (mi["admins"], mi["students_without_classroom"], mi["classrooms_without_homeroom"]), (0, 0, 1)
        )
        self.assertEqual(
            (mi["materials"], mi["tasks"], mi["assessments"], mi["submissions_this_week"]), (0, 0, 0, 0)
        )

    def test_foundation_can_chat_with_everyone(self):
        self.assertTrue(can_chat(self.foundation, self.student_mi))
        self.assertTrue(can_chat(self.admin_smk, self.foundation))
        self.assertFalse(can_chat(self.admin_smk, self.student_mi))  # beda sekolah
        contacts = set(contacts_for(self.foundation))
        self.assertEqual(contacts, {self.admin_smk, self.teacher_mi, self.student_mi})
        self.assertIn(self.foundation, set(contacts_for(self.student_mi)))
