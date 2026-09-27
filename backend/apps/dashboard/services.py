"""Ringkasan dashboard untuk tiap peran.

Semua data diambil lewat selector modul lain (classrooms_for, tasks_for, dst.) agar aturan
akses tetap di satu tempat. App ini tidak punya model sendiri.
"""

from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.academics.selectors import teaching_assignments_for
from apps.accounts.models import Role, User
from apps.materials.models import Material
from apps.materials.selectors import materials_for
from apps.tasks.models import Submission, Task
from apps.tasks.selectors import tasks_for

LIST_LIMIT = 8
UPCOMING_DAYS = 7


def _task_item(task):
    return {
        "id": task.id,
        "title": task.title,
        "subject_name": task.teaching_assignment.subject.name,
        "classroom_name": task.teaching_assignment.classroom.name,
        "teaching_assignment": task.teaching_assignment_id,
        "due_at": task.due_at,
        "is_past_due": task.is_past_due,
        "is_published": task.is_published,
    }


def _material_item(material):
    return {
        "id": material.id,
        "title": material.title,
        "material_type": material.material_type,
        "subject_name": material.teaching_assignment.subject.name,
        "classroom_name": material.teaching_assignment.classroom.name,
        "teaching_assignment": material.teaching_assignment_id,
        "created_at": material.created_at,
        "is_published": material.is_published,
    }


def _average_percentage(graded_submissions):
    """Rata-rata skala 100 dari pengumpulan yang sudah dinilai (sama dengan rekap nilai)."""
    values = [float(s.score) / s.task.max_score * 100 for s in graded_submissions]
    return round(sum(values) / len(values), 2) if values else None


def current_academic_year():
    return Classroom.objects.order_by("-academic_year").values_list("academic_year", flat=True).first()


def admin_dashboard(user):
    year = current_academic_year()
    active = User.objects.filter(is_active=True)
    role_counts = active.aggregate(
        students=Count("id", filter=Q(role=Role.STUDENT)),
        teachers=Count("id", filter=Q(role=Role.TEACHER)),
        admins=Count("id", filter=Q(role=Role.ADMIN)),
    )
    classrooms = Classroom.objects.filter(academic_year=year)
    assignments = TeachingAssignment.objects.filter(classroom__academic_year=year)

    recent_materials = Material.objects.select_related(
        "teaching_assignment__subject", "teaching_assignment__classroom", "created_by"
    ).order_by("-created_at")[:5]
    recent_tasks = Task.objects.select_related(
        "teaching_assignment__subject", "teaching_assignment__classroom", "created_by"
    ).order_by("-created_at")[:5]
    activity = [
        {
            "type": "material",
            "created_by": m.created_by.full_name if m.created_by else None,
            **_material_item(m),
        }
        for m in recent_materials
    ] + [
        {
            "type": "task",
            "created_by": t.created_by.full_name if t.created_by else None,
            "created_at": t.created_at,
            **_task_item(t),
        }
        for t in recent_tasks
    ]
    activity.sort(key=lambda item: item["created_at"], reverse=True)

    return {
        "role": Role.ADMIN,
        "academic_year": year,
        "stats": {
            **role_counts,
            "classrooms": classrooms.count(),
            "subjects": Subject.objects.count(),
            "teaching_assignments": assignments.count(),
            "materials": Material.objects.count(),
            "tasks": Task.objects.count(),
            "submissions_this_week": Submission.objects.filter(
                submitted_at__gte=timezone.now() - timedelta(days=7)
            ).count(),
        },
        # Hal yang perlu ditindaklanjuti admin.
        "attention": {
            "students_without_classroom": active.filter(role=Role.STUDENT, classroom__isnull=True).count(),
            "teachers_without_assignment": active.filter(role=Role.TEACHER)
            .exclude(id__in=assignments.values("teacher"))
            .count(),
            "classrooms_without_homeroom": classrooms.filter(homeroom_teacher__isnull=True).count(),
            "classrooms_without_students": classrooms.filter(students__isnull=True).count(),
        },
        "recent_activity": activity[:LIST_LIMIT],
    }


