from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Role, User

PASSWORD = "RahasiaKuat#2026"


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password=PASSWORD, full_name=username.title(), role=role, **extra
    )


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

    def test_createsuperuser_gets_admin_role(self):
        user = User.objects.create_superuser("root", "root@example.com", PASSWORD, full_name="Root")
        self.assertEqual(user.role, Role.ADMIN)
