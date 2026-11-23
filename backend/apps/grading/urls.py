from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("grade-types", views.GradeTypeViewSet, basename="grade-type")
router.register("grade-activities", views.GradeActivityViewSet, basename="grade-activity")

urlpatterns = router.urls
