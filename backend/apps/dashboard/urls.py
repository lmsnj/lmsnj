from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("dashboard/statistics/", views.StatisticsView.as_view(), name="dashboard-statistics"),
]
