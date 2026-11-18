"""Impor Rencana Pembelajaran (Bab, Materi, Tugas) dari Excel untuk satu kelas-mapel."""

import io
import shutil
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role
from apps.common.testing import default_school
from apps.tasks.models import Task

from .models import Chapter, Material
from .tests import TEMP_MEDIA, make_user, pdf_file


def upload(content, name="rencana.xlsx"):
    return SimpleUploadedFile(name, content)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class PlanExcelTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        school = default_school()
        self.siti = make_user("siti", Role.TEACHER)
        self.ahmad = make_user("ahmad", Role.TEACHER)
        self.outsider = make_user("rudi", Role.TEACHER)
        rpl1 = Classroom.objects.create(
            school=school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )
        rpl2 = Classroom.objects.create(
            school=school, name="X RPL 2", grade="X", major="RPL", academic_year="2026/2027"
        )
        subject = Subject.objects.create(school=school, code="INF", name="Informatika")
        self.siti_ta = TeachingAssignment.objects.create(teacher=self.siti, subject=subject, classroom=rpl1)
        # Ahmad satu tim dengan Siti di X RPL 1, dan mengajar sendiri di X RPL 2.
        self.ahmad_ta = TeachingAssignment.objects.create(teacher=self.ahmad, subject=subject, classroom=rpl1)
        self.ahmad_rpl2 = TeachingAssignment.objects.create(
            teacher=self.ahmad, subject=subject, classroom=rpl2
        )
        self.template_url = reverse("material-plan-template")
        self.import_url = reverse("material-plan-import")

    def template(self, user, assignment):
        self.client.force_authenticate(user)
        res = self.client.get(self.template_url, {"teaching_assignment": assignment.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return b"".join(res.streaming_content) if res.streaming else res.content

    def send(self, user, assignment, content, dry_run=True):
        self.client.force_authenticate(user)
        return self.client.post(
            self.import_url,
            {
                "teaching_assignment": assignment.id,
                "file": upload(content),
                "dry_run": "true" if dry_run else "false",
            },
            format="multipart",
        )

    def edit(self, content, sheet, rows):
        """Tulis ulang isi satu lembar (baris 2 dst.) lalu kembalikan bytes file."""
        workbook = load_workbook(io.BytesIO(content))
        target = workbook[sheet]
        target.delete_rows(2, target.max_row)
        for row in rows:
            target.append(row)
        buffer = io.BytesIO()
        workbook.save(buffer)
        return buffer.getvalue()

    # ------------------------------------------------------------------------------------------------

    def test_empty_class_template_examples_import(self):
        # Kelas-mapel kosong: template berisi contoh, dan contohnya lolos impor apa adanya.
        content = self.template(self.siti, self.siti_ta)
        check = self.send(self.siti, self.siti_ta, content)
        self.assertEqual(check.status_code, status.HTTP_200_OK, check.data)
        self.assertEqual(check.data["summary"]["invalid"], 0, check.data["rows"])
        self.assertFalse(Chapter.objects.exists())  # Periksa tidak menyimpan

        res = self.send(self.siti, self.siti_ta, content, dry_run=False)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["created"], {"created": 5, "updated": 0})
        chapters = list(Chapter.objects.order_by("order"))
        self.assertEqual([c.title for c in chapters], ["Pengenalan Algoritma", "Flowchart"])
        video = Material.objects.get(title="Apa itu Algoritma?")
        self.assertEqual(video.chapter, chapters[0])
        self.assertEqual(len(video.objectives), 2)
        self.assertEqual(len(video.concepts), 2)
        self.assertFalse(video.is_published)
        self.assertEqual(video.created_by, self.siti)
        task = Task.objects.get()
        self.assertEqual(task.max_score, 100)
        self.assertEqual(timezone.localtime(task.due_at).strftime("%H:%M"), "23:59")

    def test_round_trip_updates_and_reorders(self):
        chapter = Chapter.objects.create(teaching_assignment=self.ahmad_ta, title="Bab Lama", order=1)
        old = Material.objects.create(
            teaching_assignment=self.ahmad_ta, title="Materi Rekan", material_type="link",
            url="https://lama.id", order=1, chapter=chapter, created_by=self.ahmad,
        )  # fmt: skip
        other = Material.objects.create(
            teaching_assignment=self.siti_ta, title="Tidak di File", material_type="link",
            url="https://lain.id", order=2, created_by=self.siti,
        )  # fmt: skip
        task = Task.objects.create(
            teaching_assignment=self.siti_ta, title="Tugas 1", due_at=timezone.now() - timedelta(days=1),
            max_score=50, created_by=self.siti,
        )  # fmt: skip
        # Template berisi data seluruh tim, termasuk buatan rekan.
        content = self.template(self.siti, self.siti_ta)
        sheet = load_workbook(io.BytesIO(content))["Materi"]
        self.assertEqual(sheet["B2"].value, "Materi Rekan")
        self.assertEqual(sheet["A2"].value, "Bab Lama")

        content = self.edit(content, "Materi", [
            ["", "Materi Baru", "", "video", "https://youtu.be/abc", "", "", "tidak", "", "ya"],
            ["bab lama", "materi rekan", "Deskripsi baru", "link", "https://baru.id", "", "", "", "", ""],
        ])  # fmt: skip
        res = self.send(self.siti, self.siti_ta, content, dry_run=False)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        # Bab Lama & Materi Rekan & Tugas 1 diperbarui (tenggat lama boleh), Materi Baru dibuat.
        self.assertEqual(res.data["created"], {"created": 1, "updated": 3})

        old.refresh_from_db()
        self.assertEqual(old.title, "materi rekan")
        self.assertEqual(old.url, "https://baru.id")
        self.assertEqual(old.teaching_assignment, self.ahmad_ta)  # tetap di pengampu pembuatnya
        new = Material.objects.get(title="Materi Baru")
        self.assertTrue(new.is_published)
        self.assertFalse(new.require_reflection)
        self.assertIsNone(new.chapter)
        other.refresh_from_db()
        # Urutan = urutan baris; materi yang tidak ada di file ditaruh sesudahnya.
        self.assertEqual([new.order, old.order, other.order], [1, 2, 3])
        task.refresh_from_db()
        self.assertEqual(task.max_score, 50)
        self.assertEqual(Task.objects.count(), 1)

    def test_import_to_other_class_of_same_subject(self):
        Material.objects.create(
            teaching_assignment=self.siti_ta, title="HTML Dasar", material_type="link",
            url="https://contoh.id", order=1, created_by=self.siti,
        )  # fmt: skip
        content = self.template(self.siti, self.siti_ta)
        res = self.send(self.ahmad, self.ahmad_rpl2, content, dry_run=False)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        copy = Material.objects.get(teaching_assignment=self.ahmad_rpl2)
        self.assertEqual(copy.title, "HTML Dasar")
        self.assertEqual(Material.objects.count(), 2)

    def test_row_errors_save_nothing(self):
        Material.objects.create(
            teaching_assignment=self.siti_ta, title="Modul PDF", material_type="pdf",
            file=pdf_file(), original_filename="modul.pdf", order=1, created_by=self.siti,
        )  # fmt: skip
        content = self.template(self.siti, self.siti_ta)
        content = self.edit(content, "Materi", [
            ["", "Modul PDF", "", "pdf", "", "", "", "", "", ""],  # PDF lama: boleh, file tetap
            ["Bab Hilang", "A", "", "link", "https://a.id", "", "", "", "", ""],
            ["", "B", "", "pdf", "", "", "", "", "", ""],
            ["", "C", "", "audio", "", "", "", "", "", ""],
            ["", "D", "", "link", "", "", "", "mungkin", "", ""],
            ["", "d", "", "link", "https://d.id", "", "", "", "", ""],
        ])  # fmt: skip
        content = self.edit(
            content,
            "Tugas",
            [
                ["Tugas Lalu", "", "01/01/2020 10:00", "", "", ""],
                ["Tugas Aneh", "", "besok", "", "", ""],
                ["Tugas Besar", "", "31/12/2099", "5000", "", ""],
            ],
        )
        res = self.send(self.siti, self.siti_ta, content)
        errors = {(r["sheet"], r["title"]): " ".join(r["errors"]) for r in res.data["rows"]}
        self.assertEqual(errors[("Materi", "Modul PDF")], "")
        self.assertIn("Bab 'Bab Hilang' tidak ada", errors[("Materi", "A")])
        self.assertIn("Materi PDF baru", errors[("Materi", "B")])
        self.assertIn("Tipe", errors[("Materi", "C")])
        self.assertIn("Wajib Refleksi", errors[("Materi", "D")])
        self.assertIn("kembar", errors[("Materi", "d")])
        self.assertIn("masa yang akan datang", errors[("Tugas", "Tugas Lalu")])
        self.assertIn("format tanggal", errors[("Tugas", "Tugas Aneh")])
        self.assertIn("Nilai Maks", errors[("Tugas", "Tugas Besar")])

        res = self.send(self.siti, self.siti_ta, content, dry_run=False)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Material.objects.count(), 1)
        self.assertFalse(Task.objects.exists())

    def test_only_team_teacher(self):
        content = self.template(self.siti, self.siti_ta)
        # Guru lain (bukan tim) tidak bisa mengunduh/mengimpor ke kelas-mapel ini.
        self.client.force_authenticate(self.outsider)
        res = self.client.get(self.template_url, {"teaching_assignment": self.siti_ta.id})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            self.send(self.outsider, self.siti_ta, content).status_code, status.HTTP_404_NOT_FOUND
        )
        student = make_user("ani", Role.STUDENT, classroom=self.siti_ta.classroom)
        self.assertEqual(self.send(student, self.siti_ta, content).status_code, status.HTTP_403_FORBIDDEN)

    def test_bad_file(self):
        self.client.force_authenticate(self.siti)
        res = self.client.post(
            self.import_url,
            {"teaching_assignment": self.siti_ta.id, "file": upload(b"bukan excel", "data.csv")},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", res.data)
