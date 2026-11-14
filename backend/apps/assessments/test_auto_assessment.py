from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.common.testing import default_school
from apps.materials.models import Material

from .auto_assessment import AutoAssessmentError, build_questions, parse_concepts
from .models import Assessment, QuestionKind

CONCEPTS = [
    "Algoritma = Urutan langkah logis untuk menyelesaikan masalah",
    "Berhingga (*finiteness*) = Algoritma harus berhenti setelah sejumlah langkah",
    "Pasti (*definiteness*) = Setiap langkah jelas dan tidak bermakna ganda",
    "Masukan (*input*) = Data yang diberikan sebelum algoritma dijalankan",
    "Keluaran (*output*) = Hasil yang diperoleh setelah algoritma dijalankan",
    "baris tanpa tanda sama dengan diabaikan",
]


class BuildQuestionsTests(SimpleTestCase):
    def test_parse_concepts(self):
        pairs = parse_concepts(CONCEPTS)
        self.assertEqual(len(pairs), 5)
        self.assertEqual(pairs[0], ("Algoritma", "Urutan langkah logis untuk menyelesaikan masalah"))

    def test_question_mix_and_keys(self):
        pairs = parse_concepts(CONCEPTS)
        items = build_questions(pairs, seed=1)
        kinds = [item["kind"] for item in items]
        self.assertEqual(kinds.count("jodohkan"), 1)
        self.assertEqual(kinds.count("pg"), 5)  # satu per konsep
        self.assertEqual(kinds.count("isian"), 2)
        self.assertEqual(kinds.count("kategori"), 1)
        for item in items:
            if item["kind"] == "pg":
                # Kunci menunjuk pilihan yang benar-benar pasangan konsepnya.
                answer = item["choices"]["ABCDE".index(item["key"])]
                self.assertTrue(any(answer in (term, definition) for term, definition in pairs))
                self.assertEqual(len(set(item["choices"])), 4)
        statements = next(item for item in items if item["kind"] == "kategori")
        self.assertEqual(sorted(statements["key"].split(", ")), ["B", "B", "S", "S"])

    def test_fill_blank_accepts_word_without_brackets(self):
        items = build_questions(parse_concepts(CONCEPTS), seed=3)
        texts = " ".join(item["text"] for item in items if item["kind"] == "isian")
        self.assertNotIn("*", texts.split("[[", 1)[1].split("]]")[0])

    def test_same_seed_same_questions(self):
        pairs = parse_concepts(CONCEPTS)
        self.assertEqual(build_questions(pairs, seed=7), build_questions(pairs, seed=7))

    def test_needs_four_concepts(self):
        with self.assertRaisesMessage(AutoAssessmentError, "minimal 4"):
            build_questions(parse_concepts(CONCEPTS[:3]))


class GenerateFromConceptsApiTests(APITestCase):
    def setUp(self):
        school = default_school()
        self.teacher = User.objects.create(username="guru1", role=Role.TEACHER, full_name="Guru")
        self.teacher.schools.add(school)
        room = Classroom.objects.create(
            school=school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )
        self.student = User.objects.create(
            username="siswa1", role=Role.STUDENT, full_name="Siswa", classroom=room
        )
        self.student.schools.add(school)
        subject = Subject.objects.create(school=school, code="DDP", name="Dasar-dasar PPLG")
        assignment = TeachingAssignment.objects.create(teacher=self.teacher, subject=subject, classroom=room)
        self.material = Material.objects.create(
            teaching_assignment=assignment, title="Pengertian Algoritma", material_type="link",
            url="https://example.com", concepts=CONCEPTS[:5], is_published=True, created_by=self.teacher,
        )  # fmt: skip
        self.url = reverse("material-generate-assessment", args=[self.material.id])
        self.client.force_authenticate(self.teacher)

    def test_status_then_generate(self):
        info = self.client.get(self.url).data
        self.assertEqual((info["concepts"], info["min_concepts"]), (5, 4))
        response = self.client.post(self.url, {}, format="json")  # sumber bawaan = konsep (gratis)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual((response.data["question_count"], response.data["skipped"]), (9, 0))
        assessment = Assessment.objects.get(pk=response.data["assessment"])
        self.assertFalse(assessment.is_published)
        self.assertNotIn(QuestionKind.ESSAY, assessment.questions.values_list("kind", flat=True))
        self.material.refresh_from_db()
        self.assertEqual(self.material.required_assessment, assessment)

    def test_too_few_concepts(self):
        self.material.concepts = CONCEPTS[:2]
        self.material.save()
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("minimal 4", str(response.data["detail"]))
        self.assertFalse(Assessment.objects.exists())

    def test_concepts_hidden_from_students_and_validated(self):
        self.client.force_authenticate(self.student)
        data = self.client.get(reverse("material-detail", args=[self.material.id])).data
        self.assertNotIn("concepts", data)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(
            len(self.client.get(reverse("material-detail", args=[self.material.id])).data["concepts"]), 5
        )
        bad = self.client.patch(
            reverse("material-detail", args=[self.material.id]), {"concepts": ["tanpa tanda"]}, format="json"
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("istilah = penjelasan", str(bad.data["concepts"]))
