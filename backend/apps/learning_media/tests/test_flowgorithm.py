"""Plugin Flowgorithm (interpreter kembar, langkah susun/isi program, .fprg) dan plugin exposure DKV."""

import copy
import json
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from django.urls import reverse

from .. import schema
from ..plugins.flowgorithm.fprg import FprgError, convert_expression, parse_fprg
from ..plugins.flowgorithm.interpreter import check_tests, run_program
from ..plugins.flowgorithm.programs import ProgramError, clean_program, count_blanks, fill_blanks
from ..steps import KINDS, StepError
from .test_api import MediaTestCase

CONFORMANCE = json.loads(
    (Path(__file__).resolve().parents[1] / "plugins" / "flowgorithm" / "conformance.json").read_text("utf-8")
)
LUAS = CONFORMANCE["checks"][0]  # studi kasus acuan K1 "Luas dan Keliling"


def flowgorithm_step(**fields):
    step = {
        "id": "kasus1",
        "kind": "flowgorithm",
        "title": "Luas dan Keliling",
        "text": "Buat program luas & keliling persegi panjang.",
        "mode": "build",
        "program": {"body": [{"t": "decl", "type": "Integer", "names": ["p", "l"]}]},
        "solution": LUAS["program"],
        "tests": [
            {"inputs": ["5", "3"], "expected": []},
            {"inputs": ["10", "2"], "expected": ["Luas: 20", "Keliling: 24"]},
            {"inputs": ["7", "7"], "expected": [], "hidden": True},
        ],
    }
    step.update(fields)
    return step


FILL = {
    "id": "isi1",
    "kind": "flowgorithm",
    "text": "Lengkapi syarat genap.",
    "mode": "fill",
    "program": {
        "body": [
            {"t": "decl", "type": "Integer", "names": ["bilangan"]},
            {"t": "input", "target": "bilangan"},
            {
                "t": "if",
                "cond": "{{}}",
                "yes": [{"t": "output", "expr": '"genap"'}],
                "no": [{"t": "output", "expr": '"ganjil"'}],
            },
        ]
    },
    "answers": ["bilangan % 2 == 0"],
    "tests": [
        {"inputs": ["8"], "expected": ["genap"]},
        {"inputs": ["7"], "expected": ["ganjil"], "hidden": True},
    ],
}

EXPOSURE = {
    "id": "foto1",
    "kind": "exposure",
    "text": "Potret pelari di siang hari: objek harus beku.",
    "target": {"aperture": 5.6, "shutter": 1 / 500, "iso": 200},
    "rules": {"slowest_shutter": 1 / 250, "max_iso": 800},
    "tolerance": 0.5,
}


class InterpreterTests(SimpleTestCase):
    def test_conformance_cases(self):
        for item in CONFORMANCE["cases"]:
            with self.subTest(item["name"]):
                result = run_program(item["program"], item["inputs"])
                self.assertEqual(result["out"], item["out"])
                self.assertEqual(result["error"], item["error"])

    def test_reference_case_solutions_pass(self):
        for item in CONFORMANCE["checks"]:
            with self.subTest(item["name"]):
                self.assertTrue(
                    all(r["ok"] for r in check_tests(item["program"], item["tests"], item["compare"]))
                )

    def test_blanks_order(self):
        for item in CONFORMANCE["blanks"]:
            program = clean_program(item["program"], allow_blanks=True)
            self.assertEqual(count_blanks(program), item["count"])
            self.assertEqual(fill_blanks(program, item["answers"]), clean_program(item["filled"]))

    def test_program_shape_is_checked(self):
        with self.assertRaisesMessage(ProgramError, "blok yang tidak dikenal"):
            clean_program({"body": [{"t": "eval", "expr": "1"}]})
        with self.assertRaisesMessage(ProgramError, "maksimal 300 blok"):
            clean_program({"body": [{"t": "cm", "text": "x"}] * 301})
        nested = {"t": "while", "cond": "true", "body": []}
        deep = nested
        for _ in range(13):
            deep = {"t": "while", "cond": "true", "body": [deep]}
        with self.assertRaisesMessage(ProgramError, "terlalu dalam"):
            clean_program({"body": [deep]})
        with self.assertRaisesMessage(ProgramError, "bagian kosong"):
            clean_program({"body": [{"t": "output", "expr": "{{}}"}]})


