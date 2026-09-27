from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["username", "full_name", "role", "nis", "nip", "is_active"]
    list_filter = ["role", "is_active", "is_staff"]
    search_fields = ["username", "full_name", "email", "nis", "nip"]
    ordering = ["full_name"]

    fieldsets = [
        (None, {"fields": ["username", "password"]}),
        ("Data diri", {"fields": ["full_name", "email", "role", "nis", "nip"]}),
        ("Hak akses", {"fields": ["is_active", "is_staff", "is_superuser", "groups", "user_permissions"]}),
        ("Waktu penting", {"fields": ["last_login", "date_joined"]}),
    ]
    add_fieldsets = [
        (
            None,
            {
                "classes": ["wide"],
                "fields": ["username", "full_name", "email", "role", "password1", "password2"],
            },
        ),
    ]
