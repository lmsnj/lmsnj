"""File video untuk soal video interaktif: validasi, alamat bertanda tangan, dan streaming.

Berbeda dengan file lain (diunduh sebagai blob lewat API bertoken), video diputar langsung oleh
elemen <video> agar bisa mulai tanpa mengunduh seluruh file dan bisa digeser (header Range).
Elemen <video> tidak bisa mengirim header Authorization, jadi aksesnya memakai alamat bertanda
tangan (django.core.signing) yang berisi id video + id pengguna dan berlaku beberapa jam. Saat
diputar, hak akses pengguna itu dicek ulang.
"""

import os
import re

from django.conf import settings
from django.core import signing
from django.http import FileResponse, HttpResponse, StreamingHttpResponse

SALT = "assessment-video"
# Lebih lama dari durasi asesmen terpanjang (300 menit) agar video tidak berhenti di tengah ujian.
MAX_AGE_SECONDS = 6 * 3600
VIDEO_TYPES = {".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm"}
CHUNK_SIZE = 512 * 1024
RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


def max_video_mb():
    return settings.MAX_VIDEO_UPLOAD_MB


def video_error(name, head, size):
    """Pesan kesalahan file video, atau None jika valid. `head` = 16 byte pertama file."""
    ext = os.path.splitext(name or "")[1].lower()
    if ext not in VIDEO_TYPES:
        return "Video harus berformat MP4 atau WEBM."
    if size > max_video_mb() * 1024 * 1024:
        return f"Ukuran video maksimal {max_video_mb()} MB."
    # Cek isi file: MP4 punya penanda "ftyp" di byte ke-4, WEBM diawali 1A 45 DF A3.
    is_mp4 = head[4:8] == b"ftyp"
    is_webm = head[:4] == b"\x1a\x45\xdf\xa3"
    if not (is_mp4 if VIDEO_TYPES[ext] == "video/mp4" else is_webm):
        return "Isi file bukan video MP4/WEBM yang valid."
    return None


def content_type(name):
    return VIDEO_TYPES.get(os.path.splitext(name or "")[1].lower(), "application/octet-stream")


def signed_video_url(image, user):
    """Alamat relatif terhadap API, mis. /assessment-videos/5/?t=..."""
    token = signing.dumps({"v": image.id, "u": user.id}, salt=SALT, compress=True)
    return f"/assessment-videos/{image.id}/?t={token}"


def read_token(token, image_id):
    """Id pengguna dari token. signing.BadSignature (termasuk kedaluwarsa) jika tidak sah."""
    data = signing.loads(token, salt=SALT, max_age=MAX_AGE_SECONDS)
    if data.get("v") != image_id:
        raise signing.BadSignature("Token bukan untuk video ini.")
    return data.get("u")


def _chunks(file, length):
    try:
        while length > 0:
            data = file.read(min(CHUNK_SIZE, length))
            if not data:
                break
            length -= len(data)
            yield data
    finally:
        file.close()


def ranged_response(request, field_file, name):
    """FileResponse yang mendukung header Range (dibutuhkan browser untuk menggeser video)."""
    size = field_file.size
    kind = content_type(name)
    match = RANGE_RE.match(request.headers.get("Range", "").strip())
    if match and (match.group(1) or match.group(2)):
        if match.group(1):
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else size - 1
        else:  # "bytes=-500" = 500 byte terakhir
            start, end = max(size - int(match.group(2)), 0), size - 1
        end = min(end, size - 1)
        if start > end:
            response = HttpResponse(status=416)
            response["Content-Range"] = f"bytes */{size}"
            return response
        file = field_file.open("rb")
        file.seek(start)
        response = StreamingHttpResponse(_chunks(file, end - start + 1), status=206, content_type=kind)
        response["Content-Range"] = f"bytes {start}-{end}/{size}"
        response["Content-Length"] = str(end - start + 1)
    else:
        response = FileResponse(field_file.open("rb"), content_type=kind)
    response["Accept-Ranges"] = "bytes"
    response["Cache-Control"] = "private, max-age=3600"
    return response
