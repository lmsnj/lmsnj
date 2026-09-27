from django.contrib import admin

from .models import Answer, Assessment, Attempt, Question


class QuestionInline(admin.TabularInline):
    model = Question
    extra = 0


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ["title", "teaching_assignment", "due_at", "is_published"]
    list_filter = ["is_published"]
    search_fields = ["title"]
    inlines = [QuestionInline]


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ["assessment", "student", "started_at", "submitted_at", "score"]


admin.site.register(Answer)
