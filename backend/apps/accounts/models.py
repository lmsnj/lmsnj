from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class Role(models.TextChoices):
    ADMIN = "admin", "Admin"
    TEACHER = "teacher", "Guru"
    STUDENT = "student", "Siswa"


class LmsUserManager(UserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        # Superuser dari `createsuperuser` otomatis berperan admin di aplikasi.
        extra_fields.setdefault("role", Role.ADMIN)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    # Nama orang Indonesia sering hanya satu kata, jadi cukup satu field nama lengkap.
    first_name = None
    last_name = None

    full_name = models.CharField("nama lengkap", max_length=150)
    role = models.CharField("peran", max_length=10, choices=Role.choices, default=Role.STUDENT)
    # null=True agar banyak user tanpa NIS/NIP tidak bentrok dengan aturan unique.
    nis = models.CharField("NIS", max_length=20, unique=True, null=True, blank=True)
    nip = models.CharField("NIP", max_length=30, unique=True, null=True, blank=True)

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
        return self.role == Role.ADMIN

    @property
    def is_teacher(self):
        return self.role == Role.TEACHER

    @property
    def is_student(self):
        return self.role == Role.STUDENT
