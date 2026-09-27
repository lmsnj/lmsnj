import shutil
import tempfile
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User

from .models import Material, MaterialType

PASSWORD = "RahasiaKuat#2026"
TEMP_MEDIA = tempfile.mkdtemp()


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password=PASSWORD, full_name=username.title(), role=role, **extra
    )


def pdf_file(name="modul.pdf", content=b"%PDF-1.4 isi materi"):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


@override_settings(MEDIA_ROOT=TEMP_MEDIA, MAX_UPLOAD_SIZE_MB=1)
class MaterialTests(APITestCase):
    url = reverse("material-list")

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.other_teacher = make_user("guru2", Role.TEACHER)
        rpl = Classroom.objects.create(name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027")
        tkj = Classroom.objects.create(name="XI TKJ 1", grade="XI", major="TKJ", academic_year="2026/2027")
        web = Subject.objects.create(code="PWEB", name="Pemrograman Web")
        self.assignment = TeachingAssignment.objects.create(teacher=self.teacher, subject=web, classroom=rpl)
        self.other_assignment = TeachingAssignment.objects.create(
            teacher=self.other_teacher, subject=web, classroom=tkj
        )
        self.student = make_user("siswa1", Role.STUDENT, classroom=rpl)
        self.student_tkj = make_user("siswa2", Role.STUDENT, classroom=tkj)

    def create_pdf(self, **extra):
        self.client.force_authenticate(self.teacher)
        payload = {
            "teaching_assignment": self.assignment.id,
            "title": "Modul HTML",
            "material_type": MaterialType.PDF,
            "file": pdf_file(),
            **extra,
        }
        return self.client.post(self.url, payload, format="multipart")

    def test_teacher_uploads_pdf(self):
        res = self.create_pdf(is_published=True)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertTrue(res.data["has_file"])
        self.assertEqual(res.data["original_filename"], "modul.pdf")
        self.assertNotIn("file", res.data)  # path file tidak pernah dikirim ke klien
        material = Material.objects.get()
        self.assertEqual(material.created_by, self.teacher)
        self.assertNotIn("modul", material.file.name)  # nama file diacak

    def test_pdf_validation(self):
        self.client.force_authenticate(self.teacher)
        base = {"teaching_assignment": self.assignment.id, "title": "X", "material_type": MaterialType.PDF}
        self.assertIn("file", self.client.post(self.url, base, format="multipart").data)
        res = self.client.post(self.url, {**base, "file": pdf_file("virus.exe")}, format="multipart")
        self.assertIn("file", res.data)
        res = self.client.post(self.url, {**base, "file": pdf_file(content=b"bukan pdf")}, format="multipart")
        self.assertIn("file", res.data)
        big = pdf_file(content=b"%PDF-" + b"0" * (1024 * 1024 + 1))
        res = self.client.post(self.url, {**base, "file": big}, format="multipart")
        self.assertIn("file", res.data)

    def test_video_and_link_require_url(self):
        self.client.force_authenticate(self.teacher)
        base = {
            "teaching_assignment": self.assignment.id,
            "title": "Video",
            "material_type": MaterialType.VIDEO,
        }
        self.assertIn("url", self.client.post(self.url, base).data)
        res = self.client.post(self.url, {**base, "url": "javascript:alert(1)"})
        self.assertIn("url", res.data)
        res = self.client.post(self.url, {**base, "url": "https://youtu.be/abc123"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data["has_file"])

    def test_teacher_cannot_post_to_other_assignment(self):
        self.client.force_authenticate(self.teacher)
        res = self.client.post(
            self.url,
            {
                "teaching_assignment": self.other_assignment.id,
                "title": "X",
                "material_type": MaterialType.LINK,
                "url": "https://example.com",
            },
        )
        self.assertIn("teaching_assignment", res.data)

    def test_admin_and_student_cannot_create(self):
        for user in (self.admin, self.student):
            self.client.force_authenticate(user)
            res = self.client.post(self.url, {"title": "X"})
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_visibility_by_role(self):
        self.create_pdf(title="Draf")
        self.create_pdf(title="Terbit", is_published=True)
        Material.objects.create(
            teaching_assignment=self.other_assignment,
            title="Milik guru lain",
            material_type=MaterialType.LINK,
            url="https://example.com",
            is_published=True,
        )

        def titles(user):
            self.client.force_authenticate(user)
            return sorted(m["title"] for m in self.client.get(self.url).data["results"])

        self.assertEqual(titles(self.teacher), ["Draf", "Terbit"])
        self.assertEqual(titles(self.student), ["Terbit"])
        self.assertEqual(titles(self.student_tkj), ["Milik guru lain"])
        self.assertEqual(len(titles(self.admin)), 3)

    def test_download_checks_access(self):
        material_id = self.create_pdf(is_published=True).data["id"]
        url = reverse("material-download", args=[material_id])

        self.client.force_authenticate(self.student)
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(res.streaming_content), b"%PDF-1.4 isi materi")
        self.assertIn("modul.pdf", res["Content-Disposition"])

        self.client.force_authenticate(self.student_tkj)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_student_cannot_download_draft(self):
        material_id = self.create_pdf().data["id"]
        self.client.force_authenticate(self.student)
        res = self.client.get(reverse("material-download", args=[material_id]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_replace_file_and_switch_type_removes_old_file(self):
        material_id = self.create_pdf().data["id"]
        detail = reverse("material-detail", args=[material_id])
        first_path = Path(Material.objects.get().file.path)

        res = self.client.patch(detail, {"file": pdf_file("revisi.pdf")}, format="multipart")
        self.assertEqual(res.data["original_filename"], "revisi.pdf")
        second_path = Path(Material.objects.get().file.path)
        self.assertFalse(first_path.exists())
        self.assertTrue(second_path.exists())

        res = self.client.patch(detail, {"material_type": MaterialType.LINK, "url": "https://example.com"})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertFalse(res.data["has_file"])
        self.assertFalse(second_path.exists())

    def test_publish_toggle_and_title_edit_keep_file(self):
        material_id = self.create_pdf().data["id"]
        res = self.client.patch(reverse("material-detail", args=[material_id]), {"is_published": True})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["is_published"])
        self.assertTrue(res.data["has_file"])

    def test_cannot_move_material_to_another_assignment(self):
        material_id = self.create_pdf().data["id"]
        other = TeachingAssignment.objects.create(
            teacher=self.teacher,
            subject=Subject.objects.create(code="PBO", name="PBO"),
            classroom=self.assignment.classroom,
        )
        res = self.client.patch(
            reverse("material-detail", args=[material_id]), {"teaching_assignment": other.id}
        )
        self.assertIn("teaching_assignment", res.data)

    def test_other_teacher_cannot_edit_but_admin_can_delete(self):
        material_id = self.create_pdf().data["id"]
        path = Path(Material.objects.get().file.path)
        detail = reverse("material-detail", args=[material_id])
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.patch(detail, {"title": "X"}).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(detail, {"title": "X"}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.delete(detail).status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(path.exists())

    def test_assignment_with_materials_cannot_be_deleted(self):
        self.create_pdf()
        self.client.force_authenticate(self.admin)
        res = self.client.delete(reverse("teaching-assignment-detail", args=[self.assignment.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
