"""Isi database dengan data contoh untuk demo dan latihan.

    python manage.py seed_demo

Aman dijalankan berulang kali: data yang sudah ada (dicocokkan lewat username, kode mapel,
nama kelas, atau judul) tidak diubah, dan password akun yang sudah ada tidak ditimpa.
"""

import random
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.materials.models import Material, MaterialType
from apps.tasks.models import Submission, Task

PASSWORDS = {
    Role.ADMIN: "AdminSmknj#2026",
    Role.TEACHER: "Belajar#Koding26",
    Role.STUDENT: "Siswa#Smknj26",
}

TEACHERS = [
    ("guru.rpl", "Ahmad Guru RPL", "198501012010"),
    ("bu.siti", "Siti Aminah", "198702022012"),
    ("pak.budi", "Budi Santoso", "199003032015"),
]

SUBJECTS = [
    ("PWEB", "Pemrograman Web"),
    ("PBO", "Pemrograman Berorientasi Objek"),
    ("BD", "Basis Data"),
    ("JARKOM", "Jaringan Komputer"),
    ("BINDO", "Bahasa Indonesia"),
]

# (nama kelas, tingkat, jurusan, username wali kelas)
CLASSROOMS = [
    ("X RPL 1", "X", "RPL", "bu.siti"),
    ("XI RPL 1", "XI", "RPL", "guru.rpl"),
    ("XI TKJ 1", "XI", "TKJ", "pak.budi"),
]

# (username, nama lengkap, NIS, kelas). Kelas None = contoh siswa yang belum punya kelas.
STUDENTS = [
    ("rizki", "Muhammad Rizki", "26001", "XI RPL 1"),
    ("aisyah", "Aisyah Putri", "26002", "XI RPL 1"),
    ("fajar", "Fajar Maulana", "26003", None),
    ("dimas", "Dimas Pratama", "26004", "XI RPL 1"),
    ("nabila", "Nabila Zahra", "26005", "XI RPL 1"),
    ("fauzan", "Ahmad Fauzan", "26006", "XI RPL 1"),
    ("salsa", "Salsabila Rahma", "26007", "XI RPL 1"),
    ("hafiz", "Hafiz Ramadhan", "26101", "X RPL 1"),
    ("zahra", "Fatimah Az-Zahra", "26102", "X RPL 1"),
    ("ilham", "Ilham Hidayat", "26103", "X RPL 1"),
    ("putri", "Putri Maharani", "26104", "X RPL 1"),
    ("bagus", "Bagus Setiawan", "26201", "XI TKJ 1"),
    ("citra", "Citra Lestari", "26202", "XI TKJ 1"),
    ("eko", "Eko Prasetyo", "26203", "XI TKJ 1"),
    ("farah", "Farah Nadia", "26204", "XI TKJ 1"),
]

# (kelas, kode mapel, username guru)
ASSIGNMENTS = [
    ("XI RPL 1", "PWEB", "guru.rpl"),
    ("XI RPL 1", "PBO", "guru.rpl"),
    ("XI RPL 1", "BINDO", "bu.siti"),
    ("X RPL 1", "BD", "guru.rpl"),
    ("X RPL 1", "BINDO", "bu.siti"),
    ("XI TKJ 1", "JARKOM", "pak.budi"),
    ("XI TKJ 1", "BINDO", "bu.siti"),
]

