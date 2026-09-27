from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from apps.accounts.permissions import ContentPermission
from apps.common.files import file_response

from .models import Material
from .selectors import materials_for
from .serializers import MaterialSerializer


class MaterialViewSet(viewsets.ModelViewSet):
    serializer_class = MaterialSerializer
    permission_classes = [ContentPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["teaching_assignment", "material_type", "is_published"]
    search_fields = ["title", "description"]
    ordering_fields = ["created_at", "title"]

    def get_queryset(self):
        return materials_for(self.request.user).select_related(
            "teaching_assignment__subject", "teaching_assignment__classroom", "created_by"
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True)
    def download(self, request, pk=None):
        """Kirim file PDF setelah hak akses dicek (lewat get_queryset)."""
        material = self.get_object()
        return file_response(material.file, material.original_filename or "materi.pdf")
