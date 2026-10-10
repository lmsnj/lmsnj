"""Soal interaktif: isian singkat, tarik & lepas, menjodohkan, dan video interaktif.

Guru mengirim `spec` (rancangan soal, mis. kalimat berisi [[jawaban]]). Dari spec dibuat:
- content    : isi soal yang BOLEH dilihat siswa (tanpa jawaban).
- answer_key : kunci jawaban + spec asli (agar soal bisa diubah lagi). Tidak pernah dikirim ke siswa
               selama mengerjakan; penilaian selalu di server.

Pilihan/item diberi id acak sehingga id dan urutan tidak membocorkan kunci. Urutan untuk siswa diacak
di server dengan seed = id pengerjaan, jadi tetap sama saat halaman dimuat ulang.

Mode skor: "partial" = poin x (celah/pasangan benar / jumlah celah/pasangan), "all_or_nothing" = poin
penuh hanya jika semuanya benar. Video interaktif = jumlah poin semua checkpoint.

Semua fungsi `grade_*` murni (tanpa database) agar mudah diuji.
"""

import random
import re
import secrets
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import parse_qs, urlparse

from rest_framework.exceptions import ValidationError

from .models import QuestionKind, ScoringMode

GAP_RE = re.compile(r"\[\[(.*?)\]\]", re.DOTALL)
MAX_TEMPLATE = 5000
MAX_GAPS = 20
MAX_ANSWER_LENGTH = 200
MAX_DISTRACTORS = 10
MAX_PAIRS = 10
MAX_STATEMENT_LENGTH = 500
MAX_CHECKPOINTS = 20
MAX_CHOICES = 6
MAX_VIDEO_SECONDS = 6 * 3600
VIDEO_MODES = ("practice", "exam")
CHECKPOINT_KINDS = ("choice", QuestionKind.FILL_BLANK, QuestionKind.DRAG_DROP, QuestionKind.MATCHING)
YOUTUBE_ID_RE = re.compile(r"^[\w-]{6,20}$")

# Petunjuk bawaan jika guru tidak menulis pertanyaan.
DEFAULT_TEXT = {
    QuestionKind.FILL_BLANK: "Lengkapi kalimat berikut.",
    QuestionKind.DRAG_DROP: "Pindahkan jawaban yang tepat ke tempat yang kosong.",
    QuestionKind.MATCHING: "Pasangkan setiap pernyataan dengan jawaban yang tepat.",
    QuestionKind.INTERACTIVE_VIDEO: "Tonton video berikut dan jawab pertanyaan yang muncul.",
}


class InvalidResponse(ValueError):
    """Jawaban kiriman siswa tidak sesuai bentuk soal."""


def spec_error(message, field="spec"):
    return ValidationError({field: message})


# ---------------------------------------------------------------- alat bantu


def normalize(text, case_sensitive=False):
    """Spasi berlebih diabaikan; huruf besar/kecil diabaikan kecuali guru meminta peka huruf."""
    text = " ".join(str(text or "").split())
    return text if case_sensitive else text.casefold()


def parse_gaps(template):
    """'HTML singkatan dari [[HyperText|Hypertext]] Markup' -> (["HTML singkatan dari ", " Markup"],
    [["HyperText", "Hypertext"]]). Tanda | memisahkan jawaban alternatif yang juga benar."""
    parts, gaps, last = [], [], 0
    for match in GAP_RE.finditer(template):
        parts.append(template[last : match.start()])
        gaps.append([alt.strip() for alt in match.group(1).split("|") if alt.strip()])
        last = match.end()
    parts.append(template[last:])
    return parts, gaps


def new_id():
    return secrets.token_hex(4)


def shuffled(items, seed):
    items = list(items)
    random.Random(str(seed)).shuffle(items)
    return items


def score(correct, points, mode):
    """`correct` = daftar benar/salah per celah/pasangan -> poin (Decimal, 2 desimal)."""
    if not correct:
        return Decimal(0)
    points = Decimal(points)
    if mode == ScoringMode.ALL_OR_NOTHING:
        return points if all(correct) else Decimal(0)
    value = points * sum(1 for c in correct if c) / len(correct)
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _text(value, limit, name):
    if not isinstance(value, str):
        raise spec_error(f"{name} harus berupa teks.")
    value = value.strip()
    if len(value) > limit:
        raise spec_error(f"{name} maksimal {limit} karakter.")
    return value


