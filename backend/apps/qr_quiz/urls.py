from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("qr-quiz/sessions", views.QuizSessionViewSet, basename="qr-quiz-session")

urlpatterns = [
    path("qr-quiz/cards/", views.CardMapView.as_view(), name="qr-quiz-cards"),
    path("qr-quiz/cards/auto/", views.AutoCardsView.as_view(), name="qr-quiz-cards-auto"),
    *router.urls,
]
