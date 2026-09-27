import shutil
import tempfile
from datetime import timedelta
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User

from .models import Submission, Task

PASSWORD = "RahasiaKuat#2026"
TEMP_MEDIA = tempfile.mkdtemp()


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password=PASSWORD, full_name=username.title(), role=role, **extra
    )


def upload(name="jawaban.pdf", content=b"%PDF-1.4 jawaban"):
    return SimpleUploadedFile(name, content)


@override_settings(MEDIA_ROOT=TEMP_MEDIA, MAX_UPLOAD_SIZE_MB=1)
class TaskTestBase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.other_teacher = make_user("guru2", Role.TEACHER)
        self.rpl = Classroom.objects.create(
            name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027"
        )
        tkj = Classroom.objects.create(name="XI TKJ 1", grade="XI", major="TKJ", academic_year="2026/2027")
        web = Subject.objects.create(code="PWEB", name="Pemrograman Web")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher, subject=web, classroom=self.rpl
        )
        self.other_assignment = TeachingAssignment.objects.create(
            teacher=self.other_teacher, subject=web, classroom=tkj
        )
        self.student = make_user("siswa1", Role.STUDENT, classroom=self.rpl)
        self.student2 = make_user("siswa2", Role.STUDENT, classroom=self.rpl)
        self.student_tkj = make_user("siswa3", Role.STUDENT, classroom=tkj)

    def make_task(self, due_in=timedelta(days=3), **extra):
        defaults = {
            "teaching_assignment": self.assignment,
            "title": "Membuat halaman profil",
            "due_at": timezone.now() + due_in,
            "is_published": True,
        }
        return Task.objects.create(**{**defaults, **extra})

    def submit(self, task, user=None, **data):
        self.client.force_authenticate(user or self.student)
        url = reverse("task-my-submission", args=[task.id])
        return self.client.put(url, data, format="multipart")


