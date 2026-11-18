from rest_framework.routers import DefaultRouter

from . import code_views, views

router = DefaultRouter()
router.register("materials", views.MaterialViewSet, basename="material")
router.register("material-items", views.MaterialItemViewSet, basename="material-item")
router.register("chapters", views.ChapterViewSet, basename="chapter")
router.register("code-exercises", code_views.CodeExerciseViewSet, basename="code-exercise")

urlpatterns = router.urls