# Konten per mapel. Tugas: (judul, instruksi, selisih hari tenggat dari sekarang).
CONTENT = {
    "PWEB": {
        "pdf": "Modul 1: Dasar HTML",
        "video": ("Video: Struktur Dokumen HTML", "https://www.youtube.com/watch?v=UB1O30fR-EE"),
        "link": ("Referensi HTML (MDN)", "https://developer.mozilla.org/id/docs/Web/HTML"),
        "tasks": [
            ("Latihan: Tag Heading & Paragraf", "Tulis 3 contoh penggunaan tag h1 sampai h6.", -3),
            (
                "Tugas 1: Halaman Profil Diri",
                "Buat halaman HTML berisi nama, foto, hobi, dan cita-cita.\nKumpulkan dalam file .zip.",
                5,
            ),
        ],
    },
    "PBO": {
        "pdf": "Modul: Class dan Object",
        "link": ("Belajar OOP di Python", "https://docs.python.org/id/3/tutorial/classes.html"),
        "tasks": [("Latihan: Membuat Class Siswa", "Buat class Siswa dengan atribut nama dan NIS.", -5)],
    },
    "BD": {
        "pdf": "Modul: Pengenalan Basis Data",
        "tasks": [
            ("Tugas: Rancang Tabel Perpustakaan", "Buat rancangan tabel buku, anggota, dan peminjaman.", 7)
        ],
    },
    "JARKOM": {
        "pdf": "Modul: Topologi Jaringan",
        "video": ("Video: Mengenal IP Address", "https://www.youtube.com/watch?v=5WfiTHiU4x8"),
        "tasks": [
            ("Latihan: Gambar Topologi Star", "Gambar topologi star untuk lab komputer sekolah.", -2),
            ("Tugas: Konfigurasi IP Kelas C", "Tentukan pembagian IP untuk 3 lab komputer.", 4),
        ],
    },
    "BINDO": {
        "link": ("KBBI Daring", "https://kbbi.kemdikbud.go.id/"),
        "tasks": [("Menulis Teks Prosedur", "Tulis teks prosedur cara memasang aplikasi di komputer.", 3)],
    },
}


def current_academic_year(now):
    start = now.year if now.month >= 7 else now.year - 1
    return f"{start}/{start + 1}"


