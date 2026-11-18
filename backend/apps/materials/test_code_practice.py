"""Praktik menulis kode di materi: soal (guru), pengerjaan (siswa), syarat jalur belajar, hasil siswa."""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role
from apps.common.testing import default_school

from .code_practice import MAX_EXERCISES
from .models import CodeAttempt, CodeExercise, Material, MaterialProgress
from .objective_quiz import set_practice
from .sharing import copy_materials
from .tests import make_user

PYTHON_CHECKS = [{"input": "3\n4", "output": "7"}]
HTML_CHECKS = [
    {"type": "exists", "selector": "h1"},
    {"type": "text", "selector": "h1", "value": "Halo"},
    {"type": "style", "selector": "body", "property": "background-color", "value": "lightblue"},
    {"type": "console", "value": "siap"},
    {"type": "click", "selector": "button", "target": "#hasil", "value": "Terima kasih"},
]


class CodePracticeTests(APITestCase):
    def setUp(self):
        school = default_school()
        self.siti = make_user("siti", Role.TEACHER)
        self.ahmad = make_user("ahmad", Role.TEACHER)
        self.outsider = make_user("rudi", Role.TEACHER)
        self.admin = make_user("admin", Role.ADMIN)
        self.rpl1 = Classroom.objects.create(
            school=school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )
        rpl2 = Classroom.objects.create(
            school=school, name="X RPL 2", grade="X", major="RPL", academic_year="2026/2027"
        )
        subject = Subject.objects.create(school=school, code="INF", name="Informatika")
        bindo = Subject.objects.create(school=school, code="BINDO", name="Bahasa Indonesia")
        self.siti_ta = TeachingAssignment.objects.create(
            teacher=self.siti, subject=subject, classroom=self.rpl1
        )
        self.ahmad_ta = TeachingAssignment.objects.create(
            teacher=self.ahmad, subject=subject, classroom=self.rpl1
        )
        self.rpl2_ta = TeachingAssignment.objects.create(teacher=self.siti, subject=subject, classroom=rpl2)
        TeachingAssignment.objects.create(teacher=self.outsider, subject=bindo, classroom=self.rpl1)
        self.ani = make_user("ani", Role.STUDENT, classroom=self.rpl1)
        self.budi = make_user("budi", Role.STUDENT, classroom=self.rpl1)

        self.m1 = self.material("Python Dasar", 1)
        self.m2 = self.material("Materi Kedua", 2)
        self.list_url = reverse("code-exercise-list")

    def material(self, title, order):
        return Material.objects.create(
            teaching_assignment=self.siti_ta, title=title, material_type="link", url="https://contoh.id",
            is_published=True, order=order, require_reflection=True, created_by=self.siti,
        )  # fmt: skip

    def exercise(self, material=None, language="python", checks=None):
        return CodeExercise.objects.create(
            material=material or self.m1,
            title="Penjumlahan",
            language=language,
            checks=checks or PYTHON_CHECKS,
        )

    def create(self, user, **data):
        self.client.force_authenticate(user)
        body = {"material": self.m1.id, "title": "Jumlahkan", "language": "python", "checks": PYTHON_CHECKS}
        body.update(data)
        return self.client.post(self.list_url, body, format="json")

    def open_material(self, student, material=None):
        self.client.force_authenticate(student)
        res = self.client.post(reverse("material-open", args=[(material or self.m1).id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def send(self, student, exercise, **data):
        self.client.force_authenticate(student)
        body = {"code": "print(int(input()) + int(input()))", "checked": True, "passed": True}
        body.update(data)
        return self.client.post(reverse("code-exercise-attempt", args=[exercise.id]), body, format="json")

    def checks_of(self, material_data):
        return {check["key"]: check["done"] for check in material_data["progress"]["checks"]}

    # --- Guru membuat soal ----------------------------------------------------------------------------

    def test_team_teacher_creates_exercise(self):
        res = self.create(self.ahmad, starter_code="# tulis kodemu", checks=[{"input": "", "output": "Halo"}])
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["order"], 1)
        res = self.create(self.siti, language="html", checks=HTML_CHECKS)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["order"], 2)
        self.assertEqual(res.data["checks"][2]["property"], "background-color")
        self.assertEqual(self.m1.exercises.count(), 2)

    def test_php_exercise_uses_input_output_checks(self):
        checks = [{"input": "3\n4", "output": "7"}]
        res = self.create(self.siti, language="php", checks=checks)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["checks"], checks)
        # Pemeriksaan halaman HTML tidak berlaku untuk PHP.
        res = self.create(self.siti, language="php", checks=[{"type": "exists", "selector": "h1"}])
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_checks(self):
        cases = [
            ([], "minimal satu"),
            ([{"input": "1", "output": "  "}], "keluaran"),
            ([{"type": "warna"}], "tidak dikenal"),
            ([{"type": "text", "selector": "h1"}], "Nilai"),
            ([{"type": "click", "selector": "button", "value": "x"}], "Elemen hasil"),
        ]
        for checks, message in cases:
            language = "python" if checks and "input" in checks[0] else "html"
            res = self.create(self.siti, language=language, checks=checks)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, checks)
            self.assertIn(message, str(res.data["checks"]), checks)

    def test_limit_and_access(self):
        for _ in range(MAX_EXERCISES):
            self.exercise()
        res = self.create(self.siti)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Maksimal", str(res.data["material"]))
        # Guru bukan tim dan siswa tidak bisa membuat soal.
        self.assertEqual(self.create(self.outsider).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.create(self.ani).status_code, status.HTTP_403_FORBIDDEN)
        # Guru bukan tim tidak melihat soalnya.
        self.client.force_authenticate(self.outsider)
        res = self.client.get(self.list_url, {"material": self.m1.id})
        self.assertEqual(res.data, [])

    # --- Siswa mengerjakan ----------------------------------------------------------------------------

    def test_student_flow_and_requirement(self):
        exercise = self.exercise()
        # Belum membuka konten: Praktik belum boleh dikerjakan.
        res = self.send(self.ani, exercise)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.open_material(self.ani)

        # Siswa melihat soal + pemeriksaannya (dijalankan di browser).
        res = self.client.get(self.list_url, {"material": self.m1.id})
        self.assertEqual(res.data[0]["checks"], PYTHON_CHECKS)
        self.assertIsNone(res.data[0]["my_attempt"])

        # Simpan tanpa periksa / periksa gagal: belum lulus.
        res = self.send(self.ani, exercise, code="print(1)", checked=False, passed=False)
        self.assertEqual(res.data["attempt"]["check_count"], 0)
        res = self.send(self.ani, exercise, code="print(2)", passed=False)
        self.assertFalse(res.data["attempt"]["passed"])
        self.assertFalse(self.checks_of(res.data["material"])["coding"])

        # Cerita reflektif belum boleh ditulis sebelum Praktik lulus.
        reflection_url = reverse("material-reflection", args=[self.m1.id])
        text = "Saya belajar menjumlahkan dua bilangan dengan Python."
        res = self.client.post(reflection_url, {"reflection": text})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Praktik", str(res.data))

        res = self.send(self.ani, exercise)
        self.assertTrue(res.data["attempt"]["passed"])
        self.assertEqual(res.data["attempt"]["check_count"], 2)
        self.assertTrue(self.checks_of(res.data["material"])["coding"])
        self.assertEqual(res.data["material"]["progress"]["code_passed"], [exercise.id])

        # Sekali lulus tetap lulus; kode terakhir berubah, kode saat lulus tetap.
        self.send(self.ani, exercise, code="print('ubah')", passed=False)
        attempt = CodeAttempt.objects.get()
        self.assertIsNotNone(attempt.passed_at)
        self.assertEqual(attempt.code, "print('ubah')")
        self.assertIn("int(input())", attempt.passed_code)

        res = self.client.post(reflection_url, {"reflection": text})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        # Materi berikutnya terbuka.
        self.assertFalse(MaterialProgress.objects.filter(material=self.m2).exists())
        res = self.client.get(reverse("material-detail", args=[self.m2.id]))
        self.assertFalse(res.data["progress"]["locked"])

    def test_practice_quiz_comes_first(self):
        set_practice(
            self.m1, [{"kind": "choice", "text": "1 + 1 = ...", "choices": ["1", "2"], "correct_choice": 1}]
        )
        exercise = self.exercise()
        self.open_material(self.ani)
        res = self.send(self.ani, exercise)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Latihan Pemahaman", str(res.data))

    def test_locked_material_hidden_from_student(self):
        self.exercise(material=self.m2)
        self.client.force_authenticate(self.ani)
        res = self.client.get(self.list_url, {"material": self.m2.id})
        self.assertEqual(res.data, [])

    def test_teacher_sees_student_code(self):
        exercise = self.exercise()
        self.open_material(self.ani)
        self.send(self.ani, exercise)
        url = reverse("code-exercise-attempts", args=[exercise.id])
        for user in (self.ahmad, self.admin):
            self.client.force_authenticate(user)
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            rows = {row["full_name"]: row for row in res.data["rows"]}
            self.assertTrue(rows["Ani"]["passed"])
            self.assertIn("int(input())", rows["Ani"]["passed_code"])
            self.assertFalse(rows["Budi"]["passed"])
        self.client.force_authenticate(self.ani)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)

    def test_copy_to_other_class_includes_exercises(self):
        self.exercise(language="html", checks=HTML_CHECKS)
        (copy,) = copy_materials([self.m1], self.rpl2_ta, self.siti)
        self.assertEqual(copy.exercises.get().checks, HTML_CHECKS)
