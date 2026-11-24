from django.contrib import admin

from .models import CardAssignment, QuizAnswer, QuizSession


@admin.register(CardAssignment)
class CardAssignmentAdmin(admin.ModelAdmin):
    list_display = ["classroom", "number", "student"]
    list_select_related = ["classroom", "student"]


@admin.register(QuizSession)
class QuizSessionAdmin(admin.ModelAdmin):
    list_display = ["title", "teaching_assignment", "created_at", "finished_at"]
    list_select_related = ["teaching_assignment__classroom", "teaching_assignment__subject"]
    search_fields = ["title"]


@admin.register(QuizAnswer)
class QuizAnswerAdmin(admin.ModelAdmin):
    list_display = ["session", "question", "student", "option", "is_correct", "scanned_at"]
    list_select_related = ["session", "student"]
