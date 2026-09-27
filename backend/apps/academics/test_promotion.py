from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role, User
from apps.materials.models import Material

from .models import Classroom, Subject, TeachingAssignment
from .promotion import renamed, suggest_next_year

OLD, NEW = "2026/2027", "2027/2028"


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )


class RenameTests(APITestCase):
    def test_grade_in_name_is_replaced(self):
        self.assertEqual(renamed("X RPL 1", "XI"), "XI RPL 1")
        self.assertEqual(renamed("XI TKJ 2", "XII"), "XII TKJ 2")
        self.assertEqual(renamed("x rpl", "XI"), "XI rpl")
        self.assertEqual(renamed("RPL A", "XI"), "XI RPL A")  # tanpa tingkat di depan
        self.assertEqual(suggest_next_year(OLD), NEW)


class PromotionTests(APITestCase):
    def setUp(self):
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.teacher2 = make_user("guru2", Role.TEACHER)
        self.x = Classroom.objects.create(
            name="X RPL 1", grade="X", major="RPL", academic_year=OLD, homeroom_teacher=self.teacher
        )
        self.xi = Classroom.objects.create(name="XI RPL 1", grade="XI", major="RPL", academic_year=OLD)
        self.xii = Classroom.objects.create(name="XII RPL 1", grade="XII", major="RPL", academic_year=OLD)
        self.subject = Subject.objects.create(code="PWEB", name="Pemrograman Web")
        self.subject2 = Subject.objects.create(code="BD", name="Basis Data")
        # Guru1 mengajar di X, guru2 mengajar di XI: pengampu disalin per tingkat.
        self.x_assignment = TeachingAssignment.objects.create(
            teacher=self.teacher, subject=self.subject, classroom=self.x
        )
        TeachingAssignment.objects.create(teacher=self.teacher2, subject=self.subject2, classroom=self.xi)
        self.s_x = make_user("sx", Role.STUDENT, classroom=self.x)
        self.s_x_repeat = make_user("sxr", Role.STUDENT, classroom=self.x)
        self.s_xi = make_user("sxi", Role.STUDENT, classroom=self.xi)
        self.s_xii = make_user("sxii", Role.STUDENT, classroom=self.xii)
        self.material = Material.objects.create(
            teaching_assignment=self.x_assignment, title="Modul lama", material_type="link",
            url="https://example.com", created_by=self.teacher,
        )  # fmt: skip
        self.url = reverse("academic-promotion")
        self.client.force_authenticate(self.admin)

    def run_promotion(self, **options):
        return self.client.post(self.url, {"from_year": OLD, "to_year": NEW, **options}, format="json")

    def classroom(self, name, year=NEW):
        return Classroom.objects.get(name=name, academic_year=year)

    def test_only_admin(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.run_promotion().status_code, status.HTTP_403_FORBIDDEN)

    def test_preview_defaults_to_latest_year_and_changes_nothing(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual((res.data["from_year"], res.data["to_year"]), (OLD, NEW))
        by_name = {c["name"]: c for c in res.data["classes"]}
        self.assertEqual(by_name["X RPL 1"]["target_name"], "XI RPL 1")
        self.assertEqual(by_name["XII RPL 1"]["action"], "graduate")
        self.assertEqual(len(by_name["X RPL 1"]["students"]), 2)
        self.assertEqual(res.data["new_first_grade"][0]["name"], "X RPL 1")
        self.assertEqual(res.data["summary"], {"promoted": 3, "graduated": 1, "classrooms": 3})
        self.assertFalse(Classroom.objects.filter(academic_year=NEW).exists())

    def test_promotion_moves_students_and_keeps_history(self):
        res = self.run_promotion(hold_back=[self.s_x_repeat.id])
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(
            {k: res.data[k] for k in ("promoted", "graduated", "held_back", "classrooms_created")},
            {"promoted": 2, "graduated": 1, "held_back": 1, "classrooms_created": 3},
        )
        for student in (self.s_x, self.s_x_repeat, self.s_xi, self.s_xii):
            student.refresh_from_db()
        self.assertEqual(self.s_x.classroom, self.classroom("XI RPL 1"))
        self.assertEqual(self.s_xi.classroom, self.classroom("XII RPL 1"))
        # Tinggal kelas: tetap kelas X di tahun ajaran baru (kelas X baru).
        self.assertEqual(self.s_x_repeat.classroom, self.classroom("X RPL 1"))
        self.assertEqual(self.classroom("X RPL 1").grade, "X")
        # Lulus: keluar kelas dan akun dinonaktifkan.
        self.assertIsNone(self.s_xii.classroom)
        self.assertFalse(self.s_xii.is_active)
        # Data lama tetap ada.
        self.assertTrue(Classroom.objects.filter(academic_year=OLD).count() == 3)
        self.assertTrue(Material.objects.filter(pk=self.material.pk).exists())

    def test_homeroom_follows_students_and_assignments_copied_per_grade(self):
        self.run_promotion()
        # Wali kelas X RPL 1 ikut naik ke XI RPL 1; kelas X baru belum punya wali.
        self.assertEqual(self.classroom("XI RPL 1").homeroom_teacher, self.teacher)
        self.assertIsNone(self.classroom("X RPL 1").homeroom_teacher)
        # Pengampu disalin dari kelas bernama sama (tingkat sama) tahun lalu.
        new_x = TeachingAssignment.objects.get(classroom=self.classroom("X RPL 1"))
        new_xi = TeachingAssignment.objects.get(classroom=self.classroom("XI RPL 1"))
        self.assertEqual((new_x.teacher, new_x.subject), (self.teacher, self.subject))
        self.assertEqual((new_xi.teacher, new_xi.subject), (self.teacher2, self.subject2))
        self.assertFalse(TeachingAssignment.objects.filter(classroom=self.classroom("XII RPL 1")).exists())

    def test_options_off(self):
        res = self.run_promotion(
            graduate="keep", copy_homeroom=False, copy_assignments=False, recreate_first_grade=False
        )
        self.assertEqual(res.data["classrooms_created"], 2)
        self.assertFalse(Classroom.objects.filter(name="X RPL 1", academic_year=NEW).exists())
        self.assertIsNone(self.classroom("XI RPL 1").homeroom_teacher)
        self.assertFalse(TeachingAssignment.objects.filter(classroom__academic_year=NEW).exists())
        self.s_xii.refresh_from_db()
        self.assertTrue(self.s_xii.is_active)
        self.assertIsNone(self.s_xii.classroom)

    def test_running_twice_is_safe(self):
        self.run_promotion()
        res = self.run_promotion()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual((res.data["promoted"], res.data["classrooms_created"]), (0, 0))
        self.assertEqual(Classroom.objects.filter(academic_year=NEW).count(), 3)

    def test_invalid_years_rejected(self):
        for from_year, to_year, field in [
            (OLD, OLD, "to_year"),
            (OLD, "2025/2026", "to_year"),
            (OLD, "2027-2028", "to_year"),
            ("2020/2021", "2021/2022", "from_year"),
        ]:
            res = self.client.post(self.url, {"from_year": from_year, "to_year": to_year}, format="json")
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, (from_year, to_year))
            self.assertIn(field, res.data)
