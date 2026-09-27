from django.urls import path

from . import views

urlpatterns = [
    path("branding/", views.SiteSettingsView.as_view(), name="branding"),
    path("branding/logo/", views.SiteLogoView.as_view(), name="branding-logo"),
]
