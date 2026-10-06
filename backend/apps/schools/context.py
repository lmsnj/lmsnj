"""Sekolah aktif: sekolah yang sedang dibuka pengguna.

Satu akun (terutama guru) bisa terdaftar di beberapa sekolah. Frontend mengirim id sekolah yang
dipilih lewat header `X-School` di setiap request; di sini header itu dicek terhadap keanggotaan
pengguna, sehingga pengguna tidak bisa membuka sekolah lain hanya dengan mengganti header.
"""

from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from .models import School

SCHOOL_HEADER = "X-School"


def schools_for(user):
    """Sekolah (yang masih aktif) yang boleh dibuka user: admin yayasan semua, lainnya tempat ia terdaftar."""
    if not (user and user.is_authenticated):
        return School.objects.none()
    if user.is_foundation:
        return School.objects.filter(is_active=True)
    return user.schools.filter(is_active=True)


def active_school(request):
    """Sekolah dari header X-School. Tanpa header: sekolah pertama milik user (urut nama), kecuali
    admin yayasan: tanpa header berarti "mode yayasan" (belum membuka sekolah) -> None.
    Mengembalikan None juga jika user belum terdaftar di sekolah mana pun."""
    if not hasattr(request, "_active_school"):
        schools = schools_for(request.user)
        school_id = request.headers.get(SCHOOL_HEADER, "").strip()
        if school_id:
            school = schools.filter(pk=school_id).first() if school_id.isdigit() else None
            if school is None:
                raise PermissionDenied("Anda tidak terdaftar di sekolah ini.")
        elif request.user.is_authenticated and request.user.is_foundation:
            school = None
        else:
            school = schools.first()
        request._active_school = school
    return request._active_school


def require_school(request):
    school = active_school(request)
    if school is None:
        raise PermissionDenied("Akun Anda belum terdaftar di sekolah mana pun. Hubungi admin.")
    return school


class CurrentSchoolDefault:
    """Nilai bawaan field `school` di serializer = sekolah aktif (mirip CurrentUserDefault).

    Impor Excel tidak punya request per baris, jadi sekolah boleh dititipkan lewat context["school"].
    """

    requires_context = True

    def __call__(self, serializer_field):
        context = serializer_field.context
        school = context.get("school")
        if school is None and "request" in context:
            school = active_school(context["request"])
        if school is None:
            raise serializers.ValidationError("Akun Anda belum terdaftar di sekolah mana pun.")
        return school


class SchoolOwnedSerializer(serializers.ModelSerializer):
    """Dasar serializer untuk data milik satu sekolah (kelas, mapel). Sekolah diisi otomatis dari
    sekolah aktif dan tidak bisa dipindah lewat ubah data. Tambahkan "school" ke Meta.fields."""

    school = serializers.HiddenField(default=CurrentSchoolDefault())

    def update(self, instance, validated_data):
        validated_data.pop("school", None)
        return super().update(instance, validated_data)
