"""Langkah simulasi: peraga HTML bawaan aplikasi (/mpi/...) di iframe sandbox, selesai lewat mpi:done."""

import json
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from django.urls import reverse

from .. import schema
from ..importers import outline
from ..models import InteractiveMedia, InteractiveMediaProgress
from ..steps import KINDS, StepError
from . import test_api
from .samples import correct_response, media
from .test_api import MediaTestCase

SIM = {
    "id": "sim1",
    "kind": "simulation",
    "title": "Coba sendiri: peraga pangkat",
    "text": "Geser bilangan pokok dan pangkat.",
    "src": "/mpi/eksponen/sim/pangkat.html",
    "height": 560,
    "params": {"target": 81},
    "require_done": True,
    "explanation": "3⁴ = 81.",
}
PUBLIC = Path(__file__).resolve().parents[4] / "frontend" / "public"


def with_simulation(step=None):
    draft = media()
    station = draft["parts"][0]["stations"][0]
    station["steps"] = [*station["steps"], dict(step or SIM)]
    return draft


class SimulationStepTests(SimpleTestCase):
    def test_valid_step_and_defaults(self):
        kind = KINDS["simulation"]
        self.assertFalse(kind.graded)
        self.assertTrue(kind.completable)
        clean = kind.validate(SIM)
        self.assertEqual(clean["params"], {"target": 81})
        self.assertEqual(clean["height"], 560)
        bare = kind.validate({"src": "/mpi/eksponen/sim/akar.html"})
        self.assertEqual((bare["height"], bare["params"], bare["require_done"]), (520, {}, True))

    def test_src_must_be_local_mpi_html(self):
        kind = KINDS["simulation"]
        for src in (
            "https://contoh.com/x.html",
            "http://contoh.com/x.html",
            "//contoh.com/mpi/x.html",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "/mpi/../admin/index.html",
            "/api/media/x.html",
            "/mpi/eksponen/sim/gambar.svg",
            "",
        ):
            with self.assertRaises(StepError, msg=src):
                kind.validate({**SIM, "src": src})

    def test_params_height_and_require_done_rules(self):
        kind = KINDS["simulation"]
        for bad in ({"params": [1, 2]}, {"params": "target=81"}, {"height": 100}, {"height": 5000},
                    {"require_done": "ya"}, {"params": {"x": "a" * 5000}}):  # fmt: skip
            with self.assertRaises(StepError, msg=bad):
                kind.validate({**SIM, **bad})

    def test_not_graded_when_compiled_and_counted_in_import_outline(self):
        content = schema.validate_media(with_simulation())
        compiled = schema.compile_media(content)
        step = compiled["content"]["parts"][0]["stations"][0]["steps"][-1]
        self.assertEqual(step["kind"], "simulation")
        self.assertFalse(step["graded"])
        self.assertEqual(step["params"], {"target": 81})
        self.assertNotIn("sim1", compiled["keys"])
        _, totals = outline(content["parts"])
        self.assertEqual(totals["simulations"], 1)

    def test_external_src_rejected_even_in_light_check(self):
        with self.assertRaises(schema.MediaError) as caught:
            schema.validate_media(with_simulation({**SIM, "src": "https://contoh.com/x.html"}), full=False)
        self.assertIn("/mpi/", caught.exception.errors[0])

    def test_bundled_simulation_files_exist(self):
        for name in ("pangkat", "hoaks", "sifat", "fungsi", "akar"):
            self.assertTrue((PUBLIC / "mpi" / "eksponen" / "sim" / f"{name}.html").is_file(), name)


class SimulationPlayTests(MediaTestCase):
    """Alur siswa dengan media yang berisi langkah simulasi."""

    play = test_api.PlayTests.play
    steps_of = test_api.PlayTests.steps_of
    answer = test_api.PlayTests.answer
    finish = test_api.PlayTests.finish
    solve = test_api.PlayTests.solve

    def setUp(self):
        super().setUp()
        self.material = self.make_material()
        self.play_url = reverse("media-play", args=[self.material.id])
        self.client.force_authenticate(self.teacher)
        self.media.draft = with_simulation()
        self.media.save()
        self.publish()
        self.client.force_authenticate(self.student)

    def complete(self, step="sim1"):
        return self.client.post(
            reverse("media-station", args=[self.material.id]),
            {"station": "s1", "action": "complete", "step": step},
            format="json",
        )

    def test_complete_marks_simulation_done_without_affecting_stars(self):
        self.assertEqual(self.complete().status_code, 200)
        data = self.play()
        self.assertEqual(data["stations"]["s1"]["run"]["sim1"], {"done": True})
        self.assertEqual(data["stations"]["s1"]["last_step_id"], "sim1")
        result = self.solve("s1", data)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["stars"], 3)

    def test_complete_rejects_graded_steps(self):
        self.assertEqual(self.complete("pg").status_code, 400)
        self.assertEqual(self.complete("").status_code, 400)
        self.assertFalse(InteractiveMediaProgress.objects.filter(run__has_key="pg").exists())

    def test_finish_does_not_require_simulation(self):
        # Simulasi bukan latihan: stasiun tetap bisa selesai (mis. peraga gagal dimuat).
        data = self.play()
        for step in self.steps_of(data):
            if step["graded"]:
                self.answer("s1", step["id"], correct_response(step))
        self.assertEqual(self.finish("s1").status_code, 200)


class SimulationImportTests(MediaTestCase):
    def test_json_import_with_simulations(self):
        self.client.force_authenticate(self.teacher)
        payload = {"format": "lms-sigma-media", "title": "Uji", "media": with_simulation()}
        upload = SimpleUploadedFile("media.json", json.dumps(payload).encode(), "application/json")
        url = reverse("learning-media-import-content", args=[self.media.id])
        before = InteractiveMedia.objects.get(pk=self.media.id).draft
        response = self.client.post(
            url, {"source": "json", "mode": "replace", "file": upload, "dry_run": "true"}, format="multipart"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["summary"]["simulations"], 1)

        bad = with_simulation({**SIM, "src": "https://contoh.com/x.html"})
        for dry_run, status in (("true", 200), ("false", 400)):
            upload = SimpleUploadedFile(
                "media.json", json.dumps({**payload, "media": bad}).encode(), "application/json"
            )
            response = self.client.post(
                url, {"source": "json", "mode": "replace", "file": upload, "dry_run": dry_run},
                format="multipart",
            )  # fmt: skip
            self.assertEqual(response.status_code, status, response.data)
            self.assertIn("/mpi/", json.dumps(response.data["errors"], ensure_ascii=False))
        self.assertEqual(InteractiveMedia.objects.get(pk=self.media.id).draft, before)
