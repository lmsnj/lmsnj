import shutil
import tempfile
from io import StringIO

from django.core.management import CommandError, call_command
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, TeachingAssignment
from apps.accounts.models import Role, User
from apps.assessments.models import Assessment
from apps.materials.models import Material
from apps.tasks.models import Submission, Task

TEMP_MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class SeedDemoTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def seed(self):
        call_command("seed_demo", "--force", stdout=StringIO())

    def counts(self):
        return [m.objects.count() for m in (User, Classroom, TeachingAssignment, Material, Task, Submission)]

    def test_refuses_without_force_when_not_debug(self):
        with self.assertRaises(CommandError):
            call_command("seed_demo", stdout=StringIO())

    def test_seed_creates_usable_data_and_is_idempotent(self):
        self.seed()
        first = self.counts()
        self.assertTrue(all(first))
        self.seed()
        self.assertEqual(self.counts(), first)

        # Akun demo bisa login dan melihat datanya.
        for username, password in [("guru.rpl", "Belajar#Koding26"), ("rizki", "Siswa#Smknj26")]:
            res = self.client.post(reverse("auth-login"), {"username": username, "password": password})
            self.assertEqual(res.status_code, 200, username)
        self.assertTrue(User.objects.get(username="admin").is_superuser)
        self.assertIsNone(User.objects.get(username="fajar").classroom)

        # PDF demo valid dan bisa diunduh siswa.
        pdf = Material.objects.filter(
            material_type="pdf", teaching_assignment__classroom__name="XI RPL 1"
        ).first()
        self.client.force_authenticate(User.objects.get(username="rizki"))
        res = self.client.get(reverse("material-download", args=[pdf.id]))
        self.assertTrue(b"".join(res.streaming_content).startswith(b"%PDF-"))

        # Ada nilai dan pengumpulan terlambat untuk demo rekap nilai.
        self.assertTrue(Submission.objects.filter(score__isnull=False).exists())
        self.assertTrue(Submission.objects.filter(is_late=True).exists())

        # Ujian contoh simulasi TKA berisi semua bentuk soal dan bisa dikerjakan siswa.
        exam = Assessment.objects.get(title__startswith="Simulasi TKA")
        questions = list(exam.questions.all())
        self.assertEqual({q.kind for q in questions}, {"choice", "multiple", "category", "essay"})
        self.assertTrue(all(q.has_answer_key for q in questions))
        self.assertEqual(len([q for q in questions if q.group == "G1"]), 3)
        self.assertTrue(any(q.text_direction == "rtl" for q in questions))
        self.assertTrue(any("|---|" in q.stimulus for q in questions))
        res = self.client.post(reverse("assessment-start", args=[exam.id]))
        self.assertEqual(len(res.data["questions"]), len(questions))

    def test_existing_passwords_are_kept(self):
        User.objects.create_user(
            username="guru.rpl", password="PasswordSendiri#1", full_name="X", role=Role.TEACHER
        )
        self.seed()
        self.assertTrue(User.objects.get(username="guru.rpl").check_password("PasswordSendiri#1"))


class ExceptionHandlerTests(APITestCase):
    def test_404_message_is_indonesian(self):
        user = User.objects.create_user(username="guru", password="x", full_name="Guru", role=Role.TEACHER)
        self.client.force_authenticate(user)
        res = self.client.get(reverse("material-detail", args=[999]))
        self.assertEqual(res.status_code, 404)
        self.assertEqual(
            res.data["detail"], "Data tidak ditemukan, atau Anda tidak memiliki akses ke data ini."
        )

    def test_custom_not_found_message_is_kept(self):
        user = User.objects.create_user(username="siswa", password="x", full_name="Siswa", role=Role.STUDENT)
        self.client.force_authenticate(user)
        res = self.client.post(reverse("auth-logout"), {"refresh": "rusak"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Token", res.data["refresh"])
