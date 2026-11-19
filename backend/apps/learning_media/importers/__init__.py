"""Impor isi Media Pembelajaran Interaktif dari berbagai sumber.

Setiap sumber (Excel/CSV, JSON, Word, PowerPoint, PDF, tautan, bank soal) diubah menjadi `ImportResult`:
potongan draf berisi bagian/stasiun/langkah. Potongan itu lalu digabung ke draf media:
- "append"  : bagian berjudul sama digabung (stasiunnya ditambahkan di belakang), bagian lain ditambahkan;
- "replace" : seluruh bagian diganti (maskot tetap; glosarium diganti jika file membawa glosarium).

Alurnya sama dengan impor lain di aplikasi ini: Periksa (tidak ada yang disimpan) -> Terapkan.
Gambar dari dokumen dirujuk sementara sebagai "pending:<n>" dan baru diunggah (dikompres) saat diterapkan.
"""

import copy
import re
from dataclasses import dataclass, field

from django.core.files.uploadedfile import SimpleUploadedFile

from .. import assets as media_assets
from .. import schema
from .. import steps as step_kinds

MODES = ("append", "replace")
MAX_IMPORT_IMAGES = 60
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".gif", ".webp")
PENDING_RE = re.compile(r"^pending:(\d+)$")


@dataclass
class ImportResult:
    parts: list = field(default_factory=list)
    glossary: list | None = None  # None = sumber tidak membawa glosarium
    mascot: dict | None = None
    errors: list = field(default_factory=list)  # menghalangi penerapan
    warnings: list = field(default_factory=list)  # informasi saja
    images: list = field(default_factory=list)  # [(nama file, bytes)] dirujuk "pending:<indeks>"

    def add_image(self, name, data):
        """Simpan gambar dokumen; mengembalikan rujukan sementara, atau "" jika tidak bisa dipakai."""
        ext = ("." + name.rsplit(".", 1)[-1]).lower() if "." in name else ""
        if ext not in IMAGE_EXTENSIONS:
            self.warnings.append(f"Gambar {name} dilewati (hanya PNG/JPG/GIF/WEBP).")
            return ""
        if len(self.images) >= MAX_IMPORT_IMAGES:
            if len(self.images) == MAX_IMPORT_IMAGES:
                self.warnings.append(f"Hanya {MAX_IMPORT_IMAGES} gambar pertama yang diimpor.")
                self.images.append(None)  # penanda agar peringatan tidak berulang
            return ""
        self.images.append((name, data))
        return f"pending:{len(self.images) - 1}"


# ---------------------------------------------------------------- pembentuk draf


def text_step(title="", body="", image=""):
    return {"id": "", "kind": "text", "title": title[:200], "hints": [], "body": body, "image": image}


def new_station(title):
    return {
        "id": "",
        "title": (title or "Stasiun")[:200],
        "objectives": [],
        "minutes": 0,
        "prerequisites": [],
        "optional": False,
        "badge": None,
        "steps": [],
        "remedial": [],
        "challenge": [],
        "summary": [],
        "reflection": "",
    }


class Builder:
    """Menyusun bagian -> stasiun -> langkah secara berurutan (dipakai pembaca dokumen). Stasiun yang
    penuh (40 langkah) otomatis dilanjutkan di stasiun "(lanjutan)"."""

    def __init__(self, default_title, part_title=None):
        self.parts = []
        self.default_title = (default_title or "Materi impor")[:200]
        self.part_title = part_title or self.default_title

    def part(self, title):
        self.parts.append(
            {"id": "", "title": (title or self.part_title)[:200], "description": "", "stations": []}
        )

    def station(self, title):
        if not self.parts:
            self.part(self.part_title)
        self.parts[-1]["stations"].append(new_station(title or self.default_title))

    def add(self, step):
        if not self.parts or not self.parts[-1]["stations"]:
            self.station(self.parts[-1]["title"] if self.parts else self.default_title)
        station = self.parts[-1]["stations"][-1]
        if len(station["steps"]) >= schema.MAX_STEPS:
            title = re.sub(r" \(lanjutan( \d+)?\)$", "", station["title"])
            self.station(f"{title} (lanjutan)")
            station = self.parts[-1]["stations"][-1]
        station["steps"].append(step)

    def result_parts(self):
        """Buang bagian/stasiun kosong."""
        parts = []
        for part in self.parts:
            stations = [s for s in part["stations"] if s["steps"]]
            if stations:
                parts.append({**part, "stations": stations})
        return parts


def all_ids(draft):
    ids = set()
    for part in draft.get("parts", []):
        ids.add(part.get("id"))
        for station in part.get("stations", []):
            ids.add(station.get("id"))
            for _, step in schema.iter_steps(station):
                ids.add(step.get("id"))
    ids.discard("")
    ids.discard(None)
    return ids


def renew_ids(parts, used):
    """Beri id baru pada item yang id-nya kosong atau sudah dipakai; prasyarat ikut disesuaikan."""
    stations_map = {}

    def fresh(item):
        old = item.get("id")
        if not old or old in used:
            item["id"] = step_kinds.new_id()
            while item["id"] in used:
                item["id"] = step_kinds.new_id()
        used.add(item["id"])
        return old

    for part in parts:
        fresh(part)
        for station in part.get("stations", []):
            old = fresh(station)
            if old:
                stations_map[old] = station["id"]
            for _, step in schema.iter_steps(station):
                fresh(step)
    for part in parts:
        for station in part.get("stations", []):
            station["prerequisites"] = [stations_map.get(p, p) for p in station.get("prerequisites") or []]
    return parts


