from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import ImpersonationLog, User


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


@admin.register(ImpersonationLog)
class ImpersonationLogAdmin(admin.ModelAdmin):
    """Hanya untuk dibaca: catatan tidak boleh diubah atau dihapus dari panel admin."""

    list_display = ["created_at", "impersonator_username", "target_username", "ip_address"]
    search_fields = ["impersonator_username", "target_username"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
