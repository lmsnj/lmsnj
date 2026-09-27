from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("announcements", views.AnnouncementViewSet, basename="announcement")

urlpatterns = router.urls
