from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.common.mixins import ProtectedDeleteMixin

from .models import User
from .permissions import IsAdmin
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    UserWriteSerializer,
)


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]
    # Batasi percobaan login untuk mencegah tebak-tebakan password.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError:
            raise ValidationError({"refresh": "Token tidak valid atau sudah kedaluwarsa."})
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password berhasil diubah."})


class UserViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """Manajemen pengguna, khusus admin."""

    queryset = User.objects.select_related("classroom")
    permission_classes = [IsAdmin]
    # classroom__isnull=true dipakai untuk mencari siswa yang belum punya kelas.
    filterset_fields = {"role": ["exact"], "is_active": ["exact"], "classroom": ["exact", "isnull"]}
    search_fields = ["username", "full_name", "email", "nis", "nip"]
    ordering_fields = ["full_name", "username", "date_joined", "last_login"]
    protected_message = (
        "Guru ini masih mengampu mapel. Hapus data pengampunya terlebih dahulu, "
        "atau nonaktifkan akunnya saja."
    )

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return UserWriteSerializer
        return UserSerializer

    def perform_update(self, serializer):
        # Cegah admin mengunci dirinya sendiri keluar dari sistem.
        if serializer.instance == self.request.user:
            data = serializer.validated_data
            if data.get("role", self.request.user.role) != self.request.user.role:
                raise ValidationError({"role": "Anda tidak dapat mengubah peran akun sendiri."})
            if data.get("is_active") is False:
                raise ValidationError({"is_active": "Anda tidak dapat menonaktifkan akun sendiri."})
        serializer.save()

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError({"detail": "Anda tidak dapat menghapus akun sendiri."})
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        user = self.get_object()
        serializer = ResetPasswordSerializer(data=request.data, context={"target_user": user})
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response({"detail": f"Password {user.full_name} berhasil direset."})
