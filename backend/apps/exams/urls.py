from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("exam-events", views.ExamEventViewSet, basename="exam-event")

urlpatterns = router.urls
