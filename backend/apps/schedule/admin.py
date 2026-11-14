from django.contrib import admin

from .models import TeachingSession, TimeSlot, Timetable, TimetableEntry


@admin.register(TeachingSession)
class TeachingSessionAdmin(admin.ModelAdmin):
    list_display = ["title", "teaching_assignment", "starts_at", "mode"]
    list_filter = ["mode"]
    search_fields = ["title"]


@admin.register(Timetable)
class TimetableAdmin(admin.ModelAdmin):
    list_display = ["code", "school", "academic_year", "semester", "effective_from", "is_active"]
    list_filter = ["school", "academic_year", "is_active"]


@admin.register(TimeSlot)
class TimeSlotAdmin(admin.ModelAdmin):
    list_display = ["timetable", "day", "period", "starts_at", "ends_at", "kind", "label"]
    list_filter = ["timetable", "day", "kind"]


@admin.register(TimetableEntry)
class TimetableEntryAdmin(admin.ModelAdmin):
    list_display = ["time_slot", "teaching_assignment"]
    list_filter = ["time_slot__timetable", "time_slot__day"]
    search_fields = [
        "teaching_assignment__subject__name",
        "teaching_assignment__classroom__name",
        "teaching_assignment__teacher__full_name",
    ]
    list_select_related = [
        "time_slot",
        "teaching_assignment__subject",
        "teaching_assignment__classroom",
        "teaching_assignment__teacher",
    ]
