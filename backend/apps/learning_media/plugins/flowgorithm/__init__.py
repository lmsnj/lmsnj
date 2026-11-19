"""Plugin Flowgorithm: jenis langkah studi kasus program (dinilai di server) dan demo/lab program.

`flowgorithm` (latihan):
  mode "build" : siswa menyusun program dari program awal (studi kasus).
  mode "fill"  : program sudah jadi dengan bagian kosong {{}}; siswa mengisi bagian kosong itu.
  Program siswa dijalankan dengan beberapa uji (isian -> output yang diharapkan). Uji `hidden` tidak pernah
  dikirim ke siswa (kunci), hanya dinilai di server. Output yang diharapkan boleh dikosongkan guru jika ada
  program kunci: dihitung otomatis saat disimpan.
`flowgorithm_predict` (latihan "tebak output"): program ditampilkan (tidak bisa dijalankan siswa), siswa memilih
  output yang benar. Jawaban benar DIHITUNG interpreter saat disimpan, jadi kunci tidak mungkin salah.
`flowgorithm_demo` (penjelasan): program contoh yang bisa dijalankan/dilangkahi siswa (atau diubah bebas
  jika `editable`), tanpa nilai.

Interpreter: interpreter.py (kembaran frontend/src/mpi/plugins/flowgorithm/interpreter.js).
"""

import time

from ... import steps as step_kinds
from ...steps import ChoiceStep, GradedStep, InvalidResponse, StepError, StepKind, register
from .interpreter import check_tests, output_matches, run_program
from .programs import ProgramError, clean_program, count_blanks, fill_blanks, node_count

MODES = ("build", "fill")
COMPARES = ("tail", "exact")
MAX_TESTS = 10
MAX_INPUTS = 20
MAX_EXPECTED = 50
MAX_BLANKS = 10
GRADE_BUDGET = 6.0  # detik total untuk semua uji satu jawaban


def _program(raw, where, allow_blanks=False):
    try:
        return clean_program(raw, allow_blanks=allow_blanks, where=where)
    except ProgramError as error:
        raise StepError(str(error))


def _lines(values, name, maximum, limit=500):
    if values is None:
        values = []
    if not isinstance(values, list) or len(values) > maximum:
        raise StepError(f"{name}: maksimal {maximum} baris.")
    return [step_kinds.text(v, name, limit) for v in values]


def _summary(lines, limit=6):
    shown = " | ".join(lines[-limit:]) if lines else "(tidak ada)"
    return ("… | " if len(lines) > limit else "") + shown


