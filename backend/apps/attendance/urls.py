from django.urls import path

from . import views

urlpatterns = [
    path(
        "sessions/<int:session_id>/attendance/",
        views.SessionAttendanceView.as_view(),
        name="session-attendance",
    ),
    path("attendance/summary/", views.AttendanceSummaryView.as_view(), name="attendance-summary"),
    path("attendance/me/", views.MyAttendanceView.as_view(), name="attendance-me"),
]
