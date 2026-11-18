from django.db.models import Q

from apps.accounts.models import Role

from .models import InteractiveMedia


def media_for(user, school):
    """Media yang boleh dilihat di Studio.
    - Super Admin tanpa sekolah (mode Super Admin): Pustaka Media global.
    - Admin sekolah: semua media sekolahnya.
    - Guru: media buatannya + media terbit milik sekolahnya (boleh dipakai/disalin, tidak diubah).
    - Siswa: tidak ada (siswa membuka media lewat materi)."""
    if school is None:
        return (
            InteractiveMedia.objects.filter(school__isnull=True)
            if user.is_foundation
            else InteractiveMedia.objects.none()
        )
    queryset = InteractiveMedia.objects.filter(school=school)
    if user.is_admin_role:
        return queryset
    if user.role == Role.TEACHER:
        return queryset.filter(Q(created_by=user) | Q(versions__isnull=False)).distinct()
    return InteractiveMedia.objects.none()


def library_for(user, school):
    """Media Pustaka yang sudah terbit dan dibagikan ke sekolah ini (untuk disalin)."""
    queryset = InteractiveMedia.objects.filter(school__isnull=True, versions__isnull=False)
    if user.is_foundation and school is None:
        return queryset.distinct()
    if school is None or user.role == Role.STUDENT:
        return InteractiveMedia.objects.none()
    return queryset.filter(shares__school=school).distinct()


def can_edit(user, media):
    """Media sekolah: pembuatnya atau admin sekolah. Pustaka: Super Admin."""
    if media.school_id is None:
        return user.is_foundation
    return user.is_admin_role or media.created_by_id == user.id
