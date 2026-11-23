from django.contrib import admin

from .models import GradeActivity, GradeEntry, GradeType


@admin.register(GradeType)
class GradeTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "school", "group", "default_weight", "order", "is_active"]
    list_filter = ["school", "group", "is_active"]


@admin.register(GradeActivity)
class GradeActivityAdmin(admin.ModelAdmin):
    list_display = ["title", "teaching_assignment", "grade_type", "date", "scale"]
    list_filter = ["scale", "source"]
    search_fields = ["title"]
    list_select_related = ["teaching_assignment__classroom", "teaching_assignment__subject", "grade_type"]


@admin.register(GradeEntry)
class GradeEntryAdmin(admin.ModelAdmin):
    list_display = ["activity", "student", "value", "score", "status", "updated_at"]
    list_select_related = ["activity", "student"]
