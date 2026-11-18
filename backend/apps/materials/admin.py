from django.contrib import admin

from .models import Chapter, CodeAttempt, CodeExercise, Material, MaterialItem


class MaterialItemInline(admin.TabularInline):
    model = MaterialItem
    extra = 0
    fields = ["order", "title", "material_type", "url", "file"]


class CodeExerciseInline(admin.StackedInline):
    model = CodeExercise
    extra = 0
    fields = ["order", "title", "language", "instructions", "starter_code", "checks"]


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    inlines = [MaterialItemInline, CodeExerciseInline]
    list_display = ["title", "material_type", "teaching_assignment", "is_published", "created_at"]
    list_filter = ["material_type", "is_published", "teaching_assignment__subject"]
    search_fields = ["title", "teaching_assignment__classroom__name"]
    list_select_related = ["teaching_assignment__subject", "teaching_assignment__classroom"]


@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    list_display = ["title", "teaching_assignment", "order", "post_test"]
    search_fields = ["title", "teaching_assignment__classroom__name"]
    list_select_related = ["teaching_assignment__subject", "teaching_assignment__classroom", "post_test"]


@admin.register(CodeAttempt)
class CodeAttemptAdmin(admin.ModelAdmin):
    """Pekerjaan praktik siswa: hanya untuk dibaca (diisi siswa dari aplikasi)."""

    list_display = ["student", "exercise", "passed_at", "check_count", "updated_at"]
    search_fields = ["student__full_name", "exercise__title"]
    list_select_related = ["student", "exercise"]
    readonly_fields = ["exercise", "student", "code", "passed_code", "passed_at", "check_count", "updated_at"]

    def has_add_permission(self, request):
        return False
