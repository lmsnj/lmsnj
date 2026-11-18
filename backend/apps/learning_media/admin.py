from django.contrib import admin

from .models import (
    InteractiveMedia,
    InteractiveMediaAttempt,
    InteractiveMediaProgress,
    InteractiveMediaVersion,
)


class VersionInline(admin.TabularInline):
    model = InteractiveMediaVersion
    fields = ["number", "note", "published_by", "published_at"]
    readonly_fields = fields
    extra = 0
    can_delete = False


@admin.register(InteractiveMedia)
class InteractiveMediaAdmin(admin.ModelAdmin):
    list_display = ["title", "school", "subject", "created_by", "updated_at"]
    list_filter = ["school"]
    search_fields = ["title"]
    exclude = ["preview"]
    inlines = [VersionInline]


@admin.register(InteractiveMediaProgress)
class InteractiveMediaProgressAdmin(admin.ModelAdmin):
    list_display = ["student", "material", "station_id", "stars", "completed_at", "updated_at"]
    search_fields = ["student__username", "student__full_name"]


@admin.register(InteractiveMediaAttempt)
class InteractiveMediaAttemptAdmin(admin.ModelAdmin):
    list_display = ["student", "material", "station_id", "step_id", "correct", "created_at"]
    search_fields = ["student__username"]

    def has_change_permission(self, request, obj=None):
        return False
