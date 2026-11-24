from django.apps import AppConfig


class QrQuizConfig(AppConfig):
    """Kuis kartu QR (Mapel Umum Tahap 5): seluruh kelas menjawab dengan mengangkat kartu QR,
    HP guru memindai, nilainya masuk otomatis sebagai penilaian langsung (apps.grading)."""

    name = "apps.qr_quiz"
    verbose_name = "Kuis Kartu QR"
