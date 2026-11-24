from datetime import timedelta
from decimal import Decimal

from django.test import SimpleTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.assessments.models import Assessment, Question, QuestionKind
from apps.common.testing import default_school
from apps.grading.models import EntryStatus, GradeActivity, GradeType
from apps.school_settings import services as settings_services
from apps.school_settings.models import SchoolFeature

from .models import CardAssignment, QuizAnswer, QuizSession
from .services import percent_to_value

BANDS = [
    {"label": "A", "min": 90},
    {"label": "B", "min": 80},
    {"label": "C", "min": 75},
    {"label": "D", "min": 0},
]
YEAR = "2026/2027"
SESSIONS = "qr-quiz-session-list"


def make_user(username, role, school=None, **extra):
    user = User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )
    user.schools.add(school or default_school())
    return user


def question(text="2 + 2 = ?", choices=("3", "4", "5", "6"), correct=1):
    return {"text": text, "choices": list(choices), "correct": correct}


class PercentToValueTests(SimpleTestCase):
    def test_scales(self):
        self.assertEqual(percent_to_value("0-100", None, Decimal(200) / 3), ("66.67", Decimal("66.67")))
        self.assertEqual(percent_to_value("0-4", None, 75), ("3", Decimal("75.00")))
        self.assertEqual(percent_to_value("predikat", BANDS, 80), ("B", Decimal("85.00")))
        self.assertEqual(percent_to_value("predikat", BANDS, 0), ("D", Decimal("37.00")))


