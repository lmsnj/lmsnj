"""Latihan Pemahaman per materi: diatur guru, dikerjakan siswa setelah membuka semua konten,
harus benar semua (boleh mengulang), dan menjadi syarat sebelum Cerita Reflektif."""

import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from openpyxl import Workbook, load_workbook
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role
from apps.common.testing import default_school

from .models import Material, MaterialItem, MaterialProgress
from .objective_quiz import PRACTICE_MAX_QUESTIONS
from .test_objective_quiz import QUIZ, correct_answers, member

HEADER = ["Jenis", "Pertanyaan", "Kalimat [[...]]", "Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D",
          "Pilihan E", "Kunci", "Pembahasan"]  # fmt: skip


def workbook_bytes(rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Latihan"
    sheet.append(HEADER)
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


class PracticeTests(APITestCase):
    def setUp(self):
        school = default_school()
        self.teacher = member("guru1", Role.TEACHER, school)
        self.other_teacher = member("guru2", Role.TEACHER, school)
        room = Classroom.objects.create(
            school=school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )
        self.student = member("siswa1", Role.STUDENT, school, classroom=room)
        assignment = TeachingAssignment.objects.create(
            teacher=self.teacher,
            subject=Subject.objects.create(school=school, code="DDP", name="DDP"),
            classroom=room,
        )
        self.material = Material.objects.create(
            teaching_assignment=assignment, title="Flowgorithm", material_type="link", url="https://example.com",
            is_published=True, order=1, require_reflection=True, created_by=self.teacher,
        )  # fmt: skip
        self.next_material = Material.objects.create(
            teaching_assignment=assignment, title="Lanjutan", material_type="link", url="https://example.com",
            is_published=True, order=2, created_by=self.teacher,
        )  # fmt: skip
        self.url = reverse("material-practice", args=[self.material.id])
        self.client.force_authenticate(self.teacher)
        response = self.client.put(self.url, {"items": QUIZ}, format="json")
        self.assertEqual(response.data["count"], 4)

    def as_student(self):
        self.client.force_authenticate(self.student)

    def open_material(self):
        self.as_student()
        self.client.post(reverse("material-open", args=[self.material.id]))

    def practice_check(self, data):
        return next((c for c in data["progress"]["checks"] if c["key"] == "practice"), None)

    def material_data(self):
        return self.client.get(reverse("material-detail", args=[self.material.id])).data

    def test_practice_listed_as_requirement(self):
        self.as_student()
        data = self.material_data()
        self.assertEqual(data["practice_count"], 4)
        self.assertEqual(self.practice_check(data)["label"], "Lulus Latihan Pemahaman (4 soal)")
        self.assertFalse(self.practice_check(data)["done"])

    def test_must_open_all_contents_first(self):
        item = MaterialItem.objects.create(
            material=self.material, title="Video", material_type="link", url="https://a.id"
        )
        self.open_material()
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_400_BAD_REQUEST)
        self.client.post(reverse("material-item-open", args=[item.id]))
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_200_OK)

    def test_wrong_then_retry_until_all_correct(self):
        self.open_material()
        items = self.client.get(self.url).data["items"]
        self.assertNotIn("correct_choice", str(items))
        answers = correct_answers(items)
        answers[items[1]["id"]] = {"gaps": ["2"]}
        response = self.client.post(self.url, {"answers": answers}, format="json")
        self.assertFalse(response.data["passed"])
        self.assertNotIn("explanation", str(response.data["results"]))
        self.assertFalse(self.practice_check(response.data["material"])["done"])

        items = self.client.get(self.url).data["items"]
        response = self.client.post(self.url, {"answers": correct_answers(items)}, format="json")
        self.assertTrue(response.data["passed"])
        self.assertIn("Dua tambah dua.", str(response.data["results"]))
        self.assertTrue(self.practice_check(response.data["material"])["done"])
        self.assertTrue(response.data["material"]["progress"]["practice_passed"])

    def test_reflection_waits_for_practice(self):
        self.open_material()
        reflection_url = reverse("material-reflection", args=[self.material.id])
        text = {"reflection": "Saya belajar membuat flowchart sederhana hari ini."}
        response = self.client.post(reflection_url, text, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Latihan Pemahaman", str(response.data))

        items = self.client.get(self.url).data["items"]
        self.client.post(self.url, {"answers": correct_answers(items)}, format="json")
        self.assertEqual(
            self.client.post(reflection_url, text, format="json").status_code, status.HTTP_200_OK
        )
        response = self.client.get(reverse("material-detail", args=[self.next_material.id]))
        self.assertFalse(response.data["progress"]["locked"])

    def test_teacher_preview_and_permissions(self):
        self.client.force_authenticate(self.teacher)
        items = self.client.get(self.url).data["items"]
        response = self.client.post(self.url, {"answers": correct_answers(items)}, format="json")
        self.assertTrue(response.data["passed"])
        self.assertFalse(MaterialProgress.objects.exists())

        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.put(self.url, {"items": QUIZ}, format="json").status_code, 404)
        self.as_student()
        self.assertEqual(self.client.put(self.url, {"items": []}, format="json").status_code, 403)

    def test_invalid_and_remove(self):
        self.client.force_authenticate(self.teacher)
        too_many = [QUIZ[0]] * (PRACTICE_MAX_QUESTIONS + 1)
        self.assertEqual(self.client.put(self.url, {"items": too_many}, format="json").status_code, 400)
        bad = [{"kind": "choice", "text": "Soal", "choices": ["A"], "correct_choice": 0}]
        self.assertEqual(self.client.put(self.url, {"items": bad}, format="json").status_code, 400)
        self.assertEqual(self.client.put(self.url, {"items": []}, format="json").data["count"], 0)
        self.open_material()
        self.assertIsNone(self.practice_check(self.material_data()))
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_400_BAD_REQUEST)

    def test_excel_template_round_trip_and_import(self):
        self.client.force_authenticate(self.teacher)
        template = self.client.get(reverse("material-practice-template", args=[self.material.id]))
        self.assertEqual(template.status_code, status.HTTP_200_OK)
        sheet = load_workbook(io.BytesIO(template.content))["Latihan"]
        self.assertEqual(sheet.cell(row=2, column=1).value, "pg")
        self.assertEqual(sheet.cell(row=2, column=2).value, "2 + 2 = ...")

        import_url = reverse("material-practice-import", args=[self.material.id])

        def upload(content, dry_run):
            file = SimpleUploadedFile("latihan.xlsx", content)
            return self.client.post(import_url, {"file": file, "dry_run": dry_run}, format="multipart")

        # Template yang diunduh langsung lolos diperiksa.
        response = upload(template.content, "true")
        self.assertEqual(response.data["summary"], {"total": 4, "valid": 4, "invalid": 0})

        rows = [
            ["pg", "Ibu kota?", "", "Bandung", "Jakarta", "", "", "", "B", ""],
            ["isian", "", "Tanpa celah", "", "", "", "", "", "", ""],
        ]
        response = upload(workbook_bytes(rows), "false")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.material.refresh_from_db()
        self.assertEqual(len(self.material.practice_quiz["content"]), 4)

        response = upload(workbook_bytes(rows[:1]), "false")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.material.refresh_from_db()
        self.assertEqual([i["text"] for i in self.material.practice_quiz["spec"]], ["Ibu kota?"])

        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(upload(workbook_bytes(rows[:1]), "false").status_code, 404)
