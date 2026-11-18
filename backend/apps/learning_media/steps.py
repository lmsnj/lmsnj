"""Jenis langkah Media Pembelajaran Interaktif (MPI) dan kontrak plugin.

Setiap jenis langkah adalah satu kelas `StepKind`. Guru menulis rancangan langkah (JSON); saat media
diterbitkan rancangan itu "dikompilasi" menjadi:
- public : isi langkah yang BOLEH dikirim ke siswa (tanpa kunci jawaban),
- key    : kunci + umpan balik per pilihan salah, hanya tersimpan di server.

Pilihan diberi id acak saat terbit (urutan rancangan sering menaruh jawaban benar di pilihan pertama),
lalu urutannya diacak per siswa dengan seed tetap, jadi sama di HP dan laptop.

Plugin mapel (mis. Flowgorithm, simulator exposure DKV) cukup membuat subkelas `StepKind` lalu memanggil
`register(...)`. Semua metode murni (tanpa database) agar mudah diuji.
"""

import random
import re
import secrets

from rest_framework.exceptions import ValidationError

from apps.assessments import interactive

ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
MAX_TEXT = 10_000
MAX_SHORT = 500
MAX_HINTS = 3


class StepError(ValueError):
    """Rancangan langkah tidak valid. Pesannya ditampilkan ke guru (Bahasa Indonesia)."""


class InvalidResponse(ValueError):
    """Bentuk jawaban siswa tidak sesuai langkahnya."""


# ---------------------------------------------------------------- alat bantu


def new_id():
    return secrets.token_hex(4)


def shuffled(items, seed):
    items = list(items)
    random.Random(str(seed)).shuffle(items)
    return items


def text(value, name, limit=MAX_SHORT, required=False):
    if value is None:
        value = ""
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        raise StepError(f"{name} harus berupa teks.")
    value = str(value).strip()
    if len(value) > limit:
        raise StepError(f"{name} maksimal {limit} karakter.")
    if required and not value:
        raise StepError(f"{name} wajib diisi.")
    return value


def text_list(values, name, minimum=0, maximum=10, limit=MAX_SHORT):
    if values is None:
        values = []
    if not isinstance(values, list):
        raise StepError(f"{name} harus berupa daftar.")
    values = [text(v, name, limit) for v in values]
    values = [v for v in values if v]
    if not minimum <= len(values) <= maximum:
        raise StepError(f"{name}: isi {minimum} sampai {maximum} butir.")
    return values


def object_list(values, name, minimum, maximum):
    if not isinstance(values, list) or not minimum <= len(values) <= maximum:
        raise StepError(f"{name}: isi {minimum} sampai {maximum} butir.")
    if any(not isinstance(v, dict) for v in values):
        raise StepError(f"{name} tidak valid.")
    return values


def number(value, name, minimum, maximum, default=None):
    if value in (None, "") and default is not None:
        return default
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= maximum:
        raise StepError(f"{name} harus angka {minimum}-{maximum}.")
    return value


def _interactive_message(error):
    detail = error.detail.get("spec") if isinstance(error.detail, dict) else error.detail
    return str(detail[0] if isinstance(detail, list) else detail)


# ---------------------------------------------------------------- kontrak


class StepKind:
    """Kontrak satu jenis langkah.

    kind    : nama jenis (disimpan di langkah sebagai "kind").
    label   : nama untuk guru.
    graded  : True = latihan yang dinilai (menentukan bintang); False = penjelasan.
    """

    kind = ""
    label = ""
    graded = False

    def validate(self, step):
        """Rancangan -> rancangan bersih (field khusus jenis ini saja). Raise StepError jika salah."""
        return {}

    def compile(self, step):
        """Rancangan bersih -> (public, key). Penjelasan: key = None."""
        return dict(step), None

    def student(self, public, seed):
        """Isi untuk siswa (mis. acak urutan pilihan)."""
        return public

    def clean(self, public, response):
        """Periksa bentuk jawaban; raise InvalidResponse jika tidak cocok."""
        raise InvalidResponse()

    def grade(self, public, key, response):
        """-> (benar: bool, rincian, umpan_balik: [teks "kenapa salah"])."""
        raise NotImplementedError

    def key_display(self, public, key):
        """Jawaban benar untuk ditampilkan (tombol "Tunjukkan jawaban" / setelah benar)."""
        return {}

    def answer_text(self, public, response):
        """Ringkasan jawaban untuk analisis kesulitan di laporan guru."""
        return ""


