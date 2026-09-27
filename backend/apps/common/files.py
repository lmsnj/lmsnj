import os
import uuid

from django.conf import settings
from django.http import FileResponse
from django.utils import timezone
from django.utils.deconstruct import deconstructible
from rest_framework import serializers
from rest_framework.exceptions import NotFound


@deconstructible
class RandomUploadPath:
    """Nama file diacak (UUID) agar tidak bisa ditebak dan tidak bentrok antar pengguna.

    Berbentuk class (bukan fungsi biasa) agar bisa disimpan Django di file migrasi.
    """

    def __init__(self, folder):
        self.folder = folder

    def __call__(self, instance, filename):
        ext = os.path.splitext(filename)[1].lower()
        return f"{self.folder}/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{ext}"


def validate_upload(file, allowed_extensions, max_mb=None):
    """Cek ekstensi dan ukuran file upload. Mengembalikan file jika valid."""
    max_mb = max_mb or settings.MAX_UPLOAD_SIZE_MB
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in allowed_extensions:
        allowed = ", ".join(sorted(allowed_extensions))
        raise serializers.ValidationError(f"Tipe file tidak diizinkan. Gunakan: {allowed}.")
    if file.size > max_mb * 1024 * 1024:
        raise serializers.ValidationError(f"Ukuran file maksimal {max_mb} MB.")
    return file


def delete_file(field_file):
    """Hapus file dari penyimpanan tanpa error jika file sudah tidak ada."""
    if field_file:
        field_file.storage.delete(field_file.name)


def file_response(field_file, filename, as_attachment=False):
    """Kirim file yang tersimpan. Hak akses harus sudah dicek oleh view pemanggil."""
    if not field_file:
        raise NotFound("Tidak ada file.")
    try:
        handle = field_file.open("rb")
    except FileNotFoundError:
        raise NotFound("File tidak ditemukan di server.")
    return FileResponse(handle, as_attachment=as_attachment, filename=filename)
