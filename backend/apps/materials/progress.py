"""Capaian materi dan kunci urutan materi (dilihat dari sisi SATU siswa).

- Materi di satu kelas-mapel diurutkan (`order`). Materi ke-N terbuka setelah capaian SEMUA materi
  sebelumnya terpenuhi; materi pertama selalu terbuka. Hanya materi terbit yang dihitung.
- Capaian satu materi terpenuhi jika semua syarat yang dipilih guru terpenuhi:
  dibuka siswa (selalu), semua capaian dicentang (jika ada daftar capaian), tugas terkumpul / nilai
  minimal (jika ada syarat tugas), asesmen tuntas (jika ada syarat asesmen), disahkan guru.
- Guru bisa menandai materi tercapai untuk siswa tertentu (`MaterialProgress.unlocked`).
- Tugas/asesmen yang menjadi syarat sebuah materi ikut terkunci selama materi itu terkunci.
"""

from rest_framework.exceptions import PermissionDenied

from apps.academics.selectors import teaching_assignments_for
from apps.accounts.models import Role
from apps.assessments.models import Attempt
from apps.assessments.results import GRADED, PASSED, final_result, max_score_of
from apps.schools.context import active_school
from apps.tasks.models import Submission

from .models import Material, MaterialProgress


def chain_locks(completed):
    """[selesai?] per materi (urut) -> [terkunci?]: terkunci jika ada materi sebelumnya yang belum selesai."""
    locks, blocked = [], False
    for done in completed:
        locks.append(blocked)
        blocked = blocked or not done
    return locks


def material_checks(material, progress, task_done, assessment_done):
    """Daftar syarat satu materi: [{key, label, done}]."""
    checks = [{"key": "opened", "label": "Membuka materi", "done": bool(progress and progress.opened_at)}]
    if material.objectives:
        checked = set(progress.checked_objectives) if progress else set()
        done = all(index in checked for index in range(len(material.objectives)))
        label = f"Mencentang {len(material.objectives)} capaian"
        checks.append({"key": "objectives", "label": label, "done": done})
    if material.required_task_id:
        title = material.required_task.title
        label = (
            f"Nilai tugas “{title}” minimal {material.min_task_score}"
            if material.min_task_score is not None
            else f"Mengumpulkan tugas “{title}”"
        )
        checks.append({"key": "task", "label": label, "done": task_done})
    if material.required_assessment_id:
        label = f"Tuntas asesmen “{material.required_assessment.title}”"
        checks.append({"key": "assessment", "label": label, "done": assessment_done})
    if material.require_teacher_approval:
        checks.append(
            {
                "key": "approval",
                "label": "Disahkan guru",
                "done": bool(progress and progress.teacher_approved),
            }
        )
    return checks


def _task_done(material, submission):
    if submission is None:
        return False
    if material.min_task_score is None:
        return True
    if submission.score is None:
        return False
    return float(submission.score) / submission.task.max_score * 100 >= material.min_task_score


def _assessment_statuses(student_ids, assessments):
    """{(assessment_id, student_id): status hasil akhir} untuk asesmen syarat."""
    statuses = {}
    attempts = {}
    for attempt in Attempt.objects.filter(assessment__in=assessments, student_id__in=student_ids):
        attempts.setdefault((attempt.assessment_id, attempt.student_id), []).append(attempt)
    for assessment in assessments:
        max_score = max_score_of(assessment)
        for student_id in student_ids:
            mine = attempts.get((assessment.id, student_id), [])
            statuses[(assessment.id, student_id)] = final_result(assessment, mine, max_score)["status"]
    return statuses


