"""Bab + Post Test: kelola bab oleh guru, urutan belajar per bab, dan kunci Post Test."""

from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role
from apps.assessments.models import Assessment, Question
from apps.common.testing import default_school

from .models import Chapter, Material
from .tests import make_user


class ChapterTests(APITestCase):
    url = reverse("chapter-list")

    def setUp(self):
        school = default_school()
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.other_teacher = make_user("guru2", Role.TEACHER)
        room = Classroom.objects.create(
            school=school, name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027"
        )
        web = Subject.objects.create(school=school, code="PWEB", name="Pemrograman Web")
        self.assignment = TeachingAssignment.objects.create(teacher=self.teacher, subject=web, classroom=room)
        self.other_assignment = TeachingAssignment.objects.create(
            teacher=self.other_teacher,
            subject=Subject.objects.create(school=school, code="BIN", name="B. Indonesia"),
            classroom=room,
        )
        self.student = make_user("siswa1", Role.STUDENT, classroom=room)
        due = timezone.now() + timedelta(days=3)
        self.post_test = Assessment.objects.create(
            teaching_assignment=self.assignment, title="Post Test Bab 1", due_at=due,
            is_published=True, passing_score=75,
        )  # fmt: skip
        self.question = Question.objects.create(
            assessment=self.post_test, order=0, kind="choice", text="Tag judul?", points=1,
            choices=["<p>", "<h1>"], correct_choice=1,
        )  # fmt: skip
        self.chapter1 = Chapter.objects.create(
            teaching_assignment=self.assignment, title="Bab 1", order=1, post_test=self.post_test
        )
        self.chapter2 = Chapter.objects.create(teaching_assignment=self.assignment, title="Bab 2", order=2)
        # Urutan `order` sengaja diacak: urutan belajar mengikuti bab dulu.
        self.intro = self.material("Pengantar", order=9)
        self.m1 = self.material("HTML Dasar", chapter=self.chapter1, order=3)
        self.m2 = self.material("CSS Dasar", chapter=self.chapter2, order=1)

    def material(self, title, **extra):
        return Material.objects.create(
            teaching_assignment=self.assignment, title=title, material_type="link",
            url="https://contoh.id", is_published=True, require_reflection=False, **extra,
        )  # fmt: skip

    def student_materials(self):
        self.client.force_authenticate(self.student)
        res = self.client.get(reverse("material-list"), {"teaching_assignment": self.assignment.id})
        return {m["id"]: m["progress"] for m in res.data["results"]}

    def student_chapters(self):
        self.client.force_authenticate(self.student)
        res = self.client.get(self.url, {"teaching_assignment": self.assignment.id})
        return {c["id"]: c for c in res.data["results"]}

    def open(self, material):
        self.client.force_authenticate(self.student)
        self.client.post(reverse("material-open", args=[material.id]))

    def take_post_test(self, choice):
        self.client.force_authenticate(self.student)
        res = self.client.post(reverse("assessment-start", args=[self.post_test.id]))
        if res.status_code != status.HTTP_200_OK:
            return res
        answers = [{"question": self.question.id, "choice": choice}]
        self.client.post(
            reverse("assessment-submit", args=[self.post_test.id]), {"answers": answers}, format="json"
        )
        return res

    def test_teacher_manages_chapters(self):
        self.client.force_authenticate(self.teacher)
        res = self.client.post(self.url, {"teaching_assignment": self.assignment.id, "title": "Bab 3"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["order"], 3)
        listed = self.client.get(self.url, {"teaching_assignment": self.assignment.id}).data["results"]
        self.assertEqual([c["title"] for c in listed], ["Bab 1", "Bab 2", "Bab 3"])
        self.assertEqual(listed[0]["post_test_title"], "Post Test Bab 1")
        self.assertEqual(listed[0]["material_count"], 1)

        reorder = reverse("chapter-reorder")
        ids = [self.chapter2.id, self.chapter1.id, res.data["id"]]
        self.client.post(reorder, {"teaching_assignment": self.assignment.id, "chapters": ids}, format="json")
        listed = self.client.get(self.url, {"teaching_assignment": self.assignment.id}).data["results"]
        self.assertEqual([c["title"] for c in listed], ["Bab 2", "Bab 1", "Bab 3"])

        # Menghapus bab tidak menghapus materinya.
        self.client.delete(reverse("chapter-detail", args=[self.chapter1.id]))
        self.m1.refresh_from_db()
        self.assertIsNone(self.m1.chapter)

    def test_permissions_and_validation(self):
        detail = reverse("chapter-detail", args=[self.chapter1.id])
        for user in (self.student, self.admin):
            self.client.force_authenticate(user)
            res = self.client.post(self.url, {"teaching_assignment": self.assignment.id, "title": "X"})
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.patch(detail, {"title": "X"}).status_code, status.HTTP_404_NOT_FOUND)
        res = self.client.post(self.url, {"teaching_assignment": self.assignment.id, "title": "X"})
        self.assertIn("teaching_assignment", res.data)
        # Post Test & bab materi harus dari kelas-mapel yang sama.
        other_test = Assessment.objects.create(
            teaching_assignment=self.other_assignment, title="Lain", due_at=timezone.now()
        )
        self.client.force_authenticate(self.teacher)
        self.assertIn("post_test", self.client.patch(detail, {"post_test": other_test.id}).data)
        other_chapter = Chapter.objects.create(teaching_assignment=self.other_assignment, title="Lain")
        res = self.client.patch(reverse("material-detail", args=[self.m1.id]), {"chapter": other_chapter.id})
        self.assertIn("chapter", res.data)
        res = self.client.patch(
            reverse("material-detail", args=[self.intro.id]), {"chapter": self.chapter2.id}
        )
        self.assertEqual(res.data["chapter_title"], "Bab 2")

    def test_student_sees_only_chapters_with_published_materials(self):
        Material.objects.filter(pk=self.m2.id).update(is_published=False)
        chapters = self.student_chapters()
        self.assertEqual(list(chapters), [self.chapter1.id])

    def test_learning_order_and_post_test_gate(self):
        progress = self.student_materials()
        self.assertEqual(progress[self.intro.id]["order_number"], 1)  # tanpa bab = paling depan
        self.assertEqual(progress[self.m1.id]["locked_by"], "Pengantar")
        self.assertEqual(self.take_post_test(1).status_code, status.HTTP_403_FORBIDDEN)

        self.open(self.intro)
        self.open(self.m1)
        progress = self.student_materials()
        self.assertTrue(progress[self.m1.id]["completed"])
        # Bab 1 selesai, tetapi Bab 2 menunggu Post Test.
        self.assertEqual(progress[self.m2.id]["locked_by"], "Post Test Bab 1")
        chapter = self.student_chapters()[self.chapter1.id]["progress"]
        self.assertEqual(chapter["completed_materials"], 1)
        self.assertIsNone(chapter["post_test_locked_by"])
        self.assertFalse(chapter["completed"])
        self.assertTrue(self.student_chapters()[self.chapter2.id]["progress"]["locked"])

        # Gagal KKM: Bab 2 tetap terkunci.
        self.take_post_test(0)
        self.assertEqual(self.student_materials()[self.m2.id]["locked_by"], "Post Test Bab 1")

    def test_passing_post_test_opens_next_chapter(self):
        self.open(self.intro)
        self.open(self.m1)
        self.assertEqual(self.take_post_test(1).status_code, status.HTTP_200_OK)
        progress = self.student_materials()
        self.assertFalse(progress[self.m2.id]["locked"])
        chapter = self.student_chapters()[self.chapter1.id]["progress"]
        self.assertEqual(chapter["post_test_status"], "passed")
        self.assertTrue(chapter["completed"])

    def test_post_test_locked_until_chapter_materials_done(self):
        self.open(self.intro)
        self.client.force_authenticate(self.student)
        detail = self.client.get(reverse("assessment-detail", args=[self.post_test.id])).data
        self.assertEqual(detail["locked_by_material"], "HTML Dasar")
        self.assertEqual(
            self.student_chapters()[self.chapter1.id]["progress"]["post_test_locked_by"], "HTML Dasar"
        )

    def test_draft_post_test_does_not_block(self):
        Assessment.objects.filter(pk=self.post_test.id).update(is_published=False)
        self.open(self.intro)
        self.open(self.m1)
        self.assertFalse(self.student_materials()[self.m2.id]["locked"])
