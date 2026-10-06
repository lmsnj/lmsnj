"""Data satu sekolah tidak boleh terlihat atau terpakai dari sekolah lain."""

from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.announcements.models import Announcement
from apps.materials.models import Material
from apps.tasks.models import Task

from .models import Level, School

YEAR = "2026/2027"


def make_user(username, role, *schools, **extra):
    user = User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )
    user.schools.add(*schools)
    return user


class SchoolIsolationTests(APITestCase):
    def setUp(self):
        self.smk = School.objects.create(code="smknj", name="SMKS Nurul Jadid", level=Level.SMK)
        self.mts = School.objects.create(code="mtsnj", name="MTs Nurul Jadid", level=Level.MTS)
        self.admin_smk = make_user("admin.smk", Role.ADMIN, self.smk)
        self.admin_mts = make_user("admin.mts", Role.ADMIN, self.mts)
        # Guru yang mengajar di dua sekolah dengan satu akun.
        self.teacher = make_user("guru.dua", Role.TEACHER, self.smk, self.mts)
        self.teacher_mts = make_user("guru.mts", Role.TEACHER, self.mts)

        self.smk_class = Classroom.objects.create(
            school=self.smk, name="X RPL 1", grade="X", major="RPL", academic_year=YEAR
        )
        self.mts_class = Classroom.objects.create(
            school=self.mts, name="VII A", grade="VII", major="UMUM", academic_year=YEAR
        )
        self.smk_subject = Subject.objects.create(school=self.smk, code="MTK", name="Matematika")
        self.mts_subject = Subject.objects.create(school=self.mts, code="MTK", name="Matematika")
        self.smk_ta = TeachingAssignment.objects.create(
            teacher=self.teacher, subject=self.smk_subject, classroom=self.smk_class
        )
        self.mts_ta = TeachingAssignment.objects.create(
            teacher=self.teacher, subject=self.mts_subject, classroom=self.mts_class
        )
        self.student_smk = make_user("siswa.smk", Role.STUDENT, self.smk, nis="001", classroom=self.smk_class)
        self.student_mts = make_user("siswa.mts", Role.STUDENT, self.mts, nis="001", classroom=self.mts_class)

        for ta in (self.smk_ta, self.mts_ta):
            Material.objects.create(
                teaching_assignment=ta, title=f"Materi {ta.classroom.name}", material_type="link",
                url="https://contoh.sch.id", is_published=True, created_by=self.teacher,
            )  # fmt: skip
            Task.objects.create(
                teaching_assignment=ta, title=f"Tugas {ta.classroom.name}", is_published=True,
                due_at=timezone.now() + timedelta(days=2), created_by=self.teacher,
            )  # fmt: skip
        Announcement.objects.create(school=self.smk, title="Libur SMK", body="-", author=self.admin_smk)
        Announcement.objects.create(school=self.mts, title="Libur MTs", body="-", author=self.admin_mts)

    def names(self, url_name, key, school=None, **params):
        headers = {"X-School": str(school.id)} if school else {}
        res = self.client.get(reverse(url_name), params, headers=headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        return sorted(item[key] for item in res.data["results"])

    def test_admin_sees_only_own_school(self):
        self.client.force_authenticate(self.admin_smk)
        self.assertEqual(self.names("classroom-list", "name"), ["X RPL 1"])
        self.assertEqual(self.names("subject-list", "code"), ["MTK"])
        self.assertEqual(self.names("teaching-assignment-list", "classroom_name"), ["X RPL 1"])
        self.assertEqual(self.names("material-list", "title"), ["Materi X RPL 1"])
        self.assertEqual(self.names("task-list", "title"), ["Tugas X RPL 1"])
        self.assertEqual(self.names("announcement-list", "title"), ["Libur SMK"])
        self.assertEqual(self.names("user-list", "username"), ["admin.smk", "guru.dua", "siswa.smk"])
        res = self.client.get(reverse("classroom-academic-years"))
        self.assertEqual(res.data, [YEAR])

    def test_admin_cannot_open_other_school_objects(self):
        self.client.force_authenticate(self.admin_smk)
        for url in (
            reverse("classroom-detail", args=[self.mts_class.id]),
            reverse("user-detail", args=[self.student_mts.id]),
            reverse("classroom-report", args=[self.mts_class.id]),
            reverse("gradebook", args=[self.mts_ta.id]),
        ):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND, url)
        # Header sekolah lain ditolak.
        res = self.client.get(reverse("classroom-list"), headers={"X-School": str(self.mts.id)})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_switches_school_with_header(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.names("task-list", "title", self.smk), ["Tugas X RPL 1"])
        self.assertEqual(self.names("task-list", "title", self.mts), ["Tugas VII A"])
        res = self.client.get(reverse("dashboard"), headers={"X-School": str(self.mts.id)})
        self.assertEqual([a["classroom_name"] for a in res.data["teaching_assignments"]], ["VII A"])

    def test_dashboard_stats_per_school(self):
        self.client.force_authenticate(self.admin_mts)
        stats = self.client.get(reverse("dashboard")).data["stats"]
        self.assertEqual((stats["students"], stats["teachers"], stats["admins"]), (1, 2, 1))
        self.assertEqual((stats["classrooms"], stats["materials"], stats["tasks"]), (1, 1, 1))

    def test_assignment_must_use_same_school(self):
        self.client.force_authenticate(self.admin_smk)
        url = reverse("teaching-assignment-list")
        other_subject = {
            "teacher": self.teacher.id,
            "subject": self.mts_subject.id,
            "classroom": self.smk_class.id,
        }
        res = self.client.post(url, other_subject, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("subject", res.data)
        other_teacher = {
            "teacher": self.teacher_mts.id,
            "subject": self.smk_subject.id,
            "classroom": self.smk_class.id,
        }
        res = self.client.post(url, other_teacher, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("teacher", res.data)

    def test_homeroom_and_students_from_same_school(self):
        self.client.force_authenticate(self.admin_smk)
        res = self.client.patch(
            reverse("classroom-detail", args=[self.smk_class.id]),
            {"homeroom_teacher": self.teacher_mts.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.post(
            reverse("classroom-students", args=[self.smk_class.id]),
            {"student_ids": [self.student_mts.id]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.student_mts.refresh_from_db()
        self.assertEqual(self.student_mts.classroom, self.mts_class)

    def test_nis_unique_per_school(self):
        self.client.force_authenticate(self.admin_smk)
        payload = {"username": "baru", "full_name": "Baru", "role": "student", "password": "RahasiaKuat#2026"}
        res = self.client.post(reverse("user-list"), {**payload, "nis": "001"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("nis", res.data)
        res = self.client.post(reverse("user-list"), {**payload, "nis": "002"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

    def test_student_classroom_must_be_in_school(self):
        self.client.force_authenticate(self.admin_smk)
        res = self.client.post(
            reverse("user-list"),
            {"username": "baru", "full_name": "Baru", "role": "student", "password": "RahasiaKuat#2026",
             "classroom": self.mts_class.id},
            format="json",
        )  # fmt: skip
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("classroom", res.data)

    def test_join_existing_teacher_and_remove_only_membership(self):
        self.client.force_authenticate(self.admin_smk)
        url = reverse("user-join")
        res = self.client.post(url, {"username": "GURU.MTS"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(set(self.teacher_mts.schools.all()), {self.smk, self.mts})
        self.assertEqual(self.client.post(url, {"username": "guru.mts"}).status_code, 400)  # sudah terdaftar
        self.assertEqual(self.client.post(url, {"username": "siswa.mts"}).status_code, 400)  # siswa
        self.assertEqual(self.client.post(url, {"username": "tidak.ada"}).status_code, 400)

        # Dihapus dari SMK: akunnya tetap ada dan masih terdaftar di MTs.
        res = self.client.delete(reverse("user-detail", args=[self.teacher_mts.id]))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(list(User.objects.get(pk=self.teacher_mts.pk).schools.all()), [self.mts])

    def test_chat_only_within_shared_school(self):
        self.client.force_authenticate(self.admin_smk)
        res = self.client.get(reverse("conversation-contacts"))
        ids = {p["id"] for p in res.data}
        self.assertNotIn(self.teacher_mts.id, ids)
        self.assertNotIn(self.admin_mts.id, ids)
        self.assertIn(self.teacher.id, ids)
        res = self.client.post(reverse("conversation-list"), {"user": self.admin_mts.id}, format="json")
        self.assertIn(res.status_code, (status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN))
