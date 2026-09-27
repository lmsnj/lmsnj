from django.db.models import ProtectedError
from rest_framework.exceptions import ValidationError


class ProtectedDeleteMixin:
    """Ubah ProtectedError (data masih dipakai) menjadi respons 400 yang jelas, bukan error 500."""

    protected_message = "Data ini tidak dapat dihapus karena masih dipakai oleh data lain."

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({"detail": self.protected_message})
