from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("sessions", views.TeachingSessionViewSet, basename="teaching-session")

urlpatterns = router.urls
