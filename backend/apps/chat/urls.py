from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("chat/conversations", views.ConversationViewSet, basename="conversation")

urlpatterns = router.urls
