from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class Role(models.TextChoices):
    ADMIN = "admin", "Admin"
    # Admin yayasan: mengelola daftar sekolah dan bisa membuka sekolah mana pun sebagai admin.
    FOUNDATION = "foundation", "Admin Yayasan"
    TEACHER = "teacher", "Guru"
    STUDENT = "student", "Siswa"


ADMIN_ROLES = (Role.ADMIN, Role.FOUNDATION)


class LmsUserManager(UserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        # Superuser dari `createsuperuser` otomatis menjadi admin yayasan (bisa membuat sekolah pertama).
        extra_fields.setdefault("role", Role.FOUNDATION)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    # Nama orang Indonesia sering hanya satu kata, jadi cukup satu field nama lengkap.
    first_name = None
    last_name = None

    full_name = models.CharField("nama lengkap", max_length=150)
    role = models.CharField("peran", max_length=10, choices=Role.choices, default=Role.STUDENT)
    # NIS dibuat sekolah masing-masing, jadi cukup unik per sekolah (dicek di serializer & impor).
    nis = models.CharField("NIS", max_length=20, null=True, blank=True, db_index=True)
    # null=True agar banyak user tanpa NIP tidak bentrok dengan aturan unique.
    nip = models.CharField("NIP", max_length=30, unique=True, null=True, blank=True)
    # Khusus siswa. Jika kelas dihapus, siswa hanya menjadi "belum punya kelas".
    classroom = models.ForeignKey(
        "academics.Classroom",
        verbose_name="kelas",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="students",
    )
    # Sekolah tempat user terdaftar. Guru & admin boleh lebih dari satu sekolah; siswa satu.
    schools = models.ManyToManyField(
        "schools.School", verbose_name="sekolah", related_name="members", blank=True
    )

    REQUIRED_FIELDS = ["email", "full_name"]

    objects = LmsUserManager()

    class Meta:
        verbose_name = "pengguna"
        verbose_name_plural = "pengguna"
        ordering = ["full_name"]

    def __str__(self):
        return f"{self.full_name} ({self.username})"

    def get_full_name(self):
        return self.full_name

    def get_short_name(self):
        return self.full_name

    @property
    def is_admin_role(self):
        """Admin sekolah atau admin yayasan (yang di sekolah mana pun bertindak sebagai admin)."""
        return self.role in ADMIN_ROLES

    @property
    def is_foundation(self):
        return self.role == Role.FOUNDATION

    @property
    def is_teacher(self):
        return self.role == Role.TEACHER

    @property
    def is_student(self):
        return self.role == Role.STUDENT


class ImpersonationLog(models.Model):
    """Catatan setiap kali admin yayasan masuk ke akun pengguna lain (siapa, ke akun siapa, kapan).
    Username disalin agar catatan tetap terbaca walaupun akunnya kemudian dihapus."""

    impersonator = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="+", verbose_name="admin yayasan"
    )
    impersonator_username = models.CharField("username admin", max_length=150)
    target = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="+", verbose_name="akun yang dimasuki"
    )
    target_username = models.CharField("username akun", max_length=150)
    ip_address = models.GenericIPAddressField("alamat IP", null=True, blank=True)
    created_at = models.DateTimeField("waktu", auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "catatan masuk sebagai pengguna"
        verbose_name_plural = "catatan masuk sebagai pengguna"

    def __str__(self):
        return f"{self.impersonator_username} -> {self.target_username}"
