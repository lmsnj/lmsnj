"""Sumber impor: JSON (ekspor media), daftar tautan, bank soal (asesmen), dan pengubah soal -> langkah."""

import json
import re
from urllib.parse import urlparse

from rest_framework.exceptions import ValidationError

from apps.assessments.models import QuestionKind

from .. import assets as media_assets
from .. import schema
from .. import steps as step_kinds
from . import Builder, ImportResult, new_station

MAX_JSON_BYTES = 3 * 1024 * 1024
MAX_LINKS = 200
VIDEO_HOSTS = ("youtube.com", "youtu.be", "vimeo.com", "drive.google.com")
VIDEO_EXTENSIONS = (".mp4", ".webm")


# ---------------------------------------------------------------- JSON


def read_json(file, media):
    raw = file.read()
    if len(raw) > MAX_JSON_BYTES:
        raise ValidationError({"file": "File JSON maksimal 3 MB."})
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValidationError({"file": "File bukan JSON yang valid."})
    if isinstance(payload, dict) and payload.get("format") == "lms-sigma-media":
        payload = payload.get("media")
    if not isinstance(payload, dict) or not isinstance(payload.get("parts"), list):
        raise ValidationError({"file": "JSON harus hasil Ekspor JSON media (berisi daftar 'parts')."})
    result = ImportResult()
    try:
        content = schema.validate_media(payload, full=False)
    except schema.MediaError as error:
        result.errors.extend(error.errors)
        return result
    # Gambar unggahan media lain tidak ikut (file-nya tidak ada di media ini).
    own = set(media.assets.values_list("id", flat=True))
    foreign = media_assets.asset_ids(content) - own
    if foreign:
        content = media_assets.remap_assets(content, {i: "x" for i in foreign})
        content = _drop_foreign(content)
        result.warnings.append(
            f"{len(foreign)} gambar unggahan dari media lain tidak ikut. Unggah ulang gambarnya di Studio."
        )
    result.parts = content["parts"]
    result.glossary = content["glossary"]
    if content["mascot"].get("name") or content["mascot"].get("image"):
        result.mascot = content["mascot"]
    return result


