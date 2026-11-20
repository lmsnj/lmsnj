"""Skema media, kompilasi (kunci terpisah), dan penilaian per jenis langkah — tanpa database."""

import json
from types import SimpleNamespace

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from .. import schema, services
from ..steps import KINDS, StepError
from .samples import correct_response, media, wrong_response


def compiled_version():
    compiled = schema.compile_media(schema.validate_media(media()))
    return SimpleNamespace(content=compiled["content"], keys=compiled["keys"])


def student_steps(version, seed="seed"):
    content = schema.student_content(version.content, seed)
    return [step for station in schema.iter_stations(content) for step in station["steps"]]


class SchemaTests(SimpleTestCase):
    def test_sample_is_valid_and_ids_kept(self):
        clean = schema.validate_media(media())
        self.assertEqual([s["id"] for s in schema.iter_stations(clean)], ["s1", "s2"])
        self.assertEqual(schema.required_station_ids(clean), ["s1", "s2"])

    def test_missing_ids_are_generated(self):
        data = media()
        del data["parts"][0]["stations"][1]["id"]
        del data["parts"][0]["stations"][1]["steps"][0]["id"]
        clean = schema.validate_media(data)
        station = clean["parts"][0]["stations"][1]
        self.assertTrue(station["id"])
        self.assertTrue(station["steps"][0]["id"])

    def test_errors_name_location(self):
        data = media()
        data["parts"][0]["stations"][0]["steps"][2]["correct"] = 9
        data["parts"][0]["stations"][1]["steps"][0]["kind"] = "aneh"
        with self.assertRaises(schema.MediaError) as caught:
            schema.validate_media(data)
        errors = caught.exception.errors
        self.assertIn("Bagian 1 › Stasiun 1 › Langkah 3: Tandai satu pilihan sebagai jawaban benar.", errors)
        self.assertTrue(any("Stasiun 2 › Langkah 1" in e and "aneh" in e for e in errors))

    def test_duplicate_ids_rejected(self):
        data = media()
        data["parts"][0]["stations"][1]["id"] = "s1"
        with self.assertRaises(schema.MediaError):
            schema.validate_media(data)

    def test_prerequisite_must_be_earlier(self):
        data = media()
        data["parts"][0]["stations"][0]["prerequisites"] = ["s2"]
        with self.assertRaises(schema.MediaError):
            schema.validate_media(data)

    def test_light_validation_allows_incomplete_draft(self):
        data = media()
        data["parts"][0]["stations"][0]["steps"][2]["choices"] = []
        schema.validate_media(data, full=False)
        with self.assertRaises(schema.MediaError):
            schema.validate_media(data, full=True)

    def test_unknown_schema_version_rejected(self):
        with self.assertRaises(schema.MediaError):
            schema.validate_media({**media(), "schema_version": 99})

    def test_compiled_content_has_no_answer_keys(self):
        version = compiled_version()
        text = json.dumps(version.content)
        for secret in ('"correct"', '"answer"', "explanation", '"why"', "Variabel adalah tempat", "Air dulu"):
            self.assertNotIn(secret, text)
        self.assertEqual(version.content["parts"][0]["stations"][0]["graded_steps"], 8)
        # Hint boleh terlihat (memang untuk siswa).
        self.assertIn("Ingat resep teh.", text)

    def test_shuffle_stable_per_seed(self):
        version = compiled_version()
        first = student_steps(version, "a")
        self.assertEqual(first, student_steps(version, "a"))
        ordering = next(s for s in first if s["kind"] == "ordering")
        self.assertNotEqual(
            [i["text"] for i in ordering["items"]], ["Rebus air", "Masukkan teh", "Tuang air"]
        )


