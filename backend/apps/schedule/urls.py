from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("sessions", views.TeachingSessionViewSet, basename="teaching-session")

urlpatterns = router.urls + [
    path("timetable/", views.TimetableView.as_view(), name="timetable"),
    path("timetable/teacher-loads/", views.TeacherLoadView.as_view(), name="timetable-teacher-loads"),
    path(
        "timetable/import-template/",
        views.TimetableImportTemplateView.as_view(),
        name="timetable-import-template",
    ),
    path("timetable/import/", views.TimetableImportView.as_view(), name="timetable-import"),
]
