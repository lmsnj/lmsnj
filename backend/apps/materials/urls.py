from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("materials", views.MaterialViewSet, basename="material")

urlpatterns = router.urls