def _template(spec):
    template = _text(spec.get("template", ""), MAX_TEMPLATE, "Kalimat soal")
    parts, gaps = parse_gaps(template)
    if not gaps:
        raise spec_error(
            "Tulis minimal satu jawaban di dalam [[...]], mis. Ibu kota Indonesia adalah [[Jakarta]]."
        )
    if any(not alternatives for alternatives in gaps):
        raise spec_error("Ada [[ ]] yang masih kosong. Tulis jawabannya di dalam kurung siku ganda.")
    if len(gaps) > MAX_GAPS:
        raise spec_error(f"Maksimal {MAX_GAPS} jawaban [[...]] dalam satu soal.")
    if any(len(answer) > MAX_ANSWER_LENGTH for alternatives in gaps for answer in alternatives):
        raise spec_error(f"Setiap jawaban maksimal {MAX_ANSWER_LENGTH} karakter.")
    return template, parts, gaps


# ---------------------------------------------------------------- isian singkat


def build_fill_blank(spec, **_):
    """spec: {"template": "... [[jawaban|alternatif]] ...", "case_sensitive": bool}"""
    template, parts, gaps = _template(spec)
    case_sensitive = bool(spec.get("case_sensitive"))
    content = {"parts": parts, "case_sensitive": case_sensitive}
    key = {"gaps": gaps}
    return {"template": template, "case_sensitive": case_sensitive}, content, key


def clean_fill_blank(content, response):
    """Jawaban: {"gaps": ["teks", ...]} (satu teks per celah, boleh kosong)."""
    count = len(content["parts"]) - 1
    gaps = response.get("gaps") or []
    if not isinstance(gaps, list) or len(gaps) > count:
        raise InvalidResponse()
    gaps = [g if isinstance(g, str) else "" if g is None else None for g in gaps]
    if None in gaps:
        raise InvalidResponse()
    return {"gaps": [g[:MAX_ANSWER_LENGTH] for g in gaps] + [""] * (count - len(gaps))}


def grade_fill_blank(content, key, response, points, mode):
    case_sensitive = content.get("case_sensitive", False)
    given = response.get("gaps") or []
    correct = []
    for index, alternatives in enumerate(key["gaps"]):
        answer = normalize(given[index] if index < len(given) else "", case_sensitive)
        accepted = {normalize(alt, case_sensitive) for alt in alternatives}
        correct.append(bool(answer) and answer in accepted)
    return score(correct, points, mode), correct


def fill_blank_key_display(content, key):
    return {"gaps": key["gaps"]}


# ---------------------------------------------------------------- tarik & lepas


def _id_list(values, allowed, count):
    """Daftar id pilihan per celah (None = kosong). Setiap pilihan hanya boleh dipakai sekali."""
    if not isinstance(values, list) or len(values) > count:
        raise InvalidResponse()
    values = values + [None] * (count - len(values))
    used = [v for v in values if v is not None]
    if any(not isinstance(v, str) or v not in allowed for v in used) or len(used) != len(set(used)):
        raise InvalidResponse()
    return values


def _distractors(spec, first_index, image_options):
    raw = spec.get("distractors") or []
    if not isinstance(raw, list) or len(raw) > MAX_DISTRACTORS:
        raise spec_error(f"Maksimal {MAX_DISTRACTORS} pilihan pengecoh.")
    distractors = []
    for offset, value in enumerate(raw):
        text = _text(value, MAX_ANSWER_LENGTH, "Pengecoh")
        if not text and first_index + offset not in image_options:
            raise spec_error(f"Pengecoh nomor {offset + 1} masih kosong. Isi teksnya atau beri gambar.")
        distractors.append(text)
    return distractors


