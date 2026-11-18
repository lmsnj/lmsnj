"""API Studio (guru) dan pemutar (siswa): hak akses, terbit, progres, kunci stasiun, edit setelah terbit."""

import shutil
import tempfile
from datetime import timedelta

from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.assessments.models import Assessment, Attempt
from apps.common.testing import default_school
from apps.materials.models import Material, MaterialProgress
from apps.schools.models import Level, School

from .. import services
from ..models import (
    InteractiveMedia,
    InteractiveMediaAttempt,
    InteractiveMediaBadge,
    InteractiveMediaProgress,
    InteractiveMediaReflection,
)
from .samples import correct_response, media, wrong_response

# File unggahan test disimpan di folder sementara, bukan di media/.
TEMP_MEDIA = tempfile.mkdtemp()


def tearDownModule():
    shutil.rmtree(TEMP_MEDIA, ignore_errors=True)


def member(username, role, school, **extra):
    user = User.objects.create(username=username, role=role, full_name=username.title(), **extra)
    if school is not None:
        user.schools.add(school)
    return user


class MediaTestCase(APITestCase):
    def setUp(self):
        self.school = default_school()
        self.teacher = member("guru1", Role.TEACHER, self.school)
        self.other_teacher = member("guru2", Role.TEACHER, self.school)
        self.admin = member("admin1", Role.ADMIN, self.school)
        self.room = Classroom.objects.create(
            school=self.school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )
        self.student = member("siswa1", Role.STUDENT, self.school, classroom=self.room)
        self.subject = Subject.objects.create(school=self.school, code="DDP", name="Dasar Pemrograman")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher, subject=self.subject, classroom=self.room
        )
        self.client.force_authenticate(self.teacher)
        response = self.client.post(
            reverse("learning-media-list"),
            {"title": "Petualangan Flowgorithm", "draft": media()},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.media = InteractiveMedia.objects.get(pk=response.data["id"])

    def publish(self, media_obj=None, user=None):
        self.client.force_authenticate(user or self.teacher)
        return self.client.post(
            reverse("learning-media-publish", args=[(media_obj or self.media).id]), {}, format="json"
        )

    def make_material(self, settings=None):
        self.publish()
        response = self.client.post(
            reverse("material-list"),
            {
                "teaching_assignment": self.assignment.id,
                "title": "Media Flowgorithm",
                "material_type": "media",
                "interactive_media": self.media.id,
                "media_settings": settings or {},
                "is_published": True,
                "require_reflection": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return Material.objects.get(pk=response.data["id"])


class StudioTests(MediaTestCase):
    def test_publish_creates_version_and_strips_keys(self):
        response = self.publish()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["number"], 1)
        version = self.media.versions.get()
        self.assertEqual(version.required_stations, ["s1", "s2"])
        self.assertIn("pg", version.keys)
        self.assertEqual(self.publish().data["number"], 2)

    def test_publish_reports_errors_per_location(self):
        draft = media()
        draft["parts"][0]["stations"][0]["steps"][2]["choices"] = [{"text": "a"}]
        self.client.patch(
            reverse("learning-media-detail", args=[self.media.id]), {"draft": draft}, format="json"
        )
        response = self.publish()
        self.assertEqual(response.status_code, 400)
        self.assertTrue(any("Stasiun 1 › Langkah 3" in e for e in response.data["draft"]))

    def test_only_owner_or_admin_can_edit(self):
        self.publish()
        url = reverse("learning-media-detail", args=[self.media.id])
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(url).status_code, 200)  # media terbit boleh dilihat rekan
        self.assertEqual(self.client.patch(url, {"title": "x"}, format="json").status_code, 403)
        self.assertEqual(self.publish(user=self.other_teacher).status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(url, {"title": "Baru"}, format="json").status_code, 200)

    def test_unpublished_media_hidden_from_other_teachers_and_students(self):
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(reverse("learning-media-list")).data["count"], 0)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(reverse("learning-media-list")).status_code, 403)

    def test_other_school_cannot_see_media(self):
        other = School.objects.create(code="mtsnj", name="MTs Nurul Jadid", level=Level.MTS)
        outsider = member("guru3", Role.TEACHER, other)
        self.publish()
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(reverse("learning-media-list")).data["count"], 0)
        self.assertEqual(
            self.client.get(reverse("learning-media-detail", args=[self.media.id])).status_code, 404
        )

    def test_preview_does_not_save_progress(self):
        response = self.client.post(
            reverse("learning-media-preview", args=[self.media.id]), {}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["preview"])
        step = response.data["content"]["parts"][0]["stations"][0]["steps"][2]
        answer = self.client.post(
            reverse("learning-media-preview-answer", args=[self.media.id]),
            {"station": "s1", "step": "pg", "response": correct_response(step)},
            format="json",
        )
        self.assertTrue(answer.data["correct"])
        self.assertFalse(InteractiveMediaAttempt.objects.exists())

    def test_restore_version_and_export(self):
        self.publish()
        draft = media()
        draft["parts"][0]["title"] = "Diubah"
        self.client.patch(
            reverse("learning-media-detail", args=[self.media.id]), {"draft": draft}, format="json"
        )
        response = self.client.post(
            reverse("learning-media-restore", args=[self.media.id]), {"number": 1}, format="json"
        )
        self.assertEqual(response.data["draft"]["parts"][0]["title"], "Dasar")
        export = self.client.get(reverse("learning-media-export", args=[self.media.id]))
        self.assertEqual(export.status_code, 200)
        self.assertIn(b"lms-sigma-media", export.content)

    def test_used_media_cannot_be_deleted(self):
        self.make_material()
        response = self.client.delete(reverse("learning-media-detail", args=[self.media.id]))
        self.assertEqual(response.status_code, 400)

    def test_library_share_and_copy(self):
        foundation = member("yayasan", Role.FOUNDATION, None)
        self.client.force_authenticate(foundation)
        created = self.client.post(
            reverse("learning-media-list"), {"title": "Pustaka", "draft": media()}, format="json"
        )
        library = InteractiveMedia.objects.get(pk=created.data["id"])
        self.assertIsNone(library.school)
        self.publish(library, foundation)
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(reverse("learning-media-list"), {"library": 1}).data["count"], 0)
        self.client.force_authenticate(foundation)
        url = reverse("learning-media-shares", args=[library.id])
        self.assertEqual(
            self.client.put(url, {"schools": [self.school.id]}, format="json").data["schools"],
            [self.school.id],
        )
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(reverse("learning-media-list"), {"library": 1}).data["count"], 1)
        copy = self.client.post(reverse("learning-media-copy", args=[library.id]))
        self.assertEqual(copy.status_code, 201, copy.data)
        copied = InteractiveMedia.objects.get(pk=copy.data["id"])
        self.assertEqual((copied.school, copied.created_by), (self.school, self.other_teacher))
        self.assertEqual(self.client.patch(reverse("learning-media-detail", args=[library.id]), {"title": "x"}, format="json").status_code, 404)  # fmt: skip


