from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.materials.models import Material, MaterialType
from apps.tasks.models import Submission, Task

PASSWORD = "RahasiaKuat#2026"


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password=PASSWORD, full_name=username.title(), role=role, **extra
    )


class DashboardTests(APITestCase):
    url = reverse("dashboard")

    def setUp(self):
        now = timezone.now()
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.other_teacher = make_user("guru2", Role.TEACHER)
        make_user("guru3", Role.TEACHER)  # belum mengampu apa pun
        self.rpl = Classroom.objects.create(
            name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027", homeroom_teacher=self.teacher
        )
        tkj = Classroom.objects.create(name="XI TKJ 1", grade="XI", major="TKJ", academic_year="2026/2027")
        Classroom.objects.create(
            name="X RPL 1", grade="X", major="RPL", academic_year="2025/2026"
        )  # tahun lalu
        web = Subject.objects.create(code="PWEB", name="Pemrograman Web")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher, subject=web, classroom=self.rpl
        )
        other = TeachingAssignment.objects.create(teacher=self.other_teacher, subject=web, classroom=tkj)
        self.student = make_user("siswa1", Role.STUDENT, classroom=self.rpl)
        self.student2 = make_user("siswa2", Role.STUDENT, classroom=self.rpl)
        make_user("siswa3", Role.STUDENT)  # belum punya kelas

        def task(title, due, **extra):
            defaults = {"teaching_assignment": self.assignment, "is_published": True, "due_at": now + due}
            return Task.objects.create(title=title, **{**defaults, **extra})

        self.task_soon = task("Segera", timedelta(days=2))
        self.task_later = task("Nanti", timedelta(days=20))
        self.task_late_ok = task("Lewat, boleh telat", timedelta(days=-1))
        task("Lewat, ditutup", timedelta(days=-1), allow_late=False)
        task("Draf", timedelta(days=3), is_published=False)
        task("Kelas lain", timedelta(days=1), teaching_assignment=other)

        # siswa1 mengumpulkan "Segera" (sudah dinilai) dan "Nanti" (belum dinilai).
        Submission.objects.create(
            task=self.task_soon,
            student=self.student,
            text_answer="a",
            submitted_at=now,
            score=45,
            graded_at=now,
        )
        Submission.objects.create(
            task=self.task_later, student=self.student, text_answer="b", submitted_at=now
        )
        self.task_soon.max_score = 50
        self.task_soon.save()

        Material.objects.create(
            teaching_assignment=self.assignment,
            title="Modul 1",
            material_type=MaterialType.LINK,
            url="https://example.com",
            is_published=True,
            created_by=self.teacher,
        )
        Material.objects.create(
            teaching_assignment=self.assignment,
            title="Draf materi",
            material_type=MaterialType.LINK,
            url="https://example.com",
        )

    def get(self, user):
        self.client.force_authenticate(user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_requires_login(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_admin_dashboard(self):
        data = self.get(self.admin)
        self.assertEqual(data["role"], Role.ADMIN)
        self.assertEqual(data["academic_year"], "2026/2027")
        stats = data["stats"]
        self.assertEqual((stats["students"], stats["teachers"], stats["admins"]), (3, 3, 1))
        self.assertEqual(stats["classrooms"], 2)  # hanya tahun ajaran terbaru
        self.assertEqual(stats["submissions_this_week"], 2)
        attention = data["attention"]
        self.assertEqual(attention["students_without_classroom"], 1)
        self.assertEqual(attention["teachers_without_assignment"], 1)
        self.assertEqual(attention["classrooms_without_homeroom"], 1)
        self.assertEqual(attention["classrooms_without_students"], 1)
        self.assertTrue(data["recent_activity"])

    def test_teacher_dashboard(self):
        data = self.get(self.teacher)
        self.assertEqual(data["stats"]["teaching_assignments"], 1)
        self.assertEqual(data["stats"]["students"], 2)
        self.assertEqual(data["stats"]["to_grade"], 1)
        self.assertEqual(data["stats"]["drafts"], 2)  # 1 tugas draf + 1 materi draf
        self.assertEqual(data["homeroom_classes"], ["XI RPL 1"])
        self.assertEqual([item["task_title"] for item in data["to_grade"]], ["Nanti"])
        # Hanya tenggat 7 hari ke depan, milik guru ini, yang terbit.
        upcoming = data["upcoming_tasks"]
        self.assertEqual([t["title"] for t in upcoming], ["Segera"])
        self.assertEqual((upcoming[0]["submission_count"], upcoming[0]["student_count"]), (1, 2))

    def test_other_teacher_sees_only_own_data(self):
        data = self.get(self.other_teacher)
        self.assertEqual(data["stats"]["to_grade"], 0)
        self.assertEqual([t["title"] for t in data["upcoming_tasks"]], ["Kelas lain"])

    def test_student_dashboard(self):
        data = self.get(self.student)
        self.assertEqual(data["classroom_name"], "XI RPL 1")
        # Belum dikumpulkan dan masih bisa: hanya "Lewat, boleh telat" (yang ditutup & draf tidak ikut).
        self.assertEqual([t["title"] for t in data["pending_tasks"]], ["Lewat, boleh telat"])
        self.assertEqual(data["stats"]["overdue"], 1)
        self.assertEqual(data["stats"]["submitted"], 2)
        self.assertEqual(data["stats"]["average"], 90)  # 45/50 -> 90
        self.assertEqual(data["recent_grades"][0]["score"], 45)
        self.assertEqual([m["title"] for m in data["recent_materials"]], ["Modul 1"])

    def test_student_without_submissions(self):
        data = self.get(self.student2)
        self.assertEqual(len(data["pending_tasks"]), 3)
        self.assertEqual(data["pending_tasks"][0]["title"], "Lewat, boleh telat")  # urut tenggat
        self.assertIsNone(data["stats"]["average"])

    def test_student_without_classroom(self):
        data = self.get(User.objects.get(username="siswa3"))
        self.assertIsNone(data["classroom_name"])
        self.assertEqual(data["pending_tasks"], [])
