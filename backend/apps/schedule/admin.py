from django.contrib import admin

from .models import TeachingSession


@admin.register(TeachingSession)
class TeachingSessionAdmin(admin.ModelAdmin):
    list_display = ["title", "teaching_assignment", "starts_at", "mode"]
    list_filter = ["mode"]
    search_fields = ["title"]
