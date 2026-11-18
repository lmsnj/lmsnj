"""Gambar media: diperiksa isinya, lalu dikompres agar hemat kuota siswa.

Semua gambar (kecuali GIF bergerak) diubah ke WEBP, sisi terpanjang maks. MAX_SIDE piksel, sehingga foto
kamera HP 4 MB biasanya menjadi < 200 KB. Isi media merujuk gambar sebagai "asset:<id>".
"""

import io
import os
import re

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

from apps.common.images import ALLOWED_EXTENSIONS, _matches_signature

MAX_UPLOAD_MB = 10
MAX_SIDE = 1600
QUALITY = 80
MAX_ASSETS = 300
ASSET_RE = re.compile(r"asset:(\d+)")


def compress(upload):
    """File upload -> (ContentFile hasil kompres, nama file, lebar, tinggi). Raise ValidationError."""
    name = os.path.basename(upload.name or "gambar")
    ext = os.path.splitext(name)[1].lower()
    data = upload.read()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError({"file": "Gunakan gambar PNG, JPG, GIF, atau WEBP."})
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationError({"file": f"Ukuran gambar maksimal {MAX_UPLOAD_MB} MB."})
    if not _matches_signature(ext, data):
        raise ValidationError({"file": "Isi file bukan gambar yang valid."})
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValidationError({"file": "Gambar rusak atau terlalu besar untuk diproses."})
    if ext == ".gif" and getattr(image, "is_animated", False):
        # GIF bergerak disimpan apa adanya (mengubahnya butuh pustaka tambahan).
        return ContentFile(data), name, image.width, image.height
    image = ImageOps.exif_transpose(image)
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if image.has_transparency_data else "RGB")
    output = io.BytesIO()
    image.save(output, format="WEBP", quality=QUALITY, method=4)
    stem = os.path.splitext(name)[0][:200] or "gambar"
    return ContentFile(output.getvalue()), f"{stem}.webp", image.width, image.height


def asset_ids(content):
    """Id aset yang dirujuk isi media (teks JSON apa pun)."""
    import json

    return {int(value) for value in ASSET_RE.findall(json.dumps(content, ensure_ascii=False))}


def remap_assets(content, mapping):
    """Ganti rujukan "asset:<lama>" menjadi "asset:<baru>" (dipakai saat menyalin media)."""
    import json

    text = json.dumps(content, ensure_ascii=False)
    text = ASSET_RE.sub(lambda m: f"asset:{mapping.get(int(m.group(1)), m.group(1))}", text)
    return json.loads(text)
