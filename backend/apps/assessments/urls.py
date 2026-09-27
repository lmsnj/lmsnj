from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("assessments", views.AssessmentViewSet, basename="assessment")
router.register("assessment-questions", views.QuestionViewSet, basename="assessment-question")
router.register("assessment-attempts", views.AttemptViewSet, basename="assessment-attempt")

urlpatterns = router.urls
