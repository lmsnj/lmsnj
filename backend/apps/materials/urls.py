from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("materials", views.MaterialViewSet, basename="material")
router.register("material-items", views.MaterialItemViewSet, basename="material-item")

urlpatterns = router.urls
