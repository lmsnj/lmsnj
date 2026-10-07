from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.schools.context import SchoolOwnedSerializer

from .models import ExamEvent


class ExamEventSerializer(SchoolOwnedSerializer):
    grades = serializers.ListField(child=serializers.CharField(max_length=4), required=False)

    class Meta:
        model = ExamEvent
        fields = [
            "id",
            "school",
            "name",
            "academic_year",
            "grades",
            "exam_start",
            "exam_end",
            "period_start",
            "period_end",
            "min_attendance",
            "count_excused",
            "min_task_rate",
            "min_average",
            "min_paid_quarter",
            "require_homeroom_check",
            "card_note",
            "signer_title",
            "signer_name",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def validate(self, attrs):
        school = self.instance.school if self.instance else attrs["school"]
        if "grades" in attrs:
            unknown = [g for g in attrs["grades"] if g not in school.grades]
            if unknown:
                raise serializers.ValidationError(
                    {"grades": f"Tingkat tidak ada di sekolah ini: {', '.join(unknown)}."}
                )
            # Urutkan sesuai urutan tingkat sekolah sekaligus membuang duplikat.
            attrs["grades"] = [g for g in school.grades if g in attrs["grades"]]

        def value(field):
            return attrs.get(field, getattr(self.instance, field, None))

        if value("exam_end") and value("exam_end") < value("exam_start"):
            raise serializers.ValidationError({"exam_end": "Tanggal selesai harus setelah tanggal mulai."})
        if value("period_start") and value("period_end") and value("period_end") < value("period_start"):
            raise serializers.ValidationError({"period_end": "Akhir periode harus setelah awal periode."})
        return attrs


class ParticipantRecordSerializer(serializers.Serializer):
    """Field yang tidak dikirim tidak diubah (sengaja tanpa default), lihat services.save_participants."""

    student = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=Role.STUDENT))
    homeroom_checked = serializers.BooleanField(required=False)
    exempted = serializers.BooleanField(required=False)
    exemption_reason = serializers.CharField(max_length=200, required=False, allow_blank=True)
    room = serializers.CharField(max_length=50, required=False, allow_blank=True)


class ParticipantUpdateSerializer(serializers.Serializer):
    classroom = serializers.IntegerField()
    records = ParticipantRecordSerializer(many=True, allow_empty=False)
