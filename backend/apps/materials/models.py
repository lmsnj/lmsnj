from django.conf import settings
from django.core.validators import MaxValueValidator
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver

from apps.academics.models import TeachingAssignment
from apps.common.files import RandomUploadPath, delete_file


class MaterialType(models.TextChoices):
    PDF = "pdf", "PDF"
    VIDEO = "video", "Video"
    LINK = "link", "Link"


class Chapter(models.Model):
    """Bab: kumpulan materi berurutan dalam satu kelas-mapel, diakhiri Post Test (opsional).

    Materi bab berikutnya baru terbuka setelah Post Test bab sebelumnya tuntas (lihat progress.py).
    Materi tanpa bab tetap bisa dipakai (ditampilkan sebelum bab pertama)."""

    teaching_assignment = models.ForeignKey(
        TeachingAssignment, verbose_name="pengampu", on_delete=models.PROTECT, related_name="chapters"
    )
    title = models.CharField("judul", max_length=200)
    # "Yang akan dipelajari" di bab ini (tampil di kolom kiri tampilan siswa).
    description = models.TextField("yang akan dipelajari", blank=True)
    order = models.PositiveIntegerField("urutan", default=0)
    post_test = models.ForeignKey(
        "assessments.Assessment",
        verbose_name="post test",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="post_test_chapters",
    )
    created_at = models.DateTimeField("dibuat", auto_now_add=True)

    class Meta:
        verbose_name = "bab"
        verbose_name_plural = "bab"
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class Material(models.Model):
    # PROTECT: pengampu yang masih punya materi tidak bisa dihapus tanpa sengaja.
    # Jika guru pengampu diganti, cukup ubah data pengampunya; materi tetap ada.
    teaching_assignment = models.ForeignKey(
        TeachingAssignment,
        verbose_name="pengampu",
        on_delete=models.PROTECT,
        related_name="materials",
    )
    # Kosong = materi tanpa bab. Bab dihapus -> materinya menjadi tanpa bab (tidak ikut terhapus).
    chapter = models.ForeignKey(
        Chapter,
        verbose_name="bab",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="materials",
    )
    title = models.CharField("judul", max_length=200)
    description = models.TextField("deskripsi", blank=True)
    material_type = models.CharField("tipe", max_length=10, choices=MaterialType.choices)
    file = models.FileField("file", upload_to=RandomUploadPath("materials"), blank=True)
    original_filename = models.CharField("nama file asli", max_length=255, blank=True)
    url = models.URLField("URL", max_length=500, blank=True)
    is_published = models.BooleanField("terbit", default=False)

    # Urutan & capaian (lihat progress.py). Materi ke-N terbuka bagi siswa setelah capaian materi
    # sebelumnya (di kelas-mapel yang sama) terpenuhi.
    order = models.PositiveIntegerField("urutan", default=0)
    # Daftar kalimat capaian, mis. "Saya bisa menyebutkan 5 tag HTML". Siswa mencentang semuanya.
    objectives = models.JSONField("capaian", default=list, blank=True)
    # Konsep kunci "istilah = penjelasan" (satu per baris), bahan asesmen otomatis. Tidak dikirim ke siswa.
    concepts = models.JSONField("konsep kunci", default=list, blank=True)
    # Kuis kecil per capaian: {teks capaian: {"content": [...], "key": {...}, "spec": [...]}}. Dikunci dengan
    # teks capaian agar tidak tertukar saat urutan capaian diubah. Lihat objective_quiz.py.
    objective_quizzes = models.JSONField("kuis capaian", default=dict, blank=True)
    # Latihan Pemahaman satu materi ({"spec", "content", "key"}, kosong = tanpa latihan). Dikerjakan
    # setelah semua konten dibuka; harus benar semua (boleh mengulang). Lihat objective_quiz.py.
    practice_quiz = models.JSONField("latihan pemahaman", default=dict, blank=True)
    required_task = models.ForeignKey(
        "tasks.Task",
        verbose_name="syarat tugas",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="required_by_materials",
    )
    # Kosong = cukup dikumpulkan. Diisi = nilai tugas (skala 100) minimal sebesar ini.
    min_task_score = models.PositiveSmallIntegerField(
        "nilai tugas minimal", null=True, blank=True, validators=[MaxValueValidator(100)]
    )
    required_assessment = models.ForeignKey(
        "assessments.Assessment",
        verbose_name="syarat asesmen (tuntas)",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="required_by_materials",
    )
    require_teacher_approval = models.BooleanField("perlu disahkan guru", default=False)
    # Siswa menulis "cerita reflektif" (apa yang dipelajari, apa yang masih sulit) sebelum lanjut.
    # Materi lama dimigrasikan dengan nilai False agar progres siswa yang sudah jalan tidak terkunci.
    require_reflection = models.BooleanField("wajib cerita reflektif", default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="dibuat oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    created_at = models.DateTimeField("dibuat", auto_now_add=True)
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "materi"
        verbose_name_plural = "materi"
        ordering = ["order", "created_at"]

    def __str__(self):
        return self.title

    def delete(self, *args, **kwargs):
        # File di disk ikut dihapus agar tidak menumpuk.
        file = self.file
        result = super().delete(*args, **kwargs)
        delete_file(file)
        return result


class MaterialItem(models.Model):
    """Konten tambahan sebuah materi (mis. video pengantar + PDF ringkasan dalam satu materi).

    Konten utama tetap di Material (file/url) agar materi lama tidak perlu dipindah; konten tambahan
    tampil sesudahnya sesuai `order`. Siswa harus membuka SEMUA konten (lihat progress.py)."""

    material = models.ForeignKey(
        Material, verbose_name="materi", on_delete=models.CASCADE, related_name="items"
    )
    title = models.CharField("judul", max_length=200)
    material_type = models.CharField("tipe", max_length=10, choices=MaterialType.choices)
    file = models.FileField("file", upload_to=RandomUploadPath("materials"), blank=True)
    original_filename = models.CharField("nama file asli", max_length=255, blank=True)
    url = models.URLField("URL", max_length=500, blank=True)
    order = models.PositiveIntegerField("urutan", default=0)
    created_at = models.DateTimeField("dibuat", auto_now_add=True)

    class Meta:
        verbose_name = "konten materi"
        verbose_name_plural = "konten materi"
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


@receiver(post_delete, sender=MaterialItem)
def delete_item_file(sender, instance, **kwargs):
    # Sinyal (bukan delete()) agar file ikut terhapus juga saat materinya dihapus (CASCADE).
    delete_file(instance.file)


class MaterialProgress(models.Model):
    """Progres satu siswa di satu materi: dibuka, capaian yang dicentang, pengesahan/pembukaan guru."""

    material = models.ForeignKey(
        Material, verbose_name="materi", on_delete=models.CASCADE, related_name="progress"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="siswa",
        on_delete=models.CASCADE,
        related_name="material_progress",
    )
    opened_at = models.DateTimeField("pertama dibuka", null=True, blank=True)
    # Indeks capaian (Material.objectives) yang sudah dicentang siswa.
    checked_objectives = models.JSONField("capaian dicentang", default=list, blank=True)
    # Id konten tambahan (MaterialItem) yang sudah dibuka siswa.
    opened_items = models.JSONField("konten dibuka", default=list, blank=True)
    practice_passed_at = models.DateTimeField("lulus latihan pemahaman", null=True, blank=True)
    reflection = models.TextField("cerita reflektif", blank=True)
    reflected_at = models.DateTimeField("refleksi ditulis", null=True, blank=True)
    teacher_approved = models.BooleanField("disahkan guru", default=False)
    # Guru menandai materi ini tercapai untuk siswa tertentu (mis. siswa pindahan), apa pun syaratnya.
    unlocked = models.BooleanField("dibuka guru", default=False)
    note = models.CharField("catatan guru", max_length=200, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="diubah oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "progres materi"
        verbose_name_plural = "progres materi"
        constraints = [
            models.UniqueConstraint(fields=["material", "student"], name="unique_material_progress")
        ]

    def __str__(self):
        return f"{self.student} - {self.material}"


class CodeLanguage(models.TextChoices):
    HTML = "html", "HTML/CSS/JS"
    PYTHON = "python", "Python"
    PHP = "php", "PHP"


class CodeExercise(models.Model):
    """Soal Praktik (menulis kode) di satu materi. Kode siswa dijalankan & diperiksa di BROWSER siswa
    (bukan di server), jadi `checks` ikut dikirim ke siswa. Aturan bentuk `checks` di code_practice.py."""

    material = models.ForeignKey(
        Material, verbose_name="materi", on_delete=models.CASCADE, related_name="exercises"
    )
    order = models.PositiveIntegerField("urutan", default=0)
    title = models.CharField("judul", max_length=200)
    language = models.CharField("bahasa", max_length=10, choices=CodeLanguage.choices)
    instructions = models.TextField("petunjuk", blank=True)
    starter_code = models.TextField("kode awal", blank=True)
    checks = models.JSONField("pemeriksaan", default=list)
    created_at = models.DateTimeField("dibuat", auto_now_add=True)
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "soal praktik"
        verbose_name_plural = "soal praktik"

    def __str__(self):
        return self.title


class CodeAttempt(models.Model):
    """Pekerjaan satu siswa di satu soal praktik: kode terakhir, kode saat lulus, dan jumlah percobaan."""

    exercise = models.ForeignKey(
        CodeExercise, verbose_name="soal praktik", on_delete=models.CASCADE, related_name="attempts"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="siswa",
        on_delete=models.CASCADE,
        related_name="code_attempts",
    )
    code = models.TextField("kode terakhir", blank=True)
    passed_code = models.TextField("kode saat lulus", blank=True)
    passed_at = models.DateTimeField("lulus", null=True, blank=True)
    check_count = models.PositiveIntegerField("jumlah periksa", default=0)
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "pekerjaan praktik"
        verbose_name_plural = "pekerjaan praktik"
        constraints = [
            models.UniqueConstraint(fields=["exercise", "student"], name="unique_code_attempt"),
        ]

    def __str__(self):
        return f"{self.student} - {self.exercise}"