def build_drag_drop(spec, image_options=(), **_):
    """spec: {"template": "... [[jawaban]] ...", "distractors": ["pengecoh", ...]}

    Pilihan = jawaban setiap celah (urutan celah) lalu pengecoh; gambar pilihan memakai urutan ini."""
    template, parts, gaps = _template(spec)
    if any(len(alternatives) > 1 for alternatives in gaps):
        raise spec_error("Tarik & lepas: satu jawaban per celah (tanda | hanya untuk isian singkat).")
    distractors = _distractors(spec, len(gaps), image_options)
    texts = [alternatives[0] for alternatives in gaps] + distractors
    options = [{"id": new_id(), "text": text} for text in texts]
    # Jawaban kembar (mis. dua celah "Jawa") boleh tertukar: pilihan bertuliskan sama juga benar.
    answers = [normalize(alternatives[0]) for alternatives in gaps]
    key_gaps = [
        [options[gap]["id"]]
        + [options[i]["id"] for i, a in enumerate(answers) if a == answers[gap] and i != gap]
        for gap in range(len(gaps))
    ]
    content = {"parts": parts, "options": options}
    return {"template": template, "distractors": distractors}, content, {"gaps": key_gaps}


def clean_drag_drop(content, response):
    """Jawaban: {"gaps": [id_pilihan | None, ...]} (satu per celah)."""
    allowed = {option["id"] for option in content["options"]}
    return {"gaps": _id_list(response.get("gaps") or [], allowed, len(content["parts"]) - 1)}


def grade_drag_drop(content, key, response, points, mode):
    given = response.get("gaps") or []
    correct = [index < len(given) and given[index] in accepted for index, accepted in enumerate(key["gaps"])]
    return score(correct, points, mode), correct


def drag_drop_key_display(content, key):
    # Pilihan milik celah itu sendiri (yang pertama di daftar).
    return {"gaps": [accepted[0] for accepted in key["gaps"]]}


def drag_drop_student_content(question, content, seed, images):
    options = [{**option, "image": images.get(index)} for index, option in enumerate(content["options"])]
    return {**content, "options": options if seed is None else shuffled(options, f"{seed}-{question.id}")}


# ---------------------------------------------------------------- menjodohkan


def build_matching(spec, **_):
    """spec: {"pairs": [{"left": "pernyataan", "right": "jawaban"}], "distractors": ["pengecoh kanan"]}"""
    raw = spec.get("pairs") or []
    if not isinstance(raw, list) or not 2 <= len(raw) <= MAX_PAIRS:
        raise spec_error(f"Isi 2 sampai {MAX_PAIRS} pasangan.")
    pairs = []
    for number, pair in enumerate(raw, start=1):
        if not isinstance(pair, dict):
            raise spec_error("Pasangan tidak valid.")
        left = _text(pair.get("left", ""), MAX_STATEMENT_LENGTH, "Pernyataan")
        right = _text(pair.get("right", ""), MAX_ANSWER_LENGTH, "Jawaban")
        if not left or not right:
            raise spec_error(f"Pasangan nomor {number} belum lengkap (isi kiri dan kanan).")
        pairs.append({"left": left, "right": right})
    distractors = _distractors(spec, 0, image_options=())
    if len({normalize(p["left"]) for p in pairs}) != len(pairs):
        raise spec_error("Pernyataan di kiri tidak boleh ada yang sama.")
    rights = [p["right"] for p in pairs] + distractors
    if len({normalize(r) for r in rights}) != len(rights):
        raise spec_error("Jawaban di kanan (termasuk pengecoh) tidak boleh ada yang sama.")
    left = [{"id": new_id(), "text": p["left"]} for p in pairs]
    right = [{"id": new_id(), "text": text} for text in rights]
    key = {"pairs": {left[i]["id"]: right[i]["id"] for i in range(len(pairs))}}
    return {"pairs": pairs, "distractors": distractors}, {"left": left, "right": right}, key


def clean_matching(content, response):
    """Jawaban: {"pairs": {id_kiri: id_kanan}}. Setiap jawaban kanan hanya boleh dipakai sekali."""
    pairs = response.get("pairs") or {}
    if not isinstance(pairs, dict):
        raise InvalidResponse()
    lefts = {item["id"] for item in content["left"]}
    rights = {item["id"] for item in content["right"]}
    pairs = {left: right for left, right in pairs.items() if right is not None}
    if any(left not in lefts or right not in rights for left, right in pairs.items()):
        raise InvalidResponse()
    if len(set(pairs.values())) != len(pairs):
        raise InvalidResponse()
    return {"pairs": pairs}