KINDS = {}


def register(kind_class):
    """Daftarkan jenis langkah (dipakai juga oleh plugin mapel)."""
    instance = kind_class()
    KINDS[instance.kind] = instance
    return kind_class


def get_kind(name):
    kind = KINDS.get(name)
    if kind is None:
        raise StepError(f"Jenis langkah '{name}' tidak dikenal.")
    return kind


# ---------------------------------------------------------------- penjelasan


@register
class TextStep(StepKind):
    kind, label = "text", "Teks & gambar"

    def validate(self, step):
        return {
            "body": text(step.get("body"), "Isi", MAX_TEXT, required=not step.get("image")),
            "image": text(step.get("image"), "Gambar"),
            "caption": text(step.get("caption"), "Keterangan gambar"),
        }


@register
class DidYouKnowStep(TextStep):
    kind, label = "did_you_know", "Tahukah kamu?"


@register
class DialogStep(StepKind):
    kind, label = "dialog", "Dialog maskot"
    SPEAKERS = ("mascot", "student", "narrator")
    MOODS = ("", "happy", "think", "oops", "wow")

    def validate(self, step):
        lines = []
        for number_, line in enumerate(object_list(step.get("lines"), "Baris dialog", 1, 20), start=1):
            speaker = line.get("speaker") or "mascot"
            mood = line.get("mood") or ""
            if speaker not in self.SPEAKERS or mood not in self.MOODS:
                raise StepError(f"Baris dialog {number_}: pembicara/ekspresi tidak dikenal.")
            lines.append(
                {"speaker": speaker, "mood": mood, "text": text(line.get("text"), "Teks dialog", 2000, True)}
            )
        return {"lines": lines, "image": text(step.get("image"), "Gambar")}


@register
class VideoStep(StepKind):
    kind, label = "video", "Video"

    def validate(self, step):
        url = text(step.get("url"), "Alamat video", required=True)
        if not url.startswith(("https://", "http://", "asset:")):
            raise StepError("Alamat video harus diawali https:// (YouTube/Drive) atau berupa video unggahan.")
        return {
            "url": url,
            "start": number(step.get("start"), "Mulai (detik)", 0, 6 * 3600, default=0),
            "body": text(step.get("body"), "Keterangan", MAX_TEXT),
        }


@register
class FlipCardsStep(StepKind):
    kind, label = "flip_cards", "Kartu bolak-balik"

    def validate(self, step):
        cards = []
        for card in object_list(step.get("cards"), "Kartu", 1, 20):
            cards.append(
                {
                    "front": text(card.get("front"), "Sisi depan", 1000, True),
                    "back": text(card.get("back"), "Sisi belakang", 2000, True),
                }
            )
        return {"cards": cards}


@register
class FlashcardsStep(FlipCardsStep):
    kind, label = "flashcards", "Flashcard"


@register
class WorkedExampleStep(StepKind):
    kind, label = "worked_example", "Contoh langkah demi langkah"

    def validate(self, step):
        parts = []
        for part in object_list(step.get("steps"), "Langkah contoh", 1, 15):
            parts.append(
                {
                    "text": text(part.get("text"), "Langkah contoh", 2000, True),
                    "explain": text(part.get("explain"), "Penjelasan", 2000),
                }
            )
        return {"body": text(step.get("body"), "Soal contoh", MAX_TEXT), "steps": parts}


# ---------------------------------------------------------------- latihan


class GradedStep(StepKind):
    graded = True

    def question(self, step, required=True):
        return {
            "text": text(step.get("text"), "Pertanyaan", MAX_TEXT, required),
            "image": text(step.get("image"), "Gambar"),
            "explanation": text(step.get("explanation"), "Pembahasan", MAX_TEXT),
        }

    @staticmethod
    def split(step):
        """Pembahasan hanya dikirim setelah siswa benar / membuka jawaban."""
        public = {k: v for k, v in step.items() if k != "explanation"}
        return public, step.get("explanation", "")


