"""Laporan media: progres, kesulitan, N-Gain, siswa tidak aktif + pengingat, refleksi, ekspor, hak akses."""

from datetime import timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import Role
from apps.assessments.models import Assessment, Attempt, Question
from apps.chat.models import Message
from apps.common.excel import open_workbook

from ..models import InteractiveMediaProgress
from ..reports import ngain, ngain_category
from .samples import correct_response, wrong_response
from .test_api import MediaTestCase, member


class ReportTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        self.student2 = member("siswa2", Role.STUDENT, self.school, classroom=self.room)
        self.student2.full_name = "Budi Santoso"
        self.student2.save(update_fields=["full_name"])
        self.pre = self.make_test("Tes Awal")
        self.post = self.make_test("Tes Akhir")
        self.material = self.make_material({"pretest": self.pre.id, "posttest": self.post.id})
        # Tes Awal wajib sebelum stasiun pertama.
        self.score(self.pre, self.student, 4)  # 40
        self.score(self.pre, self.student2, 5)  # 50

    def make_test(self, title):
        assessment = Assessment.objects.create(
            teaching_assignment=self.assignment,
            title=title,
            due_at=timezone.now() + timedelta(days=7),
            is_published=True,
        )
        Question.objects.create(
            assessment=assessment, kind="choice", text="?", choices=["a", "b"], correct_choice=0, points=10
        )
        return assessment

    def score(self, assessment, student, value):
        Attempt.objects.create(
            assessment=assessment, student=student, submitted_at=timezone.now(), score=Decimal(value)
        )

    def play(self, student):
        self.client.force_authenticate(student)
        data = self.client.get(reverse("media-play", args=[self.material.id])).data
        return [
            s
            for p in data["content"]["parts"]
            for st in p["stations"]
            if st["id"] == "s1"
            for s in st["steps"]
        ]

    def answer(self, step, response):
        return self.client.post(
            reverse("media-answer", args=[self.material.id]),
            {"station": "s1", "step": step["id"], "response": response},
            format="json",
        )

    def report(self, user=None):
        self.client.force_authenticate(user or self.teacher)
        response = self.client.get(reverse("media-report", args=[self.material.id]))
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_ngain_formula(self):
        self.assertEqual(ngain(40, 70), 0.5)
        self.assertEqual(ngain(100, 100), None)
        self.assertEqual(ngain(None, 80), None)
        self.assertEqual(
            (ngain_category(0.75), ngain_category(0.3), ngain_category(-0.2)), ("Tinggi", "Sedang", "Rendah")
        )

    def test_progress_difficulty_and_ngain(self):
        # Siswa pertama: salah lalu benar di PG, tuntaskan stasiun 1. Siswa kedua salah di PG.
        for student in (self.student, self.student2):
            steps = self.play(student)
            choice = next(s for s in steps if s["kind"] == "choice")
            self.answer(choice, wrong_response(choice))
            self.answer(choice, wrong_response(choice))
        steps = self.play(self.student)
        for step in steps:
            if step["graded"]:
                self.assertTrue(self.answer(step, correct_response(step)).data["correct"])
        finish = self.client.post(
            reverse("media-station", args=[self.material.id]),
            {"station": "s1", "action": "finish"},
            format="json",
        )
        self.assertEqual(finish.status_code, 200, finish.data)
        self.score(self.post, self.student, 7)  # 70

        data = self.report()
        self.assertEqual(data["pretest"]["title"], "Tes Awal")
        first = next(r for r in data["rows"] if r["student"] == self.student.id)
        second = next(r for r in data["rows"] if r["student"] == self.student2.id)
        self.assertTrue(first["stations"]["s1"]["done"])
        self.assertEqual(
            (first["pretest"], first["posttest"], first["ngain"], first["ngain_category"]),
            (40, 70, 0.5, "Sedang"),
        )
        self.assertIsNone(second["ngain"])
        self.assertEqual(data["summary"]["average_ngain"], 0.5)
        hardest = data["difficulty"][0]
        self.assertEqual(hardest["kind"], "Pilihan ganda")
        self.assertEqual(hardest["wrong"], 4)
        self.assertEqual(hardest["wrong_students"], 2)
        self.assertTrue(hardest["top_wrong"])
        self.assertNotIn(self.student.id, [r["student"] for r in data["rows"] if r["inactive"]])

    def test_inactive_and_reminder(self):
        steps = self.play(self.student)
        self.answer(steps[2], wrong_response(steps[2]))
        InteractiveMediaProgress.objects.filter(student=self.student).update(
            updated_at=timezone.now() - timedelta(days=5)
        )
        from ..models import InteractiveMediaAttempt

        InteractiveMediaAttempt.objects.filter(student=self.student).update(
            created_at=timezone.now() - timedelta(days=5)
        )
        data = self.report()
        inactive = {r["student"] for r in data["rows"] if r["inactive"]}
        self.assertEqual(inactive, {self.student.id, self.student2.id})  # siswa2 belum pernah membuka media
        response = self.client.post(
            reverse("media-remind", args=[self.material.id]),
            {
                "students": [self.student.id, self.student2.id],
                "message": "Halo {nama}, ayo lanjutkan medianya.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["sent"], 2)
        self.assertTrue(
            Message.objects.filter(sender=self.teacher, body="Halo Budi, ayo lanjutkan medianya.").exists()
        )

    def test_reflections_and_export(self):
        self.client.force_authenticate(self.student)
        self.client.post(
            reverse("media-reflection", args=[self.material.id]),
            {"station": "s1", "text": "Saya paham algoritma itu urutan langkah."},
            format="json",
        )
        data = self.report()
        self.assertEqual(data["reflections"][0]["text"], "Saya paham algoritma itu urutan langkah.")
        response = self.client.get(reverse("media-report-export", args=[self.material.id]))
        self.assertEqual(response.status_code, 200)
        from django.core.files.uploadedfile import SimpleUploadedFile

        workbook = open_workbook(SimpleUploadedFile("l.xlsx", response.content))
        self.assertEqual(workbook.sheetnames, ["Progres", "Kesulitan", "Refleksi"])
        names = [row[0] for row in workbook["Progres"].iter_rows(min_row=2, values_only=True)]
        self.assertIn("Budi Santoso", names)

    def test_access(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(reverse("media-report", args=[self.material.id])).status_code, 403)
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(reverse("media-report", args=[self.material.id])).status_code, 404)
        self.report(self.admin)
