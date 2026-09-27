from django.http import Http404
from rest_framework.views import exception_handler

NOT_FOUND_MESSAGE = "Data tidak ditemukan, atau Anda tidak memiliki akses ke data ini."


def api_exception_handler(exc, context):
    """Seperti handler bawaan DRF, tetapi pesan 404 diganti ke Bahasa Indonesia.

    Pesan bawaan Django ("No Material matches the given query.") berbahasa Inggris dan
    menyebut nama model. Pesan 404 buatan kita sendiri (NotFound dengan teks khusus) tetap dipakai.
    """
    if isinstance(exc, Http404):
        response = exception_handler(exc, context)
        response.data = {"detail": NOT_FOUND_MESSAGE}
        return response
    return exception_handler(exc, context)
