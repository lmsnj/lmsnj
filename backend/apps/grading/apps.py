from django.apps import AppConfig


class GradingConfig(AppConfig):
    """Penilaian langsung (Mapel Umum Tahap 3): guru memberi nilai tanpa pengumpulan dari siswa
    (tugas kertas, lisan, praktik di kelas, sikap, kuis QR)."""

    name = "apps.grading"
    verbose_name = "Penilaian Langsung"
