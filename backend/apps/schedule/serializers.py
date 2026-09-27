from django.utils import timezone
from rest_framework import serializers

from apps.academics.models import TeachingAssignment

from .models import SessionMode, TeachingSession


class TeachingSessionSerializer(serializers.ModelSerializer):
    teaching_assignment = serializers.PrimaryKeyRelatedField(queryset=TeachingAssignment.objects.none())
    subject_name = serializers.CharField(source="teaching_assignment.subject.name", read_only=True)
    classroom_name = serializers.CharField(source="teaching_assignment.classroom.name", read_only=True)
    teacher_name = serializers.CharField(source="teaching_assignment.teacher.full_name", read_only=True)
    mode_display = serializers.CharField(source="get_mode_display", read_only=True)
    ends_at = serializers.DateTimeField(read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = TeachingSession
        fields = [
            "id",
            "teaching_assignment",
            "subject_name",
            "classroom_name",
            "teacher_name",
            "title",
            "description",
            "starts_at",
            "ends_at",
            "duration_minutes",
            "mode",
            "mode_display",
            "location",
            "meeting_url",
            "status",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["teaching_assignment"].queryset = TeachingAssignment.objects.filter(
                teacher=request.user
            )

    def get_status(self, obj):
        now = timezone.now()
        if now < obj.starts_at:
            return "upcoming"
        return "ongoing" if now <= obj.ends_at else "done"

    def validate(self, attrs):
        mode = attrs.get("mode", getattr(self.instance, "mode", SessionMode.OFFLINE))
        url = attrs.get("meeting_url", getattr(self.instance, "meeting_url", ""))
        if mode == SessionMode.ONLINE and not url:
            raise serializers.ValidationError(
                {"meeting_url": "Isi link pertemuan (Google Meet, Zoom, dll.)."}
            )
        if mode == SessionMode.OFFLINE:
            attrs["meeting_url"] = ""
        return attrs
