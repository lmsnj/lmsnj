from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from .gradebook import format_number
from .models import Submission
from .tests import TaskTestBase


class GradingTests(TaskTestBase):
    def setUp(self):
        super().setUp()
        self.task = self.make_task(max_score=50)
        self.submit(self.task, text_answer="jawaban siswa1")
        self.submission = Submission.objects.get(student=self.student)
        self.url = reverse("submission-grade", args=[self.submission.id])

    def grade(self, user=None, **data):
        self.client.force_authenticate(user or self.teacher)
        return self.client.patch(self.url, data, format="json")

    def test_teacher_grades_submission(self):
        res = self.grade(score=42.5, feedback="Bagus, rapikan indentasi.")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["score"], 42.5)  # angka, bukan string
        self.assertEqual(res.data["graded_by_name"], "Guru1")
        self.assertIsNotNone(res.data["graded_at"])

    def test_score_range(self):
        self.assertIn("score", self.grade(score=51).data)
        self.assertIn("score", self.grade(score=-1).data)
        self.assertEqual(self.grade(score=0).status_code, status.HTTP_200_OK)

    def test_only_owning_teacher_can_grade(self):
        self.assertEqual(self.grade(self.other_teacher, score=10).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.grade(self.admin, score=10).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.grade(self.student, score=50).status_code, status.HTTP_403_FORBIDDEN)

    def test_student_sees_grade_and_feedback(self):
        self.grade(score=45, feedback="Mantap")
        self.client.force_authenticate(self.student)
        mine = self.client.get(reverse("task-detail", args=[self.task.id])).data["my_submission"]
        self.assertEqual(mine["score"], 45)
        self.assertEqual(mine["feedback"], "Mantap")
        self.assertEqual(mine["max_score"], 50)

    def test_graded_submission_is_locked_until_grade_removed(self):
        self.grade(score=45)
        res = self.submit(self.task, text_answer="ganti setelah dinilai")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.delete(reverse("task-my-submission", args=[self.task.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Guru menghapus nilai -> siswa boleh mengganti lagi (tenggat belum lewat).
        res = self.grade(score=None)
        self.assertIsNone(res.data["score"])
        self.assertIsNone(res.data["graded_by_name"])
        self.assertEqual(self.submit(self.task, text_answer="revisi").status_code, status.HTTP_200_OK)

    def test_roster_includes_scores(self):
        self.grade(score=40)
        self.client.force_authenticate(self.teacher)
        rows = self.client.get(reverse("task-submissions", args=[self.task.id])).data
        scores = {r["student"]["full_name"]: r["submission"] and r["submission"]["score"] for r in rows}
        self.assertEqual(scores, {"Siswa1": 40, "Siswa2": None})


class GradebookTests(TaskTestBase):
    def setUp(self):
        super().setUp()
        self.task_a = self.make_task(title="Tugas A", max_score=100, due_in=timedelta(days=1))
        self.task_b = self.make_task(title="Tugas B", max_score=50, due_in=timedelta(days=2))
        self.make_task(title="Draf", is_published=False)
        self.submit(self.task_a, text_answer="a")
        self.submit(self.task_b, text_answer="b")
        self.submit(self.task_a, self.student2, text_answer="a2")
        self.client.force_authenticate(self.teacher)
        for task, student, score in [(self.task_a, self.student, 80), (self.task_b, self.student, 45)]:
            submission = Submission.objects.get(task=task, student=student)
            self.client.patch(
                reverse("submission-grade", args=[submission.id]), {"score": score}, format="json"
            )
        self.url = reverse("gradebook", args=[self.assignment.id])

    def test_gradebook_structure_and_average(self):
        data = self.client.get(self.url).data
        self.assertEqual([t["title"] for t in data["tasks"]], ["Tugas A", "Tugas B"])  # draf tidak ikut
        rows = {r["student"]["full_name"]: r for r in data["rows"]}
        siswa1 = rows["Siswa1"]
        self.assertEqual(siswa1["grades"][str(self.task_a.id)]["score"], 80)
        # Rata-rata skala 100: (80/100*100 + 45/50*100) / 2 = (80 + 90) / 2 = 85
        self.assertEqual(siswa1["average"], 85)
        self.assertEqual(siswa1["graded_count"], 2)
        siswa2 = rows["Siswa2"]
        self.assertIsNone(siswa2["grades"][str(self.task_a.id)]["score"])  # sudah kumpul, belum dinilai
        self.assertIsNone(siswa2["grades"][str(self.task_b.id)])  # tidak mengumpulkan
        self.assertIsNone(siswa2["average"])

    def test_gradebook_access(self):
        for user, expected in [
            (self.teacher, 200),
            (self.admin, 200),
            (self.other_teacher, 404),
            (self.student, 403),
        ]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url).status_code, expected, user.username)

    def test_csv_export(self):
        res = self.client.get(reverse("gradebook-export", args=[self.assignment.id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("Nilai PWEB XI RPL 1 2026-2027.csv", res["Content-Disposition"])
        text = res.content.decode("utf-8")
        self.assertTrue(text.startswith("\ufeff"))
        lines = text.lstrip("\ufeff").splitlines()
        self.assertEqual(lines[0], "No;NIS;Nama;Tugas A (maks 100);Tugas B (maks 50);Rata-rata (skala 100)")
        self.assertEqual(lines[1], "1;;Siswa1;80;45;85")
        self.assertEqual(lines[2], "2;;Siswa2;;;")

    def test_format_number(self):
        self.assertEqual(format_number(87.5), "87,5")
        self.assertEqual(format_number(90.0), "90")
        self.assertEqual(format_number(83.333), "83,33")
        self.assertEqual(format_number(None), "")

    def test_late_flag_kept_in_gradebook(self):
        late_task = self.make_task(title="Telat", due_in=timedelta(hours=-1))
        self.submit(late_task, text_answer="telat")
        self.client.force_authenticate(self.teacher)
        rows = {r["student"]["full_name"]: r for r in self.client.get(self.url).data["rows"]}
        self.assertTrue(rows["Siswa1"]["grades"][str(late_task.id)]["is_late"])
        self.assertLess(late_task.due_at, timezone.now())


class TaskListExtrasTests(TaskTestBase):
    def test_ungraded_count_and_due_filter(self):
        soon = self.make_task(title="Hari ini", due_in=timedelta(hours=2))
        later = self.make_task(title="Minggu depan", due_in=timedelta(days=7))
        self.submit(soon, text_answer="a")
        self.submit(soon, self.student2, text_answer="b")
        self.client.force_authenticate(self.teacher)
        first = Submission.objects.filter(task=soon).first()
        self.client.patch(reverse("submission-grade", args=[first.id]), {"score": 80}, format="json")

        now = timezone.now()
        res = self.client.get(
            reverse("task-list"),
            {"due_at__gte": now.isoformat(), "due_at__lte": (now + timedelta(days=1)).isoformat()},
        )
        self.assertEqual([t["title"] for t in res.data["results"]], ["Hari ini"])
        item = res.data["results"][0]
        self.assertEqual((item["submission_count"], item["ungraded_count"]), (2, 1))
        self.assertEqual(later.submissions.count(), 0)
