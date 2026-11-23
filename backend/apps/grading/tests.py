from decimal import Decimal

from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.common.testing import default_school
from apps.school_settings import services as settings_services
from apps.school_settings.models import SchoolFeature
from apps.schools.models import Level, School

from .models import GradeActivity, GradeEntry, GradeType
from .scales import ScaleError, clean_value, predicate_scores

BANDS = [
    {"label": "A", "min": 90},
    {"label": "B", "min": 80},
    {"label": "C", "min": 75},
    {"label": "D", "min": 0},
]
YEAR = "2026/2027"


class ScaleTests(SimpleTestCase):
    def test_0_100(self):
        self.assertEqual(clean_value("0-100", "85"), ("85", Decimal("85.00")))
        self.assertEqual(clean_value("0-100", " 87,5 "), ("87.5", Decimal("87.50")))
        self.assertEqual(clean_value("0-100", "100"), ("100", Decimal("100.00")))
        for bad in ["101", "-1", "abc", "80.123", "NaN", "Infinity", ""]:
            with self.subTest(bad), self.assertRaises(ScaleError):
                clean_value("0-100", bad)

    def test_0_4_times_25(self):
        self.assertEqual(clean_value("0-4", "3"), ("3", Decimal("75.00")))
        self.assertEqual(clean_value("0-4", "3.33"), ("3.33", Decimal("83.25")))
        with self.assertRaises(ScaleError):
            clean_value("0-4", "5")

    def test_predicate_uses_middle_of_range(self):
        self.assertEqual(predicate_scores(BANDS), {"A": 95, "B": 85, "C": 77, "D": 37})
        self.assertEqual(clean_value("predikat", "b", BANDS), ("B", Decimal("85.00")))
        bands = [{"label": "Baik", "min": 70}, {"label": "Cukup", "min": 0}]
        self.assertEqual(clean_value("predikat", "BAIK", bands), ("Baik", Decimal("85.00")))
        with self.assertRaises(ScaleError):
            clean_value("predikat", "E", BANDS)


def make_user(username, role, school=None, **extra):
    user = User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )
    user.schools.add(school or default_school())
    return user


