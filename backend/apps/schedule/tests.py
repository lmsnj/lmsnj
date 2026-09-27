from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User

from .models import TeachingSession


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )


class TeachingSessionTests(APITestCase):
    url = reverse("teaching-session-list")

    def setUp(self):
        self.teacher = make_user("guru1", Role.TEACHER)
        other_teacher = make_user("guru2", Role.TEACHER)
        rpl = Classroom.objects.create(name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027")
        tkj = Classroom.objects.create(name="XI TKJ 1", grade="XI", major="TKJ", academic_year="2026/2027")
        web = Subject.objects.create(code="PWEB", name="Pemrograman Web")
        self.assignment = TeachingAssignment.objects.create(teacher=self.teacher, subject=web, classroom=rpl)
        self.other = TeachingAssignment.objects.create(teacher=other_teacher, subject=web, classroom=tkj)
        self.student = make_user("siswa1", Role.STUDENT, classroom=rpl)
        self.student_tkj = make_user("siswa2", Role.STUDENT, classroom=tkj)

    def payload(self, **extra):
        return {
            "teaching_assignment": self.assignment.id,
            "title": "Praktik HTML",
            "starts_at": (timezone.now() + timedelta(days=1)).isoformat(),
            "duration_minutes": 90,
            "mode": "offline",
            "location": "Lab RPL 1",
            **extra,
        }

    def test_teacher_creates_session_visible_to_class(self):
        self.client.force_authenticate(self.teacher)
        res = self.client.post(self.url, self.payload())
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual((res.data["status"], res.data["mode_display"]), ("upcoming", "Tatap muka"))
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(self.url).data["count"], 1)
        self.client.force_authenticate(self.student_tkj)
        self.assertEqual(self.client.get(self.url).data["count"], 0)

    def test_online_requires_link_and_offline_clears_it(self):
        self.client.force_authenticate(self.teacher)
        self.assertIn("meeting_url", self.client.post(self.url, self.payload(mode="online")).data)
        res = self.client.post(
            self.url, self.payload(mode="offline", meeting_url="https://meet.google.com/abc")
        )
        self.assertEqual(res.data["meeting_url"], "")

    def test_permissions(self):
        self.client.force_authenticate(self.teacher)
        res = self.client.post(self.url, self.payload(teaching_assignment=self.other.id))
        self.assertIn("teaching_assignment", res.data)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.post(self.url, self.payload()).status_code, status.HTTP_403_FORBIDDEN)

    def test_status_and_date_filter(self):
        now = timezone.now()
        TeachingSession.objects.create(
            teaching_assignment=self.assignment, title="Sedang", starts_at=now - timedelta(minutes=10)
        )
        TeachingSession.objects.create(
            teaching_assignment=self.assignment, title="Selesai", starts_at=now - timedelta(days=2)
        )
        self.client.force_authenticate(self.student)
        res = self.client.get(self.url, {"starts_at__gte": (now - timedelta(days=1)).isoformat()})
        self.assertEqual([(s["title"], s["status"]) for s in res.data["results"]], [("Sedang", "ongoing")])