def grade_matching(content, key, response, points, mode):
    """Rincian: {id_kiri: benar/salah}."""
    given = response.get("pairs") or {}
    correct = {left: given.get(left) == right for left, right in key["pairs"].items()}
    return score(list(correct.values()), points, mode), correct


def matching_key_display(content, key):
    return {"pairs": key["pairs"]}


def matching_student_content(question, content, seed, images):
    if seed is None:
        return dict(content)
    return {
        "left": shuffled(content["left"], f"{seed}-{question.id}-kiri"),
        "right": shuffled(content["right"], f"{seed}-{question.id}-kanan"),
    }


# ---------------------------------------------------------------- video interaktif


def youtube_id(url):
    """ID video dari youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, /embed/ID, /live/ID."""
    try:
        parsed = urlparse(str(url).strip())
    except ValueError:
        return None
    host = (parsed.hostname or "").removeprefix("www.").removeprefix("m.")
    video_id = None
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "youtube-nocookie.com"):
        match = re.match(r"^/(embed|shorts|live)/([^/]+)", parsed.path)
        video_id = match.group(2) if match else (parse_qs(parsed.query).get("v") or [None])[0]
    return video_id if video_id and YOUTUBE_ID_RE.match(video_id) else None


def format_time(seconds):
    seconds = int(seconds)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def _number(value, name, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= maximum:
        raise spec_error(f"{name} harus berupa angka {minimum}-{maximum}.")
    return value


def build_choice(spec, **_):
    """Sub-soal pilihan ganda di checkpoint: {"choices": [...], "correct_choice": indeks}."""
    choices = spec.get("choices") or []
    if not isinstance(choices, list) or not 2 <= len(choices) <= MAX_CHOICES:
        raise spec_error(f"Isi 2 sampai {MAX_CHOICES} pilihan.")
    choices = [_text(choice, MAX_STATEMENT_LENGTH, "Pilihan") for choice in choices]
    if not all(choices):
        raise spec_error("Ada pilihan yang masih kosong.")
    correct = spec.get("correct_choice")
    if isinstance(correct, bool) or not isinstance(correct, int) or not 0 <= correct < len(choices):
        raise spec_error("Tandai satu pilihan sebagai jawaban benar.")
    return {"choices": choices, "correct_choice": correct}, {"choices": choices}, {"correct_choice": correct}


def clean_choice(content, response):
    choice = response.get("choice")
    if choice is not None and (
        isinstance(choice, bool) or not isinstance(choice, int) or not 0 <= choice < len(content["choices"])
    ):
        raise InvalidResponse()
    return {"choice": choice}


def grade_choice(content, key, response, points, mode):
    correct = response.get("choice") is not None and response.get("choice") == key["correct_choice"]
    return (Decimal(points) if correct else Decimal(0)), correct


def choice_key_display(content, key):
    return {"correct_choice": key["correct_choice"]}


def _checkpoint_part(table, kind):
    """Fungsi per jenis sub-soal checkpoint (pilihan ganda, isian, tarik & lepas, menjodohkan)."""
    return CHOICE_PARTS[table] if kind == "choice" else REGISTRY[table][kind]


def _first_message(error):
    detail = error.detail.get("spec") if isinstance(error.detail, dict) else error.detail
    message = str(detail[0] if isinstance(detail, list) else detail)
    return message[:1].lower() + message[1:]


def build_video(spec, **_):
    """spec: {"source": "youtube"|"file", "url", "duration", "allow_seek", "mode": "practice"|"exam",
    "checkpoints": [{"time": detik, "kind", "text", "points", "required", "explanation", ...sub-soal}]}

    Mengembalikan juga total poin (= poin soal)."""
    source = spec.get("source")
    if source == "youtube":
        url = _text(spec.get("url", ""), 500, "Link YouTube")
        video_id = youtube_id(url)
        if not video_id:
            raise spec_error(
                "Link YouTube tidak dikenali. Contoh: https://www.youtube.com/watch?v=..., "
                "https://youtu.be/..., atau https://www.youtube.com/shorts/..."
            )
        media, clean = {"source": "youtube", "youtube_id": video_id}, {"source": "youtube", "url": url}
    elif source == "file":
        media, clean = {"source": "file"}, {"source": "file"}
    else:
        raise spec_error("Pilih sumber video: link YouTube atau unggah file video.")

    duration = spec.get("duration")
    if duration is not None:
        duration = round(_number(duration, "Durasi video", 1, MAX_VIDEO_SECONDS), 1)
    mode = spec.get("mode") or "exam"
    if mode not in VIDEO_MODES:
        raise spec_error("Mode video harus latihan atau ujian.")
    allow_seek = bool(spec.get("allow_seek"))

    raw = spec.get("checkpoints") or []
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_CHECKPOINTS:
        raise spec_error(f"Tambahkan 1 sampai {MAX_CHECKPOINTS} checkpoint.")
    items = []
    for number, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise spec_error("Checkpoint tidak valid.")
        try:
            time = int(_number(item.get("time"), "Waktu", 0, MAX_VIDEO_SECONDS))
            if duration is not None and time > duration:
                raise spec_error(
                    f"Waktu {format_time(time)} melebihi durasi video ({format_time(duration)})."
                )
            kind = item.get("kind")
            if kind not in CHECKPOINT_KINDS:
                raise spec_error(
                    "Jenis sub-soal harus pilihan ganda, isian, tarik & lepas, atau menjodohkan."
                )
            text = _text(item.get("text", ""), 2000, "Pertanyaan")
            if not text and kind in ("choice", QuestionKind.MATCHING):
                raise spec_error("Tulis pertanyaannya.")
            points = int(_number(item.get("points", 1), "Poin", 1, 100))
            explanation = _text(item.get("explanation", ""), 2000, "Pembahasan")
            sub_spec, sub_content, sub_key = _checkpoint_part("BUILDERS", kind)(item)
        except ValidationError as error:
            raise spec_error(f"Checkpoint nomor {number}: {_first_message(error)}")
        required = bool(item.get("required", True))
        common = {"time": time, "kind": kind, "text": text, "points": points, "required": required}
        items.append(
            {
                "spec": {**common, "explanation": explanation, **sub_spec},
                "content": {"id": new_id(), **common, **sub_content},
                "key": {**sub_key, "explanation": explanation},
            }
        )
    times = [item["content"]["time"] for item in items]
    if len(set(times)) != len(times):
        raise spec_error("Dua checkpoint tidak boleh berada di detik yang sama.")
    total = sum(item["content"]["points"] for item in items)
    if total > 100:
        raise spec_error("Jumlah poin semua checkpoint maksimal 100.")
    items.sort(key=lambda item: item["content"]["time"])

    settings = {"duration": duration, "allow_seek": allow_seek, "mode": mode}
    clean_spec = {**clean, **settings, "checkpoints": [item["spec"] for item in items]}
    content = {**media, **settings, "checkpoints": [item["content"] for item in items]}
    key = {"checkpoints": {item["content"]["id"]: item["key"] for item in items}}
    return clean_spec, content, key, total


def find_checkpoint(content, checkpoint_id):
    return next((cp for cp in content.get("checkpoints", []) if cp["id"] == checkpoint_id), None)


def clean_checkpoint(checkpoint, response):
    if response in (None, ""):
        response = {}
    if not isinstance(response, dict):
        raise InvalidResponse()
    return _checkpoint_part("CLEANERS", checkpoint["kind"])(checkpoint, response)


def clean_video(content, response):
    """Jawaban: {"checkpoints": {id: jawaban sub-soal}, "skipped": [id checkpoint opsional],
    "position": detik terjauh yang sudah ditonton (untuk melanjutkan setelah halaman dimuat ulang)}."""
    answers = response.get("checkpoints") or {}
    skipped = response.get("skipped") or []
    position = response.get("position") or 0
    if not isinstance(answers, dict) or not isinstance(skipped, list):
        raise InvalidResponse()
    if isinstance(position, bool) or not isinstance(position, (int, float)) or position < 0:
        raise InvalidResponse()
    clean = {}
    for checkpoint_id, answer in answers.items():
        checkpoint = find_checkpoint(content, checkpoint_id)
        if checkpoint is None:
            raise InvalidResponse()
        clean[checkpoint_id] = clean_checkpoint(checkpoint, answer)
    optional = {cp["id"] for cp in content["checkpoints"] if not cp.get("required", True)}
    if any(cp not in optional for cp in skipped):
        raise InvalidResponse()
    return {"checkpoints": clean, "skipped": list(dict.fromkeys(skipped)), "position": round(position, 1)}


def grade_checkpoint(checkpoint, key, response, mode):
    grader = _checkpoint_part("GRADERS", checkpoint["kind"])
    return grader(checkpoint, key, response or {}, checkpoint["points"], mode)


def grade_video(content, key, response, points, mode):
    """Total = jumlah poin semua checkpoint. Rincian: {id: {"correct": rincian sub-soal, "points"}}."""
    answers = response.get("checkpoints") or {}
    total, detail = Decimal(0), {}
    for checkpoint in content["checkpoints"]:
        cp_key = key["checkpoints"][checkpoint["id"]]
        earned, correct = grade_checkpoint(checkpoint, cp_key, answers.get(checkpoint["id"]), mode)
        total += earned
        detail[checkpoint["id"]] = {"correct": correct, "points": float(earned)}
    return total, detail


def video_key_display(content, key):
    result = {}
    for checkpoint in content["checkpoints"]:
        cp_key = key["checkpoints"][checkpoint["id"]]
        display = _checkpoint_part("KEY_DISPLAYS", checkpoint["kind"])(checkpoint, cp_key)
        result[checkpoint["id"]] = {**display, "explanation": cp_key.get("explanation", "")}
    return {"checkpoints": result}


def all_correct(detail):
    if isinstance(detail, dict):
        return bool(detail) and all(detail.values())
    if isinstance(detail, list):
        return bool(detail) and all(detail)
    return bool(detail)


def checkpoint_result(question, checkpoint_id, response):
    """Umpan balik satu checkpoint (mode latihan): benar/salah, poin, pembahasan, dan kunci."""
    checkpoint = find_checkpoint(question.content, checkpoint_id)
    if checkpoint is None:
        return None
    cp_key = question.answer_key["checkpoints"][checkpoint_id]
    earned, correct = grade_checkpoint(checkpoint, cp_key, response, question.scoring_mode)
    return {
        "correct": all_correct(correct),
        "detail": correct,
        "points": float(earned),
        "max_points": checkpoint["points"],
        "explanation": cp_key.get("explanation", ""),
        "key": _checkpoint_part("KEY_DISPLAYS", checkpoint["kind"])(checkpoint, cp_key),
        "response": response,
    }


def video_student_content(question, content, seed, images, user=None):
    checkpoints = []
    for checkpoint in content["checkpoints"]:
        builder = STUDENT_CONTENT.get(checkpoint["kind"])
        if builder is not None:
            cp_seed = None if seed is None else f"{seed}-{checkpoint['id']}"
            checkpoint = {**checkpoint, **builder(question, checkpoint, cp_seed, {})}
        checkpoints.append(checkpoint)
    data = {**content, "checkpoints": checkpoints}
    if content.get("source") == "file":
        from .videos import signed_video_url  # impor di sini: videos.py memakai model

        video = next((image for image in question.images.all() if image.slot == "video"), None)
        data["video_url"] = signed_video_url(video, user) if video and user else None
        data["video_name"] = video.original_filename if video else None
    return data


# ---------------------------------------------------------------- pendaftaran per jenis

BUILDERS = {
    QuestionKind.FILL_BLANK: build_fill_blank,
    QuestionKind.DRAG_DROP: build_drag_drop,
    QuestionKind.MATCHING: build_matching,
    QuestionKind.INTERACTIVE_VIDEO: build_video,
}
CLEANERS = {
    QuestionKind.FILL_BLANK: clean_fill_blank,
    QuestionKind.DRAG_DROP: clean_drag_drop,
    QuestionKind.MATCHING: clean_matching,
    QuestionKind.INTERACTIVE_VIDEO: clean_video,
}
GRADERS = {
    QuestionKind.FILL_BLANK: grade_fill_blank,
    QuestionKind.DRAG_DROP: grade_drag_drop,
    QuestionKind.MATCHING: grade_matching,
    QuestionKind.INTERACTIVE_VIDEO: grade_video,
}
KEY_DISPLAYS = {
    QuestionKind.FILL_BLANK: fill_blank_key_display,
    QuestionKind.DRAG_DROP: drag_drop_key_display,
    QuestionKind.MATCHING: matching_key_display,
    QuestionKind.INTERACTIVE_VIDEO: video_key_display,
}
# Sub-soal pilihan ganda di checkpoint video (bukan jenis soal interaktif tersendiri).
CHOICE_PARTS = {
    "BUILDERS": build_choice,
    "CLEANERS": clean_choice,
    "GRADERS": grade_choice,
    "KEY_DISPLAYS": choice_key_display,
}
STUDENT_CONTENT = {
    QuestionKind.DRAG_DROP: drag_drop_student_content,
    QuestionKind.MATCHING: matching_student_content,
    QuestionKind.INTERACTIVE_VIDEO: video_student_content,
}
REGISTRY = {"BUILDERS": BUILDERS, "CLEANERS": CLEANERS, "GRADERS": GRADERS, "KEY_DISPLAYS": KEY_DISPLAYS}


def build(kind, spec, **options):
    """Periksa rancangan guru. Mengembalikan (spec_rapi, content, answer_key, total_poin|None)."""
    if not isinstance(spec, dict):
        raise spec_error("Rancangan soal tidak valid.")
    result = BUILDERS[kind](spec, **options)
    clean_spec, content, key = result[:3]
    total = result[3] if len(result) > 3 else None
    return clean_spec, content, {"spec": clean_spec, **key}, total


def clean_response(kind, content, response):
    """Periksa bentuk jawaban siswa. InvalidResponse jika tidak sesuai."""
    if response in (None, ""):
        response = {}
    if not isinstance(response, dict):
        raise InvalidResponse()
    return CLEANERS[kind](content, response)


def apply_locked(question, response, locked):
    """Video mode latihan: jawaban checkpoint yang sudah diperiksa server tidak bisa diganti."""
    if question.kind != QuestionKind.INTERACTIVE_VIDEO or not locked:
        return response
    checkpoints = {**response.get("checkpoints", {}), **locked}
    skipped = [cp for cp in response.get("skipped", []) if cp not in locked]
    return {**response, "checkpoints": checkpoints, "skipped": skipped}


def grade(question, response):
    """Nilai jawaban satu soal interaktif -> (poin Decimal, rincian benar/salah)."""
    return GRADERS[question.kind](
        question.content, question.answer_key, response or {}, question.points, question.scoring_mode
    )


def key_display(question):
    """Kunci dalam bentuk yang mudah ditampilkan (untuk guru, atau siswa setelah kunci dibuka)."""
    return KEY_DISPLAYS[question.kind](question.content, question.answer_key)


def choice_count(question):
    """Jumlah pilihan yang boleh bergambar (slot gambar 'choice')."""
    if question.kind == QuestionKind.DRAG_DROP:
        return len(question.content.get("options", []))
    return len(question.choices or [])


def teacher_content(question, user=None):
    """Isi soal untuk guru: urutan asli (tidak diacak), lengkap dengan gambar/video."""
    return student_content(question, seed=None, user=user)


def choice_images(question):
    """Gambar pilihan per nomor: {index: {"id", "url"}} (dari images yang sudah di-prefetch)."""
    return {
        image.index: {"id": image.id, "url": f"/assessment-images/{image.id}/"}
        for image in question.images.all()
        if image.slot == "choice"
    }


def student_content(question, seed, user=None):
    """Isi soal untuk siswa: tanpa kunci; seed = id pengerjaan (None = urutan asli untuk guru)."""
    builder = STUDENT_CONTENT.get(question.kind)
    if builder is None:
        return dict(question.content)
    if question.kind == QuestionKind.INTERACTIVE_VIDEO:
        return builder(question, question.content, seed, {}, user=user)
    return builder(question, question.content, seed, choice_images(question))
