import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from openpyxl import Workbook, load_workbook
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom
from apps.accounts.models import Role, User
from apps.common.testing import default_school
from apps.schools.models import Level, School

from . import services
from .models import PaymentStatus

YEAR = "2026/2027"
HEADER = ["NIS*", "Nama Siswa", "Tahun Ajaran", "Lunas Sampai Triwulan*", "Keterangan"]


def make_user(username, role, school=None, **extra):
    user = User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )
    user.schools.add(school or default_school())
    return user


def excel(rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Pembayaran"
    sheet.append(HEADER)
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return SimpleUploadedFile("bayar.xlsx", buffer.getvalue())


class PaymentTests(APITestCase):
    def setUp(self):
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.rpl = Classroom.objects.create(
            school=default_school(), name="XI RPL 1", grade="XI", major="RPL", academic_year=YEAR
        )
        self.ani = make_user("ani", Role.STUDENT, classroom=self.rpl, nis="001")
        self.budi = make_user("budi", Role.STUDENT, classroom=self.rpl, nis="002")
        other = School.objects.create(code="mtsnj", name="MTs", level=Level.MTS)
        self.outsider = make_user("luar", Role.STUDENT, school=other, nis="003")
        self.url = reverse("payments")

    def test_list_defaults_to_zero_and_bulk_save(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(self.url, {"classroom": self.rpl.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["academic_year"], YEAR)
        self.assertEqual([r["paid_quarter"] for r in res.data["rows"]], [0, 0])

        records = [
            {"student": self.ani.id, "paid_quarter": 2},
            {"student": self.budi.id, "paid_quarter": 4, "note": "Lunas"},
        ]
        res = self.client.put(self.url, {"academic_year": YEAR, "records": records}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        res = self.client.put(
            self.url,
            {"academic_year": YEAR, "records": [{"student": self.ani.id, "paid_quarter": 3}]},
            format="json",
        )
        self.assertEqual(services.paid_quarters([self.ani.id, self.budi.id, self.outsider.id], YEAR),
                         {self.ani.id: 3, self.budi.id: 4, self.outsider.id: 0})  # fmt: skip
        self.assertEqual(PaymentStatus.objects.count(), 2)

    def test_validation_and_access(self):
        self.client.force_authenticate(self.admin)
        bad = [{"student": self.ani.id, "paid_quarter": 5}]
        self.assertEqual(
            self.client.put(self.url, {"academic_year": YEAR, "records": bad}, format="json").status_code, 400
        )
        outsider = [{"student": self.outsider.id, "paid_quarter": 1}]
        res = self.client.put(self.url, {"academic_year": YEAR, "records": outsider}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_400_BAD_REQUEST)

        for user in (self.teacher, self.ani):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url, {"classroom": self.rpl.id}).status_code, 403)

    def test_import_excel(self):
        self.client.force_authenticate(self.admin)
        template = self.client.get(reverse("payments-template"))
        self.assertEqual(
            load_workbook(io.BytesIO(template.content)).sheetnames[:2], ["Petunjuk", "Pembayaran"]
        )

        url = reverse("payments-import")
        rows = [["001", "Ani", "", "2", ""], ["003", "Luar", "", "1", ""], ["002", "", "2026/2027", "9", ""]]
        res = self.client.post(url, {"file": excel(rows), "dry_run": "true"}, format="multipart")
        self.assertEqual(res.data["summary"], {"total": 3, "valid": 1, "invalid": 2})
        res = self.client.post(url, {"file": excel(rows), "dry_run": "false"}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PaymentStatus.objects.exists())

        good = [["001", "Ani", "", "2", ""], ["002", "Budi", YEAR, "4", "Lunas"]]
        res = self.client.post(url, {"file": excel(good), "dry_run": "false"}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(
            dict(PaymentStatus.objects.values_list("student__nis", "paid_quarter")), {"001": 2, "002": 4}
        )
