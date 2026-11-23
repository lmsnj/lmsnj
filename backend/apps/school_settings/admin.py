from django.contrib import admin

from .models import ClassMode, SchoolFeature, SchoolSetting, SettingChange, SubjectCategory, SubjectProfile


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


@admin.register(ClassMode)
class ClassModeAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "needs_student_device", "order", "is_active"]


@admin.register(SubjectCategory)
class SubjectCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "school", "order", "is_active"]
    list_filter = ["school", "is_active"]


@admin.register(SubjectProfile)
class SubjectProfileAdmin(admin.ModelAdmin):
    list_display = ["subject", "category"]
    list_select_related = ["subject", "category"]
