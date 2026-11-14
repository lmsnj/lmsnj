import io
from datetime import date, datetime, time

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom
from apps.accounts.models import Role, User
from apps.common.testing import default_school

from .models import TeachingSession, Timetable, TimetableEntry
from .test_timetable import make_user
from .timetable_excel import build_template, parse_clock, parse_date


def upload(content, name="jadwal.xlsx"):
    return SimpleUploadedFile(name, content)


def edited_template(school, changes):
    """Template contoh dengan beberapa sel diganti: changes = {(lembar, sel): nilai}."""
    workbook = load_workbook(io.BytesIO(build_template(school, with_examples=True)))
    for (sheet, cell), value in changes.items():
        workbook[sheet][cell] = value
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


class ParseTests(APITestCase):
    def test_clock(self):
        self.assertEqual(parse_clock("07:30"), "07:30")
        self.assertEqual(parse_clock("7.05"), "07:05")
        self.assertEqual(parse_clock(time(8, 0)), "08:00")
        self.assertEqual(parse_clock(datetime(2026, 1, 1, 9, 15)), "09:15")
        self.assertIsNone(parse_clock("25:00"))
        self.assertIsNone(parse_clock("jam tujuh"))

    def test_date(self):
        self.assertEqual(parse_date("2026-07-13"), date(2026, 7, 13))
        self.assertEqual(parse_date("13/07/2026"), date(2026, 7, 13))
        self.assertEqual(parse_date(datetime(2026, 7, 13, 0, 0)), date(2026, 7, 13))
        self.assertIsNone(parse_date("besok"))


