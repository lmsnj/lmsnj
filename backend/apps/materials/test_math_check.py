"""Praktik Matematika: pembaca rumus (aman, tanpa eval), pembanding jawaban, dan API pemeriksaan di server."""

from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework import status

from .math_check import (
    MathError,
    check_answer,
    clean_math_items,
    clean_variables,
    parse_math,
    render_question,
    same_value,
    values_for,
)
from .models import CodeAttempt, CodeExercise
from .test_code_practice import CodePracticeTests

ITEMS = [
    {"question": "Hitung $[a] + [b]$.", "answer": "a + b", "tolerance": ""},
    {"question": "Sederhanakan $[a]x + [b]x$.", "answer": "(a+b)x", "tolerance": ""},
    {
        "question": "Hitung $\\pi \\times [a]$ (dua angka di belakang koma).",
        "answer": "pi*a",
        "tolerance": "0.01",
    },
]
VARIABLES = {"a": {"min": 2, "max": 9, "step": 1}, "b": {"min": 1, "max": 5, "step": 1}}


class MathParserTests(SimpleTestCase):
    def same(self, a, b, tolerance=0):
        return same_value(parse_math(a), parse_math(b), tolerance)

    def test_equivalent_forms(self):
        for a, b in [
            ("2x+3", "3+2*x"), ("1/2", "0,5"), ("(x+1)^2", "x^2+2x+1"), ("sqrt(8)", "2sqrt(2)"),
            ("√16", "4"), ("2×3", "6"), ("x^2-1", "(x-1)(x+1)"), ("-2^2", "-4"), ("|-5|", "5"),
            ("log(100)", "2"), ("ab", "b a"), ("2,5", "5/2"), ("sin(pi/2)", "1"),
            # Keluaran editor rumus MathLive (ascii-math).
            ("(1)/(2)", "0.5"), ("root(3)(8)", "2"), ("6 -: 3", "2"), ("(3)/(4)x", "0.75x"),
            ("sin ((pi)/(2))", "1"), ("x^(10)", "x^10"), ("(x^2)/(sqrt(x))", "x^(3/2)"),
        ]:  # fmt: skip
            self.assertTrue(self.same(a, b), f"{a} = {b}")
        self.assertFalse(self.same("x^2", "2x"))
        self.assertFalse(self.same("3.14", "pi"))
        self.assertTrue(self.same("3.14", "pi", "0.01"))

    def test_rejects_unsafe_or_heavy_input(self):
        for text in ["__import__('os')", "a.b", "9^9^9", "2^(10^4)", "1/0", "x^y", "(((", "2+", "", "1" * 20]:
            with self.assertRaises(MathError, msg=text):
                parse_math(text)

    def test_answer_messages(self):
        values = {"a": 3, "b": 4}
        self.assertTrue(check_answer({"answer": "a+b"}, "7", values)["ok"])
        self.assertIn("tidak diharapkan", check_answer({"answer": "a+b"}, "x+7", values)["message"])
        self.assertIn("Belum tepat", check_answer({"answer": "a+b"}, "8", values)["message"])
        self.assertIn("kosong", check_answer({"answer": "a+b"}, " ", values)["message"])

    def test_render_and_values(self):
        self.assertEqual(
            render_question("$\\frac{[a]}{[b]}$ dan [c]", {"a": 12, "b": 5}), "$\\frac{12}{5}$ dan [c]"
        )

        class Exercise:
            id = 7
            variables = {"a": {"min": 0.5, "max": 2, "step": 0.5}}

        class User:
            id = 3

        first = values_for(Exercise, User)
        self.assertEqual(first, values_for(Exercise, User))  # tetap sama setiap kali dibuka
        self.assertIn(float(first["a"]), [0.5, 1.0, 1.5, 2.0])

    def test_teacher_validation(self):
        self.assertEqual(clean_math_items(ITEMS, VARIABLES)[0]["answer"], "a + b")
        with self.assertRaisesMessage(Exception, "belum dibuat"):
            clean_math_items([{"question": "[z] + 1", "answer": "z+1"}], VARIABLES)
        with self.assertRaisesMessage(Exception, "rumus jawaban"):
            clean_math_items([{"question": "x", "answer": "a +"}], VARIABLES)
        with self.assertRaisesMessage(Exception, "pembagian dengan nol"):
            clean_math_items([{"question": "x", "answer": "1/(a-a)"}], VARIABLES)
        with self.assertRaisesMessage(Exception, "satu huruf"):
            clean_variables({"ab": {"min": 1, "max": 2}})
        with self.assertRaisesMessage(Exception, "terkecil"):
            clean_variables({"a": {"min": 5, "max": 2}})


