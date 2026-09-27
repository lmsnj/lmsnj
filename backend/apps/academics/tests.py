from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role, User

from .models import Classroom, Subject, TeachingAssignment

PASSWORD = "RahasiaKuat#2026"


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password=PASSWORD, full_name=username.title(), role=role, **extra
    )


class AcademicsTestBase(APITestCase):
    def setUp(self):
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.other_teacher = make_user("guru2", Role.TEACHER)

        self.rpl = Classroom.objects.create(
            name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027"
        )
        self.tkj = Classroom.objects.create(
            name="XI TKJ 1", grade="XI", major="TKJ", academic_year="2026/2027"
        )
        self.web = Subject.objects.create(code="PWEB", name="Pemrograman Web")
        self.net = Subject.objects.create(code="JARKOM", name="Jaringan Komputer")

        self.student = make_user("siswa1", Role.STUDENT, classroom=self.rpl)
        self.student_tkj = make_user("siswa2", Role.STUDENT, classroom=self.tkj)
        self.student_no_class = make_user("siswa3", Role.STUDENT)

        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher, subject=self.web, classroom=self.rpl
        )
        TeachingAssignment.objects.create(teacher=self.other_teacher, subject=self.net, classroom=self.tkj)


class ClassroomTests(AcademicsTestBase):
    url = reverse("classroom-list")

    def ids(self, response):
        return sorted(item["id"] for item in response.data["results"])

    def test_admin_sees_all_classrooms_with_student_count(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(self.url)
        self.assertEqual(res.data["count"], 2)
        rpl = next(c for c in res.data["results"] if c["id"] == self.rpl.id)
        self.assertEqual(rpl["student_count"], 1)

    def test_teacher_sees_taught_and_homeroom_classrooms(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.ids(self.client.get(self.url)), [self.rpl.id])
        self.tkj.homeroom_teacher = self.teacher
        self.tkj.save()
        self.assertEqual(self.ids(self.client.get(self.url)), [self.rpl.id, self.tkj.id])

    def test_student_sees_only_own_classroom(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.ids(self.client.get(self.url)), [self.rpl.id])
        self.client.force_authenticate(self.student_no_class)
        self.assertEqual(self.ids(self.client.get(self.url)), [])

    def test_only_admin_can_create(self):
        payload = {"name": "X RPL 1", "grade": "X", "major": "rpl", "academic_year": "2026/2027"}
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.post(self.url, payload).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        res = self.client.post(self.url, payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["major"], "RPL")
        self.assertEqual(res.data["student_count"], 0)

    def test_create_validates_year_duplicate_and_homeroom(self):
        self.client.force_authenticate(self.admin)
        base = {"name": "X RPL 1", "grade": "X", "major": "RPL"}
        for year in ("2026", "2026/2028"):
            res = self.client.post(self.url, {**base, "academic_year": year})
            self.assertIn("academic_year", res.data)
        res = self.client.post(self.url, {**base, "name": "XI RPL 1", "academic_year": "2026/2027"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.post(
            self.url, {**base, "academic_year": "2026/2027", "homeroom_teacher": self.student.id}
        )
        self.assertIn("homeroom_teacher", res.data)

    def test_cannot_delete_classroom_with_assignments(self):
        self.client.force_authenticate(self.admin)
        res = self.client.delete(reverse("classroom-detail", args=[self.rpl.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        empty = Classroom.objects.create(
            name="XII RPL 1", grade="XII", major="RPL", academic_year="2026/2027"
        )
        res = self.client.delete(reverse("classroom-detail", args=[empty.id]))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_list_students_permissions(self):
        url = reverse("classroom-students", args=[self.rpl.id])
        self.client.force_authenticate(self.teacher)
        res = self.client.get(url)
        self.assertEqual([s["username"] for s in res.data], ["siswa1"])
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_adds_and_removes_students(self):
        add_url = reverse("classroom-students", args=[self.rpl.id])
        remove_url = reverse("classroom-remove-students", args=[self.rpl.id])
        self.client.force_authenticate(self.teacher)
        res = self.client.post(add_url, {"student_ids": [self.student_no_class.id]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        ids = [self.student_no_class.id, self.student_tkj.id]
        res = self.client.post(add_url, {"student_ids": ids}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rpl.students.count(), 3)

        res = self.client.post(remove_url, {"student_ids": [self.student.id]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertIsNone(self.student.classroom)

    def test_add_students_rejects_non_students(self):
        self.client.force_authenticate(self.admin)
        url = reverse("classroom-students", args=[self.rpl.id])
        res = self.client.post(url, {"student_ids": [self.teacher.id]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_is_ordered_by_year_grade_name(self):
        Classroom.objects.create(name="X RPL 1", grade="X", major="RPL", academic_year="2025/2026")
        Classroom.objects.create(name="X TKJ 1", grade="X", major="TKJ", academic_year="2026/2027")
        self.client.force_authenticate(self.admin)
        names = [c["name"] for c in self.client.get(self.url).data["results"]]
        self.assertEqual(names, ["X TKJ 1", "XI RPL 1", "XI TKJ 1", "X RPL 1"])

    def test_academic_years(self):
        Classroom.objects.create(name="X RPL 1", grade="X", major="RPL", academic_year="2025/2026")
        self.client.force_authenticate(self.admin)
        res = self.client.get(reverse("classroom-academic-years"))
        self.assertEqual(res.data, ["2026/2027", "2025/2026"])


class SubjectTests(AcademicsTestBase):
    url = reverse("subject-list")

    def test_everyone_can_read_only_admin_can_write(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(self.url).data["count"], 2)
        res = self.client.post(self.url, {"code": "X", "name": "X"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        res = self.client.post(self.url, {"code": " pbo ", "name": "Pemrograman Berorientasi Objek"})
        self.assertEqual(res.data["code"], "PBO")
        res = self.client.post(self.url, {"code": "pweb", "name": "Duplikat"})
        self.assertIn("code", res.data)

    def test_cannot_delete_subject_in_use(self):
        self.client.force_authenticate(self.admin)
        res = self.client.delete(reverse("subject-detail", args=[self.web.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class TeachingAssignmentTests(AcademicsTestBase):
    url = reverse("teaching-assignment-list")

    def test_scoped_by_role(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url).data["count"], 2)

        self.client.force_authenticate(self.teacher)
        res = self.client.get(self.url)
        self.assertEqual(res.data["count"], 1)
        item = res.data["results"][0]
        self.assertEqual(item["subject_name"], "Pemrograman Web")
        self.assertEqual(item["classroom_name"], "XI RPL 1")
        self.assertEqual(item["student_count"], 1)

        self.client.force_authenticate(self.student_tkj)
        self.assertEqual(self.client.get(self.url).data["results"][0]["subject_code"], "JARKOM")

        self.client.force_authenticate(self.student_no_class)
        self.assertEqual(self.client.get(self.url).data["count"], 0)

    def test_admin_creates_assignment_with_validation(self):
        self.client.force_authenticate(self.admin)
        payload = {"teacher": self.teacher.id, "subject": self.net.id, "classroom": self.rpl.id}
        self.assertEqual(self.client.post(self.url, payload).status_code, status.HTTP_201_CREATED)
        # Duplikat ditolak.
        self.assertEqual(self.client.post(self.url, payload).status_code, status.HTTP_400_BAD_REQUEST)
        # Bukan guru ditolak.
        res = self.client.post(self.url, {**payload, "teacher": self.student.id})
        self.assertIn("teacher", res.data)

    def test_teacher_cannot_create(self):
        self.client.force_authenticate(self.teacher)
        payload = {"teacher": self.teacher.id, "subject": self.net.id, "classroom": self.rpl.id}
        self.assertEqual(self.client.post(self.url, payload).status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_delete_teacher_with_assignments(self):
        self.client.force_authenticate(self.admin)
        res = self.client.delete(reverse("user-detail", args=[self.teacher.id]))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=self.teacher.pk).exists())


class UserClassroomTests(AcademicsTestBase):
    def test_classroom_only_kept_for_students(self):
        self.client.force_authenticate(self.admin)
        url = reverse("user-list")
        res = self.client.post(
            url,
            {
                "username": "guru3",
                "full_name": "Guru Tiga",
                "role": Role.TEACHER,
                "classroom": self.rpl.id,
                "password": PASSWORD,
            },
        )
        self.assertIsNone(res.data["classroom"])
        res = self.client.patch(
            reverse("user-detail", args=[self.student_no_class.id]), {"classroom": self.tkj.id}
        )
        self.assertEqual(res.data["classroom_name"], "XI TKJ 1")

    def test_filter_students_without_classroom(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(reverse("user-list"), {"role": Role.STUDENT, "classroom__isnull": "true"})
        self.assertEqual([u["username"] for u in res.data["results"]], ["siswa3"])
