import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from openpyxl import load_workbook
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.common.testing import default_school

from .models import Material
from .objective_quiz import quiz_counts, set_quizzes

EXISTING = [
    {"kind": "choice", "text": "2 + 2 = ...", "choices": ["3", "4"], "correct_choice": 1, "explanation": "Empat."},
    {"kind": "matching", "text": "Pasangkan.", "pairs": [{"left": "Input", "right": "Membaca"},
     {"left": "Output", "right": "Menampilkan"}], "distractors": ["Menghapus"]},
]  # fmt: skip
HEADER = ["No Capaian", "Jenis", "Pertanyaan", "Kalimat [[...]]", "Pilihan A", "Pilihan B", "Pilihan C",
          "Pilihan D", "Pilihan E", "Kunci", "Pembahasan"]  # fmt: skip


def workbook_bytes(rows):
    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Kuis"
    sheet.append(HEADER)
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


class ObjectiveQuizExcelTests(APITestCase):
    def setUp(self):
        school = default_school()
        self.teacher = User.objects.create(username="guru1", role=Role.TEACHER, full_name="Guru")
        self.teacher.schools.add(school)
        self.other = User.objects.create(username="guru2", role=Role.TEACHER, full_name="Guru Lain")
        self.other.schools.add(school)
        room = Classroom.objects.create(
            school=school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )
        subject = Subject.objects.create(school=school, code="DDP", name="DDP")
        assignment = TeachingAssignment.objects.create(teacher=self.teacher, subject=subject, classroom=room)
        # Guru mapel lain di kelas yang sama (bukan tim pengampu DDP) tidak boleh mengatur kuis.
        other_subject = Subject.objects.create(school=school, code="BINDO", name="Bahasa Indonesia")
        TeachingAssignment.objects.create(teacher=self.other, subject=other_subject, classroom=room)
        self.material = Material.objects.create(
            teaching_assignment=assignment, title="Flowgorithm", material_type="link", url="https://example.com",
            objectives=["Capaian satu", "Capaian dua", "Capaian tiga"], created_by=self.teacher,
        )  # fmt: skip
        set_quizzes(self.material, {"0": EXISTING})
        self.template_url = reverse("material-objective-quiz-template", args=[self.material.id])
        self.import_url = reverse("material-objective-quiz-import", args=[self.material.id])
        self.client.force_authenticate(self.teacher)

    def upload(self, content, dry_run=True):
        return self.client.post(
            self.import_url,
            {"file": SimpleUploadedFile("kuis.xlsx", content), "dry_run": "true" if dry_run else "false"},
            format="multipart",
        )

    def test_template_contains_existing_quiz_and_objectives(self):
        response = self.client.get(self.template_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        workbook = load_workbook(io.BytesIO(response.content))
        rows = [r for r in workbook["Kuis"].iter_rows(min_row=2, values_only=True) if any(r)]
        self.assertEqual(rows[0][:5], ("1", "pg", "2 + 2 = ...", None, "3"))
        self.assertEqual(rows[0][9], "B")
        self.assertEqual(rows[1][4:7], ("Input = Membaca", "Output = Menampilkan", "= Menghapus"))
        guide = " ".join(str(c.value) for c in workbook["Petunjuk"]["A"] if c.value)
        self.assertIn("3. Capaian tiga", guide)

    def test_round_trip_is_valid(self):
        content = self.client.get(self.template_url).content
        response = self.upload(content)
        self.assertEqual(response.data["summary"], {"total": 2, "valid": 2, "invalid": 0})

    def test_import_replaces_only_objectives_in_file(self):
        rows = [
            ["2", "isian", "Lengkapi.", "Hasil 17 % 5 adalah [[2]].", "", "", "", "", "", "", "Sisa bagi."],
            ["2", "seret", "", "[[Declare]] lalu [[Input]]", "If", "", "", "", "", "", ""],
            ["2", "pg", "Elemen perulangan?", "", "If", "While", "", "", "", "b", ""],
        ]
        check = self.upload(workbook_bytes(rows))
        self.assertEqual(check.data["summary"]["invalid"], 0, check.data)
        self.assertEqual(quiz_counts(self.material), [2, 0, 0])  # periksa saja belum menyimpan
        saved = self.upload(workbook_bytes(rows), dry_run=False)
        self.assertEqual(saved.status_code, status.HTTP_201_CREATED, saved.data)
        self.assertEqual(saved.data["created"], 3)
        self.material.refresh_from_db()
        self.assertEqual(quiz_counts(self.material), [2, 3, 0])

    def test_row_errors(self):
        rows = [
            ["1", "pg", "Soal", "", "a", "b", "", "", "", "D", ""],  # kunci di luar pilihan
            ["2", "isian", "Soal", "tanpa kurung siku", "", "", "", "", "", "", ""],
            ["9", "pg", "Soal", "", "a", "b", "", "", "", "A", ""],  # capaian tidak ada
            ["3", "jodohkan", "Soal", "", "tanpa sama dengan", "", "", "", "", "", ""],
            ["3", "esai", "Soal", "", "", "", "", "", "", "", ""],
        ]
        response = self.upload(workbook_bytes(rows), dry_run=False)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = [" ".join(r["errors"]) for r in response.data["rows"]]
        self.assertIn("Kunci pg", errors[0])
        self.assertIn("[[...]]", errors[1])
        self.assertIn("No Capaian", errors[2])
        self.assertIn("kiri = kanan", errors[3])
        self.assertIn("Jenis", errors[4])
        self.material.refresh_from_db()
        self.assertEqual(quiz_counts(self.material), [2, 0, 0])

    def test_too_many_questions_per_objective(self):
        rows = [["3", "pg", f"Soal {i}", "", "a", "b", "", "", "", "A", ""] for i in range(6)]
        response = self.upload(workbook_bytes(rows))
        self.assertEqual(response.data["summary"]["invalid"], 6)

    def test_only_owner_teacher(self):
        self.client.force_authenticate(self.other)
        self.assertIn(self.client.get(self.template_url).status_code, (403, 404))
        self.assertIn(self.upload(workbook_bytes([])).status_code, (403, 404))