def _drop_foreign(value):
    if isinstance(value, dict):
        return {k: _drop_foreign(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_drop_foreign(v) for v in value]
    return "" if value == "asset:x" else value


# ---------------------------------------------------------------- Flowgorithm (.fprg)


def read_fprg(file, part_title=None):
    """File Flowgorithm asli -> langkah lab program (bisa dijalankan & diubah siswa)."""
    from ..plugins.flowgorithm.fprg import FprgError, parse_fprg

    result = ImportResult()
    name = (file.name or "program").rsplit(".", 1)[0][:200] or "Program Flowgorithm"
    try:
        program, warnings = parse_fprg(file.read())
    except FprgError as error:
        result.errors.append(str(error))
        return result
    result.warnings.extend(warnings)
    builder = Builder(name, part_title)
    builder.add(
        {
            "id": "",
            "kind": "flowgorithm_demo",
            "title": name,
            "hints": [],
            "body": "Jalankan program ini langkah demi langkah, lalu amati isi variabel dan hasilnya.",
            "program": program,
            "inputs": [],
            "editable": True,
        }
    )
    result.parts = builder.result_parts()
    return result


# ---------------------------------------------------------------- tautan


def is_video(url):
    parsed = urlparse(url)
    host = (parsed.hostname or "").removeprefix("www.").removeprefix("m.")
    if any(host == h or host.endswith("." + h) for h in VIDEO_HOSTS):
        return host != "drive.google.com" or "/file/" in parsed.path
    return parsed.path.lower().endswith(VIDEO_EXTENSIONS)


def is_h5p(url):
    """Alamat embed H5P (mis. https://h5p.org/h5p/embed/123 atau situs Moodle/WordPress .../h5p/embed/...)."""
    parsed = urlparse(url)
    return parsed.scheme == "https" and "/h5p/embed" in parsed.path.lower()


def read_links(text, default_title, part_title=None):
    """Satu tautan per baris: 'Judul | https://...' atau alamatnya saja. Baris '# Judul' = stasiun baru.
    Video -> langkah video, embed H5P -> langkah konten HTML5/H5P, lainnya -> tombol tautan."""
    result = ImportResult()
    builder = Builder(default_title, part_title)
    count = 0
    for number_, raw in enumerate(str(text or "").splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            builder.station(line.lstrip("#").strip())
            continue
        title, separator, url = line.rpartition("|")
        if not separator:
            title, url = "", line
        title, url = title.strip(), url.strip()
        if not url.startswith(("https://", "http://")):
            result.errors.append(f"Baris {number_}: alamat harus diawali https:// ({url[:60]}).")
            continue
        count += 1
        if count > MAX_LINKS:
            result.errors.append(f"Maksimal {MAX_LINKS} tautan sekali impor.")
            break
        if is_h5p(url):
            builder.add(
                {
                    "id": "",
                    "kind": "embed",
                    "title": title[:200],
                    "hints": [],
                    "url": url,
                    "body": "",
                    "height": 480,
                }
            )
        elif is_video(url):
            builder.add(
                {
                    "id": "",
                    "kind": "video",
                    "title": title[:200],
                    "hints": [],
                    "url": url,
                    "start": 0,
                    "body": "",
                }
            )
        else:
            builder.add(
                {
                    "id": "",
                    "kind": "link",
                    "title": title[:200],
                    "hints": [],
                    "url": url,
                    "label": "",
                    "body": "",
                }
            )
    result.parts = builder.result_parts()
    if not result.parts and not result.errors:
        result.errors.append("Tulis minimal satu tautan (satu per baris).")
    return result


# ---------------------------------------------------------------- soal -> langkah


def question_step(data, explanation=""):
    """Data soal (bentuk `QuestionSerializer`/impor soal) -> rancangan langkah, atau None jika jenisnya tidak
    punya padanan (esai, video interaktif)."""
    kind = data.get("kind")
    stimulus = (data.get("stimulus") or "").strip()
    text = (data.get("text") or "").strip()
    question = f"{stimulus}\n\n{text}".strip() if stimulus else text
    base = {"id": "", "title": "", "hints": [], "image": "", "explanation": explanation}
    choices = data.get("choices") or []
    if kind == QuestionKind.CHOICE:
        return {
            **base,
            "kind": "choice",
            "text": question,
            "choices": [{"text": str(c), "why": ""} for c in choices],
            "correct": data.get("correct_choice"),
        }
    if kind == QuestionKind.MULTIPLE:
        # PG kompleks -> kelompokkan setiap pilihan ke "Benar" / "Salah".
        correct = set(data.get("correct_choices") or [])
        return {
            **base,
            "kind": "categorize",
            "text": question,
            "categories": ["Benar", "Salah"],
            "items": [
                {"text": str(c), "category": 0 if i in correct else 1, "why": ""}
                for i, c in enumerate(choices)
            ],
        }
    if kind == QuestionKind.CATEGORY:
        keys = data.get("correct_choices") or []
        return {
            **base,
            "kind": "categorize",
            "text": question,
            "categories": list(data.get("category_labels") or ["Benar", "Salah"]),
            "items": [
                {"text": str(c), "category": keys[i] if i < len(keys) else 0, "why": ""}
                for i, c in enumerate(choices)
            ],
        }
    spec = data.get("spec") or {}
    if kind in (QuestionKind.FILL_BLANK, QuestionKind.DRAG_DROP):
        step = {
            **base,
            "kind": str(kind),
            "text": question,
            "template": spec.get("template", ""),
            "why": "",
        }
        if kind == QuestionKind.FILL_BLANK:
            step["case_sensitive"] = bool(spec.get("case_sensitive"))
        else:
            step["distractors"] = [d for d in spec.get("distractors") or [] if isinstance(d, str)]
        return step
    if kind == QuestionKind.MATCHING:
        return {
            **base,
            "kind": "matching",
            "text": question or "Pasangkan dengan tepat.",
            "pairs": [
                {"left": p.get("left", ""), "right": p.get("right", "")} for p in spec.get("pairs") or []
            ],
            "distractors": [d for d in spec.get("distractors") or [] if isinstance(d, str)],
            "why": "",
        }
    return None


def checked_step(step, label, result):
    """Periksa langkah hasil konversi; yang tidak lolos dilewati dengan peringatan."""
    try:
        step_kinds.KINDS[step["kind"]].validate(step)
    except step_kinds.StepError as error:
        result.warnings.append(f"{label} dilewati: {error}")
        return None
    return step


# ---------------------------------------------------------------- bank soal


def read_bank(assessment, question_ids, part_title=None):
    """Soal asesmen -> satu stasiun latihan. Gambar soal (pertanyaan/stimulus) ikut diunggah."""
    result = ImportResult()
    questions = assessment.questions.prefetch_related("images").order_by("order", "id")
    if question_ids:
        questions = questions.filter(id__in=question_ids)
    station = new_station(f"Latihan: {assessment.title}")
    skipped = 0
    for number_, question in enumerate(questions, start=1):
        label = f"Soal {number_}"
        data = {
            "kind": question.kind,
            "stimulus": question.stimulus,
            "text": question.text,
            "choices": question.choices,
            "correct_choice": question.correct_choice,
            "correct_choices": question.correct_choices,
            "category_labels": question.category_labels,
            "spec": (question.answer_key or {}).get("spec") or {},
        }
        step = question_step(data)
        if step is None:
            skipped += 1
            continue
        images = {image.slot: image for image in question.images.all()}
        image = images.get("question") or images.get("stimulus")
        if image is not None and "image" in step:
            try:
                with image.file.open("rb") as handle:
                    step["image"] = result.add_image(image.original_filename or "gambar.png", handle.read())
            except (FileNotFoundError, OSError):
                result.warnings.append(f"{label}: file gambar tidak ditemukan, dilewati.")
        if images.get("choice"):
            result.warnings.append(
                f"{label}: gambar pada pilihan tidak ikut (media hanya memakai teks pilihan)."
            )
        step = checked_step(step, label, result)
        if step is not None:
            if len(station["steps"]) >= schema.MAX_STEPS:
                result.warnings.append(
                    f"Maksimal {schema.MAX_STEPS} langkah per stasiun; sisa soal dilewati."
                )
                break
            station["steps"].append(step)
    if skipped:
        result.warnings.append(f"{skipped} soal esai/video dilewati (belum ada padanannya di media).")
    if not station["steps"]:
        result.errors.append("Tidak ada soal yang bisa diubah menjadi latihan media.")
        return result
    result.parts = [{"id": "", "title": part_title or "Latihan", "description": "", "stations": [station]}]
    return result


def parse_question_block(text, result, label_prefix="Soal"):
    """Teks soal berformat impor soal (1. ... A. ... Kunci: B) -> daftar langkah. Baris 'Pembahasan: ...'
    diambil lebih dulu karena format impor soal belum mengenalnya."""
    from apps.assessments.question_import import QUESTION_RE, parse_text

    explanations, kept, current = {}, [], 0
    for line in str(text).splitlines():
        if QUESTION_RE.match(line):
            current += 1
        match = re.match(r"^\s*pembahasan\s*:\s*(.*)$", line, re.IGNORECASE)
        if match and current:
            explanations[current] = match.group(1).strip()
        else:
            kept.append(line)
    steps = []
    for index, item in enumerate(parse_text("\n".join(kept)), start=1):
        label = f"{label_prefix} {item['row'].removeprefix('Soal ')}"
        if item["errors"]:
            result.warnings.append(f"{label} dilewati: {item['errors'][0]}")
            continue
        step = question_step(item["data"], explanations.get(index, ""))
        if step is None:
            result.warnings.append(f"{label} dilewati: soal esai belum ada padanannya di media.")
            continue
        step = checked_step(step, label, result)
        if step is not None:
            steps.append(step)
    return steps