class TaskCrudTests(TaskTestBase):
    url = reverse("task-list")

    def test_teacher_creates_task_with_attachment(self):
        self.client.force_authenticate(self.teacher)
        payload = {
            "teaching_assignment": self.assignment.id,
            "title": "Tugas 1",
            "instructions": "Buat halaman HTML.",
            "due_at": (timezone.now() + timedelta(days=7)).isoformat(),
            "max_score": 100,
            "attachment": upload("soal.docx", b"isi soal"),
        }
        res = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertTrue(res.data["has_attachment"])
        self.assertEqual(res.data["attachment_filename"], "soal.docx")
        self.assertFalse(res.data["is_published"])
        self.assertEqual(res.data["student_count"], 2)

    def test_create_validation(self):
        self.client.force_authenticate(self.teacher)
        base = {"teaching_assignment": self.assignment.id, "title": "X"}
        res = self.client.post(
            self.url, {**base, "due_at": (timezone.now() - timedelta(hours=1)).isoformat()}
        )
        self.assertIn("due_at", res.data)
        future = (timezone.now() + timedelta(days=1)).isoformat()
        res = self.client.post(
            self.url, {**base, "due_at": future, "attachment": upload("virus.exe")}, format="multipart"
        )
        self.assertIn("attachment", res.data)
        res = self.client.post(self.url, {**base, "due_at": future, "max_score": 0})
        self.assertIn("max_score", res.data)
        res = self.client.post(
            self.url, {**base, "due_at": future, "teaching_assignment": self.other_assignment.id}
        )
        self.assertIn("teaching_assignment", res.data)

    def test_visibility_by_role(self):
        self.make_task(title="Terbit")
        self.make_task(title="Draf", is_published=False)
        self.make_task(title="Kelas lain", teaching_assignment=self.other_assignment)

        def titles(user):
            self.client.force_authenticate(user)
            return sorted(t["title"] for t in self.client.get(self.url).data["results"])

        self.assertEqual(titles(self.teacher), ["Draf", "Terbit"])
        self.assertEqual(titles(self.student), ["Terbit"])
        self.assertEqual(titles(self.student_tkj), ["Kelas lain"])
        self.assertEqual(len(titles(self.admin)), 3)

    def test_student_list_includes_own_submission_only(self):
        task = self.make_task()
        self.submit(task, self.student2, text_answer="punya siswa2")
        self.client.force_authenticate(self.student)
        item = self.client.get(self.url).data["results"][0]
        self.assertIsNone(item["my_submission"])
        self.submit(task, text_answer="punya siswa1")
        item = self.client.get(self.url).data["results"][0]
        self.assertEqual(item["my_submission"]["text_answer"], "punya siswa1")

    def test_remove_and_replace_attachment(self):
        task = self.make_task(attachment=upload("soal.pdf"), attachment_filename="soal.pdf")
        path = Path(task.attachment.path)
        self.client.force_authenticate(self.teacher)
        detail = reverse("task-detail", args=[task.id])
        res = self.client.patch(detail, {"remove_attachment": True})
        self.assertFalse(res.data["has_attachment"])
        self.assertFalse(path.exists())

    def test_cannot_delete_task_with_submissions(self):
        task = self.make_task()
        self.submit(task, text_answer="jawaban")
        self.client.force_authenticate(self.teacher)
        res = self.client.delete(reverse("task-detail", args=[task.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        empty = self.make_task(title="Kosong")
        self.assertEqual(
            self.client.delete(reverse("task-detail", args=[empty.id])).status_code,
            status.HTTP_204_NO_CONTENT,
        )

    def test_attachment_download_access(self):
        task = self.make_task(attachment=upload("soal.pdf", b"isi soal"), attachment_filename="soal.pdf")
        url = reverse("task-attachment", args=[task.id])
        self.client.force_authenticate(self.student)
        res = self.client.get(url)
        self.assertEqual(b"".join(res.streaming_content), b"isi soal")
        self.assertIn("attachment", res["Content-Disposition"])
        self.client.force_authenticate(self.student_tkj)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)


class SubmissionRuleTests(TaskTestBase):
    def test_submit_before_due_then_replace_file(self):
        task = self.make_task()
        res = self.submit(task, text_answer="versi 1", file=upload("v1.pdf"))
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertFalse(res.data["is_late"])
        first_path = Path(Submission.objects.get().file.path)

        res = self.submit(task, text_answer="versi 2", file=upload("v2.pdf"))
        self.assertEqual(res.data["original_filename"], "v2.pdf")
        self.assertEqual(Submission.objects.count(), 1)
        self.assertFalse(first_path.exists())

        # Mengubah teks saja tidak menghapus file yang sudah ada.
        res = self.submit(task, text_answer="versi 3")
        self.assertTrue(res.data["has_file"])
        self.assertEqual(res.data["text_answer"], "versi 3")

    def test_empty_submission_rejected(self):
        res = self.submit(self.make_task(), text_answer="   ")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bad_file_type_rejected(self):
        res = self.submit(self.make_task(), file=upload("jawaban.exe"))
        self.assertIn("file", res.data)

    def test_late_first_submission_is_marked_late(self):
        task = self.make_task(due_in=timedelta(hours=-1))
        res = self.submit(task, text_answer="telat")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["is_late"])
        # Setelah tenggat, pengumpulan tidak bisa diganti atau dibatalkan.
        self.assertEqual(self.submit(task, text_answer="ganti").status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.delete(reverse("task-my-submission", args=[task.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_late_submission_rejected_when_not_allowed(self):
        task = self.make_task(due_in=timedelta(hours=-1), allow_late=False)
        res = self.submit(task, text_answer="telat")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Submission.objects.exists())

    def test_cancel_before_due(self):
        task = self.make_task()
        self.submit(task, file=upload())
        path = Path(Submission.objects.get().file.path)
        res = self.client.delete(reverse("task-my-submission", args=[task.id]))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Submission.objects.exists())
        self.assertFalse(path.exists())

    def test_cannot_submit_draft_or_other_class_task(self):
        draft = self.make_task(is_published=False)
        self.assertEqual(self.submit(draft, text_answer="x").status_code, status.HTTP_404_NOT_FOUND)
        other = self.make_task(teaching_assignment=self.other_assignment)
        self.assertEqual(self.submit(other, text_answer="x").status_code, status.HTTP_404_NOT_FOUND)

    def test_teacher_cannot_use_my_submission(self):
        task = self.make_task()
        self.assertEqual(
            self.submit(task, self.teacher, text_answer="x").status_code, status.HTTP_403_FORBIDDEN
        )


class SubmissionReviewTests(TaskTestBase):
    def test_teacher_sees_roster_with_status(self):
        task = self.make_task()
        self.submit(task, text_answer="sudah")
        self.client.force_authenticate(self.teacher)
        res = self.client.get(reverse("task-submissions", args=[task.id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = {row["student"]["full_name"]: row["submission"] for row in res.data}
        self.assertEqual(set(rows), {"Siswa1", "Siswa2"})
        self.assertEqual(rows["Siswa1"]["text_answer"], "sudah")
        self.assertIsNone(rows["Siswa2"])

    def test_roster_keeps_students_who_moved_class(self):
        task = self.make_task()
        self.submit(task, text_answer="sudah")
        self.student.classroom = None
        self.student.save()
        self.client.force_authenticate(self.teacher)
        names = [
            row["student"]["full_name"]
            for row in self.client.get(reverse("task-submissions", args=[task.id])).data
        ]
        self.assertIn("Siswa1", names)

    def test_roster_access(self):
        task = self.make_task()
        url = reverse("task-submissions", args=[task.id])
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)

    def test_submission_download_access(self):
        task = self.make_task()
        self.submit(task, file=upload("jawaban.pdf", b"isi jawaban"))
        url = reverse("submission-download", args=[Submission.objects.get().id])
        for user, expected in [
            (self.student, 200),
            (self.teacher, 200),
            (self.admin, 200),
            (self.student2, 404),
            (self.other_teacher, 404),
        ]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, expected, user.username)

    def test_submissions_list_scoped(self):
        task = self.make_task()
        self.submit(task, text_answer="a")
        self.submit(task, self.student2, text_answer="b")
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(reverse("submission-list")).data["count"], 1)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(reverse("submission-list")).data["count"], 2)
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(reverse("submission-list")).data["count"], 0)

    def test_student_with_submission_cannot_be_deleted(self):
        self.submit(self.make_task(), text_answer="a")
        self.client.force_authenticate(self.admin)
        res = self.client.delete(reverse("user-detail", args=[self.student.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
