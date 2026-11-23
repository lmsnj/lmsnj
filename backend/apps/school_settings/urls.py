from django.urls import path

from . import views

urlpatterns = [
    path("school-settings/", views.SettingListView.as_view(), name="school-settings"),
    path("school-settings/history/", views.SettingHistoryView.as_view(), name="school-settings-history"),
    path(
        "school-settings/effective/", views.EffectiveSettingsView.as_view(), name="school-settings-effective"
    ),
    path("school-settings/<str:key>/", views.SettingDetailView.as_view(), name="school-setting-detail"),
    path("school-features/", views.FeatureListView.as_view(), name="school-features"),
    path("school-features/<str:code>/", views.FeatureDetailView.as_view(), name="school-feature-detail"),
]