class MathPracticeApiTests(CodePracticeTests):
    """Memakai data kelas/materi dari CodePracticeTests (test di sana ikut dijalankan ulang)."""

    def math_exercise(self):
        return CodeExercise.objects.create(
            material=self.m1, title="Penjumlahan", language="math", checks=ITEMS, variables=VARIABLES
        )

    def correct_answers(self, exercise, user):
        values = values_for(exercise, user)
        a, b = values["a"], values["b"]
        return [str(a + b), f"{a + b}x", f"{float(3.14159265 * a):.2f}"]

    def test_teacher_creates_math_exercise(self):
        res = self.create(self.siti, language="math", checks=ITEMS, variables=VARIABLES, starter_code="x")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["starter_code"], "")
        self.assertEqual(res.data["variables"]["a"]["max"], 9)
        res = self.create(
            self.siti, language="math", checks=[{"question": "q", "answer": "a ++"}], variables={}
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("checks", res.data)

    def test_student_never_receives_answer_key(self):
        exercise = self.math_exercise()
        self.open_material(self.ani)
        res = self.client.get(self.list_url, {"material": self.m1.id})
        data = res.data[0]
        self.assertNotIn("checks", data)
        self.assertNotIn("variables", data)
        values = values_for(exercise, self.ani)
        self.assertIn(f"{values['a']} + {values['b']}", data["questions"][0]["question"])
        self.assertNotIn("[a]", data["questions"][0]["question"])

    def test_student_checks_answers_on_server(self):
        exercise = self.math_exercise()
        url = reverse("code-exercise-check", args=[exercise.id])
        self.open_material(self.ani)
        # Jawaban kode lewat `attempt` tidak berlaku untuk matematika.
        res = self.send(self.ani, exercise)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.post(url, {"answers": ["0", "x", "1"]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual([r["ok"] for r in res.data["results"]], [False, False, False])
        self.assertFalse(res.data["attempt"]["passed"])

        answers = self.correct_answers(exercise, self.ani)
        res = self.client.post(url, {"answers": answers}, format="json")
        self.assertEqual([r["ok"] for r in res.data["results"]], [True, True, True], res.data)
        self.assertTrue(res.data["attempt"]["passed"])
        self.assertTrue(self.checks_of(res.data["material"])["coding"])
        attempt = CodeAttempt.objects.get()
        self.assertEqual(attempt.check_count, 2)
        self.assertTrue(attempt.passed_code.startswith(f"1. {answers[0]}"))

    def test_teacher_preview_is_not_saved(self):
        exercise = self.math_exercise()
        url = reverse("code-exercise-check", args=[exercise.id])
        self.client.force_authenticate(self.ahmad)
        res = self.client.post(url, {"answers": self.correct_answers(exercise, self.ahmad)}, format="json")
        self.assertEqual([r["ok"] for r in res.data["results"]], [True, True, True])
        self.assertNotIn("attempt", res.data)
        self.assertFalse(CodeAttempt.objects.exists())
        self.client.force_authenticate(self.outsider)
        res = self.client.post(url, {"answers": ["1"]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_copy_includes_variables(self):
        from .sharing import copy_materials

        self.math_exercise()
        (copy,) = copy_materials([self.m1], self.rpl2_ta, self.siti)
        self.assertEqual(copy.exercises.get().variables, VARIABLES)
