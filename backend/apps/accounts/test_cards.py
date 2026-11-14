"""Kartu akun (cetak / WhatsApp) dan reset password otomatis."""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom
from apps.common.testing import default_school
from apps.schools.models import Level, School

from .models import Role, User

PASSWORD = "RahasiaKuat#2026"


def make_user(username, role, school=None, **extra):
    user = User.objects.create_user(
        username=username, password=PASSWORD, full_name=username.title(), role=role, **extra
    )
    user.schools.add(school or default_school())
    return user


class AccountCardTests(APITestCase):
    url = reverse("user-account-cards")

    def setUp(self):
        school = default_school()
        self.rpl = Classroom.objects.create(
            school=school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )
        self.tkj = Classroom.objects.create(
            school=school, name="X TKJ 1", grade="X", major="TKJ", academic_year="2026/2027"
        )
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.budi = make_user("budi", Role.STUDENT, classroom=self.rpl, nis="111")
        self.ani = make_user("ani", Role.STUDENT, classroom=self.rpl, nis="112")
        self.tkj_student = make_user("tono", Role.STUDENT, classroom=self.tkj)
        self.inactive = make_user("lama", Role.STUDENT, classroom=self.rpl, is_active=False)
        other = School.objects.create(code="lain", name="Sekolah Lain", level=Level.SMP)
        self.outsider = make_user("orang.lain", Role.STUDENT, school=other)

    def post(self, user=None, **data):
        self.client.force_authenticate(user or self.admin)
        return self.client.post(self.url, data, format="json")

    def test_cards_for_classroom_without_reset(self):
        res = self.post(classroom=self.rpl.id)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["school"], {"name": "SMKS Nurul Jadid", "code": "smknj"})
        # Siswa aktif kelas itu saja, urut nama; password lama tidak pernah ikut.
        self.assertEqual([a["username"] for a in res.data["accounts"]], ["ani", "budi"])
        self.assertEqual(res.data["accounts"][0]["classroom"], "X RPL 1")
        self.assertIsNone(res.data["accounts"][0]["password"])
        self.budi.refresh_from_db()
        self.assertTrue(self.budi.check_password(PASSWORD))

    def test_reset_creates_working_new_passwords(self):
        res = self.post(classroom=self.rpl.id, reset_password=True)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        for account in res.data["accounts"]:
            user = User.objects.get(pk=account["id"])
            self.assertTrue(account["password"])
            self.assertTrue(user.check_password(account["password"]))
            self.assertFalse(user.check_password(PASSWORD))  # password lama tidak berlaku lagi
        # Siswa kelas lain tidak tersentuh.
        self.tkj_student.refresh_from_db()
        self.assertTrue(self.tkj_student.check_password(PASSWORD))

    def test_select_by_ids_and_role(self):
        res = self.post(user_ids=[self.budi.id, self.outsider.id, self.inactive.id])
        self.assertEqual(
            [a["username"] for a in res.data["accounts"]], ["budi"]
        )  # sekolah lain & nonaktif dibuang
        res = self.post(role=Role.TEACHER)
        self.assertEqual([a["username"] for a in res.data["accounts"]], ["guru1"])

    def test_reset_never_changes_own_password(self):
        res = self.post(role=Role.ADMIN, reset_password=True)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)  # hanya dirinya -> tidak ada akun
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(PASSWORD))

    def test_validation_and_permissions(self):
        self.assertEqual(self.post().status_code, status.HTTP_400_BAD_REQUEST)  # tanpa pilihan
        self.assertEqual(self.post(user_ids=[self.outsider.id]).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            self.post(user=self.teacher, role=Role.STUDENT).status_code, status.HTTP_403_FORBIDDEN
        )


class GeneratedResetPasswordTests(APITestCase):
    def setUp(self):
        self.admin = make_user("admin1", Role.ADMIN)
        self.student = make_user("budi", Role.STUDENT)
        self.url = reverse("user-reset-password", args=[self.student.pk])
        self.client.force_authenticate(self.admin)

    def test_empty_password_is_generated_and_returned_once(self):
        res = self.client.post(self.url, {"new_password": ""}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password(res.data["password"]))
        self.assertEqual(res.data["account"]["username"], "budi")

    def test_typed_password_is_not_returned(self):
        res = self.client.post(self.url, {"new_password": "ResetKuat#2026"}, format="json")
        self.assertIsNone(res.data["password"])
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("ResetKuat#2026"))
