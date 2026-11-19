from rest_framework import serializers

from apps.academics.models import Subject

from . import schema
from .models import InteractiveMedia, InteractiveMediaVersion
from .selectors import can_edit


def media_errors(error):
    """MediaError -> ValidationError berisi daftar pesan per lokasi (ditampilkan ke guru)."""
    return serializers.ValidationError({"draft": error.errors})


class VersionSerializer(serializers.ModelSerializer):
    published_by_name = serializers.CharField(source="published_by.full_name", read_only=True, default=None)

    class Meta:
        model = InteractiveMediaVersion
        fields = ["number", "note", "published_at", "published_by_name"]


class MediaListSerializer(serializers.ModelSerializer):
    subject = serializers.PrimaryKeyRelatedField(
        queryset=Subject.objects.none(), required=False, allow_null=True
    )
    subject_name = serializers.CharField(source="subject.name", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    latest_version = serializers.SerializerMethodField()
    station_count = serializers.SerializerMethodField()
    material_count = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    is_library = serializers.SerializerMethodField()

    class Meta:
        model = InteractiveMedia
        fields = [
            "id",
            "title",
            "description",
            "subject",
            "subject_name",
            "schema_version",
            "latest_version",
            "station_count",
            "material_count",
            "can_edit",
            "is_library",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["schema_version"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        school = self.context.get("school")
        self.fields["subject"].queryset = (
            Subject.objects.filter(school=school) if school else Subject.objects.none()
        )

    def get_latest_version(self, obj):
        version = obj.latest_version()
        return VersionSerializer(version).data if version else None

    def get_station_count(self, obj):
        return sum(1 for _ in schema.iter_stations(obj.draft or {}))

    def get_material_count(self, obj):
        return obj.materials.count()

    def get_can_edit(self, obj):
        request = self.context.get("request")
        return bool(request) and can_edit(request.user, obj)

    def get_is_library(self, obj):
        return obj.school_id is None


class MediaSerializer(MediaListSerializer):
    """Detail + draf (untuk Studio). Draf disimpan dengan pemeriksaan ringan; lengkapnya saat terbit."""

    draft = serializers.JSONField(required=False)

    class Meta(MediaListSerializer.Meta):
        fields = MediaListSerializer.Meta.fields + ["draft"]

    def validate_draft(self, value):
        try:
            return schema.validate_media(value, full=False)
        except schema.MediaError as error:
            raise serializers.ValidationError(error.errors)


class PublishSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)


class PreviewSerializer(serializers.Serializer):
    # Kosong = pratinjau draf yang tersimpan; diisi = pratinjau isi yang sedang diedit (belum disimpan).
    draft = serializers.JSONField(required=False)


class ImportSerializer(serializers.Serializer):
    """Impor isi media. Sumber file: excel/json/word/pptx/pdf (`file`); tautan: `text`; bank soal:
    `assessment` + `questions` (kosong = semua soal)."""

    SOURCES = ("excel", "json", "word", "pptx", "pdf", "fprg", "links", "bank")

    source = serializers.ChoiceField(choices=SOURCES)
    mode = serializers.ChoiceField(choices=("append", "replace"), default="append")
    file = serializers.FileField(required=False)
    text = serializers.CharField(required=False, allow_blank=True, max_length=50_000, default="")
    assessment = serializers.IntegerField(required=False, min_value=1)
    questions = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=200
    )
    dry_run = serializers.BooleanField(default=True)


class RestoreSerializer(serializers.Serializer):
    number = serializers.IntegerField(min_value=1)


class SharesSerializer(serializers.Serializer):
    schools = serializers.ListField(child=serializers.IntegerField(), max_length=500)


class AnswerSerializer(serializers.Serializer):
    # 0 = pratinjau Studio (versi bernomor 0); kosong/0 di pemutar = versi terbit terakhir.
    version = serializers.IntegerField(required=False, min_value=0)
    station = serializers.CharField(max_length=40)
    step = serializers.CharField(max_length=40)
    response = serializers.JSONField()
    hint_level = serializers.IntegerField(required=False, min_value=0, max_value=10, default=0)
    client_uid = serializers.CharField(required=False, allow_blank=True, max_length=40, default="")


class RevealSerializer(serializers.Serializer):
    # 0 = pratinjau Studio (versi bernomor 0); kosong/0 di pemutar = versi terbit terakhir.
    version = serializers.IntegerField(required=False, min_value=0)
    station = serializers.CharField(max_length=40)
    step = serializers.CharField(max_length=40)


class StationActionSerializer(serializers.Serializer):
    ACTIONS = ("visit", "restart", "finish")

    # 0 = pratinjau Studio (versi bernomor 0); kosong/0 di pemutar = versi terbit terakhir.
    version = serializers.IntegerField(required=False, min_value=0)
    station = serializers.CharField(max_length=40)
    action = serializers.ChoiceField(choices=ACTIONS)
    step = serializers.CharField(required=False, allow_blank=True, max_length=40, default="")
    seconds = serializers.IntegerField(required=False, min_value=0, max_value=24 * 3600, default=0)


class ReflectionSerializer(serializers.Serializer):
    # 0 = pratinjau Studio (versi bernomor 0); kosong/0 di pemutar = versi terbit terakhir.
    version = serializers.IntegerField(required=False, min_value=0)
    station = serializers.CharField(max_length=40)
    text = serializers.CharField(max_length=2000, allow_blank=True)


class ReminderSerializer(serializers.Serializer):
    """Pengingat lewat Ruang Obrolan. `{nama}` di pesan diganti nama depan siswa."""

    students = serializers.ListField(
        child=serializers.IntegerField(min_value=1), min_length=1, max_length=100
    )
    message = serializers.CharField(max_length=1000)
