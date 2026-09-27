from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("classrooms", views.ClassroomViewSet, basename="classroom")
router.register("subjects", views.SubjectViewSet, basename="subject")
router.register("teaching-assignments", views.TeachingAssignmentViewSet, basename="teaching-assignment")

urlpatterns = [
    path("academic-years/promotion/", views.PromotionView.as_view(), name="academic-promotion"),
    *router.urls,
]
