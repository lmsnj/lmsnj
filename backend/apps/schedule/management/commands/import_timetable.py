import csv
import json

from django.core.management.base import BaseCommand, CommandError

from apps.schedule.timetable_import import TimetableImportError, import_timetable
from apps.schools.models import School


class Command(BaseCommand):
    help = "Impor jadwal pelajaran mingguan (mapel, kelas, guru, pengampu, jadwal) dari file JSON."

    def add_arguments(self, parser):
        parser.add_argument("file", help="Lokasi file JSON jadwal.")
        parser.add_argument(
            "--school", required=True, help="Kode sekolah tujuan (mis. smknj). Sekolah lain tidak tersentuh."
        )
        parser.add_argument(
            "--dry-run", action="store_true", help="Hanya periksa dan laporkan, tanpa menyimpan."
        )
        parser.add_argument(
            "--all-teachers",
            action="store_true",
            help="Buat akun untuk semua guru di file, termasuk yang tidak punya jam mengajar.",
        )
        parser.add_argument(
            "--no-activate", action="store_true", help="Jangan jadikan jadwal ini jadwal aktif."
        )
        parser.add_argument(
            "--passwords-file",
            help="Simpan username & password awal akun guru baru ke file CSV ini (selain ditampilkan).",
        )

    def handle(self, *args, **options):
        school = School.objects.filter(code=options["school"].strip().lower()).first()
        if school is None:
            codes = ", ".join(School.objects.values_list("code", flat=True)) or "-"
            raise CommandError(f"Sekolah '{options['school']}' tidak ditemukan. Kode yang ada: {codes}")
        try:
            with open(options["file"], encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError) as error:
            raise CommandError(f"File tidak bisa dibaca: {error}")
        try:
            report = import_timetable(
                data,
                school=school,
                dry_run=options["dry_run"],
                all_teachers=options["all_teachers"],
                activate=not options["no_activate"],
            )
        except TimetableImportError as error:
            raise CommandError(
                "Impor dibatalkan, tidak ada data yang disimpan:\n- " + "\n- ".join(error.messages)
            )
        except KeyError as error:
            raise CommandError(f"Format file tidak sesuai: bagian {error} tidak ditemukan.")
        self.print_report(report)
        if options["passwords_file"] and report["teachers"]["created"] and not report["dry_run"]:
            self.write_passwords(options["passwords_file"], report["teachers"]["created"])

    def print_report(self, report):
        out = self.stdout.write
        out(self.style.MIGRATE_HEADING(f"Sekolah: {report['school']}"))
        if report["dry_run"]:
            out(self.style.WARNING("UJI COBA (--dry-run): tidak ada yang disimpan.\n"))

        def section(title, created, existing, extra=""):
            out(self.style.MIGRATE_HEADING(f"{title}: {created} baru, {existing} sudah ada{extra}"))

        subjects, classrooms = report["subjects"], report["classrooms"]
        teachers, assignments = report["teachers"], report["assignments"]
        section(
            "Mapel",
            len(subjects["created"]),
            subjects["existing"],
            f", {len(subjects['matched'])} dicocokkan",
        )
        for line in subjects["created"]:
            out(f"  + {line}")
        for line in subjects["matched"]:
            out(f"  = {line} (memakai mapel yang sudah ada)")
        section("Kelas", len(classrooms["created"]), classrooms["existing"])
        for line in classrooms["created"]:
            out(f"  + {line}")
        for line in classrooms["matched"]:
            out(f"  = {line} (memakai kelas yang sudah ada)")
        section(
            "Guru", len(teachers["created"]), teachers["existing"], f", {len(teachers['linked'])} dicocokkan"
        )
        for line in teachers["linked"]:
            out(f"  = {line} (kode guru diisi ke akun yang sudah ada)")
        for row in teachers["created"]:
            secret = "" if report["dry_run"] else f"  password: {row['password']}"
            out(f"  + {row['code']}  {row['name']}  username: {row['username']}{secret}")
        section("Pengampu", assignments["created"], assignments["existing"])
        out(f"  JP resmi diisi/diperbarui pada {assignments['hours_set']} pengampu")
        timetable = report["timetable"]
        state = "baru" if timetable["created"] else "diperbarui"
        active = "aktif" if timetable["active"] else "tidak aktif"
        out(self.style.MIGRATE_HEADING(f"Jadwal {timetable['code']} ({state}, {active})"))
        out(f"  {timetable['slots']} slot waktu, {timetable['entries']} isi jadwal")
        if teachers["created"] and not report["dry_run"]:
            out(
                self.style.WARNING("\nCatat password di atas sekarang: password hanya ditampilkan satu kali.")
            )
        if not report["dry_run"]:
            out(self.style.SUCCESS("\nImpor selesai."))

    def write_passwords(self, path, rows):
        # Pemisah ';' dan BOM agar langsung rapi dibuka di Excel berbahasa Indonesia.
        with open(path, "w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle, delimiter=";")
            writer.writerow(["Kode Guru", "Nama", "Username", "Password"])
            for row in rows:
                writer.writerow([row["code"], row["name"], row["username"], row["password"]])
        self.stdout.write(f"Password awal disimpan di {path}. Hapus file itu setelah dibagikan.")
