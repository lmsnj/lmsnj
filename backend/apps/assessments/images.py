"""Gambar pada soal asesmen: validasi, pembacaan ZIP, dan penyimpanan.

Gambar hanya boleh PNG/JPG/GIF/WEBP (dicek dari isi file, bukan hanya nama). SVG sengaja
ditolak karena bisa berisi skrip.
"""

import os
import zipfile

from django.core.files.base import ContentFile
from rest_framework.exceptions import ValidationError

from .models import ImageSlot, QuestionImage

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
MAX_IMAGE_MB = 2
# Batas ZIP agar tidak bisa dipakai membebani server ("zip bomb").
MAX_ZIP_MB = 30
MAX_ZIP_FILES = 300
MAX_ZIP_UNCOMPRESSED_MB = 100

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


def image_key(name):
    """Nama file dicocokkan tanpa folder dan tanpa peduli huruf besar: 'Soal/Grafik.PNG' = 'grafik.png'."""
    return os.path.basename(name.replace("\\", "/")).strip().lower()


def read_zip(file):
    """Baca ZIP gambar. Mengembalikan {nama_kecil: (nama_asli, bytes)}; gambar tidak valid -> error."""
    if file is None:
        return {}
    if os.path.splitext(file.name)[1].lower() != ".zip":
        raise ValidationError({"images": "Kumpulan gambar harus berupa file .zip."})
    if file.size > MAX_ZIP_MB * 1024 * 1024:
        raise ValidationError({"images": f"Ukuran file ZIP maksimal {MAX_ZIP_MB} MB."})
    try:
        archive = zipfile.ZipFile(file)
    except zipfile.BadZipFile:
        raise ValidationError({"images": "File ZIP rusak atau tidak bisa dibaca."})

    entries = [
        info
        for info in archive.infolist()
        # Lewati folder dan file bawaan sistem (mis. __MACOSX/, Thumbs.db, .DS_Store).
        if not info.is_dir()
        and not image_key(info.filename).startswith(".")
        and "__macosx" not in info.filename.lower()
        and image_key(info.filename) != "thumbs.db"
    ]
    if len(entries) > MAX_ZIP_FILES:
        raise ValidationError({"images": f"ZIP berisi lebih dari {MAX_ZIP_FILES} file."})
    if sum(info.file_size for info in entries) > MAX_ZIP_UNCOMPRESSED_MB * 1024 * 1024:
        raise ValidationError({"images": f"Total isi ZIP melebihi {MAX_ZIP_UNCOMPRESSED_MB} MB."})

    images, errors = {}, []
    for info in entries:
        key = image_key(info.filename)
        if info.file_size > MAX_IMAGE_MB * 1024 * 1024:
            errors.append(f"'{key}': ukuran gambar maksimal {MAX_IMAGE_MB} MB.")
            continue
        data = archive.read(info)
        error = image_error(key, data)
        if error:
            errors.append(error)
        elif key in images:
            errors.append(f"Nama gambar '{key}' ada lebih dari satu di dalam ZIP.")
        else:
            images[key] = (os.path.basename(info.filename.replace("\\", "/")), data)
    if errors:
        raise ValidationError({"images": errors})
    return images


def save_image(question, slot, index, name, data):
    """Simpan (atau ganti) gambar pada satu letak soal."""
    QuestionImage.objects.filter(question=question, slot=slot, index=index).delete()
    image = QuestionImage(question=question, slot=slot, index=index, original_filename=name[:255])
    image.file.save(name, ContentFile(data), save=False)
    image.save()
    return image


def images_data(question):
    """Bentuk data gambar untuk API: url relatif (diunduh lewat API dengan token)."""
    result = {"stimulus": None, "question": None, "choices": [None] * len(question.choices or [])}
    for image in question.images.all():
        item = {"id": image.id, "url": f"/assessment-images/{image.id}/", "name": image.original_filename}
        if image.slot == ImageSlot.CHOICE:
            if image.index < len(result["choices"]):
                result["choices"][image.index] = item
        else:
            result[image.slot] = item
    return result
