from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

router = DefaultRouter()
router.register("users", views.UserViewSet, basename="user")

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("auth/impersonate/", views.ImpersonationView.as_view(), name="auth-impersonate"),
    path(
        "auth/impersonate/classrooms/",
        views.ImpersonationClassroomsView.as_view(),
        name="auth-impersonate-classrooms",
    ),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="auth-change-password"),
    path("", include(router.urls)),
]
