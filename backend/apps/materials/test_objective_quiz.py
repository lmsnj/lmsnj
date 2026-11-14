from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.common.testing import default_school

from .models import Material, MaterialProgress

QUIZ = [
    {"kind": "choice", "text": "2 + 2 = ...", "choices": ["3", "4"], "correct_choice": 1, "explanation": "Dua tambah dua."},
    {"kind": "fill_blank", "text": "Lengkapi.", "template": "Hasil 7 % 3 adalah [[1]]."},
    {"kind": "matching", "text": "Pasangkan.", "pairs": [{"left": "Input", "right": "Membaca"}, {"left": "Output", "right": "Menampilkan"}]},
    {"kind": "drag_drop", "text": "Susun.", "template": "[[Declare]] lalu [[Input]]", "distractors": ["If"]},
]  # fmt: skip


def member(username, role, school, **extra):
    user = User.objects.create(username=username, role=role, full_name=username.title(), **extra)
    user.schools.add(school)
    return user


def correct_answers(items):
    """Jawaban benar dari soal versi siswa (pilihan acak dicari lewat teksnya)."""
    answers = {}
    for item in items:
        if item["kind"] == "choice":
            answers[item["id"]] = {"choice": item["choices"].index("4")}
        elif item["kind"] == "fill_blank":
            answers[item["id"]] = {"gaps": ["1"]}
        elif item["kind"] == "matching":
            right = {r["text"]: r["id"] for r in item["right"]}
            wanted = {"Input": "Membaca", "Output": "Menampilkan"}
            answers[item["id"]] = {
                "pairs": {left["id"]: right[wanted[left["text"]]] for left in item["left"]}
            }
        else:
            ids = {o["text"]: o["id"] for o in item["options"]}
            answers[item["id"]] = {"gaps": [ids["Declare"], ids["Input"]]}
    return answers


class ObjectiveQuizTests(APITestCase):
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
            objectives=["Capaian dengan kuis", "Capaian dicentang sendiri"], is_published=True,
            created_by=self.teacher,
        )  # fmt: skip
        self.url = reverse("material-objective-quiz", args=[self.material.id])
        self.client.force_authenticate(self.teacher)
        response = self.client.put(self.url, {"quizzes": {"0": QUIZ}}, format="json")
        self.assertEqual(response.data["counts"], [4, 0])

    def start(self, user=None):
        self.client.force_authenticate(user or self.student)
        response = self.client.get(self.url, {"index": 0})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data["items"]

    def check(self, answers, user=None):
        self.client.force_authenticate(user or self.student)
        return self.client.post(self.url, {"index": 0, "answers": answers}, format="json")

    def checked(self):
        progress = MaterialProgress.objects.filter(material=self.material, student=self.student).first()
        return progress.checked_objectives if progress else []

    def test_student_items_hide_keys(self):
        items = self.start()
        self.assertEqual(len(items), 4)
        text = str(items)
        self.assertNotIn("correct_choice", text)
        self.assertNotIn("Dua tambah dua", text)  # pembahasan belum dikirim

    def test_all_correct_checks_objective(self):
        response = self.check(correct_answers(self.start()))
        self.assertTrue(response.data["passed"], response.data)
        self.assertEqual(self.checked(), [0])
        self.assertIn("Dua tambah dua.", str(response.data["results"]))
        self.assertIn(0, response.data["material"]["progress"]["checked_objectives"])

    def test_one_wrong_answer_fails_without_explanation(self):
        items = self.start()
        answers = correct_answers(items)
        answers[items[1]["id"]] = {"gaps": ["2"]}
        response = self.check(answers)
        self.assertFalse(response.data["passed"])
        self.assertFalse(response.data["results"][items[1]["id"]]["correct"])
        self.assertNotIn("explanation", str(response.data["results"]))
        self.assertEqual(self.checked(), [])

    def test_self_check_cannot_tick_quiz_objective(self):
        self.client.force_authenticate(self.student)
        url = reverse("material-objectives", args=[self.material.id])
        self.client.post(url, {"checked": [0, 1]}, format="json")
        self.assertEqual(self.checked(), [1])
        self.check(correct_answers(self.start()))
        self.client.post(url, {"checked": []}, format="json")  # hapus centang mandiri
        self.assertEqual(self.checked(), [0])  # capaian lewat kuis tetap

    def test_teacher_preview_does_not_save_and_others_denied(self):
        response = self.check(correct_answers(self.start(self.teacher)), self.teacher)
        self.assertTrue(response.data["passed"])
        self.assertNotIn("material", response.data)
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(self.url, {"index": 0}).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.student)
        self.assertEqual(
            self.client.put(self.url, {"quizzes": {"0": []}}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_invalid_quiz_and_index(self):
        self.client.force_authenticate(self.teacher)
        bad = [{"kind": "choice", "text": "x", "choices": ["a", "b"], "correct_choice": 5}]
        self.assertEqual(
            self.client.put(self.url, {"quizzes": {"1": bad}}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(self.client.get(self.url, {"index": 1}).status_code, status.HTTP_400_BAD_REQUEST)

    def test_quiz_follows_objective_text_when_reordered(self):
        self.material.refresh_from_db()
        self.material.objectives = ["Capaian baru", "Capaian dengan kuis"]
        self.material.save()
        self.client.force_authenticate(self.teacher)
        detail = self.client.get(reverse("material-detail", args=[self.material.id])).data
        self.assertEqual(detail["objective_quiz"], [0, 4])
