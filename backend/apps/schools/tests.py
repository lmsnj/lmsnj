from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject
from apps.academics.promotion import next_grade, renamed
from apps.accounts.models import Role, User

from .models import Level, School


def make_user(username, role, *schools):
    user = User.objects.create_user(username=username, password="x", full_name=username.title(), role=role)
    user.schools.add(*schools)
    return user


class ActiveSchoolTests(APITestCase):
    def setUp(self):
        self.smk = School.objects.create(code="smknj", name="SMKS Nurul Jadid", level=Level.SMK)
        self.mts = School.objects.create(code="mtsnj", name="MTs Nurul Jadid", level=Level.MTS)
        self.sd = School.objects.create(code="sdnj", name="SD Nurul Jadid", level=Level.SD)
        self.admin = make_user("admin1", Role.ADMIN, self.smk, self.mts)
        self.teacher = make_user("guru1", Role.TEACHER, self.smk, self.mts)
        self.student = make_user("siswa1", Role.STUDENT, self.smk)

    def create_classroom(self, school=None, **data):
        payload = {"name": "VII A", "grade": "VII", "major": "UMUM", "academic_year": "2026/2027", **data}
        headers = {"X-School": str(school.id)} if school else {}
        return self.client.post(reverse("classroom-list"), payload, format="json", headers=headers)

    def test_list_only_own_active_schools(self):
        self.mts.is_active = False
        self.mts.save()
        self.client.force_authenticate(self.teacher)
        res = self.client.get(reverse("school-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([s["code"] for s in res.data], ["smknj"])
        self.assertEqual(res.data[0]["grades"], ["X", "XI", "XII"])

    def test_me_contains_schools(self):
        self.client.force_authenticate(self.teacher)
        res = self.client.get(reverse("auth-me"))
        self.assertEqual({s["code"] for s in res.data["schools"]}, {"smknj", "mtsnj"})

    def test_header_selects_school(self):
        self.client.force_authenticate(self.admin)
        res = self.create_classroom(self.mts)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(Classroom.objects.get().school, self.mts)

    def test_without_header_uses_first_school_by_name(self):
        self.client.force_authenticate(self.admin)
        res = self.create_classroom()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(Classroom.objects.get().school, self.mts)  # "MTs ..." < "SMKS ..."

    def test_header_of_other_school_rejected(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.create_classroom(self.sd).status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.post(
            reverse("classroom-list"), {}, format="json", headers={"X-School": "bukan-angka"}
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Classroom.objects.exists())

    def test_admin_without_school_cannot_create(self):
        lonely = make_user("admin2", Role.ADMIN)
        self.client.force_authenticate(lonely)
        self.assertEqual(self.create_classroom().status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.post(
            reverse("user-list"),
            {"username": "baru", "full_name": "Baru", "role": "teacher", "password": "RahasiaKuat#2026"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_grade_must_match_school_level(self):
        self.client.force_authenticate(self.admin)
        res = self.create_classroom(self.mts, name="X A", grade="X")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("VII, VIII, IX", str(res.data["grade"]))
        self.assertEqual(self.create_classroom(self.mts, grade="VIII").status_code, status.HTTP_201_CREATED)

    def test_classroom_name_unique_per_school(self):
        self.client.force_authenticate(self.admin)
        payload = {"name": "X RPL 1", "grade": "X"}
        self.assertEqual(self.create_classroom(self.smk, **payload).status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.create_classroom(self.smk, **payload).status_code, status.HTTP_400_BAD_REQUEST)

    def test_subject_code_unique_per_school(self):
        Subject.objects.create(school=self.mts, code="MTK", name="Matematika")
        self.client.force_authenticate(self.admin)
        url = reverse("subject-list")
        headers = {"X-School": str(self.smk.id)}
        res = self.client.post(url, {"code": "mtk", "name": "Matematika"}, format="json", headers=headers)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        res = self.client.post(url, {"code": "MTK", "name": "Lagi"}, format="json", headers=headers)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Subject.objects.filter(code="MTK").count(), 2)

    def test_new_user_joins_active_school(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            reverse("user-list"),
            {"username": "baru", "full_name": "Baru", "role": "teacher", "password": "RahasiaKuat#2026"},
            format="json",
            headers={"X-School": str(self.mts.id)},
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(list(User.objects.get(username="baru").schools.all()), [self.mts])

    def test_logo_missing_returns_404(self):
        res = self.client.get(reverse("school-logo", args=[self.smk.id]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class LevelGradeTests(APITestCase):
    def test_next_grade_per_level(self):
        sd = School(level=Level.MI).grades
        self.assertEqual(next_grade("I", sd), "II")
        self.assertIsNone(next_grade("VI", sd))
        smp = School(level=Level.SMP).grades
        self.assertEqual(next_grade("VII", smp), "VIII")
        self.assertIsNone(next_grade("IX", smp))

    def test_rename_roman_prefix(self):
        self.assertEqual(renamed("VII A", "VIII"), "VIII A")
        self.assertEqual(renamed("VIII A", "IX"), "IX A")
        self.assertEqual(renamed("IV B", "V"), "V B")
        self.assertEqual(renamed("I Umar", "II"), "II Umar")
        self.assertEqual(renamed("IPA 1", "XI"), "XI IPA 1")  # "I" di "IPA" bukan tingkat
