from django.apps import AppConfig


class LearningMediaConfig(AppConfig):
    name = "apps.learning_media"
    verbose_name = "Media Pembelajaran Interaktif"

    def ready(self):
        # Daftarkan jenis langkah plugin mapel (Flowgorithm, simulator exposure, ...).
        from . import plugins  # noqa: F401
