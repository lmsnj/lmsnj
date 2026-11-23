from django.urls import path
from rest_framework.routers import SimpleRouter

from . import master_views, views

router = SimpleRouter()
router.register("class-modes", master_views.ClassModeViewSet, basename="class-mode")
router.register("subject-categories", master_views.SubjectCategoryViewSet, basename="subject-category")

urlpatterns = [
    path("school-settings/", views.SettingListView.as_view(), name="school-settings"),
    path("school-settings/history/", views.SettingHistoryView.as_view(), name="school-settings-history"),
    path(
        "school-settings/effective/", views.EffectiveSettingsView.as_view(), name="school-settings-effective"
    ),
    path("school-settings/<str:key>/", views.SettingDetailView.as_view(), name="school-setting-detail"),
    path("school-features/", views.FeatureListView.as_view(), name="school-features"),
    path("school-features/<str:code>/", views.FeatureDetailView.as_view(), name="school-feature-detail"),
    path("subject-profiles/", master_views.SubjectProfileListView.as_view(), name="subject-profiles"),
    path(
        "subject-profiles/bulk/", master_views.SubjectProfileBulkView.as_view(), name="subject-profiles-bulk"
    ),
    path(
        "subject-profiles/<int:subject_id>/",
        master_views.SubjectProfileDetailView.as_view(),
        name="subject-profile-detail",
    ),
    *router.urls,
]
