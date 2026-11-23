"""Membaca & mengubah pengaturan pembelajaran dan saklar fitur.

Satu-satunya cara modul lain membaca aturan: `get_setting(school, key, classroom=, subject=, category=)`
dan `feature_enabled(school, code)`. Jangan membaca tabel SchoolSetting langsung.

Cache: semua pengaturan satu sekolah dimuat sekali per `SettingReader` (satu query). Sengaja tidak
memakai cache lintas request: di hosting cPanel aplikasi berjalan di beberapa proses, sehingga cache
di memori satu proses tidak ikut terhapus saat admin mengubah pengaturan di proses lain. Dengan cara
ini perubahan selalu langsung berlaku.
"""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.academics.models import Classroom, Subject

from .models import (
    ClassMode,
    SchoolFeature,
    SchoolSetting,
    Scope,
    SettingChange,
    SubjectCategory,
    SubjectProfile,
)
from .registry import FEATURES, FEATURES_BY_CODE, SETTINGS, clean_value, get_definition

# Urutan pengecekan, dari yang paling khusus.
LOOKUP_ORDER = (Scope.CLASSROOM, Scope.SUBJECT, Scope.CATEGORY, Scope.SCHOOL)
DEFAULT_SOURCE = "default"


class SettingReader:
    """Pembaca pengaturan satu sekolah. Buat sekali per request bila membaca banyak kunci."""

    def __init__(self, school):
        self.school = school
        self._values = None
        self._categories = None

    def _load(self):
        if self._values is None:
            rows = SchoolSetting.objects.filter(school=self.school) if self.school else []
            self._values = {(r.scope, r.scope_id, r.key): r.value for r in rows}
        return self._values

    def category_of(self, subject):
        """Id kategori mapel (atau None). Semua kategori mapel sekolah dimuat sekali."""
        if self._categories is None:
            profiles = SubjectProfile.objects.filter(subject__school=self.school) if self.school else []
            self._categories = {p.subject_id: p.category_id for p in profiles}
        return self._categories.get(_id(subject))

    def stored(self, key, scope=Scope.SCHOOL, scope_id=None):
        """Nilai yang disimpan tepat di scope ini (None jika tidak ada)."""
        return self._load().get((scope, scope_id, key))

    def resolve(self, key, classroom=None, subject=None, category=None):
        """(nilai, sumber): cari di kelas -> mapel -> kategori -> sekolah -> bawaan sistem.
        Argumen boleh objek atau id; yang kosong dilewati. Hanya scope yang diizinkan
        pengaturan itu (registry `scopes`) yang dicek."""
        definition = get_definition(key)
        if category is None and subject is not None and Scope.CATEGORY in definition.scopes:
            # Kategori diambil otomatis dari mapel, jadi aturan per kategori ikut berlaku.
            category = self.category_of(subject)
        ids = {Scope.CLASSROOM: classroom, Scope.SUBJECT: subject, Scope.CATEGORY: category}
        for scope in LOOKUP_ORDER:
            if scope not in definition.scopes:
                continue
            scope_id = None if scope == Scope.SCHOOL else _id(ids[scope])
            if scope != Scope.SCHOOL and scope_id is None:
                continue
            value = self.stored(key, scope, scope_id)
            if value is not None:
                return value, scope
        return definition.default, DEFAULT_SOURCE

    def get(self, key, **scopes):
        return self.resolve(key, **scopes)[0]

    def all_values(self, **scopes):
        return {s.key: self.get(s.key, **scopes) for s in SETTINGS}


def _id(obj):
    return getattr(obj, "pk", obj)


def get_setting(school, key, classroom=None, subject=None, category=None):
    """Nilai satu pengaturan yang berlaku. `school` None = bawaan sistem."""
    return SettingReader(school).get(key, classroom=classroom, subject=subject, category=category)


def features_for(school):
    """{kode: aktif} untuk semua fitur di registry. Tanpa sekolah / tanpa baris = mati."""
    active = set()
    if school is not None:
        active = set(
            SchoolFeature.objects.filter(school=school, is_active=True).values_list("code", flat=True)
        )
    return {f.code: f.code in active for f in FEATURES}


def feature_enabled(school, code):
    return features_for(school).get(code, False)


def validate_scope(school, scope, scope_id):
    """Pastikan scope dikenal dan id-nya milik sekolah ini. Mengembalikan (scope, scope_id, nama)."""
    if scope not in Scope.values:
        raise ValidationError({"scope": "Cakupan tidak dikenal."})
    if scope == Scope.SCHOOL:
        return scope, None, school.name
    if scope_id in (None, ""):
        raise ValidationError({"scope_id": "Pilih data yang akan diatur."})
    try:
        scope_id = int(scope_id)
    except (TypeError, ValueError):
        raise ValidationError({"scope_id": "Data tidak ditemukan."}) from None
    model = {Scope.CATEGORY: SubjectCategory, Scope.SUBJECT: Subject, Scope.CLASSROOM: Classroom}[scope]
    item = model.objects.filter(school=school, pk=scope_id).first()
    if item is None:
        raise ValidationError({"scope_id": "Data tidak ditemukan di sekolah ini."})
    return scope, scope_id, item.name