def make_pdf(title):
    """PDF satu halaman yang valid, cukup untuk demo penampil PDF."""
    text = title.replace("\\", "").replace("(", "").replace(")", "")
    stream = (
        f"BT /F1 22 Tf 60 760 Td ({text}) Tj 0 -40 Td /F1 12 Tf (Materi contoh LMS SMKS Nurul Jadid) Tj ET"
    )
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        "/Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = "%PDF-1.4\n"
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out.encode("latin-1")))
        out += f"{number} 0 obj\n{body}\nendobj\n"
    xref = len(out.encode("latin-1"))
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    out += "".join(f"{offset:010d} 00000 n \n" for offset in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return out.encode("latin-1", errors="replace")


class Command(BaseCommand):
    help = "Isi database dengan data contoh (guru, siswa, kelas, mapel, materi, tugas, nilai)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Tetap jalankan walaupun DEBUG=False (jangan dipakai di server sekolah yang asli).",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "DEBUG=False: seed_demo hanya untuk pengembangan. Tambahkan --force jika yakin."
            )

        self.created = {}
        # Nilai acak yang sama setiap kali dijalankan, agar data demo konsisten.
        self.random = random.Random(2026)
        self.now = timezone.now()
        with transaction.atomic():
            self.seed()
        self.report()

    def count(self, label, created):
        if created:
            self.created[label] = self.created.get(label, 0) + 1

    def user(self, username, full_name, role, **extra):
        user = User.objects.filter(username=username).first()
        if user:
            return user
        # NIS/NIP bisa saja sudah dipakai akun lain; lewati agar tidak melanggar aturan unique.
        for field in ("nis", "nip"):
            if extra.get(field) and User.objects.filter(**{field: extra[field]}).exists():
                extra.pop(field)
        user = User.objects.create_user(
            username=username, password=PASSWORDS[role], full_name=full_name, role=role, **extra
        )
        self.count("pengguna", True)
        return user

    def seed(self):
        year = current_academic_year(self.now)
        if not User.objects.filter(role=Role.ADMIN).exists():
            self.user("admin", "Administrator", Role.ADMIN, is_staff=True, is_superuser=True)

        teachers = {u: self.user(u, name, Role.TEACHER, nip=nip) for u, name, nip in TEACHERS}

        subjects = {}
        for code, name in SUBJECTS:
            subjects[code], created = Subject.objects.get_or_create(code=code, defaults={"name": name})
            self.count("mapel", created)

        classrooms = {}
        for name, grade, major, homeroom in CLASSROOMS:
            classrooms[name], created = Classroom.objects.get_or_create(
                name=name,
                academic_year=year,
                defaults={"grade": grade, "major": major, "homeroom_teacher": teachers[homeroom]},
            )
            self.count("kelas", created)

        for username, full_name, nis, classroom in STUDENTS:
            student = self.user(
                username, full_name, Role.STUDENT, nis=nis, classroom=classrooms.get(classroom)
            )
            # Siswa lama yang belum punya kelas dimasukkan ke kelas contohnya.
            if classroom and student.classroom_id is None:
                student.classroom = classrooms[classroom]
                student.save(update_fields=["classroom"])

        for classroom, code, username in ASSIGNMENTS:
            assignment, created = TeachingAssignment.objects.get_or_create(
                teacher=teachers[username], subject=subjects[code], classroom=classrooms[classroom]
            )
            self.count("pengampu", created)
            self.seed_content(assignment, CONTENT[code])

    def seed_content(self, assignment, content):
        teacher = assignment.teacher
        if "pdf" in content:
            title = content["pdf"]
            material, created = Material.objects.get_or_create(
                teaching_assignment=assignment,
                title=title,
                defaults={
                    "material_type": MaterialType.PDF,
                    "description": "Baca modul ini sebelum praktik.",
                    "is_published": True,
                    "created_by": teacher,
                },
            )
            if created:
                material.file.save(f"{title}.pdf", ContentFile(make_pdf(title)), save=False)
                material.original_filename = f"{title}.pdf"
                material.save()
            self.count("materi", created)
        for kind in ("video", "link"):
            if kind in content:
                title, url = content[kind]
                _, created = Material.objects.get_or_create(
                    teaching_assignment=assignment,
                    title=title,
                    defaults={"material_type": kind, "url": url, "is_published": True, "created_by": teacher},
                )
                self.count("materi", created)

        for title, instructions, due_days in content["tasks"]:
            task, created = Task.objects.get_or_create(
                teaching_assignment=assignment,
                title=title,
                defaults={
                    "instructions": instructions,
                    "due_at": self.now + timedelta(days=due_days),
                    "is_published": True,
                    "created_by": teacher,
                },
            )
            self.count("tugas", created)
            if created:
                self.seed_submissions(task, past_due=due_days < 0)

    def seed_submissions(self, task, past_due):
        """Tugas yang sudah lewat: sebagian besar siswa kumpul (beberapa terlambat) dan sudah dinilai.
        Tugas yang belum lewat: sebagian siswa sudah kumpul, belum dinilai."""
        for student in task.teaching_assignment.classroom.students.order_by("full_name"):
            if Submission.objects.filter(task=task, student=student).exists():
                continue
            chance = self.random.random()
            if chance < (0.2 if past_due else 0.5):
                continue  # tidak/belum mengumpulkan
            is_late = past_due and chance > 0.85
            submitted_at = task.due_at + (timedelta(hours=5) if is_late else -timedelta(days=1))
            graded = past_due and chance < 0.8
            Submission.objects.create(
                task=task,
                student=student,
                text_answer=f"Jawaban {student.full_name} untuk {task.title}.",
                is_late=is_late,
                submitted_at=min(submitted_at, self.now),
                score=self.random.randint(65, 98) if graded else None,
                feedback="Kerja bagus, pertahankan!" if graded and chance < 0.5 else "",
                graded_by=task.teaching_assignment.teacher if graded else None,
                graded_at=self.now if graded else None,
            )
            self.count("pengumpulan", True)

    def report(self):
        if self.created:
            summary = ", ".join(f"{count} {label}" for label, count in self.created.items())
            self.stdout.write(self.style.SUCCESS(f"Data demo ditambahkan: {summary}."))
        else:
            self.stdout.write("Data demo sudah lengkap, tidak ada yang ditambahkan.")
        self.stdout.write(
            "\nAkun demo (password akun yang sudah ada sebelumnya tidak diubah):\n"
            f"  Admin : admin                           / {PASSWORDS[Role.ADMIN]}\n"
            f"  Guru  : guru.rpl, bu.siti, pak.budi     / {PASSWORDS[Role.TEACHER]}\n"
            f"  Siswa : rizki, aisyah, dimas, hafiz, ... / {PASSWORDS[Role.STUDENT]}\n"
            "Ganti semua password ini sebelum aplikasi dipakai sungguhan."
        )