class MaterialMediaTests(MediaTestCase):
    def test_material_requires_published_media_of_same_school(self):
        url = reverse("material-list")
        base = {"teaching_assignment": self.assignment.id, "title": "M", "material_type": "media"}
        self.assertEqual(self.client.post(url, base, format="json").status_code, 400)
        response = self.client.post(url, {**base, "interactive_media": self.media.id}, format="json")
        self.assertEqual(response.status_code, 400)  # belum terbit
        self.assertIn("interactive_media", response.data)

    def test_settings_validate_assessments_from_same_class(self):
        other_room = Classroom.objects.create(
            school=self.school, name="X RPL 2", grade="X", major="RPL", academic_year="2026/2027"
        )
        other = TeachingAssignment.objects.create(
            teacher=self.teacher, subject=self.subject, classroom=other_room
        )
        test = Assessment.objects.create(teaching_assignment=other, title="Tes", due_at=timezone.now())
        self.publish()
        response = self.client.post(
            reverse("material-list"),
            {"teaching_assignment": self.assignment.id, "title": "M", "material_type": "media",
             "interactive_media": self.media.id, "media_settings": {"pretest": test.id}},
            format="json",
        )  # fmt: skip
        self.assertEqual(response.status_code, 400)


class PlayTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        self.material = self.make_material()
        self.client.force_authenticate(self.student)
        self.play_url = reverse("media-play", args=[self.material.id])

    def play(self):
        response = self.client.get(self.play_url)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def steps_of(self, data, station="s1"):
        for part in data["content"]["parts"]:
            for item in part["stations"]:
                if item["id"] == station:
                    return item["steps"]

    def answer(self, station, step, response, **extra):
        return self.client.post(
            reverse("media-answer", args=[self.material.id]),
            {"station": station, "step": step, "response": response, **extra},
            format="json",
        )

    def finish(self, station):
        return self.client.post(
            reverse("media-station", args=[self.material.id]),
            {"station": station, "action": "finish"},
            format="json",
        )

    def solve(self, station, data=None):
        data = data or self.play()
        for step in self.steps_of(data, station):
            if step["graded"]:
                self.assertTrue(self.answer(station, step["id"], correct_response(step)).data["correct"])
        return self.finish(station)

    def test_student_view_has_no_keys_and_second_station_locked(self):
        data = self.play()
        self.assertNotIn("keys", data)
        self.assertFalse(data["read_only"])
        self.assertFalse(data["stations"]["s1"]["locked"])
        self.assertTrue(data["stations"]["s2"]["locked"])
        self.assertIn("Apa Itu Algoritma?", data["stations"]["s2"]["locked_by"])
        self.assertEqual(data["resume"], {"station_id": "s1", "step_id": ""})

    def test_locked_station_cannot_be_answered(self):
        step = self.steps_of(self.play(), "s2")[0]
        self.assertEqual(self.answer("s2", "s2-pg", correct_response(step)).status_code, 403)

    def test_full_station_flow_stars_badges(self):
        data = self.play()
        pg = self.steps_of(data)[2]
        wrong = self.answer("s1", "pg", wrong_response(pg), hint_level=1)
        self.assertFalse(wrong.data["correct"])
        self.assertEqual(wrong.data["feedback"], ["Variabel adalah tempat menyimpan nilai."])
        self.assertEqual(self.finish("s1").status_code, 400)  # latihan belum tuntas
        result = self.solve("s1", data)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["stars"], 2)  # 1 salah + 1 petunjuk
        self.assertEqual(result.data["badges"][0]["title"], "Juru Resep")
        data = self.play()
        self.assertTrue(data["stations"]["s1"]["completed"])
        self.assertFalse(data["stations"]["s2"]["locked"])
        self.assertEqual(data["totals"]["stars"], 2)
        attempts = InteractiveMediaAttempt.objects.filter(step_id="pg")
        self.assertEqual([a.correct for a in attempts], [False, True])
        self.assertEqual(attempts[0].answer_text, "variabel")

    def test_replay_never_lowers_stars(self):
        self.solve("s1")
        self.client.post(
            reverse("media-station", args=[self.material.id]),
            {"station": "s1", "action": "restart"},
            format="json",
        )
        data = self.play()
        for step in self.steps_of(data):
            if step["graded"]:
                self.client.post(
                    reverse("media-reveal", args=[self.material.id]),
                    {"station": "s1", "step": step["id"]},
                    format="json",
                )
        self.assertEqual(self.finish("s1").data["stars"], 1)
        self.assertEqual(InteractiveMediaProgress.objects.get(station_id="s1").stars, 3)

    def test_client_uid_is_idempotent(self):
        step = self.steps_of(self.play())[2]
        for _ in range(2):
            self.answer("s1", "pg", wrong_response(step), client_uid="hp-123")
        self.assertEqual(InteractiveMediaAttempt.objects.count(), 1)
        self.assertEqual(InteractiveMediaProgress.objects.get().run["pg"]["mistakes"], 1)

    def test_completion_counts_for_learning_path(self):
        self.solve("s1")
        self.solve("s2")
        material = self.client.get(reverse("material-detail", args=[self.material.id])).data
        check = next(c for c in material["progress"]["checks"] if c["key"] == "media")
        self.assertTrue(check["done"])
        self.assertEqual(InteractiveMediaBadge.objects.filter(code="media-complete").count(), 1)

    def test_edit_after_publish_keeps_progress(self):
        self.solve("s1")
        self.client.force_authenticate(self.teacher)
        draft = media()
        station = draft["parts"][0]["stations"][0]
        station["steps"] = [s for s in station["steps"] if s["id"] != "urut"]  # langkah dihapus
        station["steps"].append({"id": "baru", "kind": "true_false", "text": "Langkah baru", "answer": True})
        draft["parts"][0]["stations"].insert(1, {"id": "s1b", "title": "Sisipan", "optional": True,
                                                  "steps": [{"id": "t", "kind": "text", "body": "x"}]})  # fmt: skip
        self.client.patch(
            reverse("learning-media-detail", args=[self.media.id]), {"draft": draft}, format="json"
        )
        self.assertEqual(self.publish().data["number"], 2)
        self.client.force_authenticate(self.student)
        data = self.play()
        self.assertEqual(data["version"], 2)
        self.assertTrue(data["stations"]["s1"]["completed"])
        self.assertEqual(data["stations"]["s1"]["stars"], 3)
        self.assertFalse(data["stations"]["s2"]["locked"])  # stasiun opsional tidak menghalangi
        self.assertTrue(
            InteractiveMediaAttempt.objects.filter(step_id="urut").exists()
        )  # tetap untuk laporan

    def test_old_version_answer_still_graded(self):
        data = self.play()
        step = self.steps_of(data)[2]
        self.publish()  # versi 2 terbit di tengah pelajaran; id pilihan berbeda
        self.client.force_authenticate(self.student)
        response = self.answer("s1", "pg", correct_response(step), version=data["version"])
        self.assertTrue(response.data["correct"])

    def test_reflection(self):
        url = reverse("media-reflection", args=[self.material.id])
        self.assertEqual(
            self.client.post(url, {"station": "s1", "text": "ok"}, format="json").status_code, 400
        )
        self.client.post(url, {"station": "s1", "text": "Saya paham algoritma."}, format="json")
        self.assertEqual(InteractiveMediaReflection.objects.get().text, "Saya paham algoritma.")
        self.assertEqual(self.play()["reflections"], {"s1": "Saya paham algoritma."})

    def test_visit_records_resume_point_and_time(self):
        url = reverse("media-station", args=[self.material.id])
        self.client.post(
            url, {"station": "s1", "action": "visit", "step": "bs", "seconds": 90}, format="json"
        )
        self.client.post(
            url, {"station": "s1", "action": "visit", "step": "urut", "seconds": 5000}, format="json"
        )
        progress = InteractiveMediaProgress.objects.get()
        self.assertEqual(progress.time_spent, 90 + 30 * 60)
        self.assertEqual(self.play()["resume"], {"station_id": "s1", "step_id": "urut"})

    def test_pretest_gate(self):
        test = Assessment.objects.create(
            teaching_assignment=self.assignment, title="Tes Awal", due_at=timezone.now() + timedelta(days=7),
            is_published=True,
        )  # fmt: skip
        self.material.media_settings = {"pretest": test.id}
        self.material.save()
        data = self.play()
        self.assertTrue(data["stations"]["s1"]["locked"])
        self.assertIn("Tes Awal", data["stations"]["s1"]["locked_by"])
        Attempt.objects.create(assessment=test, student=self.student, submitted_at=timezone.now())
        self.assertFalse(self.play()["stations"]["s1"]["locked"])

    def test_schedule_and_free_unlock(self):
        later = (timezone.now() + timedelta(days=2)).isoformat()
        self.material.media_settings = {"unlock": "free", "schedule": {"s1": later}}
        self.material.save()
        data = self.play()
        self.assertTrue(data["stations"]["s1"]["locked"])
        self.assertFalse(data["stations"]["s2"]["locked"])

    def test_teacher_preview_and_impersonation_are_read_only(self):
        self.client.force_authenticate(self.teacher)
        data = self.client.get(self.play_url).data
        self.assertTrue(data["read_only"])
        self.assertFalse(data["stations"]["s2"]["locked"])
        step = self.steps_of(data)[2]
        self.assertFalse(self.answer("s1", "pg", correct_response(step)).data["saved"])
        # Super Admin "masuk sebagai" siswa: token membawa klaim impersonator.
        foundation = member("yayasan", Role.FOUNDATION, None)
        token = AccessToken.for_user(self.student)
        token["impersonator"] = foundation.id
        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        data = self.client.get(self.play_url).data
        self.assertTrue(data["read_only"])
        step = self.steps_of(data)[2]
        self.assertFalse(self.answer("s1", "pg", correct_response(step)).data["saved"])
        self.assertFalse(InteractiveMediaAttempt.objects.exists())

    def test_other_class_student_denied(self):
        other_room = Classroom.objects.create(
            school=self.school, name="X TKJ 1", grade="X", major="TKJ", academic_year="2026/2027"
        )
        outsider = member("siswa2", Role.STUDENT, self.school, classroom=other_room)
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(self.play_url).status_code, 404)

    def test_material_lock_applies(self):
        Material.objects.filter(pk=self.material.pk).update(order=2)
        Material.objects.create(
            teaching_assignment=self.assignment, title="Pertama", material_type="link", url="https://example.com",
            is_published=True, order=1, require_reflection=False, created_by=self.teacher,
        )  # fmt: skip
        self.assertEqual(self.client.get(self.play_url).status_code, 403)
        self.assertFalse(MaterialProgress.objects.exists())

    def test_leaderboard_rank_and_toggle(self):
        self.solve("s1")
        url = reverse("media-leaderboard", args=[self.material.id])
        data = self.client.get(url).data
        self.assertEqual(data["participants"], 1)
        self.assertEqual(data["rows"][0]["name"], "Siswa1")
        self.assertTrue(data["rows"][0]["is_me"])
        self.assertEqual(services.short_name("Ahmad Fauzi Rahman"), "Ahmad F.")
        self.material.media_settings = {"leaderboard": False}
        self.material.save()
        self.assertEqual(self.client.get(url).status_code, 403)


