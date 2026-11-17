from django.contrib import admin

from .models import Material, MaterialItem


class MaterialItemInline(admin.TabularInline):
    model = MaterialItem
    extra = 0
    fields = ["order", "title", "material_type", "url", "file"]


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    inlines = [MaterialItemInline]
    list_display = ["title", "material_type", "teaching_assignment", "is_published", "created_at"]
    list_filter = ["material_type", "is_published", "teaching_assignment__subject"]
    search_fields = ["title", "teaching_assignment__classroom__name"]
    list_select_related = ["teaching_assignment__subject", "teaching_assignment__classroom"]
