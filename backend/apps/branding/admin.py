from django.contrib import admin

from .models import SiteSettings


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    list_display = ["school_name", "app_name", "updated_at"]

    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()  # hanya satu baris
