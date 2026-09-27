from rest_framework import serializers

from apps.academics.models import TeachingAssignment
from apps.academics.selectors import teaching_assignments_for
from apps.accounts.models import Role

from .models import Announcement


class AnnouncementSerializer(serializers.ModelSerializer):
    teaching_assignment = serializers.PrimaryKeyRelatedField(
        queryset=TeachingAssignment.objects.none(), allow_null=True, required=False
    )
    target_label = serializers.SerializerMethodField()
    author_name = serializers.CharField(source="author.full_name", read_only=True, default=None)
    author_role = serializers.CharField(source="author.role", read_only=True, default=None)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id",
            "title",
            "body",
            "teaching_assignment",
            "target_label",
            "is_pinned",
            "author_name",
            "author_role",
            "can_edit",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            # Admin boleh memilih kelas-mapel mana pun; guru hanya yang ia ampu.
            self.fields["teaching_assignment"].queryset = teaching_assignments_for(request.user)

    def get_target_label(self, obj):
        if obj.teaching_assignment is None:
            return "Seluruh sekolah"
        return f"{obj.teaching_assignment.subject.name} · {obj.teaching_assignment.classroom.name}"

    def get_can_edit(self, obj):
        user = self.context["request"].user
        return user.role == Role.ADMIN or obj.author_id == user.id

    def validate(self, attrs):
        user = self.context["request"].user
        target = attrs.get("teaching_assignment", getattr(self.instance, "teaching_assignment", None))
        if user.role == Role.TEACHER and target is None:
            raise serializers.ValidationError(
                {
                    "teaching_assignment": "Pilih kelas & mapel tujuan. Pengumuman seluruh sekolah dibuat oleh admin."
                }
            )
        return attrs
