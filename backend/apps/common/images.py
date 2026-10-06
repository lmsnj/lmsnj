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


class LogoSerializerMixin:
    """Field `logo` (upload, write_only) + `remove_logo` untuk serializer yang punya FileField `logo`.

    Dipakai identitas aplikasi (branding) dan identitas sekolah. Subclass tetap harus menuliskan
    `logo = serializers.FileField(write_only=True, required=False)` dan
    `remove_logo = serializers.BooleanField(write_only=True, required=False, default=False)`.
    """

    def validate_logo(self, file):
        from rest_framework import serializers

        data = file.read()
        file.seek(0)
        error = image_error(file.name, data)
        if error:
            raise serializers.ValidationError(error)
        return file

    def save_logo(self, instance, validated_data):
        """Pasang/hapus logo lalu simpan. File lama dihapus dari disk setelah data baru tersimpan."""
        remove = validated_data.pop("remove_logo", False)
        new_logo = validated_data.pop("logo", None)
        old_logo = instance.logo if (remove or new_logo) else None
        if new_logo:
            instance.logo = new_logo
        elif remove:
            instance.logo = ""
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if old_logo and old_logo.name != instance.logo.name:
            old_logo.storage.delete(old_logo.name)
        return instance
