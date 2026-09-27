from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("classrooms", views.ClassroomViewSet, basename="classroom")
router.register("subjects", views.SubjectViewSet, basename="subject")
router.register("teaching-assignments", views.TeachingAssignmentViewSet, basename="teaching-assignment")

urlpatterns = router.urls
