"""Media Pembelajaran Interaktif (MPI): Media -> Bagian -> Stasiun -> Langkah.

Isi media adalah DATA (JSON, lihat schema.py), bukan kode: pemutar di frontend hanya membaca data ini.
Guru menyusun `draft`; menerbitkan = membuat `InteractiveMediaVersion` baru (salinan terkompilasi yang
memisahkan kunci jawaban). Siswa selalu memakai versi terbaru.

Media dipakai di kelas dengan ditempelkan ke Materi (`Material.material_type = "media"`), jadi ikut
jalur belajar, bab, tim pengampu, dan Salin ke Kelas Lain. Progres siswa disimpan per materi (= per
kelas) dan per id stasiun/langkah, sehingga satu media bisa dipakai di banyak kelas.
"""

from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver

from apps.common.files import RandomUploadPath, delete_file

from .schema import SCHEMA_VERSION, empty_media


class InteractiveMedia(models.Model):
    # school kosong = Pustaka Media global milik Super Admin (dibagikan lewat InteractiveMediaShare).
    school = models.ForeignKey(
        "schools.School",
        verbose_name="sekolah",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="interactive_media",
    )
    subject = models.ForeignKey(
        "academics.Subject",
        verbose_name="mapel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interactive_media",
    )
    title = models.CharField("judul", max_length=200)
    description = models.TextField("deskripsi", blank=True)
    schema_version = models.PositiveSmallIntegerField("versi skema", default=SCHEMA_VERSION)
    draft = models.JSONField("draf isi", default=empty_media, blank=True)
    # Kompilasi draf terakhir untuk pratinjau guru (agar jawaban pratinjau bisa diperiksa server).
    preview = models.JSONField("pratinjau", default=dict, blank=True)
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
        verbose_name = "media interaktif"
        verbose_name_plural = "media interaktif"
        ordering = ["-updated_at", "-id"]

    def __str__(self):
        return self.title

    def latest_version(self):
        return self.versions.order_by("-number").first()


