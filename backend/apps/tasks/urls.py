from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("tasks", views.TaskViewSet, basename="task")
router.register("submissions", views.SubmissionViewSet, basename="submission")

urlpatterns = router.urls + [
    path("gradebook/<int:assignment_id>/", views.GradebookView.as_view(), name="gradebook"),
    path(
        "gradebook/<int:assignment_id>/export/",
        views.GradebookView.as_view(export=True),
        name="gradebook-export",
    ),
]
