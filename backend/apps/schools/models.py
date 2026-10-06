from django.db import models

from apps.common.files import RandomUploadPath


class Level(models.TextChoices):
    SD = "sd", "SD"
    MI = "mi", "MI"
    SMP = "smp", "SMP"
    MTS = "mts", "MTs"
    SMA = "sma", "SMA"
    MA = "ma", "MA"
    SMK = "smk", "SMK"


# Tingkat kelas per jenjang, urut dari yang terendah. Tingkat terakhir = lulus saat kenaikan kelas.
LEVEL_GRADES = {
    Level.SD: ["I", "II", "III", "IV", "V", "VI"],
    Level.MI: ["I", "II", "III", "IV", "V", "VI"],
    Level.SMP: ["VII", "VIII", "IX"],
    Level.MTS: ["VII", "VIII", "IX"],
    Level.SMA: ["X", "XI", "XII"],
    Level.MA: ["X", "XI", "XII"],
    Level.SMK: ["X", "XI", "XII"],
}


class School(models.Model):
    """Satu sekolah di bawah yayasan. Kelas dan mapel menempel ke sekolah; data lain (pengampu,
    materi, tugas, asesmen) ikut sekolah dari kelasnya, jadi tidak perlu kolom sekolah sendiri."""

    code = models.SlugField("kode", max_length=20, unique=True, help_text="Singkatan huruf kecil, mis. smknj")
    name = models.CharField("nama sekolah", max_length=100)
    level = models.CharField("jenjang", max_length=3, choices=Level.choices)
    slogan = models.CharField("slogan", max_length=150, blank=True)
    # Kosong = memakai logo bawaan (placeholder) di frontend.
    logo = models.FileField("logo", upload_to=RandomUploadPath("schools"), blank=True)
    # Sekolah nonaktif tidak bisa dibuka lagi, tetapi datanya tetap tersimpan.
    is_active = models.BooleanField("aktif", default=True)
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "sekolah"
        verbose_name_plural = "sekolah"
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def grades(self):
        return LEVEL_GRADES[self.level]