class GradingApiTests(APITestCase):
    def setUp(self):
        self.school = default_school()
        SchoolFeature.objects.create(school=self.school, code="penilaian_langsung", is_active=True)
        self.admin = make_user("admin1", Role.ADMIN)
        self.guru = make_user("guru1", Role.TEACHER)
        self.partner = make_user("guru2", Role.TEACHER)  # rekan setim
        self.outsider = make_user("guru3", Role.TEACHER)
        self.classroom = Classroom.objects.create(
            school=self.school, name="X RPL 1", grade="X", major="RPL", academic_year=YEAR
        )
        self.subject = Subject.objects.create(school=self.school, code="MTK", name="Matematika")
        other_subject = Subject.objects.create(school=self.school, code="BIN", name="Bahasa Indonesia")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.guru, subject=self.subject, classroom=self.classroom
        )
        TeachingAssignment.objects.create(
            teacher=self.partner, subject=self.subject, classroom=self.classroom
        )
        TeachingAssignment.objects.create(
            teacher=self.outsider, subject=other_subject, classroom=self.classroom
        )
        self.ani = make_user("ani", Role.STUDENT, classroom=self.classroom, nis="001")
        self.budi = make_user("budi", Role.STUDENT, classroom=self.classroom, nis="002")
        self.other_class = Classroom.objects.create(
            school=self.school, name="X RPL 2", grade="X", major="RPL", academic_year=YEAR
        )
        self.citra = make_user("citra", Role.STUDENT, classroom=self.other_class, nis="003")
        self.client.force_authenticate(self.admin)
        res = self.client.post(reverse("grade-type-starter"))
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.lisan = GradeType.objects.get(school=self.school, name="Lisan")

    def create_activity(self, user=None, **extra):
        self.client.force_authenticate(user or self.guru)
        body = {
            "teaching_assignment": self.assignment.id,
            "grade_type": self.lisan.id,
            "title": "Lisan Bab 1",
            "date": "2026-11-24",
            **extra,
        }
        return self.client.post(reverse("grade-activity-list"), body, format="json")

    def scores_url(self, activity_id):
        return reverse("grade-activity-scores", args=[activity_id])

    def test_starter_types_once_and_admin_only_write(self):
        names = [t["name"] for t in self.client.get(reverse("grade-type-list")).data]
        self.assertEqual(names[:2], ["Tugas Kertas", "Ulangan Kertas"])
        self.assertEqual(
            self.client.post(reverse("grade-type-starter")).status_code, status.HTTP_400_BAD_REQUEST
        )
        self.client.force_authenticate(self.guru)
        self.assertEqual(self.client.get(reverse("grade-type-list")).status_code, status.HTTP_200_OK)
        res = self.client.post(reverse("grade-type-list"), {"name": "Proyek"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.ani)
        self.assertEqual(self.client.get(reverse("grade-type-list")).status_code, status.HTTP_403_FORBIDDEN)

    def test_used_type_cannot_be_deleted(self):
        self.create_activity()
        self.client.force_authenticate(self.admin)
        res = self.client.delete(reverse("grade-type-detail", args=[self.lisan.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.patch(
            reverse("grade-type-detail", args=[self.lisan.id]), {"is_active": False}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(self.create_activity().status_code, status.HTTP_400_BAD_REQUEST)  # nonaktif

    def test_create_snapshots_scale_and_team_shares(self):
        settings_services.save_setting(self.school, "nilai.skala", "school", None, "predikat", self.admin)
        res = self.create_activity()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["scale"], "predikat")
        self.assertEqual(res.data["bands"][0], {"label": "A", "min": 90})
        # Skala sekolah diganti: kegiatan lama tetap predikat.
        settings_services.save_setting(self.school, "nilai.skala", "school", None, "0-100", self.admin)
        self.assertEqual(GradeActivity.objects.get().scale, "predikat")

        self.client.force_authenticate(self.partner)
        res = self.client.get(reverse("grade-activity-list"), {"teaching_assignment": self.assignment.id})
        self.assertEqual(res.data["count"], 1)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(reverse("grade-activity-list")).data["count"], 0)
        self.assertEqual(self.create_activity(self.outsider).status_code, status.HTTP_400_BAD_REQUEST)

    def test_scores_grid_save_kkm_and_clear(self):
        settings_services.save_setting(self.school, "nilai.kkm", "subject", self.subject.id, 80, self.admin)
        activity_id = self.create_activity().data["id"]
        res = self.client.get(self.scores_url(activity_id))
        self.assertEqual(res.data["kkm"], 80)
        self.assertEqual([r["full_name"] for r in res.data["rows"]], ["Ani", "Budi"])  # citra beda kelas

        records = [
            {"student": self.ani.id, "value": "75"},
            {"student": self.budi.id, "status": "tidak_hadir", "value": "90"},
        ]
        res = self.client.put(self.scores_url(activity_id), {"records": records}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        ani, budi = res.data["rows"]
        self.assertEqual((ani["value"], ani["below_kkm"]), ("75", True))
        self.assertEqual((budi["status"], budi["value"], budi["score"]), ("tidak_hadir", "", None))
        self.assertEqual((res.data["activity"]["graded_count"], res.data["activity"]["absent_count"]), (1, 1))

        # Rekan setim boleh mengisi; sel dikosongkan = nilai dihapus.
        self.client.force_authenticate(self.partner)
        res = self.client.put(
            self.scores_url(activity_id), {"records": [{"student": self.ani.id, "value": ""}]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(GradeEntry.objects.count(), 1)

    def test_invalid_scores_are_all_or_nothing(self):
        activity_id = self.create_activity().data["id"]
        records = [
            {"student": self.ani.id, "value": "80"},
            {"student": self.budi.id, "value": "120"},
            {"student": self.citra.id, "value": "80"},
        ]
        res = self.client.put(self.scores_url(activity_id), {"records": records}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(set(res.data["records"]), {str(self.budi.id), str(self.citra.id)})
        self.assertFalse(GradeEntry.objects.exists())

    def test_access_rules(self):
        activity_id = self.create_activity().data["id"]
        url = self.scores_url(activity_id)
        body = {"records": [{"student": self.ani.id, "value": "80"}]}
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)  # admin melihat
        self.assertEqual(self.client.put(url, body, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.ani)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.get(reverse("grade-activity-list")).status_code, status.HTTP_403_FORBIDDEN
        )

        other = School.objects.create(code="mtsnj", name="MTs", level=Level.MTS)
        other_admin = make_user("admin2", Role.ADMIN, school=other)
        self.client.force_authenticate(other_admin)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(reverse("grade-type-list")).data, [])

    def test_feature_off_blocks_writing_but_keeps_reading(self):
        activity_id = self.create_activity().data["id"]
        SchoolFeature.objects.filter(code="penilaian_langsung").update(is_active=False)
        self.assertEqual(self.create_activity().status_code, status.HTTP_403_FORBIDDEN)
        url = self.scores_url(activity_id)
        body = {"records": [{"student": self.ani.id, "value": "80"}]}
        self.assertEqual(self.client.put(url, body, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
        detail = reverse("grade-activity-detail", args=[activity_id])
        self.assertEqual(self.client.delete(detail).status_code, status.HTTP_403_FORBIDDEN)

    def test_activity_cannot_move_to_other_class(self):
        activity_id = self.create_activity().data["id"]
        other = TeachingAssignment.objects.create(
            teacher=self.guru, subject=self.subject, classroom=self.other_class
        )
        res = self.client.patch(
            reverse("grade-activity-detail", args=[activity_id]),
            {"teaching_assignment": other.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.patch(
            reverse("grade-activity-detail", args=[activity_id]),
            {"title": "Lisan Bab 1 (ulang)"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_student_who_left_class_keeps_their_score_row(self):
        activity_id = self.create_activity().data["id"]
        body = {"records": [{"student": self.budi.id, "value": "88"}]}
        self.client.put(self.scores_url(activity_id), body, format="json")
        self.budi.classroom = self.other_class
        self.budi.save()
        rows = self.client.get(self.scores_url(activity_id)).data["rows"]
        self.assertEqual([r["full_name"] for r in rows], ["Ani", "Budi"])
