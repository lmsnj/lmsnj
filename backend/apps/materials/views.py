from django.db import transaction
from django.db.models import Max, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.academics.filters import TeamContentFilter
from apps.academics.models import TeachingAssignment
from apps.academics.selectors import team_assignments_for_request
from apps.accounts.models import Role
from apps.accounts.permissions import ContentPermission, IsAdminOrTeacher, IsStudent, IsTeacher
from apps.assessments import ai_generate, auto_assessment
from apps.common.excel import import_response, is_dry_run, template_response
from apps.common.files import file_response
from apps.schools.context import active_school

from . import objective_quiz, objective_quiz_excel, plan_excel
from . import progress as learning
from . import sharing
from .models import Chapter, Material, MaterialItem, MaterialProgress
from .selectors import chapters_for, materials_for
from .serializers import (
    ChapterSerializer,
    CheckObjectivesSerializer,
    CopyMaterialsSerializer,
    MaterialItemSerializer,
    MaterialSerializer,
    MergeMaterialSerializer,
    ProgressUpdateSerializer,
    ReflectionSerializer,
    ReorderChaptersSerializer,
    ReorderItemsSerializer,
    ReorderSerializer,
)


class MaterialFilter(TeamContentFilter):
    class Meta:
        model = Material
        fields = ["material_type", "is_published"]


class ChapterFilter(TeamContentFilter):
    class Meta:
        model = Chapter
        fields = []


def team_materials(assignment):
    """Semua materi kelas-mapel ini, buatan guru tim mana pun."""
    return Material.objects.filter(teaching_assignment__in=assignment.team())


def team_chapters(assignment):
    return Chapter.objects.filter(teaching_assignment__in=assignment.team())


def team_assignment_or_404(request, assignment_id):
    """Pengampu kelas-mapel tim guru yang login (404 jika bukan timnya)."""
    return get_object_or_404(team_assignments_for_request(request), pk=assignment_id)


def ensure_team_member(user, material, message):
    if not material.teaching_assignment.has_team_member(user):
        raise PermissionDenied(message)