@register
class ChoiceStep(GradedStep):
    kind, label = "choice", "Pilihan ganda"

    def validate(self, step):
        choices = []
        for choice in object_list(step.get("choices"), "Pilihan", 2, 6):
            choices.append(
                {
                    "text": text(choice.get("text"), "Pilihan", 1000, True),
                    "why": text(choice.get("why"), "Alasan"),
                }
            )
        correct = step.get("correct")
        if isinstance(correct, bool) or not isinstance(correct, int) or not 0 <= correct < len(choices):
            raise StepError("Tandai satu pilihan sebagai jawaban benar.")
        if len({c["text"].casefold() for c in choices}) != len(choices):
            raise StepError("Pilihan tidak boleh ada yang sama.")
        return {**self.question(step), "choices": choices, "correct": correct}

    def compile(self, step):
        base, explanation = self.split({k: v for k, v in step.items() if k not in ("choices", "correct")})
        ids = [new_id() for _ in step["choices"]]
        public = {**base, "choices": [{"id": i, "text": c["text"]} for i, c in zip(ids, step["choices"])]}
        key = {
            "correct": ids[step["correct"]],
            "why": {i: c["why"] for i, c in zip(ids, step["choices"]) if c["why"]},
            "explanation": explanation,
        }
        return public, key

    def student(self, public, seed):
        return {**public, "choices": shuffled(public["choices"], seed)}

    def clean(self, public, response):
        choice = response.get("choice")
        if choice not in {c["id"] for c in public["choices"]}:
            raise InvalidResponse()
        return {"choice": choice}

    def grade(self, public, key, response):
        correct = response["choice"] == key["correct"]
        feedback = [] if correct else [key["why"].get(response["choice"], "")]
        return correct, correct, [f for f in feedback if f]

    def key_display(self, public, key):
        return {"choice": key["correct"]}

    def answer_text(self, public, response):
        return next((c["text"] for c in public["choices"] if c["id"] == response.get("choice")), "")


@register
class TrueFalseStep(GradedStep):
    kind, label = "true_false", "Benar / salah"

    def validate(self, step):
        if not isinstance(step.get("answer"), bool):
            raise StepError("Pilih kunci: Benar atau Salah.")
        return {
            **self.question(step),
            "answer": step["answer"],
            "why_true": text(step.get("why_true"), "Alasan jika menjawab Benar"),
            "why_false": text(step.get("why_false"), "Alasan jika menjawab Salah"),
        }

    def compile(self, step):
        public, explanation = self.split(
            {k: v for k, v in step.items() if k not in ("answer", "why_true", "why_false")}
        )
        key = {
            "answer": step["answer"],
            "why": {"true": step["why_true"], "false": step["why_false"]},
            "explanation": explanation,
        }
        return public, key

    def clean(self, public, response):
        if not isinstance(response.get("answer"), bool):
            raise InvalidResponse()
        return {"answer": response["answer"]}

    def grade(self, public, key, response):
        correct = response["answer"] == key["answer"]
        why = key["why"]["true" if response["answer"] else "false"]
        return correct, correct, [] if correct or not why else [why]

    def key_display(self, public, key):
        return {"answer": key["answer"]}

    def answer_text(self, public, response):
        return "Benar" if response.get("answer") else "Salah"


