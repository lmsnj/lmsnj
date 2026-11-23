from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import Classroom, Subject
from apps.accounts.permissions import IsAdmin, IsFoundation
from apps.schools.context import active_school, require_school

from . import services
from .models import SchoolFeature, Scope, SettingChange
from .registry import FEATURES, FEATURES_BY_CODE, GROUPS, SETTINGS, SETTINGS_BY_KEY


def _scope_params(request, data):
    return data.get("scope") or Scope.SCHOOL, data.get("scope_id") or None


class SettingListView(APIView):
    """GET ?scope=&scope_id=: semua pengaturan yang bisa diatur di cakupan itu, dengan nilai
    bawaan, nilai yang disimpan di cakupan itu (null = belum diubah), dan nilai yang berlaku."""

    permission_classes = [IsAdmin]

    def get(self, request):
        school = require_school(request)
        scope, scope_id = _scope_params(request, request.query_params)
        scope, scope_id, target = services.validate_scope(school, scope, scope_id)
        reader = services.SettingReader(school)
        lookup = {Scope.CLASSROOM: {"classroom": scope_id}, Scope.SUBJECT: {"subject": scope_id}}.get(
            scope, {}
        )
        items = []
        for definition in SETTINGS:
            if scope not in definition.scopes:
                continue
            value, source = reader.resolve(definition.key, **lookup)
            items.append(
                {
                    **definition.as_dict(),
                    "stored": reader.stored(definition.key, scope, scope_id),
                    "effective": value,
                    "source": source,
                }
            )
        return Response(
            {
                "scope": scope,
                "scope_id": scope_id,
                "target": target,
                "groups": [{"id": g, "label": label} for g, label in GROUPS],
                "scopes": [{"value": v, "label": label} for v, label in Scope.choices],
                "settings": items,
            }
        )


class SettingValueSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=Scope.choices, default=Scope.SCHOOL)
    scope_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    value = serializers.JSONField()


class SettingDetailView(APIView):
    """PUT {scope, scope_id, value}: ubah satu pengaturan. DELETE ?scope=&scope_id=: kembalikan
    ke bawaan di cakupan itu. Keduanya tercatat di riwayat."""

    permission_classes = [IsAdmin]

    def put(self, request, key):
        school = require_school(request)
        definition = SETTINGS_BY_KEY.get(key)
        if definition is None:
            raise ValidationError({"key": "Pengaturan tidak dikenal."})
        serializer = SettingValueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        scope, scope_id, _ = services.validate_scope(school, data["scope"], data.get("scope_id"))
        value = services.save_setting(school, key, scope, scope_id, data["value"], request.user)
        return Response({"key": key, "scope": scope, "scope_id": scope_id, "value": value})

    def delete(self, request, key):
        school = require_school(request)
        if key not in SETTINGS_BY_KEY:
            raise ValidationError({"key": "Pengaturan tidak dikenal."})
        scope, scope_id = _scope_params(request, request.query_params)
        scope, scope_id, _ = services.validate_scope(school, scope, scope_id)
        services.reset_setting(school, key, scope, scope_id, request.user)
        return Response({"detail": "Pengaturan dikembalikan ke bawaan."})


class SettingChangeSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.full_name", default=None, read_only=True)
    label = serializers.SerializerMethodField()
    target = serializers.SerializerMethodField()

    class Meta:
        model = SettingChange
        fields = [
            "id",
            "key",
            "label",
            "scope",
            "scope_id",
            "target",
            "old_value",
            "new_value",
            "changed_by_name",
            "changed_at",
        ]

    def get_label(self, change):
        if change.key.startswith(services.FEATURE_KEY_PREFIX):
            feature = FEATURES_BY_CODE.get(change.key.removeprefix(services.FEATURE_KEY_PREFIX))
            return f"Fitur: {feature.label}" if feature else change.key
        definition = SETTINGS_BY_KEY.get(change.key)
        return definition.label if definition else change.key

    def get_target(self, change):
        if change.scope == Scope.SCHOOL:
            return "Seluruh sekolah"
        name = self.context["names"].get((change.scope, change.scope_id))
        return f"{Scope(change.scope).label}: {name or '(sudah dihapus)'}"


class SettingHistoryView(ListAPIView):
    """Riwayat perubahan pengaturan & fitur sekolah aktif (terbaru dulu). Filter `key`."""

    permission_classes = [IsAdmin]
    serializer_class = SettingChangeSerializer

    def get_queryset(self):
        queryset = SettingChange.objects.filter(school=require_school(self.request)).select_related(
            "changed_by"
        )
        key = self.request.query_params.get("key")
        return queryset.filter(key=key) if key else queryset

    def get_serializer_context(self):
        # Nama mapel/kelas dimuat sekaligus (bukan satu query per baris).
        context = super().get_serializer_context()
        school = require_school(self.request)
        names = {
            (Scope.SUBJECT, pk): name
            for pk, name in Subject.objects.filter(school=school).values_list("pk", "name")
        }
        names.update(
            {
                (Scope.CLASSROOM, pk): name
                for pk, name in Classroom.objects.filter(school=school).values_list("pk", "name")
            }
        )
        context["names"] = names
        return context


class EffectiveSettingsView(APIView):
    """GET ?classroom=&subject=: nilai yang berlaku + status fitur, untuk semua pengguna login
    (dibaca frontend lewat useSetting / useFeature). Tanpa sekolah aktif = bawaan sistem."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        school = active_school(request)
        lookup = {}
        for name, model in (("classroom", Classroom), ("subject", Subject)):
            raw = request.query_params.get(name, "")
            if raw:
                if (
                    not raw.isdigit()
                    or school is None
                    or not model.objects.filter(school=school, pk=raw).exists()
                ):
                    raise ValidationError({name: "Data tidak ditemukan di sekolah ini."})
                lookup[name] = int(raw)
        return Response(
            {
                "values": services.SettingReader(school).all_values(**lookup),
                "features": services.features_for(school),
            }
        )


class FeatureListView(APIView):
    """Daftar saklar fitur sekolah aktif. Baca: admin; ubah: Super Admin (lihat FeatureDetailView)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        school = require_school(request)
        rows = {f.code: f for f in SchoolFeature.objects.filter(school=school).select_related("updated_by")}
        return Response(
            [
                {
                    **feature.as_dict(),
                    "is_active": bool(rows.get(feature.code) and rows[feature.code].is_active),
                    "updated_at": rows[feature.code].updated_at if feature.code in rows else None,
                }
                for feature in FEATURES
            ]
        )


class FeatureSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()


class FeatureDetailView(APIView):
    """PUT {is_active}: nyalakan/matikan satu fitur di sekolah aktif. Khusus Super Admin, agar fitur
    baru diuji coba dulu sebelum dibuka untuk sekolah lain."""

    permission_classes = [IsFoundation]

    def put(self, request, code):
        school = require_school(request)
        serializer = FeatureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        feature = services.set_feature(school, code, serializer.validated_data["is_active"], request.user)
        return Response({"code": feature.code, "is_active": feature.is_active})
