from django.contrib import admin

from .models import PaymentStatus


@admin.register(PaymentStatus)
class PaymentStatusAdmin(admin.ModelAdmin):
    list_display = ["student", "academic_year", "paid_quarter", "updated_at"]
    list_filter = ["academic_year", "paid_quarter"]
    search_fields = ["student__full_name", "student__nis"]
    list_select_related = ["student"]
