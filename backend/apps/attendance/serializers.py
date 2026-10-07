from rest_framework import serializers

from apps.accounts.models import Role, User

from .models import AttendanceStatus


class AttendanceRecordSerializer(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=Role.STUDENT))
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class SessionAttendanceSerializer(serializers.Serializer):
    records = AttendanceRecordSerializer(many=True, allow_empty=False)


class SummaryQuerySerializer(serializers.Serializer):
    """Parameter rekap: salah satu dari classroom (semua mapel) atau teaching_assignment."""

    classroom = serializers.IntegerField(required=False)
    teaching_assignment = serializers.IntegerField(required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)

    def validate(self, attrs):
        if bool(attrs.get("classroom")) == bool(attrs.get("teaching_assignment")):
            raise serializers.ValidationError("Pilih kelas atau kelas-mapel (salah satu).")
        if attrs.get("date_from") and attrs.get("date_to") and attrs["date_from"] > attrs["date_to"]:
            raise serializers.ValidationError({"date_to": "Tanggal akhir harus setelah tanggal awal."})
        return attrs
