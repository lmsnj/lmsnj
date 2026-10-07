from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.common.testing import default_school
from apps.schedule.models import TeachingSession

from . import services
from .models import Attendance


def make_user(username, role, **extra):
    user = User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )
    user.schools.add(default_school())
    return user


class RateTests(APITestCase):
    def test_rate(self):
        counts = {"H": 8, "S": 1, "I": 0, "A": 1}
        self.assertEqual(services.rate(counts), 80.0)
        self.assertEqual(services.rate(counts, count_excused=True), 90.0)
        self.assertIsNone(services.rate(services.empty_counts()))


class AttendanceTests(APITestCase):
    def setUp(self):
        school = default_school()
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.homeroom = make_user("wali", Role.TEACHER)
        self.other_teacher = make_user("guru2", Role.TEACHER)
        self.rpl = Classroom.objects.create(
            school=school, name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027",
            homeroom_teacher=self.homeroom,
        )  # fmt: skip
        web = Subject.objects.create(school=school, code="PWEB", name="Pemrograman Web")
        bindo = Subject.objects.create(school=school, code="BINDO", name="Bahasa Indonesia")
        self.web = TeachingAssignment.objects.create(teacher=self.teacher, subject=web, classroom=self.rpl)
        self.bindo = TeachingAssignment.objects.create(
            teacher=self.other_teacher, subject=bindo, classroom=self.rpl
        )
        self.ani = make_user("ani", Role.STUDENT, classroom=self.rpl)
        self.budi = make_user("budi", Role.STUDENT, classroom=self.rpl)
        self.outsider = make_user("luar", Role.STUDENT)
        self.past = self.session(self.web, days=-1)

    def session(self, assignment, days):
        return TeachingSession.objects.create(
            teaching_assignment=assignment, title="Pertemuan", starts_at=timezone.now() + timedelta(days=days)
        )

    def url(self, session):
        return reverse("session-attendance", args=[session.id])

    def record(self, session, **statuses):
        users = {"ani": self.ani, "budi": self.budi, "luar": self.outsider}
        records = [{"student": users[name].id, "status": value} for name, value in statuses.items()]
        return self.client.put(self.url(session), {"records": records}, format="json")

    def test_teacher_records_and_updates_attendance(self):
        self.client.force_authenticate(self.teacher)
        res = self.client.get(self.url(self.past))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["recorded"])
        self.assertEqual([s["status"] for s in res.data["students"]], [None, None])

        res = self.record(self.past, ani="H", budi="A")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["recorded"])
        res = self.record(self.past, budi="S")  # ubah satu siswa
        self.assertEqual(
            dict(Attendance.objects.values_list("student__username", "status")), {"ani": "H", "budi": "S"}
        )

    def test_cannot_record_future_session_or_other_students(self):
        self.client.force_authenticate(self.teacher)
        res = self.record(self.session(self.web, days=1), ani="H")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.record(self.past, luar="H")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Attendance.objects.exists())

    def test_only_own_teacher_or_admin_can_open(self):
        for user in (self.other_teacher, self.homeroom):
            self.client.force_authenticate(user)
            self.assertEqual(self.record(self.past, ani="H").status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.ani)
        self.assertEqual(self.client.get(self.url(self.past)).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.record(self.past, ani="I").status_code, status.HTTP_200_OK)

    def test_session_with_attendance_cannot_be_deleted(self):
        Attendance.objects.create(session=self.past, student=self.ani, status="H")
        self.client.force_authenticate(self.teacher)
        res = self.client.delete(reverse("teaching-session-detail", args=[self.past.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_summary_per_assignment_and_classroom(self):
        older = self.session(self.web, days=-10)
        other = self.session(self.bindo, days=-2)
        for session, ani, budi in ((self.past, "H", "A"), (older, "H", "H"), (other, "S", "H")):
            Attendance.objects.create(session=session, student=self.ani, status=ani)
            Attendance.objects.create(session=session, student=self.budi, status=budi)
        url = reverse("attendance-summary")

        self.client.force_authenticate(self.teacher)
        res = self.client.get(url, {"teaching_assignment": self.web.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        rows = {r["student_name"]: r for r in res.data["rows"]}
        self.assertEqual((res.data["meetings"], rows["Ani"]["rate"], rows["Budi"]["rate"]), (2, 100.0, 50.0))
        # Rentang tanggal: hanya pertemuan kemarin.
        since = (timezone.localdate() - timedelta(days=3)).isoformat()
        res = self.client.get(url, {"teaching_assignment": self.web.id, "date_from": since})
        self.assertEqual(res.data["meetings"], 1)
        # Guru mapel tidak boleh melihat rekap semua mapel / mapel guru lain.
        self.assertEqual(self.client.get(url, {"classroom": self.rpl.id}).status_code, 403)
        self.assertEqual(self.client.get(url, {"teaching_assignment": self.bindo.id}).status_code, 404)

        self.client.force_authenticate(self.homeroom)
        res = self.client.get(url, {"classroom": self.rpl.id})
        rows = {r["student_name"]: r for r in res.data["rows"]}
        self.assertEqual((rows["Ani"]["H"], rows["Ani"]["S"], rows["Ani"]["rate"]), (2, 1, 66.7))
        self.assertEqual(self.client.get(url, {"teaching_assignment": self.bindo.id}).status_code, 200)
        self.assertEqual(self.client.get(url).status_code, 400)

        self.client.force_authenticate(self.ani)
        self.assertEqual(self.client.get(url, {"classroom": self.rpl.id}).status_code, 403)
        res = self.client.get(reverse("attendance-me"))
        self.assertEqual(res.data["overall"]["rate"], 66.7)
        self.assertEqual(
            [s["subject_name"] for s in res.data["subjects"]], ["Bahasa Indonesia", "Pemrograman Web"]
        )
