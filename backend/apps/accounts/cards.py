"""Data kartu akun (nama, username, password) untuk dicetak atau dibagikan lewat WhatsApp.

Password tersimpan sebagai hash, jadi password lama TIDAK bisa ditampilkan lagi. Kartu hanya bisa
berisi password jika password dibuat ulang di sini (`reset_password=True`); password baru itu
dikembalikan sekali di respons dan tidak disimpan dalam bentuk teks biasa di mana pun.
"""

from django.db import transaction

from .models import Role, User
from .user_import import generate_password, hash_initial_password

# Batas sekali cetak (± 50 lembar A4), agar satu permintaan tidak terlalu lama.
MAX_CARDS = 500


def card_data(user, password=None):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "username": user.username,
        "role": user.role,
        "role_display": user.get_role_display(),
        "classroom": user.classroom.name if user.classroom_id else None,
        "nis": user.nis,
        "nip": user.nip,
        "password": password,
    }


@transaction.atomic
def build_cards(users, reset_password=False):
    """Kartu untuk `users` (queryset yang sudah disaring hak aksesnya), urut kelas lalu nama.
    reset_password=True: setiap akun diberi password baru (kata + 4 angka, seperti impor)."""
    users = list(
        users.exclude(role=Role.FOUNDATION)
        .select_related("classroom")
        .order_by("classroom__name", "full_name")
    )
    cards = []
    for user in users:
        password = None
        if reset_password:
            password = generate_password()
            # Hash ringan seperti impor (ratusan akun sekaligus tetap cepat); otomatis diperkuat
            # Django saat pengguna login pertama kali.
            user.password = hash_initial_password(password)
        cards.append(card_data(user, password))
    if reset_password:
        User.objects.bulk_update(users, ["password"])
    return cards