def progress_table(materials, student_ids):
    """Progres banyak siswa untuk materi-materi (boleh beberapa kelas-mapel).

    Mengembalikan {(material_id, student_id): {order_number, locked, locked_by, completed, unlocked,
    teacher_approved, opened, checked_objectives, note, checks}}."""
    materials = sorted(materials, key=lambda m: (m.teaching_assignment_id, m.order, m.created_at, m.id))
    progress = {
        (p.material_id, p.student_id): p
        for p in MaterialProgress.objects.filter(material__in=materials, student_id__in=student_ids)
    }
    task_ids = {m.required_task_id for m in materials if m.required_task_id}
    submissions = {
        (s.task_id, s.student_id): s
        for s in Submission.objects.filter(task_id__in=task_ids, student_id__in=student_ids).select_related(
            "task"
        )
    }
    assessments = list({m.required_assessment for m in materials if m.required_assessment_id})
    statuses = _assessment_statuses(student_ids, assessments) if assessments else {}

    groups = {}
    for material in materials:
        groups.setdefault(material.teaching_assignment_id, []).append(material)

    table = {}
    for student_id in student_ids:
        for group in groups.values():
            rows = []
            for material in group:
                mine = progress.get((material.id, student_id))
                task_done = _task_done(material, submissions.get((material.required_task_id, student_id)))
                status = statuses.get((material.required_assessment_id, student_id))
                checks = material_checks(material, mine, task_done, status in (PASSED, GRADED))
                unlocked = bool(mine and mine.unlocked)
                rows.append(
                    {
                        "unlocked": unlocked,
                        "teacher_approved": bool(mine and mine.teacher_approved),
                        "opened": bool(mine and mine.opened_at),
                        "checked_objectives": list(mine.checked_objectives) if mine else [],
                        "note": mine.note if mine else "",
                        "checks": checks,
                        "completed": unlocked or all(check["done"] for check in checks),
                    }
                )
            locks = chain_locks([row["completed"] for row in rows])
            for number, (material, row, locked) in enumerate(zip(group, rows, locks), start=1):
                # Materi yang dibuka guru tidak pernah terkunci.
                locked = locked and not row["unlocked"]
                row.update(
                    order_number=number,
                    locked=locked,
                    locked_by=None if not locked else _first_blocker(group, rows, material),
                )
                table[(material.id, student_id)] = row
    return table


def _first_blocker(group, rows, material):
    """Judul materi sebelumnya yang belum tercapai (penyebab materi ini terkunci)."""
    for other, row in zip(group, rows):
        if other.id == material.id:
            return None
        if not row["completed"]:
            return other.title
    return None


def published_materials(teaching_assignment_ids):
    return list(
        Material.objects.filter(teaching_assignment_id__in=teaching_assignment_ids, is_published=True)
        .select_related("required_task", "required_assessment")
        .order_by("order", "created_at", "id")
    )


def student_progress(student, teaching_assignment_ids):
    """{material_id: progres} untuk semua materi terbit di kelas-mapel tersebut."""
    materials = published_materials(teaching_assignment_ids)
    table = progress_table(materials, [student.id])
    return {material.id: table[(material.id, student.id)] for material in materials}


def content_locks(student, teaching_assignment_ids):
    """Tugas/asesmen yang terkunci karena materinya terkunci: {"tasks": {id: judul materi penyebab},
    "assessments": {id: judul materi}}. Konten yang disyaratkan beberapa materi terbuka jika SALAH SATU
    materinya terbuka."""
    materials = published_materials(teaching_assignment_ids)
    progress = progress_table(materials, [student.id])
    locks = {"tasks": {}, "assessments": {}}
    opened = {"tasks": set(), "assessments": set()}
    for material in materials:
        row = progress[(material.id, student.id)]
        for kind, content_id in (
            ("tasks", material.required_task_id),
            ("assessments", material.required_assessment_id),
        ):
            if not content_id:
                continue
            if row["locked"]:
                # Yang disebut = materi yang harus diselesaikan dulu (penyebab terkunci).
                locks[kind].setdefault(content_id, row["locked_by"])
            else:
                opened[kind].add(content_id)
    for kind in locks:
        for content_id in opened[kind]:
            locks[kind].pop(content_id, None)
    return locks


def locks_for_request(request):
    """content_locks siswa yang login untuk semua kelas-mapelnya (dihitung sekali per request)."""
    if not hasattr(request, "_content_locks"):
        ids = list(
            teaching_assignments_for(request.user, active_school(request)).values_list("id", flat=True)
        )
        request._content_locks = content_locks(request.user, ids)
    return request._content_locks


def progress_for_request(request):
    """student_progress siswa yang login untuk semua kelas-mapelnya (dihitung sekali per request)."""
    if not hasattr(request, "_material_progress"):
        ids = list(
            teaching_assignments_for(request.user, active_school(request)).values_list("id", flat=True)
        )
        request._material_progress = student_progress(request.user, ids)
    return request._material_progress


def ensure_content_unlocked(request, kind, content_id):
    """Tolak siswa yang membuka tugas/asesmen syarat sebuah materi yang masih terkunci.
    kind = "tasks" atau "assessments"."""
    if request.user.role != Role.STUDENT:
        return
    title = locks_for_request(request)[kind].get(content_id)
    if title:
        raise PermissionDenied(f"Masih terkunci. Selesaikan capaian materi \u201c{title}\u201d dulu.")


def locked_by_material(request, kind, content_id):
    """Judul materi terkunci yang menahan tugas/asesmen ini (khusus siswa), atau None."""
    if request is None or getattr(request.user, "role", None) != Role.STUDENT:
        return None
    return locks_for_request(request)[kind].get(content_id)
