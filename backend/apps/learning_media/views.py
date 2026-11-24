import json
from types import SimpleNamespace

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Max, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.models import Role
from apps.accounts.permissions import IsAdminOrTeacher, IsFoundation
from apps.accounts.views import impersonator_id
from apps.common.excel import template_response
from apps.common.files import file_response
from apps.common.mixins import ProtectedDeleteMixin
from apps.materials import progress as learning
from apps.materials.selectors import materials_for
from apps.schools.context import active_school
from apps.schools.models import School

from . import assets as media_assets
from . import reports, schema, services
from .importers import excel as excel_import
from .importers.service import run_import
from .models import InteractiveMedia, InteractiveMediaAsset, InteractiveMediaShare, InteractiveMediaVersion
from .selectors import can_edit, library_for, media_for
from .serializers import (
    AnswerSerializer,
    ImportSerializer,
    MediaListSerializer,
    MediaSerializer,
    PreviewSerializer,
    PublishSerializer,
    ReflectionSerializer,
    ReminderSerializer,
    RestoreSerializer,
    RevealSerializer,
    SharesSerializer,
    StationActionSerializer,
    VersionSerializer,
    media_errors,
)


class LearningMediaViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """Studio Penyusun: daftar, draf, terbit, riwayat versi, pratinjau, salin, ekspor, bagikan."""

    permission_classes = [IsAdminOrTeacher]
    search_fields = ["title", "description"]
    ordering_fields = ["updated_at", "title"]
    protected_message = "Media ini masih dipakai di materi. Hapus atau ganti materinya dulu."

    def get_queryset(self):
        user, school = self.request.user, active_school(self.request)
        if self.request.query_params.get("library") in ("1", "true"):
            queryset = InteractiveMedia.objects.filter(pk__in=library_for(user, school).values("pk"))
        elif self.action in ("copy", "export", "retrieve"):
            # Media Pustaka yang dibagikan boleh dibuka & disalin, tetapi tidak muncul di daftar Studio.
            queryset = InteractiveMedia.objects.filter(
                Q(pk__in=library_for(user, school).values("pk"))
                | Q(pk__in=media_for(user, school).values("pk"))
            )
        else:
            queryset = InteractiveMedia.objects.filter(pk__in=media_for(user, school).values("pk"))
        subject = self.request.query_params.get("subject")
        if subject and subject.isdigit():
            queryset = queryset.filter(subject_id=subject)
        return queryset.select_related("subject", "created_by")

    def get_serializer_class(self):
        return MediaListSerializer if self.action == "list" else MediaSerializer

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "school": active_school(self.request)}

    def editable_object(self):
        media = self.get_object()
        if not can_edit(self.request.user, media):
            raise PermissionDenied("Hanya pembuat media atau admin yang dapat mengubah media ini.")
        return media

    def perform_create(self, serializer):
        school = active_school(self.request)
        if school is None and not self.request.user.is_foundation:
            raise PermissionDenied("Akun Anda belum terdaftar di sekolah mana pun.")
        serializer.save(school=school, created_by=self.request.user)

    def perform_update(self, serializer):
        if not can_edit(self.request.user, serializer.instance):
            raise PermissionDenied("Hanya pembuat media atau admin yang dapat mengubah media ini.")
        serializer.save()

    def perform_destroy(self, instance):
        if not can_edit(self.request.user, instance):
            raise PermissionDenied("Hanya pembuat media atau admin yang dapat menghapus media ini.")
        super().perform_destroy(instance)

    # ------------------------------------------------------------ terbit & versi

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """Periksa lengkap draf, kompilasi (kunci dipisah), lalu simpan sebagai versi baru."""
        media = self.editable_object()
        serializer = PublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            source = schema.validate_media(media.draft, full=True)
        except schema.MediaError as error:
            raise media_errors(error)
        missing = media_assets.asset_ids(source) - set(media.assets.values_list("id", flat=True))
        if missing:
            raise ValidationError(
                {
                    "draft": [
                        f"Gambar asset:{i} bukan milik media ini. Unggah ulang gambarnya."
                        for i in sorted(missing)
                    ]
                }
            )
        compiled = schema.compile_media(source)
        with transaction.atomic():
            InteractiveMedia.objects.select_for_update().filter(pk=media.pk).first()
            last = media.versions.aggregate(last=Max("number"))["last"] or 0
            version = InteractiveMediaVersion.objects.create(
                media=media,
                number=last + 1,
                source=source,
                content=compiled["content"],
                keys=compiled["keys"],
                required_stations=schema.required_station_ids(source),
                note=serializer.validated_data.get("note", ""),
                published_by=request.user,
            )
            # Id yang dibuat otomatis ikut disimpan ke draf, agar progres terikat ke id yang sama.
            media.draft = source
            media.save(update_fields=["draft", "updated_at"])
        return Response(VersionSerializer(version).data, status=201)

    @action(detail=True)
    def versions(self, request, pk=None):
        media = self.get_object()
        return Response(VersionSerializer(media.versions.select_related("published_by"), many=True).data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Kembalikan draf ke isi versi lama (perlu diterbitkan lagi agar terlihat siswa)."""
        media = self.editable_object()
        serializer = RestoreSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        version = get_object_or_404(media.versions, number=serializer.validated_data["number"])
        media.draft = version.source
        media.save(update_fields=["draft", "updated_at"])
        return Response(MediaSerializer(media, context=self.get_serializer_context()).data)

    # ------------------------------------------------------------ pratinjau guru

    @action(detail=True, methods=["post"])
    def preview(self, request, pk=None):
        """Pratinjau sebagai siswa (tidak ada yang disimpan sebagai progres). Draf yang dikirim belum
        harus tersimpan, jadi guru bisa melihat hasil ubahan sebelum menekan Simpan."""
        media = self.get_object()
        serializer = PreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        draft = serializer.validated_data.get("draft", media.draft)
        try:
            source = schema.validate_media(draft, full=True)
        except schema.MediaError as error:
            raise media_errors(error)
        compiled = schema.compile_media(source)
        media.preview = compiled
        media.save(update_fields=["preview"])
        version = self._preview_version(media)
        return Response(services.player_data(None, version, request.user, preview=True))

    def _preview_version(self, media):
        if not media.preview:
            raise ValidationError({"detail": "Buka pratinjau dulu."})
        return SimpleNamespace(
            media_id=media.id,
            title=media.title,
            number=0,
            content=media.preview["content"],
            keys=media.preview["keys"],
            required_stations=schema.required_station_ids(media.preview["content"]),
        )

    @action(detail=True, methods=["post"], url_path="preview-answer")
    def preview_answer(self, request, pk=None):
        media = self.get_object()
        serializer = AnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        version = self._preview_version(media)
        *_, result = services.check_answer(version, data["station"], data["step"], data["response"])
        return Response({**result, "saved": False})

    @action(detail=True, methods=["post"], url_path="preview-reveal")
    def preview_reveal(self, request, pk=None):
        media = self.get_object()
        serializer = RevealSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        version = self._preview_version(media)
        return Response(
            services.reveal_answer(None, None, version, data["station"], data["step"], save=False)
        )

    # ------------------------------------------------------------ salin, ekspor, bagikan

    @action(detail=True, methods=["post"])
    def copy(self, request, pk=None):
        """Salin media (milik sekolah ini atau Pustaka yang dibagikan) sebagai draf baru milik guru ini.
        Yang disalin: isi versi terbit terakhir (draf orang lain yang belum terbit tidak ikut)."""
        source = self.get_object()
        school = active_school(request)
        if school is None and not request.user.is_foundation:
            raise PermissionDenied("Buka sekolah dulu untuk menyalin media.")
        version = source.latest_version()
        draft = source.draft if can_edit(request.user, source) else (version.source if version else None)
        if draft is None:
            raise ValidationError({"detail": "Media ini belum diterbitkan."})
        copy = InteractiveMedia.objects.create(
            school=school,
            subject=(
                source.subject
                if source.subject and source.subject.school_id == getattr(school, "id", None)
                else None
            ),
            title=f"{source.title} (salinan)"[:200],
            description=source.description,
            draft=draft,
            created_by=request.user,
        )
        mapping = {}
        for asset in source.assets.filter(id__in=media_assets.asset_ids(draft)):
            with asset.file.open("rb") as handle:
                clone = InteractiveMediaAsset(
                    media=copy, original_filename=asset.original_filename, size=asset.size,
                    width=asset.width, height=asset.height, created_by=request.user,
                )  # fmt: skip
                clone.file.save(
                    asset.original_filename or "gambar.webp", ContentFile(handle.read()), save=True
                )
            mapping[asset.id] = clone.id
        if mapping:
            copy.draft = media_assets.remap_assets(draft, mapping)
            copy.save(update_fields=["draft"])
        return Response(MediaSerializer(copy, context=self.get_serializer_context()).data, status=201)

    @action(detail=True, methods=["get", "post"], parser_classes=[MultiPartParser, FormParser])
    def assets(self, request, pk=None):
        """GET: gambar milik media ini. POST (multipart `file`): unggah gambar (dikompres otomatis)."""
        if request.method == "GET":
            media = self.get_object()
            return Response([asset_data(asset) for asset in media.assets.all()])
        media = self.editable_object()
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Pilih gambar yang akan diunggah."})
        if media.assets.count() >= media_assets.MAX_ASSETS:
            raise ValidationError({"file": f"Maksimal {media_assets.MAX_ASSETS} gambar per media."})
        content, name, width, height = media_assets.compress(upload)
        asset = InteractiveMediaAsset(
            media=media, original_filename=name, size=content.size, width=width, height=height,
            created_by=request.user,
        )  # fmt: skip
        asset.file.save(name, content, save=True)
        return Response(asset_data(asset), status=201)

    @action(detail=True)
    def export(self, request, pk=None):
        """Unduh isi media sebagai JSON (untuk dibagikan / diimpor di sekolah lain)."""
        media = self.get_object()
        version = media.latest_version()
        draft = media.draft if can_edit(request.user, media) else (version.source if version else media.draft)
        return _json_response(media, draft, f"media-{media.id}.json")

    # ------------------------------------------------------------ impor

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def fprg(self, request):
        """Ubah file Flowgorithm asli (.fprg) menjadi program MPI (untuk program awal/kunci di Studio)."""
        from .plugins.flowgorithm.fprg import FprgError, parse_fprg

        upload = request.FILES.get("file")
        if upload is None or not upload.name.lower().endswith(".fprg"):
            raise ValidationError({"file": "Pilih file Flowgorithm (.fprg)."})
        try:
            program, warnings = parse_fprg(upload.read())
        except FprgError as error:
            raise ValidationError({"file": str(error)})
        return Response({"program": program, "warnings": warnings})

    @action(detail=True, url_path="import-template")
    def import_template(self, request, pk=None):
        """Template Excel berisi isi draf (atau contoh jika masih kosong), untuk diubah lalu diimpor ulang."""
        media = self.get_object()
        return template_response(excel_import.build_workbook(media.draft), f"media-{media.id}.xlsx")

    @action(detail=True, url_path="json-template")
    def json_template(self, request, pk=None):
        """Template JSON (format sama dengan Ekspor JSON) berisi isi draf, atau contoh jika masih kosong."""
        media = self.get_object()
        draft = media.draft
        if not any(True for _ in schema.iter_stations(draft or {})):
            draft = excel_import.EXAMPLE
        return _json_response(media, draft, f"media-{media.id}-template.json")

    @action(
        detail=True,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def import_content(self, request, pk=None):
        """Periksa (`dry_run`, bawaan) lalu terapkan isi impor ke draf (`mode` append/replace)."""
        media = self.editable_object()
        serializer = ImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result, saved = run_import(media, data, request.user, active_school(request), data["dry_run"])
        if not data["dry_run"] and not saved:
            return Response(
                {**result, "detail": "Impor belum bisa diterapkan. Perbaiki kesalahan di bawah."}, status=400
            )
        if saved:
            result["media"] = MediaSerializer(media, context=self.get_serializer_context()).data
        return Response(result)

    @action(detail=True, methods=["get", "put"], permission_classes=[IsFoundation])
    def shares(self, request, pk=None):
        """Super Admin: sekolah yang boleh memakai media Pustaka ini."""
        media = self.get_object()
        if media.school_id is not None:
            raise ValidationError({"detail": "Hanya media Pustaka yang bisa dibagikan ke sekolah lain."})
        if request.method == "PUT":
            serializer = SharesSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            ids = set(
                School.objects.filter(pk__in=serializer.validated_data["schools"]).values_list(
                    "id", flat=True
                )
            )
            media.shares.exclude(school_id__in=ids).delete()
            existing = set(media.shares.values_list("school_id", flat=True))
            InteractiveMediaShare.objects.bulk_create(
                [InteractiveMediaShare(media=media, school_id=school_id) for school_id in ids - existing]
            )
        return Response({"schools": sorted(media.shares.values_list("school_id", flat=True))})


def asset_data(asset):
    return {
        "id": asset.id,
        "ref": asset.ref,
        "url": f"/media-assets/{asset.id}/",
        "original_filename": asset.original_filename,
        "size": asset.size,
        "width": asset.width,
        "height": asset.height,
    }


class MediaAssetViewSet(viewsets.ViewSet):
    """GET: file gambar (hak akses = boleh membuka medianya, atau siswa yang materinya memakai media ini).
    DELETE: pembuat media/admin."""

    permission_classes = [IsAuthenticated]

    def _asset(self, request, pk):
        asset = InteractiveMediaAsset.objects.select_related("media").filter(pk=pk).first()
        if asset is None:
            raise NotFound("Gambar tidak ditemukan.")
        user, school = request.user, active_school(request)
        media_id = asset.media_id
        allowed = (
            media_for(user, school).filter(pk=media_id).exists()
            or library_for(user, school).filter(pk=media_id).exists()
            or materials_for(user, school).filter(interactive_media_id=media_id).exists()
        )
        if not allowed:
            raise NotFound("Gambar tidak ditemukan.")
        return asset

    def retrieve(self, request, pk=None):
        asset = self._asset(request, pk)
        response = file_response(asset.file, asset.original_filename or "gambar.webp")
        response["Cache-Control"] = "private, max-age=86400"
        return response

    def destroy(self, request, pk=None):
        asset = self._asset(request, pk)
        if not can_edit(request.user, asset.media):
            raise PermissionDenied("Hanya pembuat media atau admin yang dapat menghapus gambar.")
        asset.delete()
        return Response(status=204)


class MediaPlayViewSet(viewsets.ViewSet):
    """Pemutar media di halaman materi: /api/materials/{id}/media/...

    Siswa: progres disimpan. Guru/admin: pratinjau (semua terbuka, tidak disimpan). Super Admin yang
    "masuk sebagai" siswa: melihat progres siswa itu, tetapi tidak ada yang berubah (lihat saja)."""

    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "media"
            return [ScopedRateThrottle()]
        return []

    def _context(self, request, material_id):
        material = (
            materials_for(request.user, active_school(request))
            .filter(pk=material_id, material_type="media")
            .select_related("interactive_media")
            .first()
        )
        if material is None or material.interactive_media is None:
            raise NotFound("Media interaktif tidak ditemukan.")
        learning.ensure_material_unlocked(request, material)
        is_student = request.user.role == Role.STUDENT
        return SimpleNamespace(
            material=material,
            student=request.user if is_student else None,
            save=is_student and not impersonator_id(request),
            preview=not is_student,
        )

    def _version(self, ctx, number=None):
        version = services._version(ctx.material.interactive_media, number)
        if version is None:
            raise NotFound("Media ini belum diterbitkan.")
        return version

    def _ensure_open(self, ctx, version, station_id):
        """Siswa tidak boleh mengerjakan stasiun yang masih terkunci."""
        if ctx.preview:
            return
        data = services.player_data(ctx.material, version, ctx.student, student=ctx.student)
        state = data["stations"].get(station_id)
        if state is None:
            raise ValidationError({"detail": "Stasiun tidak ditemukan. Muat ulang halaman."})
        if state["locked"]:
            raise PermissionDenied(f"Stasiun ini masih terkunci. {state['locked_by']}")

    def retrieve(self, request, material_id=None):
        ctx = self._context(request, material_id)
        version = self._version(ctx)
        data = services.player_data(
            ctx.material, version, request.user, student=ctx.student, preview=ctx.preview
        )
        data["read_only"] = not ctx.save
        return Response(data)

    def answer(self, request, material_id=None):
        ctx = self._context(request, material_id)
        serializer = AnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        version = self._version(ctx, data.get("version"))
        self._ensure_open(ctx, version, data["station"])
        result = services.submit_answer(
            ctx.material, ctx.student, version, data["station"], data["step"], data["response"],
            data["hint_level"], data["client_uid"], save=ctx.save,
        )  # fmt: skip
        return Response(result)

    def reveal(self, request, material_id=None):
        ctx = self._context(request, material_id)
        serializer = RevealSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        version = self._version(ctx, data.get("version"))
        self._ensure_open(ctx, version, data["station"])
        return Response(
            services.reveal_answer(
                ctx.material, ctx.student, version, data["station"], data["step"], save=ctx.save
            )
        )

    def station(self, request, material_id=None):
        ctx = self._context(request, material_id)
        serializer = StationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        version = self._version(ctx, data.get("version"))
        self._ensure_open(ctx, version, data["station"])
        station_id = data["station"]
        if data["action"] == "finish":
            return Response(
                services.finish_station(ctx.material, ctx.student, version, station_id, save=ctx.save)
            )
        if not ctx.save:
            return Response({"saved": False})
        services._locate(version, station_id)
        if data["action"] == "restart":
            services.restart_station(ctx.material, ctx.student, station_id)
        elif data["action"] == "complete":
            services.complete_step(ctx.material, ctx.student, version, station_id, data["step"])
        else:
            services.visit_station(ctx.material, ctx.student, station_id, data["step"], data["seconds"])
        return Response({"saved": True})

    def leaderboard(self, request, material_id=None):
        ctx = self._context(request, material_id)
        if not services.settings_of(ctx.material)["leaderboard"]:
            raise PermissionDenied("Papan peringkat dimatikan oleh guru.")
        return Response(services.leaderboard(ctx.material, request.user))

    def reflection(self, request, material_id=None):
        ctx = self._context(request, material_id)
        serializer = ReflectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        version = self._version(ctx, data.get("version"))
        self._ensure_open(ctx, version, data["station"])
        return Response(
            services.save_reflection(
                ctx.material, ctx.student, version, data["station"], data["text"], save=ctx.save
            )
        )


class MediaReportViewSet(viewsets.ViewSet):
    """Laporan media satu materi untuk guru tim kelas-mapel itu & admin: progres, kesulitan, N-Gain, siswa
    tidak aktif (+ pengingat lewat Ruang Obrolan), refleksi, ekspor Excel."""

    permission_classes = [IsAdminOrTeacher]

    def _material(self, request, material_id):
        material = (
            materials_for(request.user, active_school(request))
            .filter(pk=material_id, material_type="media")
            .select_related("interactive_media", "teaching_assignment__classroom")
            .first()
        )
        if material is None or material.interactive_media is None:
            raise NotFound("Media interaktif tidak ditemukan.")
        return material

    def retrieve(self, request, material_id=None):
        return Response(reports.build_report(self._material(request, material_id)))

    def export(self, request, material_id=None):
        material = self._material(request, material_id)
        content = reports.export_workbook(reports.build_report(material))
        return template_response(content, f"laporan-media-{material.id}.xlsx")

    def remind(self, request, material_id=None):
        """Kirim pesan pengingat ke siswa terpilih (hanya siswa kelas ini yang boleh diajak mengobrol)."""
        from apps.chat.models import Conversation, Message
        from apps.chat.rules import can_chat

        if impersonator_id(request):
            raise PermissionDenied("Saat masuk sebagai pengguna lain, pesan tidak bisa dikirim.")
        material = self._material(request, material_id)
        serializer = ReminderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        students = material.teaching_assignment.classroom.students.filter(
            is_active=True, pk__in=data["students"]
        )
        sent, skipped = [], []
        for student in students:
            if not can_chat(request.user, student):
                skipped.append(student.full_name)
                continue
            first, second = sorted([request.user, student], key=lambda u: u.id)
            conversation, _ = Conversation.objects.get_or_create(user_a=first, user_b=second)
            nickname = (student.full_name or student.username).split()[0]
            message = Message.objects.create(
                conversation=conversation,
                sender=request.user,
                body=data["message"].replace("{nama}", nickname),
            )
            conversation.last_message_at = message.created_at
            conversation.save(update_fields=["last_message_at"])
            sent.append(student.full_name)
        return Response({"sent": len(sent), "skipped": skipped})


def _json_response(media, draft, filename):
    """File JSON berformat Ekspor JSON media (dibaca ulang oleh importers/sources.py::read_json)."""
    payload = {
        "format": "lms-sigma-media",
        "title": media.title,
        "description": media.description,
        "media": draft,
    }
    response = HttpResponse(
        json.dumps(payload, ensure_ascii=False, indent=2), content_type="application/json; charset=utf-8"
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
