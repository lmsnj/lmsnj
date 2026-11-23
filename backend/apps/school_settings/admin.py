from django.contrib import admin

from .models import SchoolFeature, SchoolSetting, SettingChange


@admin.register(SchoolSetting)
class SchoolSettingAdmin(admin.ModelAdmin):
    list_display = ["school", "key", "scope", "scope_id", "updated_at"]
    list_filter = ["school", "scope"]
    search_fields = ["key"]


@admin.register(SchoolFeature)
class SchoolFeatureAdmin(admin.ModelAdmin):
    list_display = ["school", "code", "is_active", "updated_at"]
    list_filter = ["school", "is_active"]


@admin.register(SettingChange)
class SettingChangeAdmin(admin.ModelAdmin):
    """Riwayat hanya untuk dibaca agar jejak perubahan tidak bisa diubah."""

    list_display = ["school", "key", "scope", "scope_id", "changed_by", "changed_at"]
    list_filter = ["school", "scope"]
    search_fields = ["key"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