class TimetableExcelImportTests(APITestCase):
    template_url = reverse("timetable-import-template")
    import_url = reverse("timetable-import")

    def setUp(self):
        self.school = default_school()
        self.admin = make_user("admin1", Role.ADMIN)

    def post(self, content, dry_run, user=None):
        self.client.force_authenticate(user or self.admin)
        return self.client.post(
            self.import_url,
            {"file": upload(content), "dry_run": "true" if dry_run else "false"},
            format="multipart",
        )

    def test_template_for_admin_only(self):
        teacher = make_user("guru1", Role.TEACHER)
        self.client.force_authenticate(teacher)
        self.assertEqual(self.client.get(self.template_url).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.template_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sheets = load_workbook(io.BytesIO(response.content)).sheetnames
        self.assertEqual(
            sheets, ["Petunjuk", "Info", "Slot Waktu", "Jadwal", "Guru", "Mapel", "Distribusi JP"]
        )

    def test_examples_pass_and_dry_run_saves_nothing(self):
        response = self.post(build_template(self.school, with_examples=True), dry_run=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["timetable"]["entries"], 5)
        self.assertEqual(len(response.data["teachers"]["created"]), 2)
        self.assertIsNone(response.data["teachers"]["created"][0]["password"])
        self.assertFalse(Timetable.objects.exists())
        self.assertFalse(User.objects.filter(teacher_code="G01").exists())

    def test_import_saves_everything(self):
        response = self.post(build_template(self.school, with_examples=True), dry_run=False)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["teachers"]["created"][0]["password"])
        timetable = Timetable.objects.get(school=self.school, code="JDW-CONTOH")
        self.assertTrue(timetable.is_active)
        self.assertEqual(TimetableEntry.objects.filter(time_slot__timetable=timetable).count(), 5)
        self.assertEqual(set(Classroom.objects.values_list("name", "grade")), {("X A", "X"), ("X B", "X")})
        teacher = User.objects.get(teacher_code="G01")
        self.assertIn(self.school, teacher.schools.all())
        # Impor ulang file yang sama tidak membuat data dobel.
        again = self.post(build_template(self.school, with_examples=True), dry_run=False)
        self.assertEqual(again.status_code, status.HTTP_201_CREATED, again.data)
        self.assertEqual(again.data["teachers"]["created"], [])
        self.assertEqual(Classroom.objects.count(), 2)

    def test_errors_cancel_import(self):
        content = edited_template(
            self.school,
            {("Jadwal", "B2"): "9", ("Jadwal", "D3"): "FIS", ("Slot Waktu", "C2"): "jam tujuh"},
        )
        response = self.post(content, dry_run=False)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = " ".join(response.data["errors"])
        self.assertIn("jam ke-9 tidak ada di lembar Slot Waktu", errors)
        self.assertIn("Kode mapel FIS belum ada", errors)
        self.assertIn("Slot Waktu baris 2", errors)
        self.assertFalse(Timetable.objects.exists())

    def test_wrong_grade_is_reported(self):
        content = edited_template(self.school, {("Jadwal", "C2"): "VII A"})
        response = self.post(content, dry_run=True)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("tingkat VII", " ".join(response.data["errors"]))

    def test_rejects_non_excel(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            self.import_url, {"file": upload(b"a;b", "jadwal.csv"), "dry_run": "true"}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)

    def test_teacher_cannot_import(self):
        teacher = make_user("guru1", Role.TEACHER)
        response = self.post(build_template(self.school, with_examples=True), dry_run=True, user=teacher)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class SessionsFromTimetableTests(APITestCase):
    url = reverse("teaching-session-from-timetable")
    # Jadwal contoh berlaku sejak Senin 13 Juli 2026 dan hanya berisi hari Senin.
    WEEK = {"date_from": "2026-07-13", "date_to": "2026-07-19"}

    def setUp(self):
        school = default_school()
        admin = make_user("admin1", Role.ADMIN)
        self.client.force_authenticate(admin)
        response = self.client.post(
            reverse("timetable-import"),
            {"file": upload(build_template(school, with_examples=True)), "dry_run": "false"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.g01 = User.objects.get(teacher_code="G01")
        self.g02 = User.objects.get(teacher_code="G02")

    def post(self, user, **data):
        self.client.force_authenticate(user)
        return self.client.post(self.url, data, format="json")

    def test_consecutive_periods_become_one_session(self):
        response = self.post(self.g01, **self.WEEK)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["created"], 1)
        session = TeachingSession.objects.get()
        self.assertEqual(session.title, "Matematika Contoh (Jam 1-2)")
        self.assertEqual(session.duration_minutes, 90)
        self.assertEqual(session.starts_at, timezone.make_aware(datetime(2026, 7, 13, 7, 0)))
        self.assertEqual(session.created_by, self.g01)

    def test_break_and_combined_classes(self):
        # G02: X A jam 3 (setelah istirahat) dan X B jam 1-2 -> dua sesi terpisah.
        response = self.post(self.g02, **self.WEEK)
        self.assertEqual(response.data["created"], 2)
        titles = sorted(TeachingSession.objects.values_list("teaching_assignment__classroom__name", "title"))
        self.assertEqual(
            titles,
            [("X A", "Bahasa Indonesia Contoh (Jam 3)"), ("X B", "Bahasa Indonesia Contoh (Jam 1-2)")],
        )

    def test_repeat_skips_existing(self):
        self.post(self.g01, **self.WEEK)
        response = self.post(self.g01, date_from="2026-07-13", date_to="2026-07-27")
        self.assertEqual(response.data["created"], 2)  # dua Senin berikutnya
        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(TeachingSession.objects.count(), 3)

    def test_dry_run_and_before_effective_date(self):
        response = self.post(self.g01, dry_run=True, **self.WEEK)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["sessions"]), 1)
        self.assertFalse(TeachingSession.objects.exists())
        before = self.post(self.g01, date_from="2026-07-06", date_to="2026-07-12")
        self.assertEqual(before.data["created"], 0)

    def test_only_teacher_and_valid_range(self):
        student = make_user("siswa1", Role.STUDENT, classroom=Classroom.objects.get(name="X A"))
        self.assertEqual(self.post(student, **self.WEEK).status_code, status.HTTP_403_FORBIDDEN)
        too_long = self.post(self.g01, date_from="2026-07-01", date_to="2026-08-15")
        self.assertEqual(too_long.status_code, status.HTTP_400_BAD_REQUEST)
        reversed_range = self.post(self.g01, date_from="2026-07-19", date_to="2026-07-13")
        self.assertEqual(reversed_range.status_code, status.HTTP_400_BAD_REQUEST)
