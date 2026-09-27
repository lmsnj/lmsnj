from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User

from .models import Announcement


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )


class AnnouncementTests(APITestCase):
    url = reverse("announcement-list")

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
        self.student_tkj = make_user("siswa2", Role.STUDENT, classroom=tkj)

    def post(self, user, **data):
        self.client.force_authenticate(user)
        return self.client.post(self.url, {"title": "Info", "body": "Isi", **data}, format="json")

    def titles(self, user):
        self.client.force_authenticate(user)
        return sorted(a["title"] for a in self.client.get(self.url).data["results"])

    def test_admin_posts_school_wide_visible_to_everyone(self):
        res = self.post(self.admin, title="Libur")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["target_label"], "Seluruh sekolah")
        for user in (self.teacher, self.student, self.student_tkj):
            self.assertEqual(self.titles(user), ["Libur"])

    def test_teacher_posts_to_own_class_only(self):
        self.assertIn("teaching_assignment", self.post(self.teacher).data)  # wajib pilih kelas
        self.assertIn("teaching_assignment", self.post(self.teacher, teaching_assignment=self.other.id).data)
        res = self.post(self.teacher, title="Kelas RPL", teaching_assignment=self.assignment.id)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["target_label"], "Pemrograman Web · XI RPL 1")
        self.assertEqual(self.titles(self.student), ["Kelas RPL"])
        self.assertEqual(self.titles(self.student_tkj), [])
        self.assertEqual(self.titles(self.other_teacher), [])

    def test_student_cannot_post(self):
        self.assertEqual(self.post(self.student).status_code, status.HTTP_403_FORBIDDEN)

    def test_only_author_or_admin_can_edit(self):
        announcement = Announcement.objects.create(
            title="A", body="B", teaching_assignment=self.assignment, author=self.teacher
        )
        detail = reverse("announcement-detail", args=[announcement.id])
        self.client.force_authenticate(self.student)
        self.assertFalse(self.client.get(detail).data["can_edit"])
        self.assertEqual(self.client.patch(detail, {"title": "X"}).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.patch(detail, {"is_pinned": True}).status_code, status.HTTP_200_OK)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(detail).status_code, status.HTTP_204_NO_CONTENT)

    def test_pinned_first_and_filter(self):
        Announcement.objects.create(title="Lama disematkan", body="-", is_pinned=True, author=self.admin)
        Announcement.objects.create(title="Baru", body="-", author=self.admin)
        Announcement.objects.create(
            title="Kelas", body="-", teaching_assignment=self.assignment, author=self.teacher
        )
        self.client.force_authenticate(self.student)
        titles = [a["title"] for a in self.client.get(self.url).data["results"]]
        self.assertEqual(titles[0], "Lama disematkan")
        res = self.client.get(self.url, {"teaching_assignment": "school"})
        self.assertEqual({a["title"] for a in res.data["results"]}, {"Lama disematkan", "Baru"})
        res = self.client.get(self.url, {"teaching_assignment": self.assignment.id})
        self.assertEqual([a["title"] for a in res.data["results"]], ["Kelas"])
