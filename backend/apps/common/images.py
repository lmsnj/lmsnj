"""Validasi gambar upload: PNG/JPG/GIF/WEBP saja, dicek dari isi file (bukan hanya nama).

SVG sengaja ditolak karena bisa berisi skrip. Dipakai gambar soal asesmen dan logo sekolah.
"""

import os

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
MAX_IMAGE_MB = 2
CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _matches_signature(ext, data):
    if ext == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in (".jpg", ".jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if ext == ".gif":
        return data.startswith((b"GIF87a", b"GIF89a"))
    if ext == ".webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


def image_error(name, data):
    """Pesan error untuk gambar yang tidak valid, atau None jika valid."""
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return f"'{name}': gunakan gambar PNG, JPG, GIF, atau WEBP."
    if len(data) > MAX_IMAGE_MB * 1024 * 1024:
        return f"'{name}': ukuran gambar maksimal {MAX_IMAGE_MB} MB."
    if not _matches_signature(ext, data):
        return f"'{name}': isi file bukan gambar yang valid."
    return None