def merge(draft, result, mode):
    """Gabungkan hasil impor ke draf (salinan baru; draf asli tidak diubah)."""
    merged = copy.deepcopy(draft) if draft else schema.empty_media()
    merged.setdefault("schema_version", schema.SCHEMA_VERSION)
    parts = copy.deepcopy(result.parts)
    if result.mascot and (mode == "replace" or not (merged.get("mascot") or {}).get("name")):
        merged["mascot"] = result.mascot
    if mode == "replace":
        merged["parts"] = renew_ids(parts, set())
        if result.glossary is not None:
            merged["glossary"] = result.glossary
        return merged

    renew_ids(parts, all_ids(merged))
    existing = {(p.get("title") or "").strip().casefold(): p for p in merged.setdefault("parts", [])}
    for part in parts:
        target = existing.get((part.get("title") or "").strip().casefold())
        if target is not None:
            target.setdefault("stations", []).extend(part["stations"])
        else:
            merged["parts"].append(part)
    if result.glossary:
        glossary = merged.setdefault("glossary", [])
        known = {(g.get("term") or "").casefold() for g in glossary}
        glossary.extend(g for g in result.glossary if g["term"].casefold() not in known)
    return merged


# ---------------------------------------------------------------- ringkasan pratinjau


def _plain(text, limit=120):
    """Teks kaya -> satu baris polos (tanpa **tebal**/*miring*), dipotong agar ringkas."""
    text = " ".join(re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", str(text)).split())
    return text[:limit] + ("…" if len(text) > limit else "")


def step_caption(step):
    if step.get("title"):
        return step["title"]
    for name in ("text", "body", "template"):
        value = step.get(name)
        if isinstance(value, str) and value.strip():
            return _plain(value)
    if step.get("kind") == "dialog" and step.get("lines"):
        return _plain(step["lines"][0].get("text", ""))
    return ""


def outline(parts):
    """Ringkasan isi hasil impor untuk ditampilkan sebelum diterapkan."""
    result, totals = [], {"parts": 0, "stations": 0, "steps": 0, "graded": 0, "images": 0}
    for part in parts:
        stations = []
        for station in part.get("stations", []):
            items = []
            for list_name, step in schema.iter_steps(station):
                kind = step_kinds.KINDS.get(step.get("kind"))
                graded = bool(kind and kind.graded)
                image = str(step.get("image") or "")
                items.append(
                    {
                        "list": list_name,
                        "kind": step.get("kind"),
                        "label": kind.label if kind else step.get("kind"),
                        "caption": step_caption(step),
                        "graded": graded,
                        "image": bool(image),
                    }
                )
                totals["steps"] += 1
                totals["graded"] += graded
                totals["images"] += bool(image)
            stations.append({"title": station.get("title", ""), "steps": items})
        totals["stations"] += len(stations)
        result.append({"title": part.get("title", ""), "stations": stations})
    totals["parts"] = len(result)
    return result, totals


# ---------------------------------------------------------------- terapkan


def replace_refs(value, mapping):
    """Ganti setiap string "pending:<n>" sesuai `mapping` (n -> rujukan baru)."""
    if isinstance(value, dict):
        return {k: replace_refs(v, mapping) for k, v in value.items()}
    if isinstance(value, list):
        return [replace_refs(v, mapping) for v in value]
    if isinstance(value, str):
        match = PENDING_RE.match(value)
        if match:
            return mapping.get(int(match.group(1)), "")
    return value


def used_pending(value, found=None):
    found = set() if found is None else found
    if isinstance(value, dict):
        for item in value.values():
            used_pending(item, found)
    elif isinstance(value, list):
        for item in value:
            used_pending(item, found)
    elif isinstance(value, str) and (match := PENDING_RE.match(value)):
        found.add(int(match.group(1)))
    return found


def upload_images(media, result, draft, user):
    """Unggah gambar dokumen yang dipakai draf; mengembalikan (draf, peringatan)."""
    from rest_framework.exceptions import ValidationError

    from ..models import InteractiveMediaAsset

    warnings, mapping = [], {}
    needed = sorted(used_pending(draft))
    room = media_assets.MAX_ASSETS - media.assets.count()
    for index in needed:
        image = result.images[index] if index < len(result.images) else None
        if image is None:
            continue
        if room <= 0:
            warnings.append(
                f"Batas {media_assets.MAX_ASSETS} gambar per media tercapai; sisa gambar dilewati."
            )
            break
        name, data = image
        try:
            content, filename, width, height = media_assets.compress(SimpleUploadedFile(name, data))
        except ValidationError as error:
            detail = error.detail.get("file") if isinstance(error.detail, dict) else error.detail
            detail = detail[0] if isinstance(detail, list) else detail
            warnings.append(f"Gambar {name} dilewati: {detail}")
            continue
        asset = InteractiveMediaAsset(
            media=media, original_filename=filename, size=content.size, width=width, height=height,
            created_by=user,
        )  # fmt: skip
        asset.file.save(filename, content, save=True)
        mapping[index] = asset.ref
        room -= 1
    return replace_refs(draft, mapping), warnings
