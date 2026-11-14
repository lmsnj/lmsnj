import json
from types import SimpleNamespace
from unittest import mock

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.common.testing import default_school
from apps.materials.models import Material

from . import ai_generate
from .models import Assessment, QuestionKind

QUESTIONS = [
    {"objective": 1, "kind": "pg", "stimulus": "", "text": "Pengertian algoritma adalah ...",
     "choices": ["Urutan langkah logis", "Bahasa pemrograman", "Perangkat keras", "Data"], "key": "A",
     "points": 2},
    {"objective": 2, "kind": "pg_kompleks", "stimulus": "", "text": "Ciri algoritma? (Pilih SEMUA jawaban yang benar.)",
     "choices": ["Berhingga", "Ambigu", "Punya keluaran", "Wajib bahasa Python"], "key": "A, C", "points": 3},
    {"objective": 2, "kind": "kategori", "stimulus": "", "text": "Benar atau salah?",
     "choices": ["Algoritma harus berhenti.", "Algoritma hanya untuk komputer."], "key": "B, S", "points": 3},
    {"objective": 1, "kind": "isian", "stimulus": "", "text": "Algoritma harus [[berhenti|selesai]].",
     "choices": [], "key": "", "points": 2},
    {"objective": 2, "kind": "jodohkan", "stimulus": "", "text": "Pasangkan.",
     "choices": ["Berhingga = Berhenti", "Pasti = Tidak ambigu", "Keluaran = Hasil"], "key": "", "points": 3},
    # Kunci tidak cocok dengan pilihan -> dibuang, soal lain tetap dibuat.
    {"objective": 1, "kind": "pg", "stimulus": "", "text": "Soal rusak", "choices": ["a", "b"], "key": "E",
     "points": 2},
]  # fmt: skip


def member(username, role, school, **extra):
    user = User.objects.create(username=username, role=role, full_name=username.title(), **extra)
    user.schools.add(school)
    return user


@override_settings(ANTHROPIC_API_KEY="kunci-uji")
class GenerateAssessmentTests(APITestCase):
    def setUp(self):
        school = default_school()
        self.teacher = member("guru1", Role.TEACHER, school)
        self.other = member("guru2", Role.TEACHER, school)
        room = Classroom.objects.create(
            school=school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )
        subject = Subject.objects.create(school=school, code="DDP", name="Dasar-dasar PPLG")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher, subject=subject, classroom=room
        )
        TeachingAssignment.objects.create(
            teacher=self.other,
            subject=Subject.objects.create(school=school, code="MTK", name="Matematika"),
            classroom=room,
        )
        self.material = Material.objects.create(
            teaching_assignment=self.assignment, title="Pengertian Algoritma", material_type="link",
            url="https://example.com", objectives=["Menjelaskan pengertian algoritma", "Menyebutkan ciri algoritma"],
            created_by=self.teacher,
        )  # fmt: skip
        self.url = reverse("material-generate-assessment", args=[self.material.id])

    def post(self, user=None, **data):
        self.client.force_authenticate(user or self.teacher)
        return self.client.post(self.url, {"source": "ai", **data}, format="json")

    @mock.patch.object(ai_generate, "ask_claude", return_value=QUESTIONS)
    def test_creates_draft_assessment_and_links_material(self, ask):
        response = self.post(question_count=6)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual((response.data["question_count"], response.data["skipped"]), (5, 1))
        assessment = Assessment.objects.get(pk=response.data["assessment"])
        self.assertFalse(assessment.is_published)
        self.assertEqual((assessment.passing_score, assessment.remedial_attempts), (75, 2))
        self.assertEqual(assessment.title, "Cek Pemahaman: Pengertian Algoritma")
        kinds = list(assessment.questions.order_by("order").values_list("kind", flat=True))
        self.assertEqual(
            kinds,
            [QuestionKind.CHOICE, QuestionKind.MULTIPLE, QuestionKind.CATEGORY,
             QuestionKind.FILL_BLANK, QuestionKind.MATCHING],
        )  # fmt: skip
        self.assertNotIn(QuestionKind.ESSAY, kinds)
        self.material.refresh_from_db()
        self.assertEqual(self.material.required_assessment, assessment)
        ask.assert_called_once()

    def test_only_teacher_of_material(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, status.HTTP_404_NOT_FOUND)
        student = member("siswa1", Role.STUDENT, default_school(), classroom=self.assignment.classroom)
        self.assertEqual(self.post(student).status_code, status.HTTP_403_FORBIDDEN)

    def test_requires_objectives_and_valid_count(self):
        self.assertEqual(self.post(question_count=50).status_code, status.HTTP_400_BAD_REQUEST)
        self.material.objectives = []
        self.material.save()
        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertIn("capaian", response.data["detail"])
        self.assertFalse(Assessment.objects.exists())

    @override_settings(ANTHROPIC_API_KEY="")
    def test_disabled_without_api_key(self):
        self.client.force_authenticate(self.teacher)
        self.assertFalse(self.client.get(self.url).data["ai_enabled"])
        self.assertEqual(self.post().status_code, status.HTTP_400_BAD_REQUEST)

    @mock.patch.object(ai_generate, "ask_claude", return_value=QUESTIONS[-1:])
    def test_too_few_valid_questions_saves_nothing(self, ask):
        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(Assessment.objects.exists())
        self.material.refresh_from_db()
        self.assertIsNone(self.material.required_assessment)


def fake_response(stop_reason="end_turn", payload=None):
    text = json.dumps({"questions": payload or QUESTIONS})
    return SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="text", text=text)])


@override_settings(ANTHROPIC_API_KEY="kunci-uji", AI_MODEL="claude-opus-5-5")
class AskClaudeTests(APITestCase):
    def setUp(self):
        self.material = SimpleNamespace(
            title="Algoritma",
            description="Materi pengantar",
            objectives=["Menjelaskan algoritma"],
            teaching_assignment=SimpleNamespace(
                subject=SimpleNamespace(name="DDP"),
                classroom=SimpleNamespace(
                    name="X RPL 1", school=SimpleNamespace(get_level_display=lambda: "SMK")
                ),
            ),
        )

    @mock.patch("apps.assessments.ai_generate.anthropic.Anthropic")
    def test_request_shape_and_parsing(self, client_class):
        create = client_class.return_value.beta.messages.create
        create.return_value = fake_response()
        self.assertEqual(len(ai_generate.ask_claude(self.material, 8)), len(QUESTIONS))
        kwargs = create.call_args.kwargs
        self.assertEqual(kwargs["model"], "claude-opus-5-5")
        self.assertEqual(kwargs["output_config"]["format"]["type"], "json_schema")
        self.assertEqual(kwargs["fallbacks"], "default")
        self.assertIn("Buat 8 soal", kwargs["messages"][0]["content"])
        self.assertIn("1. Menjelaskan algoritma", kwargs["messages"][0]["content"])

    @mock.patch("apps.assessments.ai_generate.anthropic.Anthropic")
    def test_refusal_and_truncation_are_reported(self, client_class):
        create = client_class.return_value.beta.messages.create
        for reason, word in (("refusal", "menolak"), ("max_tokens", "terpotong")):
            create.return_value = fake_response(stop_reason=reason)
            with self.assertRaisesMessage(ai_generate.AIGenerationError, word):
                ai_generate.ask_claude(self.material, 5)
