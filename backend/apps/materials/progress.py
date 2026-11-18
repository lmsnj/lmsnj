"""Capaian materi dan kunci urutan materi (dilihat dari sisi SATU siswa).

- Satu kelas-mapel = SATU jalur belajar, walaupun diampu beberapa guru (tim pengampu): materi semua guru
  tim digabung dalam satu urutan, sehingga progres siswa tidak ganda.
- Materi di satu kelas-mapel diurutkan: materi tanpa bab dulu, lalu per bab (`Chapter.order`), di dalamnya
  `order`. Materi ke-N terbuka setelah capaian SEMUA materi sebelumnya terpenuhi; materi pertama selalu
  terbuka. Hanya materi terbit yang dihitung.
- Bab: materi bab berikutnya baru terbuka setelah Post Test (terbit) bab sebelumnya tuntas; Post Test
  sendiri terkunci sampai semua materi babnya tercapai.
- Capaian satu materi terpenuhi jika semua syarat yang dipilih guru terpenuhi:
  dibuka siswa (selalu; jika ada konten tambahan, SEMUA kontennya), Latihan Pemahaman benar semua
  (jika ada), semua capaian dicentang (jika ada daftar capaian), tugas terkumpul / nilai
  minimal (jika ada syarat tugas), asesmen tuntas (jika ada syarat asesmen), cerita reflektif ditulis
  (jika diwajibkan), disahkan guru.
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

from .models import CodeAttempt, Material, MaterialProgress


def chain_blockers(steps):
    """Kunci berantai. steps = [(judul, selesai?, gerbang)] urut, gerbang = judul Post Test bab sebelumnya
    yang belum tuntas (None jika tidak ada). Mengembalikan penghalang tiap langkah: judul yang harus
    diselesaikan dulu, atau None jika terbuka."""
    result, blocker = [], None
    for title, done, gate in steps:
        blocker = blocker or gate
        result.append(blocker)
        if blocker is None and not done:
            blocker = title
    return result


def group_key(material):
    """Jalur belajar materi ini = kelas-mapelnya (bukan guru pengampunya)."""
    return material.teaching_assignment.class_subject


def sort_key(material):
    """Urutan belajar: materi tanpa bab dulu, lalu per bab, lalu urutan materi."""
    chapter = material.chapter
    return (
        *group_key(material),
        chapter is not None,
        chapter.order if chapter else 0,
        material.chapter_id or 0,
        material.order,
        material.created_at,
        material.id,
    )


def open_post_test(chapter):
    """Post Test bab yang dihitung (hanya yang terbit; draf tidak menahan siswa)."""
    test = chapter.post_test if chapter and chapter.post_test_id else None
    return test if test and test.is_published else None


def material_checks(material, progress, task_done, assessment_done, code_passed=frozenset()):
    """Daftar syarat satu materi: [{key, label, done}]. `code_passed` = id soal Praktik yang sudah lulus."""
    item_ids = [item.id for item in material.items.all()]
    opened = bool(progress and progress.opened_at)
    if item_ids:
        opened = opened and set(item_ids) <= set(progress.opened_items)
        label = f"Membuka {len(item_ids) + 1} konten materi"
    else:
        label = "Membuka materi"
    checks = [{"key": "opened", "label": label, "done": opened}]
    practice_count = len((material.practice_quiz or {}).get("content", []))
    if practice_count:
        checks.append(
            {
                "key": "practice",
                "label": f"Lulus Latihan Pemahaman ({practice_count} soal)",
                "done": bool(progress and progress.practice_passed_at),
            }
        )
    exercise_ids = [exercise.id for exercise in material.exercises.all()]
    if exercise_ids:
        checks.append(
            {
                "key": "coding",
                "label": f"Lulus Praktik ({len(exercise_ids)} soal)",
                "done": set(exercise_ids) <= set(code_passed),
            }
        )
    if material.objectives:
        checked = set(progress.checked_objectives) if progress else set()
        done = all(index in checked for index in range(len(material.objectives)))
        # Capaian berkuis dibuktikan lewat kuis, bukan sekadar dicentang.
        verb = "Menuntaskan" if material.objective_quizzes else "Mencentang"
        label = f"{verb} {len(material.objectives)} capaian"
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
    if material.require_reflection:
        checks.append(
            {
                "key": "reflection",
                "label": "Menulis cerita reflektif",
                "done": bool(progress and progress.reflection.strip()),
            }
        )
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
    teacher_approved, opened, opened_items, practice_passed, code_passed, checked_objectives, note, reflection, reflected_at, checks}}.
    """
    materials = sorted(materials, key=sort_key)
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
    code_passed = {}
    for exercise_id, student_id in CodeAttempt.objects.filter(
        exercise__material__in=materials, student_id__in=student_ids, passed_at__isnull=False
    ).values_list("exercise_id", "student_id"):
        code_passed.setdefault(student_id, set()).add(exercise_id)
    assessments = {m.required_assessment for m in materials if m.required_assessment_id}
    assessments |= {open_post_test(m.chapter) for m in materials if open_post_test(m.chapter)}
    assessments = list(assessments)
    statuses = _assessment_statuses(student_ids, assessments) if assessments else {}

    groups = {}
    for material in materials:
        groups.setdefault(group_key(material), []).append(material)

    table = {}
    for student_id in student_ids:
        for group in groups.values():
            rows = []
            for material in group:
                mine = progress.get((material.id, student_id))
                task_done = _task_done(material, submissions.get((material.required_task_id, student_id)))
                status = statuses.get((material.required_assessment_id, student_id))
                passed_codes = code_passed.get(student_id, set())
                checks = material_checks(material, mine, task_done, status in (PASSED, GRADED), passed_codes)
                unlocked = bool(mine and mine.unlocked)
                rows.append(
                    {
                        "unlocked": unlocked,
                        "teacher_approved": bool(mine and mine.teacher_approved),
                        "opened": bool(mine and mine.opened_at),
                        "opened_items": list(mine.opened_items) if mine else [],
                        "practice_passed": bool(mine and mine.practice_passed_at),
                        "code_passed": sorted(e.id for e in material.exercises.all() if e.id in passed_codes),
                        "checked_objectives": list(mine.checked_objectives) if mine else [],
                        "note": mine.note if mine else "",
                        "reflection": mine.reflection if mine else "",
                        "reflected_at": mine.reflected_at if mine else None,
                        "checks": checks,
                        "completed": unlocked or all(check["done"] for check in checks),
                    }
                )
            steps, previous = [], None
            for material, row in zip(group, rows):
                gate = None
                if previous is not None and material.chapter_id != previous.id:
                    test = open_post_test(previous)
                    if test and statuses.get((test.id, student_id)) not in (PASSED, GRADED):
                        gate = test.title
                steps.append((material.title, row["completed"], gate))
                previous = material.chapter
            blockers = chain_blockers(steps)
            for number, (material, row, blocker) in enumerate(zip(group, rows, blockers), start=1):
                # Materi yang dibuka guru tidak pernah terkunci.
                locked = blocker is not None and not row["unlocked"]
                row.update(order_number=number, locked=locked, locked_by=blocker if locked else None)
                table[(material.id, student_id)] = row
    return table