class InteractiveMediaVersion(models.Model):
    """Salinan media saat diterbitkan. Tidak pernah diubah; jawaban siswa dinilai dengan versi yang
    ia pakai, jadi menerbitkan ulang di tengah pelajaran tidak membuat jawaban salah dinilai."""

    media = models.ForeignKey(InteractiveMedia, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField("versi")
    # Draf lengkap saat terbit: untuk memulihkan versi lama dan menyalin media ke sekolah/guru lain.
    source = models.JSONField("draf saat terbit", default=dict)
    content = models.JSONField("isi untuk siswa")
    keys = models.JSONField("kunci jawaban", default=dict)
    required_stations = models.JSONField("stasiun wajib", default=list)
    note = models.CharField("catatan", max_length=200, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    published_at = models.DateTimeField("diterbitkan", auto_now_add=True)

    class Meta:
        verbose_name = "versi media"
        verbose_name_plural = "versi media"
        ordering = ["-number"]
        constraints = [models.UniqueConstraint(fields=["media", "number"], name="unique_media_version")]

    def __str__(self):
        return f"{self.media} v{self.number}"


class InteractiveMediaShare(models.Model):
    """Media Pustaka (tanpa sekolah) yang dibagikan Super Admin ke sekolah tertentu."""

    media = models.ForeignKey(InteractiveMedia, on_delete=models.CASCADE, related_name="shares")
    school = models.ForeignKey("schools.School", on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField("dibagikan", auto_now_add=True)

    class Meta:
        verbose_name = "media dibagikan"
        verbose_name_plural = "media dibagikan"
        constraints = [models.UniqueConstraint(fields=["media", "school"], name="unique_media_share")]


class StudentMediaRecord(models.Model):
    """Dasar data milik satu siswa di satu materi bermedia."""

    material = models.ForeignKey("materials.Material", on_delete=models.CASCADE, related_name="+")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")

    class Meta:
        abstract = True


class InteractiveMediaProgress(StudentMediaRecord):
    """Progres siswa di satu stasiun. `run` = keadaan percobaan yang sedang berjalan per langkah
    ({id langkah: {"done", "mistakes", "hints", "revealed"}}); bintang & selesai tidak pernah turun."""

    station_id = models.CharField("stasiun", max_length=40)
    stars = models.PositiveSmallIntegerField("bintang terbaik", default=0)
    mistakes = models.PositiveIntegerField("salah (percobaan terakhir)", default=0)
    total_mistakes = models.PositiveIntegerField("salah (semua)", default=0)
    hints_used = models.PositiveIntegerField("petunjuk dipakai", default=0)
    time_spent = models.PositiveIntegerField("waktu belajar (detik)", default=0)
    run = models.JSONField("percobaan berjalan", default=dict, blank=True)
    last_step_id = models.CharField("langkah terakhir", max_length=40, blank=True)
    started_at = models.DateTimeField("mulai", auto_now_add=True)
    completed_at = models.DateTimeField("selesai", null=True, blank=True)
    updated_at = models.DateTimeField("aktivitas terakhir", auto_now=True)

    class Meta:
        verbose_name = "progres media"
        verbose_name_plural = "progres media"
        constraints = [
            models.UniqueConstraint(
                fields=["material", "student", "station_id"], name="unique_media_progress"
            )
        ]


class InteractiveMediaAttempt(StudentMediaRecord):
    """Satu jawaban siswa di satu langkah (untuk analisis kesulitan & jawaban salah terbanyak)."""

    version = models.ForeignKey(
        InteractiveMediaVersion, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    station_id = models.CharField("stasiun", max_length=40)
    step_id = models.CharField("langkah", max_length=40)
    kind = models.CharField("jenis", max_length=40)
    response = models.JSONField("jawaban", default=dict)
    answer_text = models.CharField("ringkasan jawaban", max_length=500, blank=True)
    correct = models.BooleanField("benar")
    hint_level = models.PositiveSmallIntegerField("petunjuk dibuka", default=0)
    # Id acak dari HP siswa: kiriman ulang dari antrean offline tidak tercatat dua kali.
    client_uid = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField("dijawab", auto_now_add=True)

    class Meta:
        verbose_name = "jawaban media"
        verbose_name_plural = "jawaban media"
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["material", "step_id"])]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "client_uid"],
                condition=~models.Q(client_uid=""),
                name="unique_media_attempt_uid",
            )
        ]


class InteractiveMediaReflection(StudentMediaRecord):
    station_id = models.CharField("stasiun", max_length=40)
    text = models.TextField("refleksi")
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "refleksi media"
        verbose_name_plural = "refleksi media"
        constraints = [
            models.UniqueConstraint(
                fields=["material", "student", "station_id"], name="unique_media_reflection"
            )
        ]


class InteractiveMediaBadge(StudentMediaRecord):
    code = models.CharField("kode", max_length=60)
    title = models.CharField("nama", max_length=60)
    icon = models.CharField("ikon", max_length=40, default="award")
    earned_at = models.DateTimeField("diperoleh", auto_now_add=True)

    class Meta:
        verbose_name = "lencana media"
        verbose_name_plural = "lencana media"
        constraints = [
            models.UniqueConstraint(fields=["material", "student", "code"], name="unique_media_badge")
        ]


class InteractiveMediaAsset(models.Model):
    """Gambar yang diunggah guru untuk media (dikompres saat diunggah, lihat assets.py). Dirujuk di isi
    media sebagai "asset:<id>" dan hanya diambil lewat /api/media-assets/<id>/ (hak akses dicek)."""

    media = models.ForeignKey(InteractiveMedia, on_delete=models.CASCADE, related_name="assets")
    file = models.FileField("file", upload_to=RandomUploadPath("media_assets"))
    original_filename = models.CharField("nama file asli", max_length=255, blank=True)
    size = models.PositiveIntegerField("ukuran (byte)", default=0)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField("diunggah", auto_now_add=True)

    class Meta:
        verbose_name = "gambar media"
        verbose_name_plural = "gambar media"
        ordering = ["-created_at", "-id"]

    @property
    def ref(self):
        return f"asset:{self.id}"


@receiver(post_delete, sender=InteractiveMediaAsset)
def delete_asset_file(sender, instance, **kwargs):
    delete_file(instance.file)
