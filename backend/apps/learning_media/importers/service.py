"""Menjalankan impor: baca sumber -> gabung ke draf -> periksa -> (simpan)."""

import os

from rest_framework.exceptions import ValidationError

from .. import schema
from . import documents, excel, merge, outline, sources, upload_images

SOURCES = ("excel", "json", "word", "pptx", "pdf", "fprg", "links", "bank")
# Ekstensi & ukuran maksimal (MB) per sumber berbentuk file.
FILE_RULES = {
    "excel": ((".xlsx", ".csv"), 10),
    "json": ((".json",), 3),
    "word": ((".docx",), 25),
    "pptx": ((".pptx",), 40),
    "pdf": ((".pdf",), 25),
    "fprg": ((".fprg",), 1),
}
MAX_PROBLEMS = 50


def _file(data, source):
    file = data.get("file")
    extensions, max_mb = FILE_RULES[source]
    if file is None:
        raise ValidationError({"file": "Pilih file yang akan diimpor."})
    ext = os.path.splitext(file.name or "")[1].lower()
    if ext not in extensions:
        raise ValidationError({"file": f"Gunakan file {' atau '.join(extensions)}."})
    if file.size > max_mb * 1024 * 1024:
        raise ValidationError({"file": f"Ukuran file maksimal {max_mb} MB."})
    return file, ext


def read_source(media, data, user, school):
    source = data["source"]
    parts = (media.draft or {}).get("parts") or []
    last_part = parts[-1].get("title") if parts else None
    if source in FILE_RULES:
        file, ext = _file(data, source)
        if source == "excel":
            return excel.read_csv(file, media.draft) if ext == ".csv" else excel.read_excel(file, media.draft)
        if source == "json":
            return sources.read_json(file, media)
        if source == "fprg":
            return sources.read_fprg(file, last_part)
        return {"word": documents.read_docx, "pptx": documents.read_pptx, "pdf": documents.read_pdf}[source](
            file
        )
    if source == "links":
        return sources.read_links(data.get("text", ""), "Tautan belajar", last_part or "Bagian 1")

    from apps.assessments.views import assessments_for

    assessment = assessments_for(user, school).filter(pk=data.get("assessment") or 0).first()
    if assessment is None:
        raise ValidationError({"assessment": "Pilih asesmen yang akan diambil soalnya."})
    return sources.read_bank(assessment, data.get("questions") or [], last_part)


def station_titles(draft):
    return {s.get("id"): s.get("title", "") for s in schema.iter_stations(draft or {})}


def run_import(media, data, user, school, dry_run):
    """Mengembalikan (respons, disimpan?)."""
    result = read_source(media, data, user, school)
    mode = data["mode"]
    items, summary = outline(result.parts)
    response = {
        "source": data["source"],
        "mode": mode,
        "imported": False,
        "summary": summary,
        "outline": items,
        "errors": list(result.errors),
        "warnings": list(result.warnings),
        "problems": [],
        "removed": [],
    }
    if result.errors:
        return response, False

    merged = merge(media.draft, result, mode)
    try:
        merged = schema.validate_media(merged, full=False)
    except schema.MediaError as error:
        response["errors"] = error.errors
        return response, False
    try:
        schema.validate_media(merged, full=True)
    except schema.MediaError as error:
        response["problems"] = error.errors[:MAX_PROBLEMS]
    if mode == "replace":
        before, after = station_titles(media.draft), station_titles(merged)
        response["removed"] = [title for station_id, title in before.items() if station_id not in after]
    if dry_run:
        return response, False

    merged, image_warnings = upload_images(media, result, merged, user)
    media.draft = merged
    media.save(update_fields=["draft", "updated_at"])
    response["warnings"] += image_warnings
    response["imported"] = True
    return response, True
