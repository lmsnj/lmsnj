from django.urls import path

from . import views

urlpatterns = [
    path("payments/", views.PaymentListView.as_view(), name="payments"),
    path("payments/import-template/", views.PaymentImportTemplateView.as_view(), name="payments-template"),
    path("payments/import/", views.PaymentImportView.as_view(), name="payments-import"),
]