def _check_allowed(definition, scope):
    if scope not in definition.scopes:
        label = Scope(scope).label.lower()
        raise ValidationError({"scope": f"Pengaturan ini tidak bisa diatur per {label}."})


@transaction.atomic
def save_setting(school, key, scope, scope_id, value, user):
    """Simpan nilai (sudah diperiksa) dan catat riwayatnya. Nilai sama = tidak dicatat."""
    definition = get_definition(key)
    _check_allowed(definition, scope)
    value = clean_value(definition, value)
    row = SchoolSetting.objects.select_for_update().filter(
        school=school, scope=scope, scope_id=scope_id, key=key
    )
    row = row.first()
    old = row.value if row else None
    if old == value:
        return value
    if row is None:
        SchoolSetting.objects.create(
            school=school, scope=scope, scope_id=scope_id, key=key, value=value, updated_by=user
        )
    else:
        row.value = value
        row.updated_by = user
        row.save(update_fields=["value", "updated_by", "updated_at"])
    SettingChange.objects.create(
        school=school,
        scope=scope,
        scope_id=scope_id,
        key=key,
        old_value=old,
        new_value=value,
        changed_by=user,
    )
    return value


@transaction.atomic
def reset_setting(school, key, scope, scope_id, user):
    """Kembalikan ke bawaan: hapus nilai di scope ini (scope di atasnya / bawaan sistem berlaku)."""
    definition = get_definition(key)
    _check_allowed(definition, scope)
    row = SchoolSetting.objects.select_for_update().filter(
        school=school, scope=scope, scope_id=scope_id, key=key
    )
    row = row.first()
    if row is None:
        return False
    SettingChange.objects.create(
        school=school,
        scope=scope,
        scope_id=scope_id,
        key=key,
        old_value=row.value,
        new_value=None,
        changed_by=user,
    )
    row.delete()
    return True


FEATURE_KEY_PREFIX = "fitur."


@transaction.atomic
def set_feature(school, code, is_active, user):
    if code not in FEATURES_BY_CODE:
        raise ValidationError({"code": "Fitur tidak dikenal."})
    feature, _ = SchoolFeature.objects.select_for_update().get_or_create(school=school, code=code)
    if feature.is_active == is_active:
        return feature
    SettingChange.objects.create(
        school=school,
        key=FEATURE_KEY_PREFIX + code,
        old_value=feature.is_active,
        new_value=is_active,
        changed_by=user,
    )
    feature.is_active = is_active
    feature.updated_by = user
    feature.save(update_fields=["is_active", "updated_by", "updated_at"])
    return feature


# --- Kategori mapel & mode kelas (Tahap 2) ---

MODE_KEY = "kelas.mode_default"


def mode_info(code):
    """{code, name, needs_student_device} untuk kode mode (mode tak dikenal dianggap butuh perangkat)."""
    mode = ClassMode.objects.filter(code=code).first()
    if mode is None:
        return {"code": code, "name": code, "needs_student_device": True}
    return {"code": mode.code, "name": mode.name, "needs_student_device": mode.needs_student_device}


def set_scope_value(school, key, scope, scope_id, value, user):
    """Simpan nilai di satu cakupan; None = kembalikan ke bawaan (hapus)."""
    if value is None:
        reset_setting(school, key, scope, scope_id, user)
    else:
        save_setting(school, key, scope, scope_id, value, user)


@transaction.atomic
def set_subject_category(subject, category):
    """Tetapkan kategori mapel; None = tanpa kategori. Kategori wajib dari sekolah mapel itu."""
    if category is None:
        SubjectProfile.objects.filter(subject=subject).delete()
        return
    if category.school_id != subject.school_id:
        raise ValidationError({"category": "Kategori tidak ditemukan di sekolah ini."})
    SubjectProfile.objects.update_or_create(subject=subject, defaults={"category": category})


@transaction.atomic
def delete_category(category):
    """Hapus kategori yang tidak dipakai mapel, beserta pengaturan di cakupan kategori itu."""
    if category.profiles.exists():
        raise ValidationError(
            {"detail": "Kategori masih dipakai mapel. Pindahkan mapelnya dulu atau nonaktifkan kategori ini."}
        )
    SchoolSetting.objects.filter(school=category.school, scope=Scope.CATEGORY, scope_id=category.pk).delete()
    category.delete()
