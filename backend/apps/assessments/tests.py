from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User

from .models import Assessment, Attempt, Question


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )


class AssessmentTestBase(APITestCase):
    def setUp(self):
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.other_teacher = make_user("guru2", Role.TEACHER)
        rpl = Classroom.objects.create(name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027")
        tkj = Classroom.objects.create(name="XI TKJ 1", grade="XI", major="TKJ", academic_year="2026/2027")
        web = Subject.objects.create(code="PWEB", name="Pemrograman Web")
        self.assignment = TeachingAssignment.objects.create(teacher=self.teacher, subject=web, classroom=rpl)
        self.other = TeachingAssignment.objects.create(teacher=self.other_teacher, subject=web, classroom=tkj)
        self.student = make_user("siswa1", Role.STUDENT, classroom=rpl)
        self.student2 = make_user("siswa2", Role.STUDENT, classroom=rpl)
        self.student_tkj = make_user("siswa3", Role.STUDENT, classroom=tkj)

    def make_assessment(self, due_in=timedelta(days=2), published=True, **extra):
        assessment = Assessment.objects.create(
            teaching_assignment=self.assignment,
            title="Kuis HTML",
            due_at=timezone.now() + due_in,
            is_published=published,
            **extra,
        )
        self.mc = Question.objects.create(
            assessment=assessment, order=0, kind="choice", text="Tag judul?", points=2,
            choices=["<p>", "<h1>", "<a>"], correct_choice=1,
        )  # fmt: skip
        self.essay = Question.objects.create(
            assessment=assessment, order=1, kind="essay", text="Jelaskan HTML", points=8
        )
        return assessment

    def act(self, user, name, assessment, method="post", data=None):
        self.client.force_authenticate(user)
        url = reverse(f"assessment-{name}", args=[assessment.id])
        return getattr(self.client, method)(url, data or {}, format="json")


class TeacherAuthoringTests(AssessmentTestBase):
    def test_create_add_questions_and_publish(self):
        self.client.force_authenticate(self.teacher)
        res = self.client.post(
            reverse("assessment-list"),
            {
                "teaching_assignment": self.assignment.id,
                "title": "Kuis 1",
                "due_at": (timezone.now() + timedelta(days=3)).isoformat(),
                "duration_minutes": 30,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        assessment_id = res.data["id"]
        detail = reverse("assessment-detail", args=[assessment_id])
        self.assertIn(
            "is_published", self.client.patch(detail, {"is_published": True}).data
        )  # belum ada soal

        questions = reverse("assessment-question-list")
        bad = {
            "assessment": assessment_id,
            "kind": "choice",
            "text": "?",
            "choices": ["A"],
            "correct_choice": 0,
        }
        self.assertIn("choices", self.client.post(questions, bad, format="json").data)
        no_key = {**bad, "choices": ["A", "B"], "correct_choice": None}
        self.assertIn("correct_choice", self.client.post(questions, no_key, format="json").data)
        ok = {**bad, "choices": [" A ", "B"], "correct_choice": 1, "points": 5}
        res = self.client.post(questions, ok, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["choices"], ["A", "B"])
        essay = {
            "assessment": assessment_id,
            "kind": "essay",
            "text": "Jelaskan",
            "choices": ["x"],
            "points": 10,
        }
        self.assertEqual(self.client.post(questions, essay, format="json").data["choices"], [])

        res = self.client.patch(detail, {"is_published": True})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual((res.data["question_count"], res.data["max_score"]), (2, 15))

    def test_other_teacher_cannot_add_questions(self):
        assessment = self.make_assessment()
        self.client.force_authenticate(self.other_teacher)
        res = self.client.post(
            reverse("assessment-question-list"),
            {"assessment": assessment.id, "kind": "essay", "text": "x"},
            format="json",
        )
        self.assertIn("assessment", res.data)

    def test_questions_locked_after_first_attempt(self):
        assessment = self.make_assessment()
        self.act(self.student, "start", assessment)
        self.client.force_authenticate(self.teacher)
        res = self.client.patch(reverse("assessment-question-detail", args=[self.mc.id]), {"text": "ubah"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.delete(reverse("assessment-question-detail", args=[self.mc.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.delete(reverse("assessment-detail", args=[assessment.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.client.get(reverse("assessment-detail", args=[assessment.id])).data["locked"])


class StudentFlowTests(AssessmentTestBase):
    def test_answer_key_never_sent_before_reveal(self):
        assessment = self.make_assessment()
        res = self.act(self.student, "start", assessment)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertNotIn("correct_choice", res.data["questions"][0])
        # Siswa tidak bisa mengakses daftar soal versi guru.
        self.assertEqual(self.act(self.student, "questions", assessment, "get").status_code, 403)
        self.client.force_authenticate(self.student)
        res = self.client.get(reverse("assessment-question-list"), {"assessment": assessment.id})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_submit_auto_grades_choice_and_teacher_grades_essay(self):
        assessment = self.make_assessment()
        self.act(self.student, "start", assessment)
        answers = [
            {"question": self.mc.id, "choice": 1},
            {"question": self.essay.id, "text": "Bahasa markup"},
        ]
        res = self.act(self.student, "submit", assessment, data={"answers": answers})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        attempt = res.data["attempt"]
        self.assertEqual((attempt["status"], attempt["auto_score"], attempt["ungraded"]), ("submitted", 2, 1))
        self.assertIsNone(attempt["score"])
        self.assertIsNone(res.data["questions"][0]["correct_choice"])  # tenggat belum lewat
        # Tidak bisa mengumpulkan dua kali.
        again = self.act(self.student, "submit", assessment, data={"answers": answers})
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)

        rows = self.act(self.teacher, "results", assessment, "get").data
        mine = next(r for r in rows if r["student"]["id"] == self.student.id)
        self.assertEqual(mine["attempt"]["status"], "submitted")
        self.assertIsNone(next(r for r in rows if r["student"]["id"] == self.student2.id)["attempt"])

        attempt_url = reverse("assessment-attempt-detail", args=[mine["attempt"]["id"]])
        self.client.force_authenticate(self.teacher)
        sheet = self.client.get(attempt_url).data
        self.assertEqual(sheet["questions"][0]["correct_choice"], 1)  # guru melihat kunci
        essay_answer = sheet["questions"][1]["answer"]["id"]
        grade_url = reverse("assessment-attempt-grade", args=[mine["attempt"]["id"]])
        too_high = {"grades": [{"answer": essay_answer, "points": 9}]}
        self.assertEqual(self.client.patch(grade_url, too_high, format="json").status_code, 400)
        res = self.client.patch(
            grade_url,
            {"grades": [{"answer": essay_answer, "points": 6.5, "feedback": "Baik"}]},
            format="json",
        )
        self.assertEqual(res.data["attempt"]["score"], 8.5)
        self.assertEqual(res.data["attempt"]["status"], "graded")

        mine = self.act(self.student, "my-attempt", assessment, "get").data
        self.assertEqual(mine["questions"][1]["answer"]["feedback"], "Baik")

    def test_empty_essay_is_zero_and_wrong_choice_scores_zero(self):
        assessment = self.make_assessment()
        self.act(self.student, "start", assessment)
        res = self.act(
            self.student, "submit", assessment, data={"answers": [{"question": self.mc.id, "choice": 0}]}
        )
        self.assertEqual((res.data["attempt"]["status"], res.data["attempt"]["score"]), ("graded", 0))

    def test_invalid_answers_rejected(self):
        assessment = self.make_assessment()
        other = Question.objects.create(
            assessment=Assessment.objects.create(teaching_assignment=self.assignment, title="Lain", due_at=timezone.now() + timedelta(days=1)),
            kind="essay", text="?",
        )  # fmt: skip
        self.act(self.student, "start", assessment)
        res = self.act(
            self.student, "submit", assessment, data={"answers": [{"question": other.id, "text": "x"}]}
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.act(
            self.student, "submit", assessment, data={"answers": [{"question": self.mc.id, "choice": 9}]}
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_submit_requires_start_and_cannot_start_after_due(self):
        assessment = self.make_assessment()
        self.assertEqual(self.act(self.student, "submit", assessment, data={"answers": []}).status_code, 404)
        past = self.make_assessment(due_in=timedelta(hours=-1))
        self.assertEqual(self.act(self.student, "start", past).status_code, status.HTTP_400_BAD_REQUEST)

    def test_timer_marks_late_and_deadline_capped_by_due(self):
        assessment = self.make_assessment(due_in=timedelta(minutes=20), duration_minutes=60)
        res = self.act(self.student, "start", assessment)
        deadline = timezone.datetime.fromisoformat(str(res.data["attempt"]["deadline"]))
        self.assertLessEqual(abs((deadline - assessment.due_at).total_seconds()), 1)  # dipotong tenggat
        Attempt.objects.filter(student=self.student).update(started_at=timezone.now() - timedelta(hours=2))
        assessment.due_at = timezone.now() - timedelta(minutes=5)
        assessment.save()
        res = self.act(self.student, "submit", assessment, data={"answers": []})
        self.assertTrue(res.data["attempt"]["is_late"])
        # Tenggat lewat & show_answers -> kunci jawaban dibuka.
        self.assertTrue(res.data["answers_revealed"])
        self.assertEqual(res.data["questions"][0]["correct_choice"], 1)

    def test_visibility(self):
        self.make_assessment()
        self.make_assessment(published=False)
        for user, expected in [(self.student, 1), (self.teacher, 2), (self.student_tkj, 0), (self.admin, 2)]:
            self.client.force_authenticate(user)
            self.assertEqual(
                self.client.get(reverse("assessment-list")).data["count"], expected, user.username
            )
        self.client.force_authenticate(self.student)
        item = self.client.get(reverse("assessment-list")).data["results"][0]
        self.assertIsNone(item["my_attempt"])
        self.assertEqual(item["max_score"], 10)


class SupervisionTests(AssessmentTestBase):
    def test_draft_saved_and_restored_on_start(self):
        assessment = self.make_assessment()
        self.act(self.student, "start", assessment)
        draft = [{"question": self.mc.id, "choice": 1}, {"question": self.essay.id, "text": "setengah jadi"}]
        res = self.act(self.student, "draft", assessment, data={"answers": draft})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        restored = self.act(self.student, "start", assessment).data["draft"]
        self.assertEqual({d["question"]: d["choice"] for d in restored}[self.mc.id], 1)
        bad = self.act(
            self.student, "draft", assessment, data={"answers": [{"question": self.mc.id, "choice": 7}]}
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_violations_recorded_without_limit(self):
        assessment = self.make_assessment()
        self.act(self.student, "start", assessment)
        for kind in ("hidden", "blur", "fullscreen_exit"):
            res = self.act(self.student, "violation", assessment, data={"kind": kind})
        self.assertEqual(res.data["attempt"]["violation_count"], 3)
        self.assertEqual(res.data["attempt"]["status"], "in_progress")  # tanpa batas: hanya dicatat
        self.assertEqual(self.act(self.student, "violation", assessment, data={"kind": "x"}).status_code, 400)

    def test_auto_submit_with_draft_when_limit_reached(self):
        assessment = self.make_assessment(max_violations=2)
        start = self.act(self.student, "start", assessment).data
        self.assertEqual(start["rules"], {"max_violations": 2, "require_fullscreen": False})
        self.act(self.student, "draft", assessment, data={"answers": [{"question": self.mc.id, "choice": 1}]})
        first = self.act(self.student, "violation", assessment, data={"kind": "hidden"})
        self.assertEqual(first.data["attempt"]["status"], "in_progress")
        second = self.act(self.student, "violation", assessment, data={"kind": "hidden"})
        attempt = second.data["attempt"]
        self.assertTrue(attempt["auto_submitted"])
        self.assertEqual(attempt["status"], "graded")  # esai kosong = 0, PG dari draf benar
        self.assertEqual(attempt["score"], 2)
        # Setelah terkumpul: pelanggaran berikutnya diabaikan, draf/kumpul ditolak.
        again = self.act(self.student, "violation", assessment, data={"kind": "hidden"})
        self.assertEqual(again.data["attempt"]["violation_count"], 2)
        self.assertEqual(self.act(self.student, "draft", assessment, data={"answers": []}).status_code, 400)

    def test_teacher_sees_violation_log(self):
        assessment = self.make_assessment()
        self.act(self.student, "start", assessment)
        self.act(self.student, "violation", assessment, data={"kind": "hidden"})
        self.act(self.student, "submit", assessment, data={"answers": []})
        rows = self.act(self.teacher, "results", assessment, "get").data
        mine = next(r for r in rows if r["student"]["id"] == self.student.id)["attempt"]
        self.assertEqual(mine["violation_count"], 1)
        self.client.force_authenticate(self.teacher)
        detail = self.client.get(reverse("assessment-attempt-detail", args=[mine["id"]])).data
        self.assertEqual([e["label"] for e in detail["events"]], ["Pindah tab / aplikasi"])

    def test_violation_requires_own_started_attempt(self):
        assessment = self.make_assessment()
        self.assertEqual(
            self.act(self.student, "violation", assessment, data={"kind": "hidden"}).status_code, 404
        )
        self.act(self.student, "start", assessment)
        self.assertEqual(
            self.act(self.teacher, "violation", assessment, data={"kind": "hidden"}).status_code, 403
        )
