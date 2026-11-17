from datetime import timedelta

from django.test import SimpleTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role
from apps.assessments.models import Assessment, Question
from apps.common.testing import default_school
from apps.tasks.models import Submission, Task

from .models import Material, MaterialProgress
from .progress import chain_blockers
from .tests import make_user


class ChainLockTests(SimpleTestCase):
    def test_locks_after_first_unfinished(self):
        steps = [("A", True, None), ("B", False, None), ("C", True, None), ("D", False, None)]
        self.assertEqual(chain_blockers(steps), [None, None, "B", "B"])
        self.assertEqual(chain_blockers([("A", True, None), ("B", True, None)]), [None, None])
        self.assertEqual(chain_blockers([]), [])

    def test_post_test_gate(self):
        steps = [("A", True, None), ("B", True, "Post Test Bab 1"), ("C", True, None)]
        self.assertEqual(chain_blockers(steps), [None, "Post Test Bab 1", "Post Test Bab 1"])
        # Materi yang belum selesai lebih dulu menjadi penghalang.
        steps = [("A", False, None), ("B", True, "Post Test Bab 1")]
        self.assertEqual(chain_blockers(steps), [None, "A"])


class LearningPathTests(APITestCase):
    def setUp(self):
        school = default_school()
        self.teacher = make_user("guru1", Role.TEACHER)
        self.other_teacher = make_user("guru2", Role.TEACHER)
        rpl = Classroom.objects.create(
            school=school, name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027"
        )
        web = Subject.objects.create(school=school, code="PWEB", name="Pemrograman Web")
        self.assignment = TeachingAssignment.objects.create(teacher=self.teacher, subject=web, classroom=rpl)
        bindo = Subject.objects.create(school=school, code="BINDO", name="Bahasa Indonesia")
        self.other_assignment = TeachingAssignment.objects.create(
            teacher=self.other_teacher, subject=bindo, classroom=rpl
        )
        self.ani = make_user("ani", Role.STUDENT, classroom=rpl)
        self.budi = make_user("budi", Role.STUDENT, classroom=rpl)

        due = timezone.now() + timedelta(days=3)
        self.task = Task.objects.create(
            teaching_assignment=self.assignment, title="Buat halaman", due_at=due, is_published=True
        )
        self.quiz = Assessment.objects.create(
            teaching_assignment=self.assignment,
            title="Kuis HTML",
            due_at=due,
            is_published=True,
            passing_score=75,
        )
        self.question = Question.objects.create(
            assessment=self.quiz, order=0, kind="choice", text="Tag judul?", points=2,
            choices=["<p>", "<h1>"], correct_choice=1,
        )  # fmt: skip
        self.m1 = self.material("Pengenalan HTML", objectives=["Menyebut 5 tag", "Membuat halaman"])
        self.m2 = self.material("Struktur Dokumen", required_task=self.task, min_task_score=70)
        self.m3 = self.material("Form HTML", required_assessment=self.quiz)
        self.m4 = self.material("Proyek Akhir", require_teacher_approval=True)

    def material(self, title, **extra):
        # Refleksi diuji tersendiri (test_reflection_requirement) agar test lain tetap ringkas.
        extra.setdefault("require_reflection", False)
        order = Material.objects.filter(teaching_assignment=self.assignment).count() + 1
        return Material.objects.create(
            teaching_assignment=self.assignment, title=title, material_type="link",
            url="https://contoh.id", is_published=True, order=order, **extra,
        )  # fmt: skip

    def as_student(self, student=None):
        self.client.force_authenticate(student or self.ani)
        res = self.client.get(reverse("material-list"), {"teaching_assignment": self.assignment.id})
        return {m["id"]: m for m in res.data["results"]}

    def post(self, name, material, data=None):
        return self.client.post(reverse(f"material-{name}", args=[material.id]), data or {}, format="json")

    def test_chain_of_requirements(self):
        listed = self.as_student()
        self.assertFalse(listed[self.m1.id]["progress"]["locked"])
        m2 = listed[self.m2.id]
        self.assertTrue(m2["progress"]["locked"])
        self.assertEqual(m2["progress"]["locked_by"], "Pengenalan HTML")
        self.assertEqual(m2["url"], "")  # isi materi terkunci disembunyikan
        self.assertEqual(self.post("open", self.m2).status_code, status.HTTP_403_FORBIDDEN)

        # Tugas syarat Materi 2 ikut terkunci.
        url = reverse("task-my-submission", args=[self.task.id])
        self.assertEqual(self.client.put(url, {"text_answer": "x"}).status_code, status.HTTP_403_FORBIDDEN)

        # Materi 1: buka + centang semua capaian.
        self.post("open", self.m1)
        res = self.post("objectives", self.m1, {"checked": [0]})
        self.assertFalse(res.data["progress"]["completed"])
        res = self.post("objectives", self.m1, {"checked": [0, 1, 7]})
        self.assertTrue(res.data["progress"]["completed"])
        self.assertFalse(self.as_student()[self.m2.id]["progress"]["locked"])

        # Materi 2: tugas harus dinilai minimal 70.
        self.post("open", self.m2)
        self.assertEqual(self.client.put(url, {"text_answer": "jawaban"}).status_code, status.HTTP_200_OK)
        self.assertTrue(self.as_student()[self.m3.id]["progress"]["locked"])
        Submission.objects.filter(task=self.task, student=self.ani).update(score=80)
        listed = self.as_student()
        self.assertFalse(listed[self.m3.id]["progress"]["locked"])

        # Materi 3: asesmen harus tuntas (KKM 75).
        self.post("open", self.m3)
        start = reverse("assessment-start", args=[self.quiz.id])
        self.assertEqual(self.client.post(start).status_code, status.HTTP_200_OK)
        submit = reverse("assessment-submit", args=[self.quiz.id])
        self.client.post(submit, {"answers": [{"question": self.question.id, "choice": 1}]}, format="json")
        listed = self.as_student()
        self.assertTrue(listed[self.m3.id]["progress"]["completed"])

        # Materi 4: perlu disahkan guru.
        self.post("open", self.m4)
        self.assertFalse(self.as_student()[self.m4.id]["progress"]["completed"])
        self.client.force_authenticate(self.teacher)
        url = reverse("material-progress", args=[self.m4.id])
        res = self.client.put(
            url, {"records": [{"student": self.ani.id, "teacher_approved": True}]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(self.as_student()[self.m4.id]["progress"]["completed"])

    def test_reflection_requirement(self):
        m1 = Material.objects.get(pk=self.m1.id)
        m1.require_reflection = True
        m1.save()
        self.client.force_authenticate(self.ani)
        self.post("open", self.m1)
        res = self.post("objectives", self.m1, {"checked": [0, 1]})
        self.assertFalse(res.data["progress"]["completed"])
        checks = {c["key"]: c["done"] for c in res.data["progress"]["checks"]}
        self.assertEqual(checks["reflection"], False)

        # Kosong / terlalu pendek ditolak.
        self.assertEqual(self.post("reflection", self.m1, {"reflection": "  "}).status_code, 400)
        self.assertEqual(self.post("reflection", self.m1, {"reflection": "paham"}).status_code, 400)
        text = "Saya belajar tag dasar HTML, masih bingung atribut."
        res = self.post("reflection", self.m1, {"reflection": text})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["progress"]["completed"])
        self.assertEqual(res.data["progress"]["reflection"], text)

        # Materi terkunci tidak bisa direfleksikan; guru bisa membaca refleksi siswa.
        self.assertEqual(self.post("reflection", self.m3, {"reflection": text}).status_code, 403)
        self.client.force_authenticate(self.teacher)
        rows = self.client.get(reverse("material-progress", args=[self.m1.id])).data["rows"]
        self.assertEqual(rows[0]["reflection"], text)
        self.assertEqual(rows[1]["reflection"], "")
        # Guru tidak memakai endpoint refleksi siswa.
        self.assertEqual(self.post("reflection", self.m1, {"reflection": text}).status_code, 403)

    def test_assessment_requirement_is_locked_too(self):
        self.client.force_authenticate(self.ani)
        res = self.client.post(reverse("assessment-start", args=[self.quiz.id]))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        listed = self.client.get(reverse("assessment-detail", args=[self.quiz.id])).data
        self.assertEqual(listed["locked_by_material"], "Pengenalan HTML")

    def test_teacher_progress_and_unlock_for_one_student(self):
        self.client.force_authenticate(self.teacher)
        url = reverse("material-progress", args=[self.m1.id])
        res = self.client.get(url)
        self.assertEqual([r["student_name"] for r in res.data["rows"]], ["Ani", "Budi"])
        self.assertFalse(res.data["rows"][0]["completed"])
        res = self.client.put(
            url,
            {"records": [{"student": self.budi.id, "unlocked": True, "note": "Siswa pindahan"}]},
            format="json",
        )
        self.assertTrue(res.data["rows"][1]["completed"])
        self.assertFalse(self.as_student(self.budi)[self.m2.id]["progress"]["locked"])
        self.assertTrue(self.as_student(self.ani)[self.m2.id]["progress"]["locked"])

        # Siswa tidak bisa melihat/mengubah progres siswa lain; guru lain tidak bisa membuka.
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)

    def test_reorder_and_validation(self):
        self.client.force_authenticate(self.teacher)
        url = reverse("material-reorder")
        order = [self.m4.id, self.m1.id, self.m2.id, self.m3.id]
        res = self.client.post(
            url, {"teaching_assignment": self.assignment.id, "materials": order}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            list(Material.objects.filter(teaching_assignment=self.assignment).values_list("id", flat=True)),
            order,
        )
        res = self.client.post(
            url, {"teaching_assignment": self.assignment.id, "materials": order[:2]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Materi baru masuk urutan terakhir; capaian boleh dikirim sebagai teks JSON (form multipart).
        data = {
            "teaching_assignment": self.assignment.id, "title": "Baru", "material_type": "link",
            "url": "https://contoh.id", "objectives": '["Capaian A", " "]',
        }  # fmt: skip
        res = self.client.post(reverse("material-list"), data)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual((res.data["order"], res.data["objectives"]), (5, ["Capaian A"]))

        other_task = Task.objects.create(
            teaching_assignment=self.other_assignment, title="Lain", due_at=timezone.now() + timedelta(days=1)
        )
        res = self.client.post(
            reverse("material-list"), {**data, "objectives": "[]", "required_task": other_task.id}
        )
        self.assertIn("required_task", res.data)
        self.assertFalse(MaterialProgress.objects.exists())