@register
class OrderingStep(GradedStep):
    kind, label = "ordering", "Urutkan langkah"

    def validate(self, step):
        items = text_list(step.get("items"), "Butir urutan", 2, 10, 1000)
        if len({i.casefold() for i in items}) != len(items):
            raise StepError("Butir urutan tidak boleh ada yang sama.")
        return {**self.question(step, required=False), "items": items, "why": text(step.get("why"), "Alasan")}

    def compile(self, step):
        public, explanation = self.split({k: v for k, v in step.items() if k not in ("items", "why")})
        items = [{"id": new_id(), "text": item} for item in step["items"]]
        public["items"] = items
        return public, {"order": [i["id"] for i in items], "why": step["why"], "explanation": explanation}

    def student(self, public, seed):
        items = public["items"]
        mixed = shuffled(items, seed)
        if mixed == items:  # jangan pernah tampil sudah benar
            mixed = items[1:] + items[:1]
        return {**public, "items": mixed}

    def clean(self, public, response):
        order = response.get("order")
        ids = [i["id"] for i in public["items"]]
        if not isinstance(order, list) or sorted(order) != sorted(ids):
            raise InvalidResponse()
        return {"order": order}

    def grade(self, public, key, response):
        detail = [given == want for given, want in zip(response["order"], key["order"])]
        correct = all(detail)
        return correct, detail, [] if correct or not key["why"] else [key["why"]]

    def key_display(self, public, key):
        return {"order": key["order"]}

    def answer_text(self, public, response):
        names = {i["id"]: i["text"] for i in public["items"]}
        return " → ".join(names.get(i, "?") for i in response.get("order", []))


@register
class CategorizeStep(GradedStep):
    kind, label = "categorize", "Kelompokkan ke wadah"

    def validate(self, step):
        categories = text_list(step.get("categories"), "Wadah", 2, 4, 100)
        items = []
        for item in object_list(step.get("items"), "Butir", 2, 12):
            category = item.get("category")
            if (
                isinstance(category, bool)
                or not isinstance(category, int)
                or not 0 <= category < len(categories)
            ):
                raise StepError("Setiap butir harus punya wadah yang benar.")
            items.append(
                {
                    "text": text(item.get("text"), "Butir", 500, True),
                    "category": category,
                    "why": text(item.get("why"), "Alasan"),
                }
            )
        return {**self.question(step, required=False), "categories": categories, "items": items}

    def compile(self, step):
        public, explanation = self.split({k: v for k, v in step.items() if k not in ("categories", "items")})
        categories = [{"id": new_id(), "label": label} for label in step["categories"]]
        items = [{"id": new_id(), "text": item["text"]} for item in step["items"]]
        public.update(categories=categories, items=items)
        key = {
            "items": {i["id"]: categories[raw["category"]]["id"] for i, raw in zip(items, step["items"])},
            "why": {i["id"]: raw["why"] for i, raw in zip(items, step["items"]) if raw["why"]},
            "explanation": explanation,
        }
        return public, key

    def student(self, public, seed):
        return {**public, "items": shuffled(public["items"], seed)}

    def clean(self, public, response):
        given = response.get("items")
        items = {i["id"] for i in public["items"]}
        categories = {c["id"] for c in public["categories"]}
        if not isinstance(given, dict) or set(given) != items or not set(given.values()) <= categories:
            raise InvalidResponse()
        return {"items": given}

    def grade(self, public, key, response):
        detail = {item: response["items"][item] == want for item, want in key["items"].items()}
        feedback = [key["why"][item] for item, ok in detail.items() if not ok and item in key["why"]]
        return all(detail.values()), detail, feedback

    def key_display(self, public, key):
        return {"items": key["items"]}

    def answer_text(self, public, response):
        labels = {c["id"]: c["label"] for c in public["categories"]}
        names = {i["id"]: i["text"] for i in public["items"]}
        return "; ".join(f"{names[i]} → {labels.get(c, '?')}" for i, c in response.get("items", {}).items())


