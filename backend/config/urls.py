from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.schools.urls")),
    path("api/", include("apps.academics.urls")),
    path("api/", include("apps.materials.urls")),
    path("api/", include("apps.tasks.urls")),
    path("api/", include("apps.dashboard.urls")),
    path("api/", include("apps.announcements.urls")),
    path("api/", include("apps.schedule.urls")),
    path("api/", include("apps.attendance.urls")),
    path("api/", include("apps.payments.urls")),
    path("api/", include("apps.exams.urls")),
    path("api/", include("apps.chat.urls")),
    path("api/", include("apps.assessments.urls")),
    path("api/", include("apps.learning_media.urls")),
    path("api/", include("apps.branding.urls")),
    path("api/", include("apps.school_settings.urls")),
    path("api/", include("apps.grading.urls")),
]

# Sengaja TIDAK menyajikan MEDIA_ROOT secara publik: file materi & tugas hanya boleh
# diambil lewat endpoint download yang mengecek login dan hak akses.
