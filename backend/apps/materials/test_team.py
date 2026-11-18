"""Tim pengampu (dua guru satu mapel di satu kelas), salin materi ke kelas lain, dan gabung materi kembar."""

import shutil
from datetime import timedelta

from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role
from apps.common.testing import default_school
from apps.tasks.models import Submission, Task

from .models import Chapter, Material, MaterialItem, MaterialProgress
from .tests import TEMP_MEDIA, make_user, pdf_file


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class TeamTeachingTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        school = default_school()
        self.siti = make_user("siti", Role.TEACHER)
        self.ahmad = make_user("ahmad", Role.TEACHER)
        self.outsider = make_user("rudi", Role.TEACHER)
        self.rpl1 = Classroom.objects.create(
            school=school, name="XI RPL 1", grade="XI", major="RPL", academic_year="2026/2027"
        )
        self.rpl2 = Classroom.objects.create(
            school=school, name="XI RPL 2", grade="XI", major="RPL", academic_year="2026/2027"
        )
        self.web = Subject.objects.create(school=school, code="PWEB", name="Pemrograman Web")
        bindo = Subject.objects.create(school=school, code="BINDO", name="Bahasa Indonesia")
        # Siti & Ahmad = satu tim (PWEB di XI RPL 1). Ahmad juga mengajar PWEB di XI RPL 2 sendirian.
        self.siti_ta = TeachingAssignment.objects.create(
            teacher=self.siti, subject=self.web, classroom=self.rpl1
        )
        self.ahmad_ta = TeachingAssignment.objects.create(
            teacher=self.ahmad, subject=self.web, classroom=self.rpl1
        )
        self.ahmad_rpl2 = TeachingAssignment.objects.create(
            teacher=self.ahmad, subject=self.web, classroom=self.rpl2
        )
        self.outsider_ta = TeachingAssignment.objects.create(
            teacher=self.outsider, subject=bindo, classroom=self.rpl1
        )
        self.ani = make_user("ani", Role.STUDENT, classroom=self.rpl1)
        self.dewi = make_user("dewi", Role.STUDENT, classroom=self.rpl2)

        self.m1 = self.material(self.siti_ta, "Pengenalan HTML", 1)
        self.m2 = self.material(self.ahmad_ta, "CSS Dasar", 2)

    def material(self, assignment, title, order, **extra):
        return Material.objects.create(
            teaching_assignment=assignment, title=title, material_type="link", url="https://contoh.id",
            is_published=True, order=order, require_reflection=False, created_by=assignment.teacher, **extra,
        )  # fmt: skip

    def listed(self, user, assignment):
        self.client.force_authenticate(user)
        res = self.client.get(reverse("material-list"), {"teaching_assignment": assignment.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return {m["id"]: m for m in res.data["results"]}

    # --- Tim pengampu ---------------------------------------------------------------------------------

    def test_team_shares_materials(self):
        # Kedua guru melihat materi yang sama dari pengampu masing-masing.
        self.assertEqual(set(self.listed(self.siti, self.siti_ta)), {self.m1.id, self.m2.id})
        self.assertEqual(set(self.listed(self.ahmad, self.ahmad_ta)), {self.m1.id, self.m2.id})
        # Guru mapel lain di kelas yang sama tidak termasuk tim.
        self.assertEqual(self.listed(self.outsider, self.outsider_ta), {})

    def test_team_member_can_edit_and_delete_partner_material(self):
        self.client.force_authenticate(self.ahmad)
        url = reverse("material-detail", args=[self.m1.id])
        res = self.client.patch(url, {"title": "Pengenalan HTML (revisi)"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_204_NO_CONTENT)

        self.client.force_authenticate(self.outsider)
        url = reverse("material-detail", args=[self.m2.id])
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_404_NOT_FOUND)

    def test_student_has_one_learning_path(self):
        # Materi Ahmad (urutan 2) terkunci sampai materi Siti (urutan 1) tercapai.
        listed = self.listed(self.ani, self.siti_ta)
        self.assertEqual(set(listed), {self.m1.id, self.m2.id})
        self.assertEqual(listed[self.m1.id]["progress"]["order_number"], 1)
        self.assertTrue(listed[self.m2.id]["progress"]["locked"])
        self.assertEqual(listed[self.m2.id]["progress"]["locked_by"], "Pengenalan HTML")

        self.client.post(reverse("material-open", args=[self.m1.id]))
        listed = self.listed(self.ani, self.ahmad_ta)
        self.assertFalse(listed[self.m2.id]["progress"]["locked"])
        self.assertEqual(listed[self.m2.id]["progress"]["order_number"], 2)

    def test_new_material_continues_team_order_and_reorder(self):
        self.client.force_authenticate(self.ahmad)
        data = {"teaching_assignment": self.ahmad_ta.id, "title": "JavaScript", "material_type": "link",
                "url": "https://contoh.id/js", "require_reflection": False}  # fmt: skip
        res = self.client.post(reverse("material-list"), data, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["order"], 3)

        order = [res.data["id"], self.m2.id, self.m1.id]
        res = self.client.post(
            reverse("material-reorder"),
            {"teaching_assignment": self.ahmad_ta.id, "materials": order},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.m1.refresh_from_db()
        self.assertEqual(self.m1.order, 3)

    def test_requirement_and_chapter_from_team_member(self):
        due = timezone.now() + timedelta(days=3)
        task = Task.objects.create(teaching_assignment=self.siti_ta, title="Tugas Siti", due_at=due)
        other = Task.objects.create(teaching_assignment=self.ahmad_rpl2, title="Tugas RPL 2", due_at=due)
        chapter = Chapter.objects.create(teaching_assignment=self.siti_ta, title="Bab 1")
        self.client.force_authenticate(self.ahmad)
        url = reverse("material-detail", args=[self.m2.id])
        res = self.client.patch(url, {"required_task": task.id, "chapter": chapter.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        res = self.client.patch(url, {"required_task": other.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_team_shares_tasks_and_gradebook(self):
        due = timezone.now() + timedelta(days=3)
        task = Task.objects.create(
            teaching_assignment=self.siti_ta, title="Tugas Siti", due_at=due, is_published=True
        )
        submission = Submission.objects.create(
            task=task, student=self.ani, text_answer="jawaban", submitted_at=timezone.now()
        )
        self.client.force_authenticate(self.ahmad)
        res = self.client.get(reverse("task-list"), {"teaching_assignment": self.ahmad_ta.id})
        self.assertEqual([t["id"] for t in res.data["results"]], [task.id])
        res = self.client.patch(
            reverse("submission-grade", args=[submission.id]), {"score": 90}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        res = self.client.get(reverse("gradebook", args=[self.ahmad_ta.id]))
        self.assertEqual([t["id"] for t in res.data["tasks"]], [task.id])

    def test_team_listing_and_classroom_report(self):
        # Data pengampu berisi nama semua guru tim.
        self.client.force_authenticate(self.ani)
        res = self.client.get(reverse("teaching-assignment-list"), {"subject": self.web.id})
        self.assertEqual({tuple(a["team_teachers"]) for a in res.data["results"]}, {("Siti", "Ahmad")})
        # Laporan kelas: satu kolom untuk mapel yang diampu tim.
        self.rpl1.homeroom_teacher = self.siti
        self.rpl1.save()
        self.client.force_authenticate(self.siti)
        res = self.client.get(reverse("classroom-report", args=[self.rpl1.id]))
        web = [s for s in res.data["subjects"] if s["subject_code"] == "PWEB"]
        self.assertEqual(len(web), 1)
        self.assertEqual(web[0]["teacher_name"], "Siti, Ahmad")

    # --- Salin ke kelas lain ----------------------------------------------------------------------

    def test_copy_targets(self):
        self.client.force_authenticate(self.siti)
        res = self.client.get(reverse("material-copy-targets"), {"teaching_assignment": self.siti_ta.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res.data,
            [
                {
                    "teaching_assignment": self.ahmad_rpl2.id,
                    "classroom_name": "XI RPL 2",
                    "academic_year": "2026/2027",
                    "teachers": ["Ahmad"],
                }
            ],
        )

    def test_copy_materials_as_draft(self):
        chapter = Chapter.objects.create(teaching_assignment=self.siti_ta, title="Bab 1", description="HTML")
        pdf = self.material(self.siti_ta, "Modul PDF", 3, chapter=chapter, objectives=["Paham tag"])
        pdf.material_type = "pdf"
        pdf.url = ""
        pdf.file = pdf_file()
        pdf.original_filename = "modul.pdf"
        pdf.save()
        MaterialItem.objects.create(material=pdf, title="Video", material_type="video", url="https://yt.be/x")

        self.client.force_authenticate(self.siti)
        res = self.client.post(
            reverse("material-copy"),
            {"teaching_assignment": self.siti_ta.id, "materials": [pdf.id, self.m2.id], "target": self.ahmad_rpl2.id},
            format="json",
        )  # fmt: skip
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        copies = list(Material.objects.filter(teaching_assignment=self.ahmad_rpl2).order_by("order"))
        self.assertEqual([c.title for c in copies], ["CSS Dasar", "Modul PDF"])
        self.assertTrue(all(not c.is_published for c in copies))
        copied_pdf = copies[1]
        self.assertNotEqual(copied_pdf.file.name, pdf.file.name)
        self.assertEqual(copied_pdf.file.read(), b"%PDF-1.4 isi materi")
        self.assertEqual(copied_pdf.objectives, ["Paham tag"])
        self.assertEqual(copied_pdf.items.get().title, "Video")
        self.assertEqual(copied_pdf.chapter.title, "Bab 1")
        self.assertEqual(copied_pdf.chapter.teaching_assignment, self.ahmad_rpl2)
        # Draf: siswa kelas tujuan belum melihatnya.
        self.assertEqual(self.listed(self.dewi, self.ahmad_rpl2), {})

    def test_copy_rejects_wrong_target_or_foreign_material(self):
        self.client.force_authenticate(self.siti)
        url = reverse("material-copy")
        res = self.client.post(
            url, {"teaching_assignment": self.siti_ta.id, "materials": [self.m1.id], "target": self.outsider_ta.id},
            format="json",
        )  # fmt: skip
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        # Rudi bukan anggota tim PWEB XI RPL 1.
        self.client.force_authenticate(self.outsider)
        res = self.client.post(
            url, {"teaching_assignment": self.siti_ta.id, "materials": [self.m1.id], "target": self.ahmad_rpl2.id},
            format="json",
        )  # fmt: skip
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # --- Gabung materi kembar ---------------------------------------------------------------------

    def test_merge_marks_finished_students(self):
        duplicate = self.material(self.ahmad_ta, "Pengenalan HTML (Ahmad)", 3)
        MaterialProgress.objects.create(
            material=duplicate, student=self.ani, opened_at=timezone.now(), reflection="Saya belajar tag HTML dasar."
        )  # fmt: skip
        self.client.force_authenticate(self.ahmad)
        res = self.client.post(reverse("material-merge", args=[self.m1.id]), {"duplicate": duplicate.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["completed"], 1)
        self.assertFalse(Material.objects.filter(pk=duplicate.id).exists())
        progress = MaterialProgress.objects.get(material=self.m1, student=self.ani)
        self.assertTrue(progress.unlocked)
        self.assertEqual(progress.reflection, "Saya belajar tag HTML dasar.")
        self.assertIn("Pengenalan HTML (Ahmad)", progress.note)

    def test_merge_rejects_other_class_subject(self):
        other = self.material(self.ahmad_rpl2, "HTML RPL 2", 1)
        self.client.force_authenticate(self.ahmad)
        res = self.client.post(reverse("material-merge", args=[self.m1.id]), {"duplicate": other.id})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.post(reverse("material-merge", args=[self.m1.id]), {"duplicate": self.m1.id})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Material.objects.filter(pk=other.id).exists())
