from datetime import date, timedelta
from types import SimpleNamespace

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.attendance.models import Attendance
from apps.common.testing import default_school
from apps.payments.models import PaymentStatus
from apps.schedule.models import TeachingSession
from apps.schools.models import Level, School
from apps.tasks.models import Submission, Task

from . import services
from .models import ExamEvent, ExamParticipant

YEAR = "2026/2027"


def make_user(username, role, school=None, **extra):
    user = User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )
    user.schools.add(school or default_school())
    return user


def event_values(**overrides):
    """Acara palsu untuk menguji check_requirements tanpa database."""
    values = dict(
        min_attendance=None, min_task_rate=None, min_average=None, min_paid_quarter=None,
        require_homeroom_check=False,
    )  # fmt: skip
    values.update(overrides)
    return SimpleNamespace(**values)


class CheckRequirementsTests(APITestCase):
    def test_unused_requirements_are_skipped(self):
        result = services.check_requirements(event_values(), {"attendance": 10})
        self.assertEqual(result, {"checks": [], "requirements_met": True, "eligible": True})

    def test_missing_data_passes_and_below_minimum_fails(self):
        event = event_values(min_attendance=75, min_average=70, min_paid_quarter=2)
        result = services.check_requirements(event, {"attendance": None, "average": 65.5, "paid_quarter": 2})
        self.assertEqual([c["passed"] for c in result["checks"]], [True, False, True])
        self.assertFalse(result["eligible"])

    def test_homeroom_check_and_exemption(self):
        event = event_values(require_homeroom_check=True)
        self.assertFalse(services.check_requirements(event, {})["eligible"])
        checked = SimpleNamespace(homeroom_checked=True, exempted=False)
        self.assertTrue(services.check_requirements(event, {}, checked)["eligible"])
        exempted = SimpleNamespace(homeroom_checked=False, exempted=True)
        result = services.check_requirements(event, {}, exempted)
        self.assertFalse(result["requirements_met"])
        self.assertTrue(result["eligible"])