def published_materials(teaching_assignment_ids):
    return list(
        Material.objects.filter(teaching_assignment_id__in=teaching_assignment_ids, is_published=True)
        .select_related("teaching_assignment", "required_task", "required_assessment", "chapter__post_test")
        .prefetch_related("items", "exercises")
        .order_by("order", "created_at", "id")
    )


def student_progress(student, teaching_assignment_ids):
    """{material_id: progres} untuk semua materi terbit di kelas-mapel tersebut."""
    materials = published_materials(teaching_assignment_ids)
    table = progress_table(materials, [student.id])
    return {material.id: table[(material.id, student.id)] for material in materials}


def content_locks(student, teaching_assignment_ids):
    """Tugas/asesmen yang terkunci karena materinya terkunci: {"tasks": {id: judul penyebab},
    "assessments": {id: judul penyebab}}. Konten yang disyaratkan beberapa materi terbuka jika SALAH SATU
    materinya terbuka. Post Test bab terkunci sampai semua materi babnya tercapai."""
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
    for material in sorted(materials, key=sort_key):
        test_id = material.chapter.post_test_id if material.chapter_id else None
        # Asesmen yang sekaligus syarat materi bab itu tidak dikunci lagi (agar tidak saling menunggu).
        if test_id and test_id != material.required_assessment_id:
            if not progress[(material.id, student.id)]["completed"]:
                locks["assessments"].setdefault(test_id, material.title)
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


def ensure_material_unlocked(request, material):
    """Siswa hanya boleh membuka isi materi (dan konten tambahannya) yang tidak terkunci."""
    if request.user.role != Role.STUDENT:
        return
    row = progress_for_request(request).get(material.id)
    if row and row["locked"]:
        raise PermissionDenied(f"Materi ini masih terkunci. Selesaikan dulu “{row['locked_by']}”.")


def check_done(request, material, key):
    """Apakah syarat `key` materi ini sudah terpenuhi bagi siswa yang login (True jika syarat tidak ada)."""
    row = progress_for_request(request).get(material.id)
    check = next((c for c in (row or {}).get("checks", []) if c["key"] == key), None)
    return check is None or check["done"]


def ensure_content_unlocked(request, kind, content_id):
    """Tolak siswa yang membuka tugas/asesmen syarat sebuah materi yang masih terkunci.
    kind = "tasks" atau "assessments"."""
    if request.user.role != Role.STUDENT:
        return
    title = locks_for_request(request)[kind].get(content_id)
    if title:
        raise PermissionDenied(f"Masih terkunci. Selesaikan dulu “{title}”.")


def chapter_progress(request, chapter, materials):
    """Progres satu bab bagi siswa yang login. `materials` = materi terbit bab itu (urut).
    {locked, locked_by, completed_materials, total_materials, post_test_status, post_test_locked_by,
    completed}."""
    rows = progress_for_request(request)
    mine = [rows[m.id] for m in materials if m.id in rows]
    done = sum(1 for row in mine if row["completed"])
    test = open_post_test(chapter)
    status = None
    if test:
        status = _assessment_statuses([request.user.id], [test])[(test.id, request.user.id)]
    first = mine[0] if mine else None
    return {
        "locked": bool(first and first["locked"]),
        "locked_by": first["locked_by"] if first else None,
        "completed_materials": done,
        "total_materials": len(mine),
        "post_test_status": status,
        "post_test_locked_by": locks_for_request(request)["assessments"].get(test.id) if test else None,
        "completed": done == len(mine) and (test is None or status in (PASSED, GRADED)),
    }


def locked_by_material(request, kind, content_id):
    """Judul materi terkunci yang menahan tugas/asesmen ini (khusus siswa), atau None."""
    if request is None or getattr(request.user, "role", None) != Role.STUDENT:
        return None
    return locks_for_request(request)[kind].get(content_id)
