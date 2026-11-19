"""Plugin mapel untuk Media Pembelajaran Interaktif.

Setiap plugin mendaftarkan jenis langkahnya sendiri lewat `steps.register` saat modulnya diimpor. Modul ini
diimpor sekali oleh `LearningMediaConfig.ready()`. Plugin baru = tambah modul lalu impor di sini.
"""

from . import exposure, flowgorithm  # noqa: F401
