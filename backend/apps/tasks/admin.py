from django.contrib import admin

from .models import Submission, Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ["title", "teaching_assignment", "due_at", "is_published"]
    list_filter = ["is_published", "teaching_assignment__subject"]
    search_fields = ["title", "teaching_assignment__classroom__name"]
    list_select_related = ["teaching_assignment__subject", "teaching_assignment__classroom"]


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ["task", "student", "submitted_at", "is_late"]
    list_filter = ["is_late"]
    search_fields = ["task__title", "student__full_name"]
    list_select_related = ["task", "student"]
