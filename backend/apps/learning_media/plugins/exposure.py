"""Plugin contoh mapel DKV: simulator exposure (segitiga exposure: bukaan, shutter, ISO).

Siswa memilih bukaan (angka f), kecepatan shutter, dan ISO. Seperti kamera sungguhan, pemutar menampilkan
light meter (terang/gelap) dari `scene` yang boleh diketahui siswa. Yang dinilai di server:
1) exposure tepat: selisih terang dengan pengaturan acuan guru <= toleransi (stop);
2) syarat kreatif (kunci, tidak dikirim ke siswa): shutter cukup cepat untuk objek bergerak, bukaan lebar
   untuk latar blur / sempit untuk pemandangan tajam, ISO tidak terlalu tinggi (noise).

Plugin ini sengaja kecil: contoh cara mapel lain menambah jenis langkah tanpa mengubah inti MPI.
"""

import math

from .. import steps as step_kinds
from ..steps import GradedStep, InvalidResponse, StepError, register

APERTURES = [1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16, 22]
SHUTTERS = [
    1 / 4000,
    1 / 2000,
    1 / 1000,
    1 / 500,
    1 / 250,
    1 / 125,
    1 / 60,
    1 / 30,
    1 / 15,
    1 / 8,
    1 / 4,
    1 / 2,
    1,
]
ISOS = [100, 200, 400, 800, 1600, 3200, 6400]


def shutter_label(seconds):
    return f"1/{round(1 / seconds)}" if seconds < 1 else f"{seconds:g}"


def light(aperture, shutter, iso):
    """Banyak cahaya yang direkam (skala log2/stop). Lebih besar = foto lebih terang."""
    return math.log2(shutter * iso / (aperture * aperture))


def _pick(value, options, name):
    for option in options:
        if (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isclose(value, option, rel_tol=1e-6)
        ):
            return option
    raise StepError(f"{name} harus salah satu pilihan yang tersedia.")


def _optional(value, options, name):
    return None if value in (None, "") else _pick(value, options, name)


@register
class ExposureStep(GradedStep):
    kind, label = "exposure", "Simulator exposure (DKV)"

    def validate(self, step):
        target = step.get("target") or {}
        if not isinstance(target, dict):
            raise StepError("Isi pengaturan acuan (bukaan, shutter, ISO).")
        clean_target = {
            "aperture": _pick(target.get("aperture"), APERTURES, "Bukaan acuan"),
            "shutter": _pick(target.get("shutter"), SHUTTERS, "Shutter acuan"),
            "iso": _pick(target.get("iso"), ISOS, "ISO acuan"),
        }
        rules = step.get("rules") or {}
        clean_rules = {
            "slowest_shutter": _optional(rules.get("slowest_shutter"), SHUTTERS, "Shutter paling lambat"),
            "max_aperture": _optional(rules.get("max_aperture"), APERTURES, "Angka f paling besar"),
            "min_aperture": _optional(rules.get("min_aperture"), APERTURES, "Angka f paling kecil"),
            "max_iso": _optional(rules.get("max_iso"), ISOS, "ISO paling tinggi"),
        }
        tolerance = step_kinds.number(step.get("tolerance"), "Toleransi (stop)", 0.3, 2, default=0.5)
        candidate = clean_target
        problems = self.rule_problems(candidate, clean_rules)
        if problems:
            raise StepError(f"Pengaturan acuan melanggar syaratnya sendiri: {problems[0]}")
        return {
            **self.question(step),
            "target": clean_target,
            "rules": clean_rules,
            "tolerance": tolerance,
        }

    @staticmethod
    def rule_problems(setting, rules):
        problems = []
        if rules.get("slowest_shutter") and setting["shutter"] > rules["slowest_shutter"] * (1 + 1e-6):
            problems.append(
                f"Shutter terlalu lambat, objek bisa kabur. Pakai {shutter_label(rules['slowest_shutter'])} "
                "detik atau lebih cepat."
            )
        if rules.get("max_aperture") and setting["aperture"] > rules["max_aperture"]:
            problems.append(
                f"Bukaan kurang lebar untuk latar yang blur. Pakai f/{rules['max_aperture']:g} atau angka f lebih kecil."
            )
        if rules.get("min_aperture") and setting["aperture"] < rules["min_aperture"]:
            problems.append(
                f"Bukaan terlalu lebar, tidak semua bagian tajam. Pakai f/{rules['min_aperture']:g} atau angka f lebih besar."
            )
        if rules.get("max_iso") and setting["iso"] > rules["max_iso"]:
            problems.append(
                f"ISO terlalu tinggi, foto akan berbintik (noise). Maksimal ISO {rules['max_iso']}."
            )
        return problems

    def compile(self, step):
        target = step["target"]
        public = {
            "text": step["text"],
            "image": step["image"],
            "apertures": APERTURES,
            "shutters": SHUTTERS,
            "isos": ISOS,
            # Terang adegan (seperti light meter kamera); bukan jawaban karena syarat kreatif tetap harus dipenuhi.
            "scene": light(target["aperture"], target["shutter"], target["iso"]),
            "tolerance": step["tolerance"],
        }
        key = {"target": target, "rules": step["rules"], "explanation": step["explanation"]}
        return public, key

    def clean(self, public, response):
        try:
            return {
                "aperture": _pick(response.get("aperture"), public["apertures"], "Bukaan"),
                "shutter": _pick(response.get("shutter"), public["shutters"], "Shutter"),
                "iso": _pick(response.get("iso"), public["isos"], "ISO"),
            }
        except StepError:
            raise InvalidResponse()

    def grade(self, public, key, response):
        difference = light(response["aperture"], response["shutter"], response["iso"]) - public["scene"]
        feedback = []
        exposure_ok = abs(difference) <= public["tolerance"] + 1e-9
        if not exposure_ok:
            if difference > 0:
                feedback.append(
                    f"Foto terlalu terang (lebih {difference:.1f} stop). Perkecil bukaan (angka f lebih besar), "
                    "percepat shutter, atau turunkan ISO."
                )
            else:
                feedback.append(
                    f"Foto terlalu gelap (kurang {-difference:.1f} stop). Perlebar bukaan (angka f lebih kecil), "
                    "perlambat shutter, atau naikkan ISO."
                )
        problems = self.rule_problems(response, key["rules"])
        feedback += problems
        detail = {"exposure": exposure_ok, "difference": round(difference, 2), "rules": not problems}
        return not feedback, detail, feedback

    def key_display(self, public, key):
        return {"setting": key["target"]}

    def answer_text(self, public, response):
        return f"f/{response.get('aperture'):g}, {shutter_label(response.get('shutter') or 1)} s, ISO {response.get('iso')}"