class QrQuizApiTests(APITestCase):
    def setUp(self):
        self.school = default_school()
        SchoolFeature.objects.create(school=self.school, code="kuis_qr", is_active=True)
        self.admin = make_user("admin1", Role.ADMIN)
        self.guru = make_user("guru1", Role.TEACHER)
        self.partner = make_user("guru2", Role.TEACHER)
        self.outsider = make_user("guru3", Role.TEACHER)
        self.classroom = Classroom.objects.create(
            school=self.school, name="X RPL 1", grade="X", major="RPL", academic_year=YEAR
        )
        self.subject = Subject.objects.create(school=self.school, code="MTK", name="Matematika")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.guru, subject=self.subject, classroom=self.classroom
        )
        self.partner_assignment = TeachingAssignment.objects.create(
            teacher=self.partner, subject=self.subject, classroom=self.classroom
        )
        # Ani, Budi, Citra (urut nama = urutan absen).
        self.students = [
            make_user(name, Role.STUDENT, classroom=self.classroom, nis=str(n))
            for n, name in enumerate(["citra", "ani", "budi"], start=1)
        ]
        self.ani, self.budi, self.citra = sorted(self.students, key=lambda s: s.full_name)

    def login(self, user):
        self.client.force_authenticate(user)

    def map_cards(self):
        self.login(self.guru)
        response = self.client.post(reverse("qr-quiz-cards-auto"), {"classroom": self.classroom.pk})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response

    def create_session(self, questions=None, user=None):
        self.login(user or self.guru)
        return self.client.post(
            reverse(SESSIONS),
            {
                "teaching_assignment": self.assignment.pk,
                "title": "Kuis Pecahan",
                "questions": questions or [question(), question("Ibu kota RI?", ["Jakarta", "Bandung"], 0)],
            },
            format="json",
        )

    def scan(self, session_id, question_index, scans):
        return self.client.post(
            reverse("qr-quiz-session-scans", args=[session_id]),
            {"question": question_index, "scans": scans},
            format="json",
        )

    # --- Peta kartu ----------------------------------------------------------------------

    def test_auto_cards_follow_name_order(self):
        response = self.map_cards()
        numbers = {row["full_name"]: row["number"] for row in response.data["rows"]}
        self.assertEqual(numbers, {"Ani": 1, "Budi": 2, "Citra": 3})
        self.assertEqual(response.data["card_limit"], 40)

    def test_save_cards_rejects_duplicates_and_out_of_range(self):
        self.login(self.guru)
        url = reverse("qr-quiz-cards")
        bad = {
            "classroom": self.classroom.pk,
            "records": [
                {"student": self.ani.pk, "number": 5},
                {"student": self.budi.pk, "number": 5},
                {"student": self.citra.pk, "number": 41},
            ],
        }
        response = self.client.put(url, bad, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(set(response.data["records"]), {str(self.budi.pk), str(self.citra.pk)})
        ok = {"classroom": self.classroom.pk, "records": [{"student": self.ani.pk, "number": 7}]}
        response = self.client.put(url, ok, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(CardAssignment.objects.get().number, 7)

    def test_cards_access(self):
        self.login(self.outsider)  # tidak mengajar kelas ini
        response = self.client.get(reverse("qr-quiz-cards"), {"classroom": self.classroom.pk})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.login(self.ani)
        response = self.client.get(reverse("qr-quiz-cards"), {"classroom": self.classroom.pk})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.login(self.admin)
        response = self.client.post(reverse("qr-quiz-cards-auto"), {"classroom": self.classroom.pk})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_feature_off_blocks_writes_but_not_reads(self):
        SchoolFeature.objects.filter(code="kuis_qr").update(is_active=False)
        self.login(self.guru)
        response = self.client.post(reverse("qr-quiz-cards-auto"), {"classroom": self.classroom.pk})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.create_session().status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.get(reverse("qr-quiz-cards"), {"classroom": self.classroom.pk})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # --- Sesi ----------------------------------------------------------------------------

    def test_question_validation_uses_option_setting(self):
        response = self.create_session([{"text": "", "choices": ["a"], "correct": 0}])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("0", response.data["questions"])
        settings_services.save_setting(self.school, "kuis_qr.jumlah_opsi", "school", None, 3, self.admin)
        response = self.create_session([question()])  # 4 pilihan > 3
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.create_session([question(choices=("a", "b", "c"), correct=2)])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_team_member_sees_session_admin_reads_only(self):
        session_id = self.create_session().data["id"]
        self.login(self.partner)
        response = self.client.get(reverse(SESSIONS), {"teaching_assignment": self.partner_assignment.pk})
        self.assertEqual([s["id"] for s in response.data["results"]], [session_id])
        self.login(self.outsider)
        response = self.client.get(reverse("qr-quiz-session-detail", args=[session_id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.login(self.admin)
        response = self.client.get(reverse("qr-quiz-session-detail", args=[session_id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["roster"]), 3)
        response = self.client.post(reverse("qr-quiz-session-finish", args=[session_id]))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.create_session(user=self.admin).status_code, status.HTTP_403_FORBIDDEN)

    def test_control_moves_question_and_hides_result(self):
        session_id = self.create_session().data["id"]
        url = reverse("qr-quiz-session-control", args=[session_id])
        response = self.client.post(url, {"revealed": True}, format="json")
        self.assertTrue(response.data["revealed"])
        response = self.client.post(url, {"question": 1}, format="json")
        self.assertEqual((response.data["current_question"], response.data["revealed"]), (1, False))
        response = self.client.post(url, {"question": 5}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_scans_report_unknown_invalid_and_rescan(self):
        self.map_cards()
        session_id = self.create_session().data["id"]
        # Soal 2 hanya punya 2 pilihan: kartu yang diangkat C (2) tidak sah.
        response = self.scan(
            session_id, 1, [{"card": 1, "option": 0}, {"card": 2, "option": 2}, {"card": 9, "option": 0}]
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data["report"],
            {"saved": 1, "unknown_cards": [9], "invalid_cards": [2], "kept_cards": []},
        )
        # Pindai ulang (bawaan boleh) mengganti jawaban.
        self.scan(session_id, 1, [{"card": 1, "option": 1}])
        answer = QuizAnswer.objects.get(student=self.ani)
        self.assertEqual((answer.option, answer.is_correct), (1, False))
        settings_services.save_setting(
            self.school, "kuis_qr.boleh_pindai_ulang", "school", None, False, self.admin
        )
        response = self.scan(session_id, 1, [{"card": 1, "option": 0}])
        self.assertEqual(response.data["report"]["kept_cards"], [1])
        self.assertEqual(QuizAnswer.objects.get(student=self.ani).option, 1)
        # Soal tidak bisa diubah setelah ada jawaban.
        response = self.client.patch(
            reverse("qr-quiz-session-detail", args=[session_id]), {"questions": [question()]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_finish_saves_grades_as_qr_quiz_activity(self):
        self.map_cards()
        session_id = self.create_session().data["id"]
        # Ani benar 2, Budi benar 1, Citra tidak terbaca.
        self.scan(session_id, 0, [{"card": 1, "option": 1}, {"card": 2, "option": 1}])
        self.scan(session_id, 1, [{"card": 1, "option": 0}, {"card": 2, "option": 1}])
        response = self.client.post(reverse("qr-quiz-session-finish", args=[session_id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        activity = GradeActivity.objects.get(pk=response.data["grade_activity"])
        self.assertEqual(
            (activity.source, activity.grade_type.name, activity.scale), ("kuis_qr", "Kuis QR", "0-100")
        )
        entries = {e.student_id: e for e in activity.entries.all()}
        self.assertEqual(entries[self.ani.pk].score, Decimal("100.00"))
        self.assertEqual(entries[self.budi.pk].value, "50")
        self.assertEqual(entries[self.budi.pk].note, "Kuis QR: 1/2 benar")
        self.assertEqual(entries[self.citra.pk].status, EntryStatus.ABSENT)
        self.assertIsNone(entries[self.citra.pk].score)
        # Selesai = terkunci; jenis Kuis QR yang sudah ada dipakai ulang.
        self.assertEqual(self.scan(session_id, 0, [{"card": 3, "option": 1}]).status_code, 400)
        response = self.client.post(reverse("qr-quiz-session-finish", args=[session_id]))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        second = self.create_session().data["id"]
        self.client.post(reverse("qr-quiz-session-finish", args=[second]))
        self.assertEqual(GradeType.objects.filter(name="Kuis QR").count(), 1)
        self.assertEqual(
            QuizSession.objects.get(pk=second).grade_activity.entries.filter(status="hadir").count(), 0
        )

    def test_bank_lists_simple_choice_questions_of_team(self):
        assessment = Assessment.objects.create(
            teaching_assignment=self.partner_assignment,
            title="Ulangan 1",
            due_at=timezone.now() + timedelta(days=1),
        )
        Question.objects.create(
            assessment=assessment,
            text="Akar 9?",
            choices=["1", "3", "9"],
            correct_choice=1,
            kind=QuestionKind.CHOICE,
        )
        Question.objects.create(
            assessment=assessment, text="Terlalu banyak", choices=list("abcde"), correct_choice=0
        )
        Question.objects.create(assessment=assessment, text="Esai", kind=QuestionKind.ESSAY)
        self.login(self.guru)
        response = self.client.get(
            reverse("qr-quiz-session-bank"), {"teaching_assignment": self.assignment.pk}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["option_limit"], 4)
        self.assertEqual(
            [(q["text"], q["correct"], q["assessment"]) for q in response.data["questions"]],
            [("Akar 9?", 1, "Ulangan 1")],
        )
