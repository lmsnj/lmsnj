from django.conf import settings
from django.db import models
from django.db.models import Q


class Scope(models.TextChoices):
    """Tingkat berlakunya satu pengaturan. Urutan pengecekan: kelas -> mapel -> kategori -> sekolah."""

    SCHOOL = "school", "Sekolah"
    CATEGORY = "category", "Kategori mapel"
    SUBJECT = "subject", "Mata pelajaran"
    CLASSROOM = "classroom", "Kelas"


class SchoolSetting(models.Model):
    """Nilai satu pengaturan yang DIUBAH admin. Pengaturan yang tidak punya baris di sini memakai
    nilai bawaan sistem (registry.py), jadi sekolah baru otomatis mendapat paket bawaan tanpa
    perlu membuat data apa pun.

    `scope_id` = id kategori/mapel/kelas; kosong untuk scope sekolah. Tidak memakai FK karena satu
    kolom dipakai untuk beberapa tabel; keabsahan id dicek di services.validate_scope."""

    school = models.ForeignKey(
        "schools.School", verbose_name="sekolah", on_delete=models.CASCADE, related_name="learning_settings"
    )
    scope = models.CharField("berlaku untuk", max_length=12, choices=Scope.choices, default=Scope.SCHOOL)
    scope_id = models.PositiveIntegerField("id cakupan", null=True, blank=True)
    key = models.CharField("kunci", max_length=64)
    value = models.JSONField("nilai")
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="diubah oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "pengaturan sekolah"
        verbose_name_plural = "pengaturan sekolah"
        ordering = ["school", "key", "scope", "scope_id"]
        constraints = [
            # Dua aturan unik karena NULL dianggap berbeda-beda oleh database.
            models.UniqueConstraint(
                fields=["school", "scope", "scope_id", "key"],
                condition=Q(scope_id__isnull=False),
                name="unique_setting_per_scope_item",
            ),
            models.UniqueConstraint(
                fields=["school", "scope", "key"],
                condition=Q(scope_id__isnull=True),
                name="unique_setting_per_scope",
            ),
        ]

    def __str__(self):
        target = f" #{self.scope_id}" if self.scope_id else ""
        return f"{self.school.code} {self.scope}{target} {self.key}"


class SettingChange(models.Model):
    """Riwayat perubahan pengaturan & saklar fitur: siapa, kapan, nilai lama, nilai baru.
    Nilai kosong (null) = memakai bawaan. Disimpan per kunci (bukan FK ke SchoolSetting) agar
    riwayat tetap ada walaupun pengaturannya dikembalikan ke bawaan (barisnya dihapus)."""

    school = models.ForeignKey(
        "schools.School", verbose_name="sekolah", on_delete=models.CASCADE, related_name="setting_changes"
    )
    scope = models.CharField("berlaku untuk", max_length=12, choices=Scope.choices, default=Scope.SCHOOL)
    scope_id = models.PositiveIntegerField("id cakupan", null=True, blank=True)
    key = models.CharField("kunci", max_length=64)
    old_value = models.JSONField("nilai lama", null=True, blank=True)
    new_value = models.JSONField("nilai baru", null=True, blank=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="oleh", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    changed_at = models.DateTimeField("waktu", auto_now_add=True)

    class Meta:
        verbose_name = "riwayat pengaturan"
        verbose_name_plural = "riwayat pengaturan"
        ordering = ["-changed_at", "-id"]

    def __str__(self):
        return f"{self.school.code} {self.key} {self.changed_at:%Y-%m-%d %H:%M}"


class SchoolFeature(models.Model):
    """Saklar fitur baru per sekolah. Tanpa baris = mati (bawaan untuk sekolah baru)."""

    school = models.ForeignKey(
        "schools.School", verbose_name="sekolah", on_delete=models.CASCADE, related_name="features"
    )
    code = models.CharField("kode fitur", max_length=40)
    is_active = models.BooleanField("aktif", default=False)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="diubah oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "fitur sekolah"
        verbose_name_plural = "fitur sekolah"
        ordering = ["school", "code"]
        constraints = [models.UniqueConstraint(fields=["school", "code"], name="unique_feature_per_school")]

    def __str__(self):
        return f"{self.school.code} {self.code}: {'aktif' if self.is_active else 'mati'}"