class GradingTests(SimpleTestCase):
    def setUp(self):
        self.version = compiled_version()
        self.steps = {s["id"]: s for s in student_steps(self.version) if s["graded"]}

    def grade(self, step_id, response):
        *_, result = services.check_answer(
            self.version, "s1" if step_id != "s2-pg" else "s2", step_id, response
        )
        return result

    def test_every_kind_accepts_correct_answer(self):
        for step_id, step in self.steps.items():
            with self.subTest(kind=step["kind"]):
                result = self.grade(step_id, correct_response(step))
                self.assertTrue(result["correct"], result)
                self.assertIn("key", result)

    def test_wrong_answer_explains_why(self):
        result = self.grade("pg", wrong_response(self.steps["pg"]))
        self.assertFalse(result["correct"])
        self.assertNotIn("explanation", result)
        result = self.grade("bs", wrong_response(self.steps["bs"]))
        self.assertEqual(result["feedback"], ["Komputer hanya mengikuti langkah."])
        result = self.grade("ketuk", wrong_response(self.steps["ketuk"]))
        self.assertEqual(result["feedback"], ["Itu Console."])

    def test_ordering_detail_per_position(self):
        result = self.grade("urut", wrong_response(self.steps["urut"]))
        self.assertFalse(result["correct"])
        self.assertEqual(result["detail"], [False, True, False])

    def test_invalid_response_rejected(self):
        for response in ({"choice": "bukan-id"}, {"order": ["x"]}, "teks"):
            with self.assertRaises(ValidationError):
                self.grade("pg" if "choice" in str(response) else "urut", response)

    def test_explanation_steps_are_not_graded(self):
        with self.assertRaises(ValidationError):
            services.check_answer(self.version, "s1", "teori", {})

    def test_all_kinds_registered(self):
        expected = {"text", "did_you_know", "dialog", "video", "flip_cards", "flashcards", "worked_example",
                    "choice", "true_false", "ordering", "categorize", "hotspot", "fill_blank", "drag_drop",
                    "matching"}  # fmt: skip
        self.assertLessEqual(expected, set(KINDS))


class StarsTests(SimpleTestCase):
    def test_stars(self):
        station = {
            "steps": [{"id": "a", "graded": True}, {"id": "b", "graded": True}, {"id": "c", "graded": False}]
        }
        perfect = services.run_summary(station, {"a": {"done": True}, "b": {"done": True}})
        self.assertEqual((perfect["done"], perfect["graded"], services.stars_for(perfect)), (2, 2, 3))
        two = services.run_summary(
            station, {"a": {"done": True, "mistakes": 1}, "b": {"done": True, "hints": 1}}
        )
        self.assertEqual(services.stars_for(two), 2)
        revealed = services.run_summary(
            station, {"a": {"done": True, "revealed": True, "hints": 2}, "b": {"done": True}}
        )
        self.assertEqual(services.stars_for(revealed), 1)

    def test_suggestion(self):
        station = {"remedial": [{}], "challenge": [{}]}
        self.assertEqual(services.suggestion(station, 1, 0), "remedial")
        self.assertEqual(services.suggestion(station, 3, 3), "remedial")
        self.assertEqual(services.suggestion(station, 3, 0), "challenge")
        self.assertIsNone(services.suggestion({}, 1, 5))


class FlipCardImageTests(SimpleTestCase):
    def validate(self, cards):
        return KINDS["flip_cards"].validate({"cards": cards})

    def test_card_image_kept_and_front_optional_with_image(self):
        result = self.validate(
            [
                {"front": "", "back": "Simbol Input", "image": "asset:7"},
                {"front": "Console", "back": "Tempat Output", "image": "https://contoh.id/c.png"},
                {"front": "Toolbar", "back": "Deretan tombol"},
            ]
        )
        self.assertEqual([c["image"] for c in result["cards"]], ["asset:7", "https://contoh.id/c.png", ""])

    def test_builtin_image_path_allowed_but_not_traversal(self):
        result = self.validate([{"front": "Console", "back": "x", "image": "/mpi/flowgorithm/console.svg"}])
        self.assertEqual(result["cards"][0]["image"], "/mpi/flowgorithm/console.svg")
        for bad in ("/mpi/../index.html", "/etc/passwd.png", "//evil.id/a.png"):
            with self.assertRaises(StepError):
                self.validate([{"front": "a", "back": "b", "image": bad}])

    def test_card_without_front_and_image_rejected(self):
        with self.assertRaises(StepError):
            self.validate([{"front": "", "back": "x"}])

    def test_card_image_must_be_upload_or_https(self):
        with self.assertRaises(StepError):
            self.validate([{"front": "a", "back": "b", "image": "javascript:alert(1)"}])
