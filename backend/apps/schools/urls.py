from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("schools", views.SchoolViewSet, basename="school")

urlpatterns = [path("", include(router.urls))]
