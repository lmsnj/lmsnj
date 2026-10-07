from django.conf import settings
from django.core.validators import MaxValueValidator
from django.db import models

from apps.academics.models import validate_academic_year

QUARTERS = 4


class PaymentStatus(models.Model):
    """Status pembayaran (SPP) satu siswa di satu tahun ajaran: lunas sampai triwulan ke-N.

    Sengaja sederhana (bukan sistem keuangan): admin mencatat sampai triwulan berapa siswa sudah
    lunas. 0 = belum ada triwulan yang lunas. Siswa tanpa catatan dianggap 0.
    """

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="siswa",
        on_delete=models.PROTECT,
        related_name="payment_statuses",
    )
    academic_year = models.CharField("tahun ajaran", max_length=9, validators=[validate_academic_year])
    paid_quarter = models.PositiveSmallIntegerField(
        "lunas sampai triwulan", default=0, validators=[MaxValueValidator(QUARTERS)]
    )
    note = models.CharField("keterangan", max_length=200, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="diubah oleh",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    updated_at = models.DateTimeField("diubah", auto_now=True)

    class Meta:
        verbose_name = "status pembayaran"
        verbose_name_plural = "status pembayaran"
        ordering = ["-academic_year", "student__full_name"]
        constraints = [
            models.UniqueConstraint(fields=["student", "academic_year"], name="unique_payment_per_year")
        ]

    def __str__(self):
        return f"{self.student} {self.academic_year}: triwulan {self.paid_quarter}"
