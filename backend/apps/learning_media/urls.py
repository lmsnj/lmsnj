from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import LearningMediaViewSet, MediaAssetViewSet, MediaPlayViewSet, MediaReportViewSet

router = DefaultRouter()
router.register("learning-media", LearningMediaViewSet, basename="learning-media")
router.register("media-assets", MediaAssetViewSet, basename="media-asset")

play = MediaPlayViewSet
report = MediaReportViewSet
urlpatterns = router.urls + [
    path(
        "materials/<int:material_id>/media/report/", report.as_view({"get": "retrieve"}), name="media-report"
    ),
    path(
        "materials/<int:material_id>/media/report/export/",
        report.as_view({"get": "export"}),
        name="media-report-export",
    ),
    path(
        "materials/<int:material_id>/media/remind/", report.as_view({"post": "remind"}), name="media-remind"
    ),
    path("materials/<int:material_id>/media/", play.as_view({"get": "retrieve"}), name="media-play"),
    path("materials/<int:material_id>/media/answer/", play.as_view({"post": "answer"}), name="media-answer"),
    path("materials/<int:material_id>/media/reveal/", play.as_view({"post": "reveal"}), name="media-reveal"),
    path(
        "materials/<int:material_id>/media/station/", play.as_view({"post": "station"}), name="media-station"
    ),
    path(
        "materials/<int:material_id>/media/leaderboard/",
        play.as_view({"get": "leaderboard"}),
        name="media-leaderboard",
    ),
    path(
        "materials/<int:material_id>/media/reflection/",
        play.as_view({"post": "reflection"}),
        name="media-reflection",
    ),
]