@register
class FlowgorithmStep(GradedStep):
    kind, label = "flowgorithm", "Flowgorithm (susun/isi program)"

    def validate(self, step):
        mode = step.get("mode") or "build"
        if mode not in MODES:
            raise StepError("Mode harus 'build' (susun program) atau 'fill' (isi bagian kosong).")
        program = _program(step.get("program") or {"body": []}, "Program awal", allow_blanks=mode == "fill")
        blanks = count_blanks(program)
        solution, answers = None, []
        if mode == "fill":
            if not 1 <= blanks <= MAX_BLANKS:
                raise StepError(f"Program isian harus berisi 1 sampai {MAX_BLANKS} bagian kosong {{{{}}}}.")
            answers = _lines(step.get("answers"), "Jawaban bagian kosong", MAX_BLANKS, 300)
            if len(answers) != blanks or not all(a.strip() for a in answers):
                raise StepError(f"Isi jawaban untuk ke-{blanks} bagian kosong (satu per baris, berurutan).")
            reference = fill_blanks(program, answers)
        else:
            if step.get("solution") and (step["solution"].get("body") or step["solution"].get("funcs")):
                solution = _program(step["solution"], "Program kunci")
            reference = solution
        compare = step.get("compare") or "tail"
        if compare not in COMPARES:
            raise StepError("Cara membandingkan output harus 'tail' atau 'exact'.")

        tests = []
        for number_, raw in enumerate(
            step_kinds.object_list(step.get("tests"), "Uji", 1, MAX_TESTS), start=1
        ):
            where = f"Uji {number_}"
            inputs = _lines(raw.get("inputs"), f"{where} (isian)", MAX_INPUTS, 200)
            expected = [
                line for line in _lines(raw.get("expected"), f"{where} (output)", MAX_EXPECTED) if line != ""
            ]
            if reference is not None:
                result = run_program(reference, inputs)
                if result["error"]:
                    raise StepError(f"{where}: program kunci error: {result['error']}")
                if not expected:
                    expected = result["out"]
                elif not output_matches(result["out"], expected, compare):
                    raise StepError(
                        f"{where}: program kunci menampilkan '{_summary(result['out'])}', "
                        f"tidak sama dengan output yang diharapkan '{_summary(expected)}'."
                    )
            if not expected:
                raise StepError(
                    f"{where}: isi output yang diharapkan (atau program kunci agar dihitung otomatis)."
                )
            tests.append({"inputs": inputs, "expected": expected, "hidden": bool(raw.get("hidden"))})
        if all(t["hidden"] for t in tests):
            raise StepError("Minimal satu uji harus terlihat siswa sebagai contoh.")
        return {
            **self.question(step),
            "mode": mode,
            "program": program,
            "solution": solution,
            "answers": answers,
            "tests": tests,
            "compare": compare,
        }

    def compile(self, step):
        public = {
            "text": step["text"],
            "image": step["image"],
            "mode": step["mode"],
            "program": step["program"],
            "compare": step["compare"],
            "blanks": len(step["answers"]),
            "examples": [
                {"inputs": t["inputs"], "expected": t["expected"]} for t in step["tests"] if not t["hidden"]
            ],
            "hidden_tests": sum(1 for t in step["tests"] if t["hidden"]),
        }
        key = {
            "tests": step["tests"],
            "solution": step["solution"],
            "answers": step["answers"],
            "explanation": step["explanation"],
        }
        return public, key

    def clean(self, public, response):
        if public["mode"] == "fill":
            blanks = response.get("blanks")
            if (
                not isinstance(blanks, list)
                or len(blanks) != public["blanks"]
                or not all(isinstance(b, str) and len(b) <= 300 for b in blanks)
            ):
                raise InvalidResponse()
            return {"blanks": blanks}
        try:
            return {"program": clean_program(response.get("program"), where="Program")}
        except ProgramError:
            raise InvalidResponse()

    def program_of(self, public, response):
        if public["mode"] == "fill":
            return fill_blanks(public["program"], response["blanks"])
        return response["program"]

    def grade(self, public, key, response):
        program = self.program_of(public, response)
        started = time.monotonic()
        detail, feedback = [], []
        for number_, test in enumerate(key["tests"], start=1):
            if time.monotonic() - started > GRADE_BUDGET:
                result = {"ok": False, "out": [], "error": "Waktu pemeriksaan habis."}
            else:
                [result] = check_tests(program, [test], key.get("compare") or public["compare"])
            if test["hidden"]:
                detail.append({"ok": result["ok"], "hidden": True})
                if not result["ok"] and not feedback:
                    feedback.append(
                        f"Uji {number_} (tersembunyi) belum lolos. Coba programmu dengan isian lain, "
                        "misalnya angka nol, negatif, atau batas syarat."
                    )
                continue
            detail.append(
                {
                    "ok": result["ok"],
                    "hidden": False,
                    "inputs": test["inputs"],
                    "expected": test["expected"],
                    "out": result["out"][-30:],
                    "error": result["error"],
                }
            )
            if not result["ok"] and not feedback:
                isian = f" (isian: {', '.join(test['inputs'])})" if test["inputs"] else ""
                got = f"galat: {result['error']}" if result["error"] else _summary(result["out"])
                feedback.append(
                    f"Uji {number_}{isian}: seharusnya berakhir dengan '{_summary(test['expected'])}', "
                    f"programmu: '{got}'."
                )
        correct = all(item["ok"] for item in detail)
        return correct, detail, feedback

    def key_display(self, public, key):
        if public["mode"] == "fill":
            return {"blanks": key["answers"]}
        return {"program": key["solution"]} if key.get("solution") else {}

    def answer_text(self, public, response):
        if public["mode"] == "fill":
            return " | ".join(response.get("blanks", []))[:500]
        return f"program {node_count(response.get('program') or {})} blok"


@register
class FlowgorithmDemoStep(StepKind):
    kind, label = "flowgorithm_demo", "Flowgorithm (demo/lab)"

    def validate(self, step):
        return {
            "body": step_kinds.text(step.get("body"), "Keterangan", step_kinds.MAX_TEXT),
            "program": _program(step.get("program") or {"body": []}, "Program"),
            "inputs": _lines(step.get("inputs"), "Contoh isian", MAX_INPUTS, 200),
            "editable": bool(step.get("editable")),
        }


def predicted_output(program, inputs, show):
    """Output yang tampil, dalam bentuk pilihan jawaban (sama dengan aturan media acuan)."""
    result = run_program(program, inputs)
    if result["error"]:
        return f"Error: {result['error']}"
    if not result["out"]:
        return "Tidak ada yang tampil"
    return result["out"][-1] if show == "last" else ", ".join(result["out"])


@register
class FlowgorithmPredictStep(ChoiceStep):
    kind, label = "flowgorithm_predict", "Flowgorithm (tebak output)"

    def validate(self, step):
        program = _program(step.get("program") or {"body": []}, "Program")
        if not program["body"]:
            raise StepError("Program masih kosong.")
        inputs = _lines(step.get("inputs"), "Isian", MAX_INPUTS, 200)
        show = step.get("show") or "all"
        if show not in ("all", "last"):
            raise StepError("Yang ditebak harus 'all' (semua output) atau 'last' (baris terakhir).")
        answer = predicted_output(program, inputs, show)
        wrong = []
        for text in _lines(step.get("wrong"), "Pilihan salah", 5, 300):
            text = text.strip()
            # Dibandingkan persis (huruf besar/kecil bermakna di output program).
            if text and text != answer and text not in wrong:
                wrong.append(text)
        if not wrong:
            raise StepError("Isi minimal satu pilihan salah (yang berbeda dari output sebenarnya).")
        choices = [{"text": answer, "why": ""}] + [{"text": text, "why": ""} for text in wrong]
        cleaned = super().validate({**step, "choices": choices, "correct": 0})
        return {**cleaned, "program": program, "inputs": inputs, "show": show, "wrong": wrong}

    def compile(self, step):
        return super().compile({k: v for k, v in step.items() if k != "wrong"})