class StepTests(SimpleTestCase):
    kind = KINDS["flowgorithm"]

    def test_expected_output_is_computed_from_solution(self):
        clean = self.kind.validate(flowgorithm_step())
        self.assertEqual(clean["tests"][0]["expected"], ["Luas: 15", "Keliling: 16"])
        public, key = self.kind.compile({**clean, "hints": []})
        self.assertEqual(len(public["examples"]), 2)
        self.assertEqual(public["hidden_tests"], 1)
        self.assertNotIn("solution", public)
        self.assertNotIn("7", json.dumps(public["examples"]))  # isian uji tersembunyi tidak ikut
        self.assertEqual(len(key["tests"]), 3)

    def test_wrong_expected_or_broken_solution_is_rejected(self):
        step = flowgorithm_step(tests=[{"inputs": ["5", "3"], "expected": ["Luas: 99"]}])
        with self.assertRaisesMessage(StepError, "tidak sama dengan output yang diharapkan"):
            self.kind.validate(step)
        step = flowgorithm_step(tests=[{"inputs": [], "expected": []}])
        with self.assertRaisesMessage(StepError, "program kunci error: Program meminta isian"):
            self.kind.validate(step)
        step = flowgorithm_step(solution=None, tests=[{"inputs": ["1"], "expected": []}])
        with self.assertRaisesMessage(StepError, "isi output yang diharapkan"):
            self.kind.validate(step)
        step = flowgorithm_step(tests=[{"inputs": ["5", "3"], "expected": [], "hidden": True}])
        with self.assertRaisesMessage(StepError, "Minimal satu uji harus terlihat"):
            self.kind.validate(step)

    def test_fill_mode_needs_answers_per_blank(self):
        self.assertEqual(self.kind.validate(FILL)["answers"], ["bilangan % 2 == 0"])
        with self.assertRaisesMessage(StepError, "Isi jawaban untuk ke-1 bagian kosong"):
            self.kind.validate({**FILL, "answers": []})
        with self.assertRaisesMessage(StepError, "program kunci error"):
            self.kind.validate({**FILL, "answers": ["bilangan % 2"]})

    def test_grading_hides_hidden_test_details(self):
        clean = self.kind.validate(flowgorithm_step())
        public, key = self.kind.compile({**clean, "hints": []})
        correct, detail, feedback = self.kind.grade(public, key, {"program": LUAS["program"]})
        self.assertTrue(correct)
        self.assertEqual(feedback, [])
        # Program yang hanya benar untuk uji terlihat (luas & keliling ditulis langsung).
        cheat = {
            "body": [
                {"t": "decl", "type": "Integer", "names": ["p", "l"]},
                {"t": "input", "target": "p"},
                {"t": "input", "target": "l"},
                {"t": "if", "cond": "p == 5", "yes": [{"t": "output", "expr": '"Luas: 15"'}, {"t": "output", "expr": '"Keliling: 16"'}],
                 "no": [{"t": "output", "expr": '"Luas: 20"'}, {"t": "output", "expr": '"Keliling: 24"'}]},
            ]
        }  # fmt: skip
        correct, detail, feedback = self.kind.grade(public, key, self.kind.clean(public, {"program": cheat}))
        self.assertFalse(correct)
        self.assertEqual(detail[2], {"ok": False, "hidden": True})
        self.assertIn("tersembunyi", feedback[0])
        self.assertNotIn("49", json.dumps([detail, feedback]))

    def test_visible_failure_explains_expected_and_actual(self):
        clean = self.kind.validate(flowgorithm_step())
        public, key = self.kind.compile({**clean, "hints": []})
        program = copy.deepcopy(LUAS["program"])
        program["body"][-1]["expr"] = '"Keliling: " & p + l'
        correct, detail, feedback = self.kind.grade(public, key, {"program": program})
        self.assertFalse(correct)
        self.assertEqual(
            feedback,
            [
                "Uji 1 (isian: 5, 3): seharusnya berakhir dengan 'Luas: 15 | Keliling: 16', programmu: 'Luas: 15 | Keliling: 8'."
            ],
        )
        self.assertEqual(detail[0]["out"], ["Luas: 15", "Keliling: 8"])

    def test_fill_grading_and_reveal(self):
        public, key = self.kind.compile({**self.kind.validate(FILL), "hints": []})
        self.assertEqual(public["blanks"], 1)
        response = self.kind.clean(public, {"blanks": ["bilangan % 2 == 0"]})
        self.assertTrue(self.kind.grade(public, key, response)[0])
        self.assertFalse(self.kind.grade(public, key, {"blanks": ["bilangan % 2 == 1"]})[0])
        self.assertEqual(self.kind.key_display(public, key), {"blanks": ["bilangan % 2 == 0"]})
        from ..steps import InvalidResponse

        with self.assertRaises(InvalidResponse):
            self.kind.clean(public, {"blanks": ["a", "b"]})

    def test_predict_answer_is_computed(self):
        kind = KINDS["flowgorithm_predict"]
        step = {
            "text": "Kalau umur diisi 15, pesan terakhir yang tampil adalah ...",
            "program": {
                "body": [
                    {"t": "decl", "type": "Integer", "names": ["umur"]},
                    {"t": "output", "expr": '"Berapa umurmu?"'},
                    {"t": "input", "target": "umur"},
                    {"t": "if", "cond": "umur > 12", "yes": [{"t": "output", "expr": '"Besar"'}], "no": [{"t": "output", "expr": '"Kecil"'}]},
                ]
            },
            "inputs": ["15"],
            "show": "last",
            "wrong": ["Besar", "Kecil", "Kecil"],
        }  # fmt: skip
        clean = kind.validate(step)
        self.assertEqual([c["text"] for c in clean["choices"]], ["Besar", "Kecil"])
        public, key = kind.compile({**clean, "hints": []})
        self.assertIn("program", public)
        self.assertNotIn("wrong", public)
        right = next(c["id"] for c in public["choices"] if c["text"] == "Besar")
        self.assertTrue(kind.grade(public, key, {"choice": right})[0])
        self.assertEqual(
            kind.validate({**step, "show": "all"})["choices"][0]["text"], "Berapa umurmu?, Besar"
        )
        with self.assertRaisesMessage(StepError, "minimal satu pilihan salah"):
            kind.validate({**step, "wrong": ["Besar"]})

    def test_demo_step_and_exposure_validate(self):
        demo = KINDS["flowgorithm_demo"].validate(
            {"program": LUAS["program"], "inputs": ["5", "3"], "editable": True}
        )
        self.assertTrue(demo["editable"])
        exposure = KINDS["exposure"]
        clean = exposure.validate(EXPOSURE)
        with self.assertRaisesMessage(StepError, "melanggar syaratnya sendiri"):
            exposure.validate({**EXPOSURE, "target": {**EXPOSURE["target"], "shutter": 1 / 60}})
        public, key = exposure.compile({**clean, "hints": [], "explanation": ""})
        self.assertNotIn("rules", public)
        # Kombinasi lain yang sama terangnya juga benar: bukaan 1 stop lebih sempit, shutter 1 stop lebih lambat
        # (1/250 masih memenuhi syarat objek beku).
        self.assertTrue(exposure.grade(public, key, {"aperture": 8, "shutter": 1 / 250, "iso": 200})[0])
        dark = exposure.grade(public, key, {"aperture": 16, "shutter": 1 / 500, "iso": 200})
        self.assertFalse(dark[0])
        self.assertIn("terlalu gelap (kurang 3.0 stop)", dark[2][0])
        blur = exposure.grade(public, key, {"aperture": 11, "shutter": 1 / 125, "iso": 200})
        self.assertIn("Shutter terlalu lambat", blur[2][0])
        noisy = exposure.grade(public, key, {"aperture": 5.6, "shutter": 1 / 4000, "iso": 1600})
        self.assertIn("ISO terlalu tinggi", noisy[2][0])


