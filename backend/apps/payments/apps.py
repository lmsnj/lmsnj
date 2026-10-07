from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    """Status pembayaran siswa per tahun ajaran (lunas sampai triwulan ke-N), diisi admin."""

    name = "apps.payments"
    verbose_name = "Pembayaran"
