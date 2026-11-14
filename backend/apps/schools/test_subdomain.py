"""Subdomain per sekolah (header X-School-Code) dan pembuatan sekolah baru oleh Super Admin."""

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom
from apps.accounts.models import Role, User

from .models import Level, School

PASSWORD = "RahasiaKuat#2026"


def make_user(username, role, *schools, **extra):
    user = User.objects.create_user(
        username=username, password=PASSWORD, full_name=username.title(), role=role, **extra
    )
    user.schools.add(*schools)
    return user


class SubdomainTests(APITestCase):
    def setUp(self):
        cache.clear()  # batas percobaan login dihitung lewat cache
        self.smk = School.objects.create(code="smknj", name="SMKS Nurul Jadid", level=Level.SMK)
        self.other = School.objects.create(code="sekolah-b", name="SMP Pelanggan B", level=Level.SMP)
        self.closed = School.objects.create(code="lama", name="Sekolah Lama", level=Level.SD, is_active=False)
        self.superadmin = make_user("super", Role.FOUNDATION)
        # Admin & guru yang terdaftar di dua sekolah: di subdomain tetap terkunci ke sekolah itu.
        self.multi_admin = make_user("admin.dua", Role.ADMIN, self.smk, self.other)
        self.teacher = make_user("guru", Role.TEACHER, self.smk, self.other)
        self.admin_b = make_user("admin.b", Role.ADMIN, self.other)
        Classroom.objects.create(
            school=self.smk, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )
        Classroom.objects.create(
            school=self.other, name="VII A", grade="VII", major="UMUM", academic_year="2026/2027"
        )

    def login(self, username, code=None):
        headers = {"X-School-Code": code} if code else {}
        return self.client.post(
            reverse("auth-login"), {"username": username, "password": PASSWORD}, headers=headers
        )

    def classrooms(self, user, **headers):
        self.client.force_authenticate(user)
        return self.client.get(reverse("classroom-list"), headers=headers)

    # --- Sekolah aktif dari subdomain ---

    def test_school_code_locks_active_school(self):
        res = self.classrooms(self.multi_admin, **{"X-School-Code": "sekolah-b"})
        self.assertEqual([c["name"] for c in res.data["results"]], ["VII A"])
        # Header X-School (id sekolah lain) diabaikan di subdomain sekolah.
        res = self.classrooms(
            self.multi_admin, **{"X-School-Code": "sekolah-b", "X-School": str(self.smk.id)}
        )
        self.assertEqual([c["name"] for c in res.data["results"]], ["VII A"])

    def test_code_is_case_insensitive(self):
        res = self.classrooms(self.multi_admin, **{"X-School-Code": "SMKNJ"})
        self.assertEqual([c["name"] for c in res.data["results"]], ["X RPL 1"])

    def test_non_member_rejected(self):
        res = self.classrooms(self.admin_b, **{"X-School-Code": "smknj"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("SMKS Nurul Jadid", str(res.data))

    def test_unknown_and_inactive_school(self):
        self.assertEqual(
            self.classrooms(self.teacher, **{"X-School-Code": "tidakada"}).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        res = self.classrooms(self.superadmin, **{"X-School-Code": "lama"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("tidak aktif", str(res.data))

    def test_superadmin_can_open_any_school_subdomain(self):
        res = self.classrooms(self.superadmin, **{"X-School-Code": "smknj"})
        self.assertEqual([c["name"] for c in res.data["results"]], ["X RPL 1"])

    def test_school_list_only_subdomain_school(self):
        self.client.force_authenticate(self.teacher)
        res = self.client.get(reverse("school-list"), headers={"X-School-Code": "smknj"})
        self.assertEqual([s["code"] for s in res.data], ["smknj"])
        # Tanpa subdomain: semua sekolah tempat ia terdaftar (pilihan "Ganti Sekolah").
        res = self.client.get(reverse("school-list"))
        self.assertEqual(sorted(s["code"] for s in res.data), ["sekolah-b", "smknj"])

    # --- Login ---

    def test_login_on_school_subdomain(self):
        self.assertEqual(self.login("guru", "smknj").status_code, status.HTTP_200_OK)
        self.assertEqual(self.login("super", "smknj").status_code, status.HTTP_200_OK)
        res = self.login("admin.b", "smknj")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("tidak terdaftar di SMKS Nurul Jadid", str(res.data))
        # Tanpa subdomain (alamat lama / Super Admin): login seperti biasa.
        self.assertEqual(self.login("admin.b").status_code, status.HTTP_200_OK)

    def test_login_unknown_or_inactive_school(self):
        self.assertEqual(self.login("guru", "tidakada").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.login("super", "lama").status_code, status.HTTP_403_FORBIDDEN)

    # --- Identitas publik untuk halaman login ---

    def test_public_identity(self):
        res = self.client.get(reverse("school-public"), {"code": "SEKOLAH-B"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["name"], "SMP Pelanggan B")
        self.assertTrue(res.data["is_active"])
        self.assertNotIn("grades", res.data)
        self.assertFalse(self.client.get(reverse("school-public"), {"code": "lama"}).data["is_active"])
        self.assertEqual(
            self.client.get(reverse("school-public"), {"code": "x"}).status_code, status.HTTP_404_NOT_FOUND
        )


class NewSchoolTests(APITestCase):
    url = reverse("school-list")

    def setUp(self):
        cache.clear()
        self.superadmin = make_user("super", Role.FOUNDATION)
        self.existing = School.objects.create(code="smknj", name="SMKS Nurul Jadid", level=Level.SMK)
        self.admin = make_user("admin.smk", Role.ADMIN, self.existing)

    def create(self, user=None, **data):
        payload = {
            "code": "sekolah-b",
            "name": "SMP Pelanggan B",
            "level": "smp",
            "admin_username": "admin.b",
            "admin_full_name": "Admin Sekolah B",
            **data,
        }
        self.client.force_authenticate(user or self.superadmin)
        return self.client.post(self.url, payload, format="json")

    def test_create_school_with_first_admin_and_generated_password(self):
        res = self.create()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        school = School.objects.get(code="sekolah-b")
        admin = User.objects.get(username="admin.b")
        self.assertEqual(admin.role, Role.ADMIN)
        self.assertEqual(list(admin.schools.all()), [school])
        password = res.data["admin"]["password"]
        self.assertTrue(password and admin.check_password(password))
        self.assertNotIn("admin_password", res.data)

        # Admin baru langsung bisa masuk lewat subdomain sekolahnya.
        self.client.force_authenticate(None)
        login = self.client.post(
            reverse("auth-login"),
            {"username": "admin.b", "password": password},
            headers={"X-School-Code": "sekolah-b"},
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

    def test_create_with_own_password_is_not_returned(self):
        res = self.create(admin_password=PASSWORD)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertIsNone(res.data["admin"]["password"])
        self.assertTrue(User.objects.get(username="admin.b").check_password(PASSWORD))

    def test_invalid_codes(self):
        for code in ("smk_nj", "-abc", "abc-", "ada spasi", "admin", "www", "smknj"):
            res = self.create(code=code)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, code)
            self.assertIn("code", res.data, code)
        self.assertEqual(self.create(code="SMP-2").data["code"], "smp-2")

    def test_validation_is_all_or_nothing(self):
        res = self.create(admin_username="ADMIN.SMK")  # username sudah dipakai (tanpa beda huruf)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("admin_username", res.data)
        res = self.create(admin_password="123")
        self.assertIn("admin_password", res.data)
        self.assertFalse(School.objects.filter(code="sekolah-b").exists())

    def test_admin_account_is_optional(self):
        res = self.create(admin_username="", admin_full_name="")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertNotIn("admin", res.data)
        self.assertEqual(self.create(code="smp-c", admin_username="").status_code, 400)  # nama tanpa username
        res = self.create(code="smp-d", admin_full_name="")
        self.assertIn("admin_full_name", res.data)

    def test_only_superadmin_can_create(self):
        self.assertEqual(self.create(user=self.admin).status_code, status.HTTP_403_FORBIDDEN)
