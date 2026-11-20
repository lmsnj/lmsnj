from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom
from apps.common.testing import default_school
from apps.schools.models import Level, School

from .models import ImpersonationLog, Role, User

PASSWORD = "RahasiaKuat#2026"


def make_user(username, role, **extra):
    user = User.objects.create_user(
        username=username, password=PASSWORD, full_name=username.title(), role=role, **extra
    )
    user.schools.add(default_school())
    return user


class AuthTests(APITestCase):
    def setUp(self):
        cache.clear()  # reset throttle login antar test
        self.student = make_user("siswa1", Role.STUDENT, nis="12345")

    def login(self, username="siswa1", password=PASSWORD):
        return self.client.post(reverse("auth-login"), {"username": username, "password": password})

    def test_login_returns_tokens_and_user(self):
        res = self.login()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertEqual(res.data["user"]["role"], Role.STUDENT)

    def test_login_wrong_password(self):
        res = self.login(password="salah")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_user_cannot_login(self):
        self.student.is_active = False
        self.student.save()
        self.assertEqual(self.login().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_requires_auth(self):
        self.assertEqual(self.client.get(reverse("auth-me")).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_current_user(self):
        access = self.login().data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        res = self.client.get(reverse("auth-me"))
        self.assertEqual(res.data["username"], "siswa1")

    def test_refresh_and_logout_blacklists_token(self):
        tokens = self.login().data
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        res = self.client.post(reverse("auth-logout"), {"refresh": tokens["refresh"]})
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        res = self.client.post(reverse("auth-refresh"), {"refresh": tokens["refresh"]})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_change_password(self):
        self.client.force_authenticate(self.student)
        url = reverse("auth-change-password")
        res = self.client.post(url, {"old_password": "salah", "new_password": "BaruKuat#2026"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.post(url, {"old_password": PASSWORD, "new_password": "BaruKuat#2026"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("BaruKuat#2026"))


class UserManagementTests(APITestCase):
    def setUp(self):
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER, nip="198001")
        self.student = make_user("siswa1", Role.STUDENT, nis="12345")
        self.list_url = reverse("user-list")

    def test_only_admin_can_list_users(self):
        for user in (self.teacher, self.student):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 3)

    def test_filter_by_role(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(self.list_url, {"role": Role.TEACHER})
        self.assertEqual([u["username"] for u in res.data["results"]], ["guru1"])

    def test_admin_creates_user(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "username": "siswa2",
            "full_name": "Siswa Dua",
            "role": Role.STUDENT,
            "nis": "",
            "nip": "999",
            "password": PASSWORD,
        }
        res = self.client.post(self.list_url, payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        user = User.objects.get(username="siswa2")
        self.assertTrue(user.check_password(PASSWORD))
        self.assertIsNone(user.nis)
        self.assertIsNone(user.nip)  # siswa tidak punya NIP
        self.assertNotIn("password", res.data)

    def test_create_user_requires_password(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(self.list_url, {"username": "x", "full_name": "X", "role": Role.STUDENT})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", res.data)

    def test_create_user_rejects_weak_password(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            self.list_url, {"username": "x", "full_name": "X", "role": Role.STUDENT, "password": "123"}
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", res.data)

    def test_admin_cannot_demote_or_delete_self(self):
        self.client.force_authenticate(self.admin)
        url = reverse("user-detail", args=[self.admin.pk])
        res = self.client.patch(url, {"role": Role.TEACHER})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.patch(url, {"is_active": False})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_resets_password(self):
        self.client.force_authenticate(self.admin)
        url = reverse("user-reset-password", args=[self.student.pk])
        res = self.client.post(url, {"new_password": "ResetKuat#2026"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("ResetKuat#2026"))

    def test_createsuperuser_gets_foundation_role(self):
        user = User.objects.create_superuser("root", "root@example.com", PASSWORD, full_name="Root")
        self.assertEqual(user.role, Role.FOUNDATION)


class ImpersonationTests(APITestCase):
    """Admin yayasan masuk ke akun lain tanpa password, lalu kembali ke akunnya sendiri."""

    def setUp(self):
        self.foundation = User.objects.create_user(
            username="yayasan", password=PASSWORD, full_name="Admin Yayasan", role=Role.FOUNDATION
        )
        self.teacher = make_user("guru1", Role.TEACHER, nip="1981")
        self.admin = make_user("admin1", Role.ADMIN)
        self.url = reverse("auth-impersonate")

    def impersonate(self, user):
        self.client.force_authenticate(self.foundation)
        res = self.client.post(self.url, {"user": user.pk})
        self.client.force_authenticate(None)
        return res

    def use_token(self, access):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def test_only_foundation_can_impersonate(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.post(self.url, {"user": self.teacher.pk})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_excludes_foundation_and_inactive(self):
        other = User.objects.create_user(username="yayasan2", password=PASSWORD, role=Role.FOUNDATION)
        inactive = make_user("lama", Role.TEACHER, is_active=False)
        self.client.force_authenticate(self.foundation)
        res = self.client.get(self.url, {"page_size": 100})
        ids = {row["id"] for row in res.data["results"]}
        self.assertIn(self.teacher.pk, ids)
        self.assertNotIn(other.pk, ids)
        self.assertNotIn(inactive.pk, ids)

    def test_filter_by_class_grade_and_major_with_classroom_options(self):
        school = default_school()
        year = "2026/2027"
        rpl = Classroom.objects.create(
            school=school, name="X RPL 1", grade="X", major="RPL", academic_year=year
        )
        tkj = Classroom.objects.create(
            school=school, name="XI TKJ 1", grade="XI", major="TKJ", academic_year=year
        )
        other = School.objects.create(code="mtsnj", name="MTs", level=Level.MTS)
        Classroom.objects.create(school=other, name="VII A", grade="VII", major="Umum", academic_year=year)
        siswa_rpl = make_user("rpl", Role.STUDENT, classroom=rpl)
        siswa_tkj = make_user("tkj", Role.STUDENT, classroom=tkj)
        self.client.force_authenticate(self.foundation)

        def ids(**params):
            res = self.client.get(self.url, {"page_size": 100, **params})
            return {row["id"] for row in res.data["results"]}

        self.assertEqual(ids(classroom=rpl.pk), {siswa_rpl.pk})
        self.assertEqual(ids(classroom__grade="XI"), {siswa_tkj.pk})
        self.assertEqual(ids(classroom__major="RPL"), {siswa_rpl.pk})
        self.assertIn(self.teacher.pk, ids())

        url = reverse("auth-impersonate-classrooms")
        names = [c["name"] for c in self.client.get(url, {"school": school.pk}).data]
        self.assertEqual(names, ["X RPL 1", "XI TKJ 1"])
        self.assertEqual(len(self.client.get(url).data), 3)
        self.assertEqual(self.client.get(url, {"school": "x"}).status_code, status.HTTP_400_BAD_REQUEST)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_impersonate_returns_tokens_of_target_and_logs(self):
        res = self.impersonate(self.teacher)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["user"]["id"], self.teacher.pk)
        self.assertEqual(res.data["user"]["impersonator"]["id"], self.foundation.pk)
        log = ImpersonationLog.objects.get()
        self.assertEqual((log.impersonator, log.target), (self.foundation, self.teacher))

        self.use_token(res.data["access"])
        me = self.client.get(reverse("auth-me")).data
        self.assertEqual(me["username"], "guru1")
        self.assertEqual(me["impersonator"]["full_name"], "Admin Yayasan")

    def test_marker_survives_token_refresh(self):
        refresh = self.impersonate(self.teacher).data["refresh"]
        tokens = self.client.post(reverse("auth-refresh"), {"refresh": refresh}).data
        self.use_token(tokens["access"])
        self.assertEqual(self.client.get(reverse("auth-me")).data["impersonator"]["id"], self.foundation.pk)

    def test_normal_login_has_no_impersonator(self):
        cache.clear()
        tokens = self.client.post(reverse("auth-login"), {"username": "guru1", "password": PASSWORD}).data
        self.use_token(tokens["access"])
        self.assertIsNone(self.client.get(reverse("auth-me")).data["impersonator"])

    def test_cannot_impersonate_foundation_or_inactive(self):
        other = User.objects.create_user(username="yayasan2", password=PASSWORD, role=Role.FOUNDATION)
        self.teacher.is_active = False
        self.teacher.save()
        for target in (other, self.teacher, self.foundation):
            self.assertEqual(self.impersonate(target).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ImpersonationLog.objects.exists())

    def test_cannot_change_password_while_impersonating(self):
        self.use_token(self.impersonate(self.teacher).data["access"])
        res = self.client.post(
            reverse("auth-change-password"), {"old_password": PASSWORD, "new_password": "BaruKuat#2026"}
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.check_password(PASSWORD))

    def test_impersonated_admin_cannot_impersonate_again(self):
        # Akun admin sekolah yang dimasuki tetap bukan admin yayasan, jadi tetap ditolak.
        self.use_token(self.impersonate(self.admin).data["access"])
        res = self.client.post(self.url, {"user": self.teacher.pk})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
