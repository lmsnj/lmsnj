from django.contrib import admin

from .models import Attendance


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ["student", "session", "status", "updated_at"]
    list_filter = ["status"]
    search_fields = ["student__full_name", "session__title"]
    list_select_related = ["student", "session"]