FPRG = b"""<?xml version="1.0"?>
<flowgorithm fileversion="3.0">
  <function name="Main" type="None" variable="">
    <parameters/>
    <body>
      <declare name="a, b" type="Integer" array="False" size=""/>
      <declare name="buah" type="String" array="True" size="3"/>
      <input variable="a"/>
      <assign variable="b" expression="Kuadrat(a)"/>
      <if expression="b = 25 &amp;&amp; a &lt;&gt; 0">
        <then><output expression="&quot;lima = &quot; &amp; a" newline="True"/></then>
        <else><output expression="b" newline="True"/></else>
      </if>
      <for variable="a" start="3" end="1" direction="dec" step="1">
        <output expression="a" newline="True"/>
      </for>
      <comment text="selesai"/>
    </body>
  </function>
  <function name="Kuadrat" type="Integer" variable="hasil">
    <parameters><parameter name="n" type="Integer" array="False"/></parameters>
    <body>
      <declare name="hasil" type="Integer" array="False" size=""/>
      <assign variable="hasil" expression="n * n"/>
    </body>
  </function>
</flowgorithm>"""


class FprgTests(SimpleTestCase):
    def test_convert_expression(self):
        self.assertEqual(
            convert_expression("a = 1 && !(b <> 2) || c >= 3"), "a == 1 and not (b != 2) or c >= 3"
        )
        self.assertEqual(convert_expression('"x = y" & a'), '"x = y" & a')

    def test_parse_and_run(self):
        program, warnings = parse_fprg(FPRG)
        self.assertEqual(warnings, [])
        self.assertEqual(program["body"][1]["size"], 3)
        self.assertEqual(run_program(program, ["5"]), {"out": ["lima = 5", "3", "2", "1"], "error": ""})

    def test_rejects_invalid_files(self):
        for data in (b"bukan xml", b"<html/>", b'<!DOCTYPE x [<!ENTITY a "b">]><flowgorithm/>'):
            with self.assertRaises(FprgError):
                parse_fprg(data)


class FlowgorithmApiTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        draft = schema.empty_media()
        draft["parts"] = [
            {
                "id": "b1",
                "title": "Studi kasus",
                "stations": [{"id": "s1", "title": "K1", "steps": [flowgorithm_step(), FILL, EXPOSURE]}],
            }
        ]
        self.media.draft = draft
        self.media.save()
        self.material = self.make_material()
        self.client.force_authenticate(self.student)

    def answer(self, step, response):
        return self.client.post(
            reverse("media-answer", args=[self.material.id]),
            {"station": "s1", "step": step, "response": response},
            format="json",
        )

    def test_student_content_has_no_keys_and_server_grades(self):
        data = self.client.get(reverse("media-play", args=[self.material.id])).data
        text = json.dumps(data, ensure_ascii=False)
        self.assertNotIn("Luas: 49", text)
        self.assertNotIn("bilangan % 2 == 0", text)
        self.assertNotIn("slowest_shutter", text)
        response = self.answer("kasus1", {"program": LUAS["program"]})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["correct"])
        response = self.answer("isi1", {"blanks": ["bilangan % 2 == 1"]})
        self.assertFalse(response.data["correct"])
        self.assertEqual(self.answer("kasus1", {"program": "bukan program"}).status_code, 400)
        response = self.answer("foto1", {"aperture": 5.6, "shutter": 1 / 500, "iso": 200})
        self.assertTrue(response.data["correct"])

    def test_fprg_endpoint_and_import(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(
            reverse("learning-media-fprg"),
            {"file": SimpleUploadedFile("hitung.fprg", FPRG)},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["program"]["funcs"]["Kuadrat"]["ret"], "hasil")
        response = self.client.post(
            reverse("learning-media-import-content", args=[self.media.id]),
            {"source": "fprg", "file": SimpleUploadedFile("hitung.fprg", FPRG), "dry_run": False},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.media.refresh_from_db()
        step = list(schema.iter_stations(self.media.draft))[-1]["steps"][0]
        self.assertEqual(step["kind"], "flowgorithm_demo")

    def test_teacher_preview_can_check_answers(self):
        # Pemutar pratinjau mengirim version = 0 (nomor versi pratinjau); harus diterima.
        self.client.force_authenticate(self.teacher)
        self.client.post(reverse("learning-media-preview", args=[self.media.id]), {}, format="json")
        response = self.client.post(
            reverse("learning-media-preview-answer", args=[self.media.id]),
            {"version": 0, "station": "s1", "step": "isi1", "response": {"blanks": ["bilangan % 2 == 0"]}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["correct"])
        self.assertFalse(response.data["saved"])


DOCS = Path(__file__).resolve().parents[4] / "docs" / "mpi"


class ContentTests(SimpleTestCase):
    """Isi "Petualangan Flowgorithm" (docs/mpi) harus selalu layak terbit dan soal tesnya bisa diimpor."""

    def test_media_json_is_publishable(self):
        payload = json.loads((DOCS / "petualangan-flowgorithm.json").read_text("utf-8"))
        self.assertEqual(payload["format"], "lms-sigma-media")
        # Pemeriksaan lengkap = pemeriksaan terbit: semua program kunci studi kasus dijalankan dengan ujinya.
        content = schema.validate_media(payload["media"], full=True)
        stations = list(schema.iter_stations(content))
        self.assertGreaterEqual(len(stations), 29)
        kinds = {s["kind"] for station in stations for _, s in schema.iter_steps(station)}
        self.assertTrue(
            {"flowgorithm", "flowgorithm_predict", "flowgorithm_demo", "categorize", "matching"} <= kinds
        )
        compiled = json.dumps(schema.compile_media(content)["content"], ensure_ascii=False)
        self.assertNotIn('"solution"', compiled)

    def test_migration_restores_builtin_images(self):
        """Migrasi 0003 memasang gambar bawaan ke media yang diimpor sebelum gambar ada (draf & versi terbit)."""
        from importlib import import_module

        fill_images = import_module(
            "apps.learning_media.migrations.0003_flowgorithm_builtin_images"
        ).fill_images
        original = schema.validate_media(
            json.loads((DOCS / "petualangan-flowgorithm.json").read_text("utf-8"))["media"]
        )

        def strip(value):
            if isinstance(value, dict):
                return {
                    k: "" if k == "image" and str(v).startswith("/mpi/") else strip(v)
                    for k, v in value.items()
                }
            if isinstance(value, list):
                return [strip(v) for v in value]
            return value

        for media in (original, schema.compile_media(original)["content"]):
            old = strip(media)
            self.assertNotEqual(old, media)
            self.assertTrue(fill_images(old))
            self.assertEqual(old, media)
            self.assertFalse(fill_images(old))  # aman diulang
        # Gambar yang sudah diganti guru tidak ditimpa; media lain tidak disentuh.
        custom = copy.deepcopy(original)
        custom["mascot"]["image"] = "asset:5"
        self.assertFalse(fill_images(custom))
        other = strip(original)
        other["mascot"]["name"] = "Robo"
        self.assertFalse(fill_images(other))

    def test_pre_and_post_tests_parse(self):
        from apps.assessments.question_import import parse_text

        for name in ("tes-awal-flowgorithm.txt", "tes-akhir-flowgorithm.txt"):
            items = parse_text((DOCS / name).read_text("utf-8"))
            self.assertEqual(len(items), 10, name)
            self.assertEqual([e for item in items for e in item["errors"]], [], name)
            # Pilihan PG Asesmen tidak diacak: kunci tidak boleh selalu di huruf yang sama.
            self.assertGreater(len({item["data"]["correct_choice"] for item in items}), 1, name)
