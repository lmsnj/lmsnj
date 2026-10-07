from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework import status

from . import results
from .tests import AssessmentTestBase


def attempt(number, score, submitted=True):
    return SimpleNamespace(
        number=number, score=None if score is None else Decimal(score), submitted_at=submitted or None
    )


def assessment(kkm=75, remedial=1, due_in=1):
    due_at = timezone.now() + timedelta(days=due_in)
    return SimpleNamespace(passing_score=kkm, remedial_attempts=remedial, last_due_at=due_at)


class FinalResultTests(SimpleTestCase):
    """Aturan nilai akhir (skala 100, maks. nilai 10 poin)."""

    def result(self, a, attempts):
        return results.final_result(a, attempts, max_score=10)

    def test_passed_first_try_keeps_real_score(self):
        r = self.result(assessment(), [attempt(1, 9)])
        self.assertEqual((r["status"], r["final_score"]), (results.PASSED, 90.0))

    def test_below_kkm_gets_remedial_then_capped_at_kkm(self):
        a = assessment()
        r = self.result(a, [attempt(1, 5)])
        self.assertEqual((r["status"], r["remedial_left"], r["final_score"]), (results.REMEDIAL, 1, 50.0))
        r = self.result(a, [attempt(1, 5), attempt(2, 10)])
        self.assertEqual((r["status"], r["final_score"], r["best_score"]), (results.PASSED, 75.0, 100.0))
        self.assertTrue(r["passed_by_remedial"])

    def test_failed_when_chances_used_or_deadline_passed(self):
        r = self.result(assessment(), [attempt(1, 5), attempt(2, 6)])
        self.assertEqual((r["status"], r["final_score"]), (results.FAILED, 60.0))
        r = self.result(assessment(due_in=-1), [attempt(1, 5)])
        self.assertEqual(r["status"], results.FAILED)
        r = self.result(assessment(remedial=0), [attempt(1, 5)])
        self.assertEqual(r["status"], results.FAILED)

    def test_pending_none_and_without_kkm(self):
        self.assertEqual(self.result(assessment(), [attempt(1, None)])["status"], results.PENDING)
        self.assertEqual(
            self.result(assessment(), [attempt(1, None, submitted=False)])["status"], results.NONE
        )
        r = self.result(assessment(kkm=None), [attempt(1, 4)])
        self.assertEqual((r["status"], r["final_score"]), (results.GRADED, 40.0))


class RemedialFlowTests(AssessmentTestBase):
    def make_quiz(self, **extra):
        quiz = self.make_assessment(passing_score=75, remedial_attempts=1, **extra)
        self.essay.delete()  # hanya PG (2 poin) agar langsung dinilai
        return quiz

    def submit(self, quiz, choice):
        return self.act(
            self.student, "submit", quiz, data={"answers": [{"question": self.mc.id, "choice": choice}]}
        )

    def test_remedial_flow(self):
        quiz = self.make_quiz()
        self.act(self.student, "start", quiz)
        res = self.submit(quiz, 0)  # salah -> 0
        self.assertEqual(res.data["result"]["status"], "remedial")
        self.assertEqual(res.data["result"]["remedial_left"], 1)

        # Tanpa remedial=true, start hanya mengembalikan hasil yang sudah ada.
        res = self.act(self.student, "start", quiz)
        self.assertEqual(res.data["attempt"]["number"], 1)
        res = self.act(self.student, "start", quiz, data={"remedial": True})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual((res.data["attempt"]["number"], res.data["attempt"]["status"]), (2, "in_progress"))

        res = self.submit(quiz, 1)  # benar -> 100, dicatat = KKM
        result = res.data["result"]
        self.assertEqual((result["status"], result["final_score"]), ("passed", 75.0))
        self.assertTrue(result["passed_by_remedial"])
        res = self.act(self.student, "start", quiz, data={"remedial": True})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Daftar siswa & rekap guru memakai percobaan terbaru dan riwayatnya.
        self.client.force_authenticate(self.student)
        listed = self.client.get(f"/api/assessments/{quiz.id}/").data
        self.assertEqual((listed["my_attempt"]["number"], listed["my_result"]["status"]), (2, "passed"))
        rows = self.act(self.teacher, "results", quiz, "get").data
        mine = next(r for r in rows if r["student"]["id"] == self.student.id)
        self.assertEqual(len(mine["attempts"]), 2)
        self.assertEqual(mine["result"]["final_score"], 75.0)

    def test_no_remedial_when_passed_or_pending(self):
        quiz = self.make_quiz()
        self.act(self.student, "start", quiz)
        self.assertEqual(self.submit(quiz, 1).data["result"]["status"], "passed")
        res = self.act(self.student, "start", quiz, data={"remedial": True})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Esai belum dinilai -> menunggu guru, remedial belum bisa.
        other = self.make_assessment(passing_score=75, remedial_attempts=2)
        self.act(self.student, "start", other)
        data = {
            "answers": [{"question": self.mc.id, "choice": 0}, {"question": self.essay.id, "text": "isi"}]
        }
        res = self.act(self.student, "submit", other, data=data)
        self.assertEqual(res.data["result"]["status"], "pending")
        res = self.act(self.student, "start", other, data={"remedial": True})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_answer_key_hidden_until_remedial_deadline(self):
        quiz = self.make_quiz(show_answers=True, due_in=timedelta(minutes=5))
        quiz.remedial_due_at = timezone.now() + timedelta(days=3)
        quiz.save()
        self.act(self.student, "start", quiz)
        self.submit(quiz, 0)
        quiz.due_at = timezone.now() - timedelta(minutes=1)  # tenggat utama lewat, remedial belum
        quiz.save()
        res = self.act(self.student, "my-attempt", quiz, "get")
        self.assertFalse(res.data["answers_revealed"])
        self.assertEqual(res.data["result"]["status"], "remedial")

    def test_validation(self):
        self.client.force_authenticate(self.teacher)
        data = {
            "teaching_assignment": self.assignment.id, "title": "Kuis", "remedial_attempts": 1,
            "due_at": (timezone.now() + timedelta(days=3)).isoformat(),
        }  # fmt: skip
        res = self.client.post("/api/assessments/", data, format="json")
        self.assertIn("passing_score", res.data)
        early = (timezone.now() + timedelta(days=1)).isoformat()
        res = self.client.post("/api/assessments/", {**data, "passing_score": 75, "remedial_due_at": early})
        self.assertIn("remedial_due_at", res.data)
