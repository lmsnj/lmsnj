import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role, User

from .models import DEFAULT_SCHOOL_NAME, SiteSettings

TEMP_MEDIA = tempfile.mkdtemp()
PNG = bytes.fromhex("89504e470d0a1a0a") + b"0" * 32
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


def make_user(username, role):
    return User.objects.create_user(username=username, password="x", full_name=username, role=role)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class BrandingTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.url = reverse("branding")

    def upload(self, name, data, **extra):
        return self.client.patch(
            self.url, {"logo": SimpleUploadedFile(name, data), **extra}, format="multipart"
        )

    def test_public_can_read_defaults_without_login(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["school_name"], DEFAULT_SCHOOL_NAME)
        self.assertIsNone(res.data["logo_url"])
        self.assertNotIn("logo", res.data)  # path file tidak dikirim ke klien

    def test_only_admin_can_change(self):
        self.assertEqual(
            self.client.patch(self.url, {"app_name": "X"}, format="json").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.client.force_authenticate(self.teacher)
        self.assertEqual(
            self.client.patch(self.url, {"app_name": "X"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_admin_changes_names_and_blank_name_rejected(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch(
            self.url, {"school_name": " SMK Baru ", "app_name": "E-Learning SMK", "slogan": ""}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual((res.data["school_name"], res.data["slogan"]), ("SMK Baru", ""))
        self.assertEqual(SiteSettings.objects.count(), 1)
        res = self.client.patch(self.url, {"school_name": "  "}, format="json")
        self.assertIn("school_name", res.data)

    def test_logo_upload_replace_serve_and_remove(self):
        self.client.force_authenticate(self.admin)
        res = self.upload("logo.png", PNG)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["logo_url"].startswith(reverse("branding-logo") + "?v="))
        first = SiteSettings.load().logo
        storage, first_name = first.storage, first.name
        self.assertTrue(storage.exists(first_name))

        # Logo bisa diambil tanpa login (untuk halaman login).
        self.client.force_authenticate(None)
        logo = self.client.get(reverse("branding-logo"))
        self.assertEqual(logo.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(logo.streaming_content), PNG)
        self.assertIn("immutable", logo["Cache-Control"])

        # Ganti logo: file lama dihapus.
        self.client.force_authenticate(self.admin)
        self.upload("logo2.png", PNG)
        self.assertFalse(storage.exists(first_name))

        # Hapus logo: kembali ke logo bawaan.
        second = SiteSettings.load().logo.name
        res = self.client.patch(self.url, {"remove_logo": True}, format="json")
        self.assertIsNone(res.data["logo_url"])
        self.assertFalse(storage.exists(second))
        self.assertEqual(self.client.get(reverse("branding-logo")).status_code, 404)

    def test_svg_and_fake_images_rejected(self):
        self.client.force_authenticate(self.admin)
        for name, data in [("logo.svg", SVG), ("logo.png", b"bukan gambar")]:
            res = self.upload(name, data)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, name)
            self.assertIn("logo", res.data)
        self.assertFalse(SiteSettings.load().logo)