def png_upload(name="foto.png", size=(2400, 1200)):
    import io

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, (31, 138, 76)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class AssetTests(MediaTestCase):
    def upload(self, file=None):
        return self.client.post(
            reverse("learning-media-assets", args=[self.media.id]),
            {"file": file or png_upload()},
            format="multipart",
        )

    def test_upload_compresses_to_webp_and_limits_size(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual((response.data["width"], response.data["height"]), (1600, 800))
        self.assertTrue(response.data["original_filename"].endswith(".webp"))
        self.assertEqual(response.data["ref"], f"asset:{response.data['id']}")
        listing = self.client.get(reverse("learning-media-assets", args=[self.media.id]))
        self.assertEqual(len(listing.data), 1)

    def test_rejects_fake_image_and_non_owner(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        fake = SimpleUploadedFile("x.png", b"<svg onload=alert(1)>", content_type="image/png")
        self.assertEqual(self.upload(fake).status_code, 400)
        self.client.force_authenticate(self.other_teacher)
        self.assertIn(self.upload().status_code, (403, 404))

    def test_student_sees_asset_only_through_material(self):
        asset_id = self.upload().data["id"]
        url = reverse("media-asset-detail", args=[asset_id])
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(url).status_code, 404)
        draft = media()
        draft["parts"][0]["stations"][0]["steps"][1]["image"] = f"asset:{asset_id}"
        self.client.force_authenticate(self.teacher)
        self.client.patch(
            reverse("learning-media-detail", args=[self.media.id]), {"draft": draft}, format="json"
        )
        self.make_material()
        self.client.force_authenticate(self.student)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/webp")
        other = School.objects.create(code="mtsnj", name="MTs", level=Level.MTS)
        self.client.force_authenticate(member("luar", Role.TEACHER, other))
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_publish_rejects_foreign_asset_and_copy_remaps(self):
        draft = media()
        draft["parts"][0]["stations"][0]["steps"][1]["image"] = "asset:999"
        self.client.patch(
            reverse("learning-media-detail", args=[self.media.id]), {"draft": draft}, format="json"
        )
        self.assertEqual(self.publish().status_code, 400)
        asset_id = self.upload().data["id"]
        draft["parts"][0]["stations"][0]["steps"][1]["image"] = f"asset:{asset_id}"
        self.client.patch(
            reverse("learning-media-detail", args=[self.media.id]), {"draft": draft}, format="json"
        )
        self.assertEqual(self.publish().status_code, 201)
        self.client.force_authenticate(self.other_teacher)
        copy = self.client.post(reverse("learning-media-copy", args=[self.media.id])).data
        copied = InteractiveMedia.objects.get(pk=copy["id"])
        new_ref = copied.draft["parts"][0]["stations"][0]["steps"][1]["image"]
        self.assertNotEqual(new_ref, f"asset:{asset_id}")
        self.assertEqual(copied.assets.get().ref, new_ref)

    def test_delete_asset_removes_file(self):
        from ..models import InteractiveMediaAsset

        asset = InteractiveMediaAsset.objects.get(pk=self.upload().data["id"])
        storage, name = asset.file.storage, asset.file.name
        self.assertTrue(storage.exists(name))
        self.assertEqual(self.client.delete(reverse("media-asset-detail", args=[asset.id])).status_code, 204)
        self.assertFalse(storage.exists(name))