@register
class HotspotStep(GradedStep):
    kind, label = "hotspot", "Ketuk bagian gambar"

    def validate(self, step):
        image = text(step.get("image"), "Gambar")
        areas = []
        for number_, area in enumerate(object_list(step.get("areas"), "Bagian gambar", 2, 12), start=1):
            box = {}
            for field in ("x", "y", "w", "h"):
                box[field] = number(area.get(field), f"Bagian {number_} ({field})", 0, 100)
            areas.append(
                {
                    **box,
                    "label": text(area.get("label"), "Nama bagian", 100),
                    "correct": bool(area.get("correct")),
                    "why": text(area.get("why"), "Alasan"),
                }
            )
        if not any(a["correct"] for a in areas):
            raise StepError("Tandai minimal satu bagian gambar sebagai jawaban benar.")
        return {
            **self.question(step),
            "image": image,
            "areas": areas,
            "show_labels": bool(step.get("show_labels", True)),
        }

    def compile(self, step):
        public, explanation = self.split({k: v for k, v in step.items() if k != "areas"})
        ids = [new_id() for _ in step["areas"]]
        public["areas"] = [
            {"id": i, **{f: a[f] for f in ("x", "y", "w", "h", "label")}} for i, a in zip(ids, step["areas"])
        ]
        key = {
            "correct": [i for i, a in zip(ids, step["areas"]) if a["correct"]],
            "why": {i: a["why"] for i, a in zip(ids, step["areas"]) if a["why"]},
            "explanation": explanation,
        }
        return public, key

    def student(self, public, seed):
        if public.get("show_labels"):
            return public
        return {**public, "areas": [{k: v for k, v in a.items() if k != "label"} for a in public["areas"]]}

    def clean(self, public, response):
        if response.get("area") not in {a["id"] for a in public["areas"]}:
            raise InvalidResponse()
        return {"area": response["area"]}

    def grade(self, public, key, response):
        correct = response["area"] in key["correct"]
        why = key["why"].get(response["area"], "")
        return correct, correct, [] if correct or not why else [why]

    def key_display(self, public, key):
        return {"areas": key["correct"]}

    def answer_text(self, public, response):
        area = next((a for a in public["areas"] if a["id"] == response.get("area")), None)
        return (area or {}).get("label") or "(bagian lain)"


class InteractiveStep(GradedStep):
    """Isian rumpang, tarik & lepas, menjodohkan: memakai komponen soal interaktif Asesmen
    (apps/assessments/interactive.py) agar tidak ada dua versi pemeriksaan."""

    part = ""

    def validate(self, step):
        try:
            spec, _, _ = interactive.checkpoint_part("BUILDERS", self.part)(step)
        except ValidationError as error:
            raise StepError(_interactive_message(error))
        return {
            **self.question(step, required=self.part == "matching"),
            **spec,
            "why": text(step.get("why"), "Alasan"),
        }

    def compile(self, step):
        spec = {k: v for k, v in step.items() if k not in ("text", "image", "explanation", "why")}
        _, content, key = interactive.checkpoint_part("BUILDERS", self.part)(spec)
        public = {"text": step["text"], "image": step["image"], **content}
        return public, {**key, "why": step["why"], "explanation": step["explanation"]}

    def student(self, public, seed):
        builder = interactive.STUDENT_CONTENT.get(self.part)
        if builder is None:
            return public
        owner = type("Owner", (), {"id": "mpi"})()
        return {**public, **builder(owner, public, seed, {})}

    def clean(self, public, response):
        try:
            return interactive.checkpoint_part("CLEANERS", self.part)(public, response)
        except interactive.InvalidResponse:
            raise InvalidResponse()

    def grade(self, public, key, response):
        grader = interactive.checkpoint_part("GRADERS", self.part)
        _, detail = grader(public, key, response, 1, "all_or_nothing")
        correct = interactive.all_correct(detail)
        return correct, detail, [] if correct or not key.get("why") else [key["why"]]

    def key_display(self, public, key):
        return interactive.checkpoint_part("KEY_DISPLAYS", self.part)(public, key)


@register
class FillBlankStep(InteractiveStep):
    kind, label, part = "fill_blank", "Isian rumpang", "fill_blank"

    def answer_text(self, public, response):
        return " | ".join(response.get("gaps", []))


@register
class DragDropStep(InteractiveStep):
    kind, label, part = "drag_drop", "Tarik & lepas", "drag_drop"

    def answer_text(self, public, response):
        names = {o["id"]: o["text"] for o in public.get("options", [])}
        return " | ".join(names.get(g, "-") for g in response.get("gaps", []))


@register
class MatchingStep(InteractiveStep):
    kind, label, part = "matching", "Pasangkan", "matching"

    def answer_text(self, public, response):
        left = {o["id"]: o["text"] for o in public.get("left", [])}
        right = {o["id"]: o["text"] for o in public.get("right", [])}
        return "; ".join(
            f"{left.get(a, '?')} → {right.get(b, '?')}" for a, b in response.get("pairs", {}).items()
        )