class MaterialViewSet(viewsets.ModelViewSet):
    serializer_class = MaterialSerializer
    permission_classes = [ContentPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_class = MaterialFilter
    search_fields = ["title", "description"]
    ordering_fields = ["created_at", "title", "order"]

    def get_queryset(self):
        return (
            materials_for(self.request.user, active_school(self.request))
            .select_related(
                "teaching_assignment__subject",
                "teaching_assignment__classroom",
                "created_by",
                "required_task",
                "required_assessment",
                "chapter",
            )
            .prefetch_related("items")
        )

    def perform_create(self, serializer):
        # Materi baru ditaruh di urutan terakhir kelas-mapelnya (materi semua guru tim dihitung).
        assignment = serializer.validated_data["teaching_assignment"]
        last = team_materials(assignment).aggregate(last=Max("order"))["last"] or 0
        serializer.save(created_by=self.request.user, order=last + 1)

    def unlocked_for_student(self, material):
        learning.ensure_material_unlocked(self.request, material)

    @action(detail=True)
    def download(self, request, pk=None):
        """Kirim file PDF setelah hak akses dicek (lewat get_queryset dan kunci materi)."""
        material = self.get_object()
        self.unlocked_for_student(material)
        return file_response(material.file, material.original_filename or "materi.pdf")

    def _my_progress(self, material):
        progress, _ = MaterialProgress.objects.get_or_create(material=material, student=self.request.user)
        return progress

    def _material_response(self, material):
        # Hitung ulang progres setelah berubah.
        self.request.__dict__.pop("_material_progress", None)
        return Response(self.get_serializer(material).data)

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def open(self, request, pk=None):
        """Siswa membuka materi (syarat capaian pertama)."""
        material = self.get_object()
        self.unlocked_for_student(material)
        progress = self._my_progress(material)
        if not progress.opened_at:
            progress.opened_at = timezone.now()
            progress.save(update_fields=["opened_at", "updated_at"])
        return self._material_response(material)

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def objectives(self, request, pk=None):
        """{checked: [indeks capaian]} - siswa mencentang capaian yang sudah ia kuasai."""
        material = self.get_object()
        self.unlocked_for_student(material)
        serializer = CheckObjectivesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        progress = self._my_progress(material)
        # Capaian yang punya kuis hanya tercentang lewat kuis (lihat objective_quiz.py), jadi
        # statusnya tidak bisa diubah dari sini.
        with_quiz = {i for i, count in enumerate(objective_quiz.quiz_counts(material)) if count}
        requested = {i for i in serializer.validated_data["checked"] if i < len(material.objectives)}
        kept = set(progress.checked_objectives) & with_quiz
        checked = sorted((requested - with_quiz) | kept)
        progress.checked_objectives = checked
        progress.opened_at = progress.opened_at or timezone.now()
        progress.save()
        return self._material_response(material)

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def reflection(self, request, pk=None):
        """{reflection} - siswa menulis/mengubah cerita reflektif materi ini."""
        material = self.get_object()
        self.unlocked_for_student(material)
        serializer = ReflectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Alur belajar: konten -> Latihan Pemahaman -> Cerita Reflektif.
        if not learning.check_done(request, material, "practice"):
            raise ValidationError(
                {"reflection": "Selesaikan Latihan Pemahaman dulu, lalu tulis cerita reflektif."}
            )
        progress = self._my_progress(material)
        progress.reflection = serializer.validated_data["reflection"]
        progress.reflected_at = timezone.now()
        progress.opened_at = progress.opened_at or timezone.now()
        progress.save()
        return self._material_response(material)

    # Siswa juga boleh POST (mengirim jawaban); hak akses diperiksa di dalam action.
    @action(
        detail=True,
        methods=["get", "post", "put"],
        url_path="objective-quiz",
        permission_classes=[IsAuthenticated],
    )
    def objective_quiz(self, request, pk=None):
        """Kuis kecil per capaian.
        GET ?index=   : soal (tanpa kunci) untuk dikerjakan / dipratinjau.
        POST {index, answers}: periksa; siswa yang benar semua -> capaian itu tercentang.
        PUT {quizzes: {indeks: [rancangan soal]}}: guru pengampu mengatur kuis."""
        material = self.get_object()
        user = request.user
        is_owner = material.teaching_assignment.has_team_member(user)
        if request.method == "PUT":
            if not is_owner:
                raise PermissionDenied("Hanya guru pengampu yang dapat mengatur kuis capaian.")
            objective_quiz.set_quizzes(material, request.data.get("quizzes"))
            return Response({"counts": objective_quiz.quiz_counts(material)})

        if user.role == Role.STUDENT:
            self.unlocked_for_student(material)
        elif not (is_owner or user.is_admin_role):
            raise PermissionDenied("Hanya guru pengampu yang dapat mencoba kuis ini.")
        raw_index = (
            request.query_params.get("index") if request.method == "GET" else request.data.get("index")
        )
        index = int(raw_index) if str(raw_index).isdigit() else -1
        quiz = objective_quiz.quiz_for(material, index)
        if quiz is None:
            raise ValidationError({"index": "Capaian ini tidak punya kuis."})

        if request.method == "GET":
            # Seed berubah setiap kali dibuka agar urutan pilihan saat mencoba ulang berbeda.
            seed = f"{user.id}-{timezone.now().timestamp()}"
            return Response(
                {
                    "index": index,
                    "objective": material.objectives[index],
                    "items": objective_quiz.student_items(quiz, seed),
                }
            )

        result = objective_quiz.grade(quiz, request.data.get("answers") or {})
        if user.role == Role.STUDENT and result["passed"]:
            progress = self._my_progress(material)
            progress.checked_objectives = sorted(set(progress.checked_objectives) | {index})
            progress.opened_at = progress.opened_at or timezone.now()
            progress.save()
        if user.role == Role.STUDENT:
            result["material"] = self._material_response(material).data
        return Response(result)

    def _owned_material(self, request):
        material = self.get_object()
        ensure_team_member(request.user, material, "Hanya guru pengampu yang dapat mengatur kuis materi ini.")
        return material

    # Siswa juga boleh POST (mengirim jawaban); hak akses diperiksa di dalam action.
    @action(detail=True, methods=["get", "post", "put"], permission_classes=[IsAuthenticated])
    def practice(self, request, pk=None):
        """Latihan Pemahaman satu materi.
        GET: soal (tanpa kunci). POST {answers}: periksa; siswa yang benar semua -> lulus latihan.
        PUT {items: [rancangan soal]}: guru pengampu mengatur latihan (daftar kosong = hapus)."""
        material = self.get_object()
        user = request.user
        is_owner = material.teaching_assignment.has_team_member(user)
        if request.method == "PUT":
            if not is_owner:
                raise PermissionDenied("Hanya guru pengampu yang dapat mengatur Latihan Pemahaman.")
            objective_quiz.set_practice(material, request.data.get("items"))
            return Response({"count": objective_quiz.practice_count(material)})

        if user.role == Role.STUDENT:
            self.unlocked_for_student(material)
        elif not (is_owner or user.is_admin_role):
            raise PermissionDenied("Hanya guru pengampu yang dapat mencoba latihan ini.")
        quiz = material.practice_quiz
        if not objective_quiz.practice_count(material):
            raise ValidationError({"detail": "Materi ini tidak punya Latihan Pemahaman."})
        if user.role == Role.STUDENT and not learning.check_done(request, material, "opened"):
            raise ValidationError(
                {"detail": "Buka semua konten materi dulu, lalu kerjakan Latihan Pemahaman."}
            )

        if request.method == "GET":
            # Seed berubah setiap kali dibuka agar urutan pilihan saat mencoba ulang berbeda.
            seed = f"{user.id}-{timezone.now().timestamp()}"
            return Response({"items": objective_quiz.student_items(quiz, seed)})

        result = objective_quiz.grade(quiz, request.data.get("answers") or {})
        if user.role == Role.STUDENT:
            if result["passed"]:
                progress = self._my_progress(material)
                if not progress.practice_passed_at:
                    progress.practice_passed_at = timezone.now()
                    progress.save(update_fields=["practice_passed_at", "updated_at"])
            result["material"] = self._material_response(material).data
        return Response(result)

    @action(detail=True, url_path="practice-template", permission_classes=[IsTeacher])
    def practice_template(self, request, pk=None):
        """Template Excel Latihan Pemahaman, sudah berisi soal latihan yang ada."""
        material = self._owned_material(request)
        content = objective_quiz_excel.build_practice_template(material)
        return template_response(content, f"Latihan Pemahaman - {material.title[:60]}.xlsx")

    @action(detail=True, methods=["post"], url_path="practice-import", permission_classes=[IsTeacher])
    def practice_import(self, request, pk=None):
        """Impor Latihan Pemahaman dari Excel; isi file MENGGANTI seluruh soal latihan materi ini."""
        material = self._owned_material(request)
        preview, items = objective_quiz_excel.check_practice_file(request.FILES.get("file"))

        def save():
            objective_quiz.set_practice(material, items)
            return len(items)

        return import_response(preview, is_dry_run(request), save)

    @action(detail=True, url_path="objective-quiz-template", permission_classes=[IsTeacher])
    def objective_quiz_template(self, request, pk=None):
        """Template Excel kuis capaian, sudah berisi kuis yang ada (untuk menambah/mengubah soal)."""
        material = self._owned_material(request)
        if not material.objectives:
            raise ValidationError({"detail": "Isi dulu daftar capaian materi ini."})
        content = objective_quiz_excel.build_quiz_template(material)
        return template_response(content, f"Kuis Capaian - {material.title[:60]}.xlsx")

    @action(detail=True, methods=["post"], url_path="objective-quiz-import", permission_classes=[IsTeacher])
    def objective_quiz_import(self, request, pk=None):
        """Impor kuis capaian dari Excel. dry_run=true (bawaan) hanya memeriksa; false menyimpan jika
        SEMUA baris benar. Capaian yang ada di file diganti soalnya; capaian lain tidak berubah."""
        material = self._owned_material(request)
        preview, grouped = objective_quiz_excel.check_file(request.FILES.get("file"), material)

        def save():
            objective_quiz.set_quizzes(material, grouped)
            return sum(len(items) for items in grouped.values())

        return import_response(preview, is_dry_run(request), save)

    @action(detail=True, methods=["get", "put"], permission_classes=[IsAdminOrTeacher])
    def progress(self, request, pk=None):
        """GET: progres capaian setiap siswa kelas ini. PUT {records}: sahkan / buka kunci per siswa."""
        material = self.get_object()
        if request.method == "PUT":
            if request.user.role != Role.TEACHER:
                raise PermissionDenied("Hanya guru pengampu yang dapat mengubah progres siswa.")
            serializer = ProgressUpdateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            self._save_progress(material, serializer.validated_data["records"])
        students = list(
            material.teaching_assignment.classroom.students.filter(is_active=True).order_by("full_name")
        )
        # Progres dihitung bersama materi lain di kelas-mapel ini, buatan guru tim mana pun (agar status
        # terkunci benar).
        team_ids = list(material.teaching_assignment.team().values_list("id", flat=True))
        materials = learning.published_materials(team_ids)
        if material not in materials:
            materials.append(material)
        table = learning.progress_table(materials, [s.id for s in students])
        return Response(
            {
                "material": material.id,
                "title": material.title,
                "rows": [
                    {"student": s.id, "student_name": s.full_name, "nis": s.nis, **table[(material.id, s.id)]}
                    for s in students
                ],
            }
        )

    @transaction.atomic
    def _save_progress(self, material, records):
        allowed = set(material.teaching_assignment.classroom.students.values_list("id", flat=True))
        unknown = [r["student"].full_name for r in records if r["student"].id not in allowed]
        if unknown:
            raise ValidationError({"records": f"Bukan siswa kelas ini: {', '.join(unknown)}."})
        for record in records:
            progress, _ = MaterialProgress.objects.get_or_create(material=material, student=record["student"])
            for field in ("teacher_approved", "unlocked", "note"):
                if field in record:
                    setattr(progress, field, record[field])
            progress.updated_by = self.request.user
            progress.save()

    @action(
        detail=True, methods=["get", "post"], url_path="generate-assessment", permission_classes=[IsTeacher]
    )
    def generate_assessment(self, request, pk=None):
        """Guru pengampu: buat asesmen "Cek Pemahaman" otomatis (draf, langsung jadi syarat materi).
        GET = sumber yang tersedia. POST {source: "concepts" (gratis, bawaan) | "ai", question_count}."""
        material = self.get_object()
        ensure_team_member(
            request.user, material, "Hanya guru pengampu yang dapat membuat asesmen untuk materi ini."
        )
        if request.method == "GET":
            return Response(
                {
                    "concepts": len(auto_assessment.parse_concepts(material.concepts)),
                    "min_concepts": auto_assessment.MIN_CONCEPTS,
                    "objectives": len(material.objectives),
                    "ai_enabled": ai_generate.ai_enabled(),
                }
            )
        params = GenerateAssessmentSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        try:
            if params.validated_data["source"] == "ai":
                if not ai_generate.ai_enabled():
                    raise ValidationError(
                        {"detail": "Fitur AI belum diaktifkan di server (ANTHROPIC_API_KEY kosong)."}
                    )
                assessment, skipped = ai_generate.generate_for_material(
                    material, request, params.validated_data["question_count"]
                )
            else:
                assessment, skipped = auto_assessment.generate_from_concepts(material, request)
        except auto_assessment.AutoAssessmentError as error:
            raise ValidationError({"detail": str(error)})
        except ai_generate.AIGenerationError as error:
            return Response({"detail": str(error)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(
            {
                "assessment": assessment.id,
                "title": assessment.title,
                "question_count": assessment.questions.count(),
                "skipped": skipped,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], permission_classes=[IsTeacher])
    def reorder(self, request):
        """{teaching_assignment, materials: [id urut]} - atur urutan materi kelas-mapel tim guru."""
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = team_assignment_or_404(request, serializer.validated_data["teaching_assignment"])
        ids = serializer.validated_data["materials"]
        existing = set(team_materials(assignment).values_list("id", flat=True))
        if set(ids) != existing or len(ids) != len(existing):
            raise ValidationError(
                {"materials": "Daftar materi tidak lengkap atau bukan dari kelas-mapel ini."}
            )
        with transaction.atomic():
            for number, material_id in enumerate(ids, start=1):
                Material.objects.filter(pk=material_id).update(order=number)
        return Response({"detail": "Urutan materi disimpan."})

    def _plan_assignment(self, request, source):
        assignment_id = source.get("teaching_assignment")
        if not str(assignment_id or "").isdigit():
            raise ValidationError({"teaching_assignment": "Pilih kelas-mapel."})
        return team_assignment_or_404(request, int(assignment_id))

    @action(detail=False, url_path="plan-template", permission_classes=[IsTeacher])
    def plan_template(self, request):
        """?teaching_assignment= - template Excel Rencana Pembelajaran (lembar Bab, Materi, Tugas) yang
        sudah berisi data kelas-mapel itu, atau contoh jika masih kosong."""
        assignment = self._plan_assignment(request, request.query_params)
        content = plan_excel.build_plan_template(assignment)
        name = f"Rencana Pembelajaran - {assignment.subject.name} {assignment.classroom.name}"
        return template_response(content, f"{name[:80]}.xlsx")

    @action(detail=False, methods=["post"], url_path="plan-import", permission_classes=[IsTeacher])
    def plan_import(self, request):
        """Impor Rencana Pembelajaran (multipart teaching_assignment, file, dry_run). Judul sama =
        diperbarui, judul baru = dibuat; disimpan hanya jika SEMUA baris benar (plan_excel.py)."""
        assignment = self._plan_assignment(request, request.data)
        preview, plan = plan_excel.check_plan_file(request.FILES.get("file"), assignment, request)
        return import_response(
            preview, is_dry_run(request), lambda: plan_excel.save_plan(plan, assignment, request)
        )

    @action(detail=False, url_path="copy-targets", permission_classes=[IsTeacher])
    def copy_targets(self, request):
        """?teaching_assignment=<id> - kelas lain (mapel sama, sekolah ini) tujuan Salin ke Kelas Lain."""
        raw_id = request.query_params.get("teaching_assignment", "")
        assignment = team_assignment_or_404(request, raw_id if raw_id.isdigit() else 0)
        return Response(sharing.copy_targets(assignment, active_school(request)))

    @action(detail=False, methods=["post"], permission_classes=[IsTeacher])
    def copy(self, request):
        """{teaching_assignment, materials: [id], target} - salin materi ke kelas-mapel lain sebagai draf."""
        serializer = CopyMaterialsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        source = team_assignment_or_404(request, data["teaching_assignment"])
        materials = list(
            team_materials(source)
            .filter(pk__in=data["materials"])
            .select_related("teaching_assignment", "chapter")
            .prefetch_related("items")
        )
        if len(materials) != len(set(data["materials"])):
            raise ValidationError({"materials": "Ada materi yang bukan dari kelas-mapel ini."})
        targets = {t["teaching_assignment"] for t in sharing.copy_targets(source, active_school(request))}
        if data["target"] not in targets:
            raise ValidationError({"target": "Kelas tujuan harus kelas lain dengan mapel yang sama."})
        target = TeachingAssignment.objects.select_related("classroom").get(pk=data["target"])
        copies = sharing.copy_materials(materials, target, request.user)
        return Response(
            {
                "copied": len(copies),
                "detail": f"{len(copies)} materi disalin ke {target.classroom.name} sebagai draf.",
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], permission_classes=[IsTeacher])
    def merge(self, request, pk=None):
        """{duplicate} - gabungkan materi kembar ke materi ini; materi kembar dihapus."""
        keep = self.get_object()
        serializer = MergeMaterialSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        duplicate = self.get_queryset().filter(pk=serializer.validated_data["duplicate"]).first()
        if duplicate is None:
            raise ValidationError({"duplicate": "Materi yang digabung tidak ditemukan."})
        completed = sharing.merge_materials(keep, duplicate, request.user)
        keep.refresh_from_db()
        return Response(
            {
                "completed": completed,
                "detail": f"Materi digabung. {completed} siswa ditandai sudah tuntas.",
                "material": self.get_serializer(keep).data,
            }
        )


class GenerateAssessmentSerializer(serializers.Serializer):
    source = serializers.ChoiceField(choices=["concepts", "ai"], default="concepts")
    question_count = serializers.IntegerField(
        min_value=ai_generate.MIN_QUESTIONS, max_value=ai_generate.MAX_QUESTIONS, default=10
    )


class MaterialItemViewSet(viewsets.ModelViewSet):
    """Konten tambahan materi. Hak akses mengikuti materinya: queryset dibatasi lewat materials_for
    (guru hanya materi miliknya, siswa hanya materi terbit di kelasnya)."""

    serializer_class = MaterialItemSerializer
    permission_classes = [ContentPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["material"]

    def get_queryset(self):
        materials = materials_for(self.request.user, active_school(self.request))
        return MaterialItem.objects.filter(material__in=materials).select_related("material")

    def perform_create(self, serializer):
        # Konten baru ditaruh paling akhir.
        material = serializer.validated_data["material"]
        last = material.items.aggregate(last=Max("order"))["last"] or 0
        serializer.save(order=last + 1)

    @action(detail=True)
    def download(self, request, pk=None):
        item = self.get_object()
        learning.ensure_material_unlocked(request, item.material)
        return file_response(item.file, item.original_filename or "materi.pdf")

    @action(detail=True, methods=["post"], permission_classes=[IsStudent])
    def open(self, request, pk=None):
        """Siswa membuka konten ini; mengembalikan materinya (dengan progres terbaru)."""
        item = self.get_object()
        material = item.material
        learning.ensure_material_unlocked(request, material)
        progress, _ = MaterialProgress.objects.get_or_create(material=material, student=request.user)
        if item.id not in progress.opened_items:
            progress.opened_items = [*progress.opened_items, item.id]
            progress.save(update_fields=["opened_items", "updated_at"])
        request.__dict__.pop("_material_progress", None)
        return Response(MaterialSerializer(material, context=self.get_serializer_context()).data)

    @action(detail=False, methods=["post"], permission_classes=[IsTeacher])
    def reorder(self, request):
        """{material, items: [id urut]} - atur urutan konten tambahan materi milik guru."""
        serializer = ReorderItemsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        material = get_object_or_404(
            Material.objects.filter(teaching_assignment__in=team_assignments_for_request(request)),
            pk=serializer.validated_data["material"],
        )
        ids = serializer.validated_data["items"]
        existing = set(material.items.values_list("id", flat=True))
        if set(ids) != existing or len(ids) != len(existing):
            raise ValidationError({"items": "Daftar konten tidak lengkap atau bukan dari materi ini."})
        with transaction.atomic():
            for number, item_id in enumerate(ids, start=1):
                MaterialItem.objects.filter(pk=item_id).update(order=number)
        return Response({"detail": "Urutan konten disimpan."})


class ChapterViewSet(viewsets.ModelViewSet):
    """Bab per kelas-mapel (pengelompokan materi + Post Test). Hak akses seperti materi: guru pengampu
    mengelola, admin boleh menghapus, siswa hanya melihat bab berisi materi terbit di kelasnya.
    Menghapus bab TIDAK menghapus materinya (materi menjadi tanpa bab)."""

    serializer_class = ChapterSerializer
    permission_classes = [ContentPermission]
    filterset_class = ChapterFilter

    def get_queryset(self):
        materials = Material.objects.order_by("order", "created_at", "id")
        return (
            chapters_for(self.request.user, active_school(self.request))
            .select_related("post_test")
            .prefetch_related(Prefetch("materials", queryset=materials))
            # Urut per kelas-mapel (bukan per pengampu) agar bab semua guru tim tersusun bersama.
            .order_by("teaching_assignment__classroom_id", "teaching_assignment__subject_id", "order", "id")
        )

    def perform_create(self, serializer):
        # Bab baru ditaruh paling akhir (bab semua guru tim dihitung).
        assignment = serializer.validated_data["teaching_assignment"]
        last = team_chapters(assignment).aggregate(last=Max("order"))["last"] or 0
        serializer.save(order=last + 1)

    @action(detail=False, methods=["post"], permission_classes=[IsTeacher])
    def reorder(self, request):
        """{teaching_assignment, chapters: [id urut]} - atur urutan bab kelas-mapel tim guru."""
        serializer = ReorderChaptersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = team_assignment_or_404(request, serializer.validated_data["teaching_assignment"])
        ids = serializer.validated_data["chapters"]
        existing = set(team_chapters(assignment).values_list("id", flat=True))
        if set(ids) != existing or len(ids) != len(existing):
            raise ValidationError({"chapters": "Daftar bab tidak lengkap atau bukan dari kelas-mapel ini."})
        with transaction.atomic():
            for number, chapter_id in enumerate(ids, start=1):
                Chapter.objects.filter(pk=chapter_id).update(order=number)
        return Response({"detail": "Urutan bab disimpan."})
