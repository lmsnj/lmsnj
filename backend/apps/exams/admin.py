from django.contrib import admin

from .models import ExamEvent, ExamParticipant


@admin.register(ExamEvent)
class ExamEventAdmin(admin.ModelAdmin):
    list_display = ["name", "school", "academic_year", "exam_start"]
    list_filter = ["school", "academic_year"]
    search_fields = ["name"]


@admin.register(ExamParticipant)
class ExamParticipantAdmin(admin.ModelAdmin):
    list_display = ["student", "event", "homeroom_checked", "exempted", "room"]
    list_filter = ["event", "exempted"]
    search_fields = ["student__full_name", "student__nis"]
    list_select_related = ["student", "event"]
