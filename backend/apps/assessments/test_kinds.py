"""Test PG kompleks (MCMA), soal kategori (Benar/Salah), soal grup, dan tanda ragu-ragu."""

import io
import zipfile
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from openpyxl import Workbook
from rest_framework import status

from .models import Answer, Question
from .question_import import COLUMNS, EXAMPLES, parse_text
from .tests import AssessmentTestBase

PNG = bytes.fromhex("89504e470d0a1a0a") + b"0" * 32


class KindsTestBase(AssessmentTestBase):
    def add_complex_questions(self, assessment):
        self.multi = Question.objects.create(
            assessment=assessment, order=2, kind="multiple", text="Sama dengan $\\frac{1}{2}$?", points=3,
            choices=["$\\frac{2}{4}$", "$0{,}5$", "$\\frac{3}{5}$"], correct_choices=[0, 1],
        )  # fmt: skip
        self.category = Question.objects.create(
            assessment=assessment, order=3, kind="category", text="Benar atau salah?", points=4,
            choices=["Tag <br> tanpa penutup", "href untuk gambar"], correct_choices=[0, 1],
            category_labels=["Benar", "Salah"],
        )  # fmt: skip


class ComplexAuthoringTests(KindsTestBase):
    def setUp(self):
        super().setUp()
        self.assessment = self.make_assessment(published=False)
        self.client.force_authenticate(self.teacher)
        self.url = reverse("assessment-question-list")

    def post(self, **data):
        return self.client.post(
            self.url, {"assessment": self.assessment.id, "text": "Soal", **data}, format="json"
        )

    def test_multiple_needs_at_least_two_correct_choices(self):
        res = self.post(kind="multiple", choices=["a", "b", "c"], correct_choices=[1])
        self.assertIn("correct_choices", res.data)
        res = self.post(kind="multiple", choices=["a", "b", "c"], correct_choices=[5, 1])
        self.assertIn("correct_choices", res.data)
        res = self.post(kind="multiple", choices=["a", "b", "c"], correct_choices=[2, 0, 2])
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["correct_choices"], [0, 2])
        self.assertIsNone(res.data["correct_choice"])

    def test_category_needs_key_for_every_statement(self):
        res = self.post(kind="category", choices=["p1", "p2"], correct_choices=[0])
        self.assertIn("correct_choices", res.data)
        res = self.post(kind="category", choices=["p1", "p2"], correct_choices=[0, 2])
        self.assertIn("correct_choices", res.data)
        res = self.post(kind="category", choices=["p1"], correct_choices=[0], category_labels=["Ya", ""])
        self.assertIn("category_labels", res.data)
        res = self.post(kind="category", choices=["p1", "p2"], correct_choices=[1, 0])
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["category_labels"], ["Benar", "Salah"])  # label bawaan

    def test_changing_kind_clears_other_keys_and_group_is_trimmed(self):
        res = self.post(kind="multiple", choices=["a", "b"], correct_choices=[0, 1], group="  G1 ")
        self.assertEqual(res.data["group"], "G1")
        detail = reverse("assessment-question-detail", args=[res.data["id"]])
        res = self.client.patch(detail, {"kind": "choice", "correct_choice": 1}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["correct_choices"], [])
        res = self.client.patch(detail, {"kind": "essay"}, format="json")
        self.assertEqual((res.data["choices"], res.data["correct_choice"]), ([], None))

    def test_publish_requires_complex_answer_keys(self):
        Question.objects.create(
            assessment=self.assessment, order=5, kind="category", text="x", choices=["a", "b"],
            correct_choices=[0], category_labels=["Benar", "Salah"],
        )  # fmt: skip
        res = self.client.patch(
            reverse("assessment-detail", args=[self.assessment.id]), {"is_published": True}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("3", str(res.data["is_published"]))


class ComplexAttemptTests(KindsTestBase):
    def setUp(self):
        super().setUp()
        self.assessment = self.make_assessment()
        self.add_complex_questions(self.assessment)

    def submit(self, multi, category):
        self.act(self.student, "start", self.assessment)
        answers = [
            {"question": self.mc.id, "choice": 1},
            {"question": self.multi.id, "choices": multi},
            {"question": self.category.id, "choices": category},
        ]
        return self.act(self.student, "submit", self.assessment, data={"answers": answers})

    def points(self, question):
        return Answer.objects.get(question=question, attempt__student=self.student).points

    def test_student_questions_hide_complex_keys(self):
        res = self.act(self.student, "start", self.assessment)
        by_id = {q["id"]: q for q in res.data["questions"]}
        self.assertNotIn("correct_choices", by_id[self.multi.id])
        self.assertEqual(by_id[self.category.id]["category_labels"], ["Benar", "Salah"])

    def test_all_correct_gets_full_points(self):
        res = self.submit([1, 0], [0, 1])
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual((self.points(self.multi), self.points(self.category)), (3, 4))
        sheet = {q["id"]: q for q in res.data["questions"]}
        self.assertEqual(sheet[self.multi.id]["answer"]["choices"], [0, 1])
        # Kunci belum dibuka sebelum tenggat.
        self.assertIsNone(sheet[self.multi.id]["correct_choices"])

    def test_partly_correct_gets_zero(self):
        self.submit([0], [0, 0])
        self.assertEqual((self.points(self.multi), self.points(self.category)), (0, 0))

    def test_extra_wrong_choice_or_unanswered_statement_gets_zero(self):
        self.submit([0, 1, 2], [0, None])
        self.assertEqual((self.points(self.multi), self.points(self.category)), (0, 0))
        answer = Answer.objects.get(question=self.category, attempt__student=self.student)
        self.assertEqual(answer.choices, [0, None])

    def test_invalid_complex_answers_rejected(self):
        self.act(self.student, "start", self.assessment)
        for bad in [
            {"question": self.multi.id, "choices": [7]},
            {"question": self.category.id, "choices": [2]},
        ]:
            res = self.act(self.student, "submit", self.assessment, data={"answers": [bad]})
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_draft_keeps_complex_answers_and_doubt_flag(self):
        self.act(self.student, "start", self.assessment)
        draft = [
            {"question": self.multi.id, "choices": [1], "flagged": True},
            {"question": self.category.id, "choices": [1]},
        ]
        res = self.act(self.student, "draft", self.assessment, data={"answers": draft})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        saved = {d["question"]: d for d in self.act(self.student, "start", self.assessment).data["draft"]}
        self.assertEqual((saved[self.multi.id]["choices"], saved[self.multi.id]["flagged"]), ([1], True))
        self.assertEqual(saved[self.category.id]["choices"], [1, None])  # dilengkapi per pernyataan

    def test_keys_revealed_after_due_date(self):
        self.submit([0, 1], [0, 1])
        self.assessment.due_at = timezone.now() - timedelta(minutes=1)
        self.assessment.save()
        res = self.act(self.student, "my-attempt", self.assessment, method="get")
        sheet = {q["id"]: q for q in res.data["questions"]}
        self.assertEqual(sheet[self.category.id]["correct_choices"], [0, 1])
        self.assertTrue(sheet[self.category.id]["key_revealed"])


def excel_of(rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Soal"
    sheet.append([f"{c.label}*" if c.required else c.label for c in COLUMNS])
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return SimpleUploadedFile("soal.xlsx", buffer.getvalue())


class ComplexImportTests(KindsTestBase):
    def setUp(self):
        super().setUp()
        self.assessment = self.make_assessment(published=False)
        self.client.force_authenticate(self.teacher)
        self.url = reverse("assessment-import-questions", args=[self.assessment.id])

    def upload(self, **data):
        return self.client.post(self.url, {"dry_run": "false", **data}, format="multipart")

    def imported(self):
        return list(self.assessment.questions.order_by("order")[2:])

    def test_paste_text_complex_kinds_and_group(self):
        text = (
            "Stimulus: Bacalah teks berikut.\n"
            "| Nama | Nilai |\n|---|---|\n| Ani | 90 |\n"
            "1. [pg kompleks] Pilih semua bilangan genap.\n"
            "A. 2\nB. 3\nC. 4\nKunci: A, C\nGrup: G1\n"
            "2. [kategori] Tentukan kesesuaian dengan teks.\n"
            "A. Ani mendapat 90.\nB. Ani mendapat 60.\n"
            "Label: Sesuai / Tidak sesuai\nKunci: S, T\nGrup: G1\n"
            "3. Pilih dua jawaban benar.\n*A. satu\nB. dua\n*C. tiga\n"
        )
        res = self.upload(mode="text", text=text)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        multi, category, starred = self.imported()
        self.assertEqual((multi.kind, multi.correct_choices, multi.group), ("multiple", [0, 2], "G1"))
        self.assertIn("| Ani | 90 |", multi.stimulus)  # tabel tetap utuh
        self.assertEqual(category.kind, "category")
        self.assertEqual(category.category_labels, ["Sesuai", "Tidak sesuai"])
        self.assertEqual((category.correct_choices, category.group, category.stimulus), ([0, 1], "G1", ""))
        self.assertEqual((starred.kind, starred.correct_choices), ("multiple", [0, 2]))

    def test_category_key_formats(self):
        items = parse_text(
            "1. [kategori] Soal\nA. p\nB. q\nC. r\nKunci: Benar; Salah; Benar\n"
            "2. [kategori] Soal\nA. p\nB. q\nKunci: B S\n"
            "3. [kategori] Soal\nA. p\nB. q\nKunci: 2, 1\n"
        )
        self.assertEqual([i["data"]["correct_choices"] for i in items], [[0, 1, 0], [0, 1], [1, 0]])

    def test_category_key_count_must_match_statements(self):
        res = self.upload(mode="text", text="1. [kategori] Soal\nA. p\nB. q\nKunci: B\n")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("2 jawaban", str(res.data["rows"][0]["errors"]))
        self.assertEqual(len(self.imported()), 0)

    def test_template_examples_are_all_valid(self):
        # Semua contoh di lembar Petunjuk harus bisa langsung diimpor (termasuk contoh gambar + ZIP).
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("rangkaian1.png", PNG)
        res = self.upload(
            mode="excel",
            file=excel_of(EXAMPLES),
            images=SimpleUploadedFile("gambar.zip", buffer.getvalue()),
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        kinds = {q.kind for q in self.imported()}
        self.assertEqual(kinds, {"choice", "multiple", "category", "essay"})
        grouped = [q for q in self.imported() if q.group == "G1"]
        self.assertEqual(len(grouped), 2)
        self.assertTrue(grouped[0].stimulus and not grouped[1].stimulus)
        table = next(q for q in self.imported() if "| Kegiatan |" in q.stimulus)
        self.assertIn("*extracurricular*", table.stimulus)
