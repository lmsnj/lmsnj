import json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.materials.models import Material
from apps.materials.objective_quiz import quiz_counts, set_quizzes


class Command(BaseCommand):
    help = (
        "Pasang kuis per capaian ke sebuah materi dari file JSON: "
        '{"0": [soal capaian 1], "1": [soal capaian 2], ...} (lihat apps/materials/objective_quiz.py).'
    )

    def add_arguments(self, parser):
        parser.add_argument("material", type=int, help="ID materi.")
        parser.add_argument("file", help="Lokasi file JSON kuis.")
        parser.add_argument("--dry-run", action="store_true", help="Hanya periksa, tanpa menyimpan.")

    def handle(self, *args, **options):
        material = Material.objects.filter(pk=options["material"]).first()
        if material is None:
            raise CommandError(f"Materi dengan ID {options['material']} tidak ditemukan.")
        try:
            with open(options["file"], encoding="utf-8") as handle:
                quizzes = json.load(handle)
        except (OSError, ValueError) as error:
            raise CommandError(f"File tidak bisa dibaca: {error}")
        try:
            with transaction.atomic():
                set_quizzes(material, quizzes)
                counts = quiz_counts(material)
                if options["dry_run"]:
                    transaction.set_rollback(True)
        except ValidationError as error:
            raise CommandError(f"Kuis tidak valid: {error.detail}")
        self.stdout.write(f"Materi: {material.title}")
        for number, (objective, count) in enumerate(zip(material.objectives, counts), start=1):
            self.stdout.write(f"  {number}. {objective} -> {count or 'tanpa'} soal")
        state = "UJI COBA, tidak disimpan." if options["dry_run"] else "Kuis capaian disimpan."
        self.stdout.write(self.style.SUCCESS(state))