class ExamEventTests(APITestCase):
    def setUp(self):
        school = default_school()
        self.admin = make_user("admin1", Role.ADMIN)
        self.homeroom = make_user("wali", Role.TEACHER)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.rpl = Classroom.objects.create(
            school=school, name="XI RPL 1", grade="XI", major="RPL", academic_year=YEAR,
            homeroom_teacher=self.homeroom,
        )  # fmt: skip
        self.tkj = Classroom.objects.create(
            school=school, name="X TKJ 1", grade="X", major="TKJ", academic_year=YEAR
        )
        subject = Subject.objects.create(school=school, code="PWEB", name="Pemrograman Web")
        self.web = TeachingAssignment.objects.create(
            teacher=self.teacher, subject=subject, classroom=self.rpl
        )
        self.ani = make_user("ani", Role.STUDENT, classroom=self.rpl, nis="001")
        self.budi = make_user("budi", Role.STUDENT, classroom=self.rpl, nis="002")
        self.event = ExamEvent.objects.create(
            school=school, name="PAS Ganjil", academic_year=YEAR, grades=["XI"], exam_start=date(2026, 12, 1),
            min_attendance=75, min_task_rate=50, min_paid_quarter=2,
        )  # fmt: skip

    def url(self, name, event=None):
        return reverse(f"exam-event-{name}", args=[(event or self.event).id])

    def eligibility(self, classroom=None):
        return self.client.get(self.url("eligibility"), {"classroom": (classroom or self.rpl).id})

    def make_data(self):
        """Ani: hadir 3/4, kumpul 1/2 tugas, lunas triwulan 2 -> lolos. Budi: hadir 1/4, belum bayar -> gagal."""
        for day, (ani, budi) in enumerate([("H", "A"), ("H", "A"), ("S", "H"), ("A", "A")], start=1):
            session = TeachingSession.objects.create(
                teaching_assignment=self.web,
                title="Pertemuan",
                starts_at=timezone.now() - timedelta(days=day),
            )
            Attendance.objects.create(session=session, student=self.ani, status=ani)
            Attendance.objects.create(session=session, student=self.budi, status=budi)
        tasks = [
            Task.objects.create(
                teaching_assignment=self.web, title=f"Tugas {n}", is_published=True,
                due_at=timezone.now() - timedelta(days=n),
            )  # fmt: skip
            for n in (1, 2)
        ]
        # Tugas draf dan tugas yang belum lewat tenggat tidak dihitung.
        Task.objects.create(
            teaching_assignment=self.web, title="Draf", due_at=timezone.now() - timedelta(days=1)
        )
        Task.objects.create(
            teaching_assignment=self.web,
            title="Nanti",
            is_published=True,
            due_at=timezone.now() + timedelta(days=3),
        )
        Submission.objects.create(
            task=tasks[0], student=self.ani, text_answer="x", submitted_at=timezone.now()
        )
        PaymentStatus.objects.create(student=self.ani, academic_year=YEAR, paid_quarter=2)

    def test_admin_creates_event_with_validation(self):
        self.client.force_authenticate(self.admin)
        url = reverse("exam-event-list")
        data = {"name": "PTS", "academic_year": YEAR, "exam_start": "2026-10-20", "grades": ["XII", "X", "X"]}
        res = self.client.post(url, data, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["grades"], ["X", "XII"])
        self.assertEqual(ExamEvent.objects.get(pk=res.data["id"]).created_by, self.admin)

        bad = {**data, "grades": ["VII"], "exam_end": "2026-10-01"}
        res = self.client.post(url, bad, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("grades", res.data)

    def test_access_rules(self):
        self.client.force_authenticate(self.homeroom)
        self.assertEqual(self.client.get(reverse("exam-event-list")).data["count"], 1)
        res = self.client.post(reverse("exam-event-list"), {"name": "x"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual([c["name"] for c in self.client.get(self.url("classrooms")).data], ["XI RPL 1"])
        self.assertEqual(self.eligibility().status_code, status.HTTP_200_OK)

        # Guru yang bukan wali kelas tidak melihat kelas mana pun.
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(self.url("classrooms")).data, [])
        self.assertEqual(self.eligibility().status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.ani)
        self.assertEqual(self.client.get(reverse("exam-event-list")).status_code, status.HTTP_403_FORBIDDEN)

        # Kelas X tidak ikut acara (tingkat XI saja).
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.eligibility(self.tkj).status_code, status.HTTP_404_NOT_FOUND)

        # Acara sekolah lain tidak terlihat.
        other = School.objects.create(code="mtsnj", name="MTs", level=Level.MTS)
        foreign = ExamEvent.objects.create(
            school=other, name="PAS", academic_year=YEAR, exam_start=date(2026, 12, 1)
        )
        self.assertEqual(
            self.client.get(self.url("classrooms", foreign)).status_code, status.HTTP_404_NOT_FOUND
        )

    def test_eligibility_is_computed_from_attendance_tasks_and_payment(self):
        self.make_data()
        self.client.force_authenticate(self.admin)
        res = self.eligibility()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ani, budi = res.data["rows"]
        self.assertEqual({c["key"]: c["value"] for c in ani["checks"]},
                         {"attendance": 75.0, "task_rate": 50.0, "paid_quarter": 2})  # fmt: skip
        self.assertTrue(ani["eligible"])
        self.assertEqual({c["key"]: c["passed"] for c in budi["checks"]},
                         {"attendance": False, "task_rate": False, "paid_quarter": False})  # fmt: skip
        self.assertEqual(res.data["eligible_count"], 1)
        self.assertEqual(ani["exam_number"], f"{self.event.id:03d}-001")

        # Sakit tidak dihitung hadir jika count_excused dimatikan: Ani jadi 50%.
        self.event.count_excused = False
        self.event.save()
        self.assertFalse(self.eligibility().data["rows"][0]["eligible"])

    def test_homeroom_check_and_admin_exemption(self):
        self.make_data()
        self.event.require_homeroom_check = True
        self.event.save()
        url = self.url("eligibility")

        self.client.force_authenticate(self.homeroom)
        res = self.client.put(
            url, {"classroom": self.rpl.id, "records": [{"student": self.ani.id, "homeroom_checked": True}]},
            format="json",
        )  # fmt: skip
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["rows"][0]["eligible"])
        # Wali kelas tidak boleh memberi pengecualian.
        exempt = {"student": self.budi.id, "exempted": True, "exemption_reason": "Dispensasi"}
        res = self.client.put(url, {"classroom": self.rpl.id, "records": [exempt]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        no_reason = {"student": self.budi.id, "exempted": True}
        res = self.client.put(url, {"classroom": self.rpl.id, "records": [no_reason]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ExamParticipant.objects.filter(student=self.budi).exists())

        res = self.client.put(
            url, {"classroom": self.rpl.id, "records": [{**exempt, "room": "R-01"}]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        budi = res.data["rows"][1]
        self.assertTrue(budi["eligible"])
        self.assertFalse(budi["requirements_met"])
        # Persetujuan wali kelas untuk Ani tidak ikut terhapus oleh simpanan admin.
        self.assertTrue(res.data["rows"][0]["homeroom_checked"])

        outsider = make_user("luar", Role.STUDENT, nis="009")
        res = self.client.put(
            url,
            {"classroom": self.rpl.id, "records": [{"student": outsider.id, "room": "R-02"}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cards_only_for_eligible_students(self):
        self.make_data()
        self.client.force_authenticate(self.homeroom)
        res = self.client.get(self.url("cards"), {"classroom": self.rpl.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([c["student_name"] for c in res.data["cards"]], ["Ani"])
        self.assertEqual(res.data["skipped_count"], 1)
        self.assertEqual(res.data["event"]["name"], "PAS Ganjil")

        self.client.force_authenticate(self.teacher)
        res = self.client.get(self.url("cards"), {"classroom": self.rpl.id})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class CardTokenTests(ExamEventTests):
    """Kartu peserta sebagai syarat mengerjakan asesmen yang ditautkan ke acara ujian."""

    def make_assessment(self, **extra):
        from apps.assessments.models import Assessment, Question

        assessment = Assessment.objects.create(
            teaching_assignment=self.web, title="PAS Pemrograman Web", is_published=True,
            due_at=timezone.now() + timedelta(days=2), exam_event=self.event, **extra,
        )  # fmt: skip
        Question.objects.create(
            assessment=assessment, order=0, kind="choice", text="Tag judul?", points=2,
            choices=["<p>", "<h1>"], correct_choice=1,
        )  # fmt: skip
        return assessment

    def start(self, assessment, user, token=None):
        self.client.force_authenticate(user)
        data = {} if token is None else {"token": token}
        return self.client.post(reverse("assessment-start", args=[assessment.id]), data, format="json")

    def ani_token(self):
        self.client.force_authenticate(self.homeroom)
        cards = self.client.get(self.url("cards"), {"classroom": self.rpl.id}).data["cards"]
        return cards[0]["token"]

    def test_tokens_are_stable_and_reset_by_admin(self):
        self.make_data()
        token = self.ani_token()
        self.assertEqual(len(token), services.TOKEN_LENGTH)
        self.assertEqual(self.ani_token(), token)
        # Budi tidak layak -> tidak mendapat token.
        self.assertEqual(ExamParticipant.objects.filter(student=self.budi).exclude(token="").count(), 0)

        url = self.url("reset-token")
        res = self.client.post(url, {"student": self.ani.id, "classroom": self.rpl.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        res = self.client.post(url, {"student": self.ani.id, "classroom": self.rpl.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertNotEqual(res.data["token"], token)

    def test_start_requires_eligibility_and_card_token(self):
        self.make_data()
        assessment = self.make_assessment()
        # Kartu belum dicetak -> belum ada token.
        res = self.start(assessment, self.ani, "ABCDEF")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("belum dicetak", str(res.data["token"]))

        token = self.ani_token()
        self.assertEqual(self.start(assessment, self.ani).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.start(assessment, self.ani, "ZZZZZZ").status_code, status.HTTP_400_BAD_REQUEST)
        # Huruf kecil & spasi tetap diterima.
        res = self.start(assessment, self.ani, f" {token.lower()} ")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        # Melanjutkan pengerjaan tidak perlu token lagi.
        self.assertEqual(self.start(assessment, self.ani).status_code, status.HTTP_200_OK)

        # Budi belum memenuhi syarat: tidak bisa mulai walau menebak token Ani.
        res = self.start(assessment, self.budi, token)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("belum memenuhi", str(res.data["token"]))

    def test_teacher_links_assessment_to_matching_event_only(self):
        self.client.force_authenticate(self.teacher)
        data = {
            "teaching_assignment": self.web.id, "title": "PAS", "exam_event": self.event.id,
            "due_at": (timezone.now() + timedelta(days=3)).isoformat(),
        }  # fmt: skip
        res = self.client.post(reverse("assessment-list"), data, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["exam_event_name"], "PAS Ganjil")

        other = ExamEvent.objects.create(
            school=default_school(),
            name="PAS Kelas X",
            academic_year=YEAR,
            grades=["X"],
            exam_start=date(2026, 12, 1),
        )
        res = self.client.post(reverse("assessment-list"), {**data, "exam_event": other.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exam_event", res.data)

        # Acara yang dipakai asesmen tidak bisa dihapus.
        self.client.force_authenticate(self.admin)
        res = self.client.delete(reverse("exam-event-detail", args=[self.event.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