def teacher_dashboard(user):
    now = timezone.now()
    assignments = (
        teaching_assignments_for(user)
        .select_related("subject", "classroom")
        .annotate(student_count=Count("classroom__students", distinct=True))
        .order_by("classroom__name", "subject__name")
    )
    to_grade = (
        Submission.objects.filter(task__teaching_assignment__teacher=user, score__isnull=True).select_related(
            "student", "task__teaching_assignment__subject", "task__teaching_assignment__classroom"
        )
        # Yang paling lama menunggu dinilai tampil paling atas.
        .order_by("submitted_at")
    )
    upcoming = (
        tasks_for(user)
        .filter(is_published=True, due_at__gte=now, due_at__lte=now + timedelta(days=UPCOMING_DAYS))
        .select_related("teaching_assignment__subject", "teaching_assignment__classroom")
        .annotate(
            submission_count=Count("submissions", distinct=True),
            student_count=Count("teaching_assignment__classroom__students", distinct=True),
        )
        .order_by("due_at")
    )
    my_tasks = tasks_for(user)

    return {
        "role": Role.TEACHER,
        "stats": {
            "teaching_assignments": assignments.count(),
            "students": User.objects.filter(classroom__teaching_assignments__teacher=user).distinct().count(),
            "active_tasks": my_tasks.filter(is_published=True, due_at__gte=now).count(),
            "to_grade": to_grade.count(),
            "drafts": my_tasks.filter(is_published=False).count()
            + materials_for(user).filter(is_published=False).count(),
        },
        "homeroom_classes": list(
            Classroom.objects.filter(homeroom_teacher=user)
            .order_by("-academic_year", "name")
            .values_list("name", flat=True)
        ),
        "teaching_assignments": [
            {
                "id": a.id,
                "subject_name": a.subject.name,
                "classroom_name": a.classroom.name,
                "student_count": a.student_count,
            }
            for a in assignments
        ],
        "to_grade": [
            {
                "submission_id": s.id,
                "task_id": s.task_id,
                "task_title": s.task.title,
                "student_name": s.student.full_name,
                "classroom_name": s.task.teaching_assignment.classroom.name,
                "subject_name": s.task.teaching_assignment.subject.name,
                "submitted_at": s.submitted_at,
                "is_late": s.is_late,
            }
            for s in to_grade[:LIST_LIMIT]
        ],
        "upcoming_tasks": [
            {**_task_item(t), "submission_count": t.submission_count, "student_count": t.student_count}
            for t in upcoming[:LIST_LIMIT]
        ],
    }


def student_dashboard(user):
    now = timezone.now()
    tasks = tasks_for(user).select_related("teaching_assignment__subject", "teaching_assignment__classroom")
    submissions = Submission.objects.filter(student=user).select_related("task__teaching_assignment__subject")
    submitted_task_ids = submissions.values_list("task_id", flat=True)
    # Belum dikumpulkan dan masih bisa dikumpulkan (belum lewat tenggat, atau terlambat diizinkan).
    pending = (
        tasks.exclude(id__in=submitted_task_ids)
        .filter(Q(due_at__gte=now) | Q(allow_late=True))
        .order_by("due_at")
    )
    graded = list(submissions.filter(score__isnull=False).order_by("-graded_at"))
    recent_materials = (
        materials_for(user)
        .select_related("teaching_assignment__subject", "teaching_assignment__classroom")
        .order_by("-created_at")[:5]
    )

    return {
        "role": Role.STUDENT,
        "classroom_name": user.classroom.name if user.classroom else None,
        "stats": {
            "pending": pending.count(),
            "overdue": pending.filter(due_at__lt=now).count(),
            "submitted": submissions.count(),
            "graded": len(graded),
            "average": _average_percentage(graded),
        },
        "pending_tasks": [_task_item(t) for t in pending[:LIST_LIMIT]],
        "recent_grades": [
            {
                "task_id": s.task_id,
                "task_title": s.task.title,
                "subject_name": s.task.teaching_assignment.subject.name,
                "score": float(s.score),
                "max_score": s.task.max_score,
                "has_feedback": bool(s.feedback),
                "graded_at": s.graded_at,
            }
            for s in graded[:5]
        ],
        "recent_materials": [_material_item(m) for m in recent_materials],
    }


DASHBOARDS = {
    Role.ADMIN: admin_dashboard,
    Role.TEACHER: teacher_dashboard,
    Role.STUDENT: student_dashboard,
}
