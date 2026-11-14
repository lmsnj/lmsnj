"""Alamat subdomain per sekolah, mis. smknj.sigmateknologi.my.id.

Frontend membaca kode sekolah dari alamat browser lalu mengirimkannya lewat header X-School-Code.
Kode sekolah = bagian subdomain, jadi harus sah sebagai nama DNS: huruf kecil, angka, dan tanda
hubung (tidak di awal/akhir). Beberapa nama dicadangkan untuk platform (mis. admin = Super Admin).
"""

import re

from rest_framework import serializers

SCHOOL_CODE_HEADER = "X-School-Code"

# Subdomain yang tidak boleh dipakai sekolah: dipakai platform atau lazim untuk layanan lain.
RESERVED_CODES = {"admin", "api", "app", "www", "mail", "static", "media", "ftp", "cpanel", "webmail"}

CODE_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")


def validate_school_code(value):
    """Rapikan & periksa kode sekolah. Mengembalikan kode huruf kecil."""
    code = (value or "").strip().lower()
    if not CODE_PATTERN.match(code):
        raise serializers.ValidationError(
            "Kode hanya boleh huruf kecil, angka, dan tanda hubung (tidak di awal/akhir), "
            "karena dipakai sebagai alamat subdomain sekolah."
        )
    if code in RESERVED_CODES:
        raise serializers.ValidationError(f"Kode “{code}” sudah dipakai sistem. Pilih kode lain.")
    return code
