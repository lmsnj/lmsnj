"""Konten tambahan materi (MaterialItem): kelola oleh guru, akses siswa, dan syarat "membuka semua konten"."""

import shutil
import tempfile
from pathlib import Path

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role
from apps.common.testing import default_school

from .models import Material, MaterialItem
from .serializers import MAX_ITEMS
from .tests import make_user, pdf_file

TEMP_MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEMP_MEDIA, MAX_UPLOAD_SIZE_MB=1)
class MaterialItemTests(APITestCase):
    url = reverse("material-item-list")

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        school = default_school()
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.other_teacher = make_user("guru2", Role.TEACHER)
        rpl = Classroom.objects.create(
            school=school, name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027"
        )
        tkj = Classroom.objects.create(
            school=school, name="XI TKJ 1", grade="XI", major="TKJ", academic_year="2026/2027"
        )
        web = Subject.objects.create(school=school, code="PWEB", name="Pemrograman Web")
        assignment = TeachingAssignment.objects.create(teacher=self.teacher, subject=web, classroom=rpl)
        TeachingAssignment.objects.create(teacher=self.other_teacher, subject=web, classroom=tkj)
        self.student = make_user("siswa1", Role.STUDENT, classroom=rpl)
        self.student_tkj = make_user("siswa2", Role.STUDENT, classroom=tkj)
        self.m1 = Material.objects.create(
            teaching_assignment=assignment, title="Pengantar", material_type="video",
            url="https://youtu.be/abcdefghijk", is_published=True, order=1, require_reflection=False,
        )  # fmt: skip
        self.m2 = Material.objects.create(
            teaching_assignment=assignment, title="Lanjutan", material_type="link",
            url="https://contoh.id", is_published=True, order=2, require_reflection=False,
        )  # fmt: skip

    def add_item(self, user=None, **extra):
        self.client.force_authenticate(user or self.teacher)
        payload = {"material": self.m1.id, "title": "Ringkasan", "material_type": "pdf", "file": pdf_file()}
        payload.update(extra)
        return self.client.post(self.url, payload, format="multipart")

    def student_material(self, material):
        self.client.force_authenticate(self.student)
        return self.client.get(reverse("material-detail", args=[material.id])).data

    def test_teacher_adds_items_in_order(self):
        res = self.add_item()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertNotIn("file", res.data)
        self.assertTrue(res.data["has_file"])
        self.assertEqual(res.data["order"], 1)
        res = self.add_item(title="Video", material_type="video", url="https://youtu.be/xyz12345678", file="")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["order"], 2)
        items = self.client.get(reverse("material-detail", args=[self.m1.id])).data["items"]
        self.assertEqual([i["title"] for i in items], ["Ringkasan", "Video"])

    def test_validation(self):
        self.assertIn("file", self.add_item(file="").data)
        self.assertIn("file", self.add_item(file=pdf_file(content=b"bukan pdf")).data)
        self.assertIn("url", self.add_item(material_type="link", file="").data)
        for number in range(MAX_ITEMS):
            MaterialItem.objects.create(
                material=self.m1, title=f"K{number}", material_type="link", url="https://a.id"
            )
        self.assertIn("material", self.add_item().data)

    def test_only_owner_teacher_manages(self):
        self.assertEqual(self.add_item(self.other_teacher).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.add_item(self.admin).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.add_item(self.student).status_code, status.HTTP_403_FORBIDDEN)
        item_id = self.add_item().data["id"]
        detail = reverse("material-item-detail", args=[item_id])
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.patch(detail, {"title": "X"}).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.teacher)
        res = self.client.patch(detail, {"material": self.m2.id})
        self.assertIn("material", res.data)

    def test_delete_removes_file_also_when_material_deleted(self):
        item = MaterialItem.objects.get(pk=self.add_item().data["id"])
        path = Path(item.file.path)
        self.assertTrue(path.exists())
        self.client.force_authenticate(self.teacher)
        self.client.delete(reverse("material-detail", args=[self.m1.id]))
        self.assertFalse(MaterialItem.objects.exists())
        self.assertFalse(path.exists())

    def test_replace_file_removes_old(self):
        item = MaterialItem.objects.get(pk=self.add_item().data["id"])
        old = Path(item.file.path)
        res = self.client.patch(
            reverse("material-item-detail", args=[item.id]),
            {"file": pdf_file("baru.pdf")},
            format="multipart",
        )
        self.assertEqual(res.data["original_filename"], "baru.pdf")
        self.assertFalse(old.exists())

    def test_student_access_and_download(self):
        item_id = self.add_item().data["id"]
        download = reverse("material-item-download", args=[item_id])
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(download).status_code, status.HTTP_200_OK)
        self.client.force_authenticate(self.student_tkj)
        self.assertEqual(self.client.get(download).status_code, status.HTTP_404_NOT_FOUND)
        # Materi draf: kontennya ikut tersembunyi.
        Material.objects.filter(pk=self.m1.id).update(is_published=False)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(download).status_code, status.HTTP_404_NOT_FOUND)

    def test_all_contents_must_be_opened(self):
        first = self.add_item().data["id"]
        second = self.add_item(
            title="Video", material_type="video", url="https://youtu.be/xyz12345678", file=""
        )
        second = second.data["id"]

        data = self.student_material(self.m1)
        opened = next(c for c in data["progress"]["checks"] if c["key"] == "opened")
        self.assertEqual(opened["label"], "Membuka 3 konten materi")
        self.client.post(reverse("material-open", args=[self.m1.id]))
        res = self.client.post(reverse("material-item-open", args=[first]))
        self.assertEqual(res.data["progress"]["opened_items"], [first])
        self.assertFalse(res.data["progress"]["completed"])
        self.assertTrue(self.student_material(self.m2)["progress"]["locked"])

        res = self.client.post(reverse("material-item-open", args=[second]))
        self.client.post(reverse("material-item-open", args=[second]))  # dibuka lagi: tidak dobel
        self.assertTrue(res.data["progress"]["completed"])
        self.assertEqual(self.student_material(self.m1)["progress"]["opened_items"], [first, second])
        self.assertFalse(self.student_material(self.m2)["progress"]["locked"])

    def test_locked_material_hides_item_content(self):
        MaterialItem.objects.create(
            material=self.m2, title="Video", material_type="video", url="https://a.id/v"
        )
        item = MaterialItem.objects.create(material=self.m2, title="PDF", material_type="pdf")
        data = self.student_material(self.m2)
        self.assertTrue(data["progress"]["locked"])
        self.assertEqual({i["url"] for i in data["items"]}, {""})
        for name in ("material-item-open", "material-item-download"):
            method = self.client.post if name.endswith("open") else self.client.get
            self.assertEqual(method(reverse(name, args=[item.id])).status_code, status.HTTP_403_FORBIDDEN)

    def test_reorder(self):
        a = self.add_item(title="A").data["id"]
        b = self.add_item(title="B").data["id"]
        url = reverse("material-item-reorder")
        self.assertEqual(
            self.client.post(url, {"material": self.m1.id, "items": [a]}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.client.post(url, {"material": self.m1.id, "items": [b, a]}, format="json")
        items = self.client.get(reverse("material-detail", args=[self.m1.id])).data["items"]
        self.assertEqual([i["title"] for i in items], ["B", "A"])
        self.client.force_authenticate(self.other_teacher)
        res = self.client.post(url, {"material": self.m1.id, "items": [a, b]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
