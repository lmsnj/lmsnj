from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import TeachingAssignment
from apps.academics.selectors import classrooms_for, teaching_assignments_for
from apps.accounts.models import Role
from apps.accounts.permissions import IsAdminOrTeacher, IsStudent
from apps.schedule.models import TeachingSession
from apps.schools.context import active_school

from . import services
from .models import Attendance
from .serializers import SessionAttendanceSerializer, SummaryQuerySerializer


class SessionAttendanceView(APIView):
    """GET: siswa kelas + status presensi pertemuan ini. PUT {records}: simpan presensi.

    Yang bisa membuka: guru pengampu kelas-mapel itu dan admin (lihat teaching_assignments_for).
    """

    permission_classes = [IsAdminOrTeacher]

    def get_session(self, request, session_id):
        assignments = teaching_assignments_for(request.user, active_school(request))
        return get_object_or_404(
            TeachingSession.objects.select_related(
                "teaching_assignment__classroom", "teaching_assignment__subject"
            ).filter(teaching_assignment__in=assignments),
            pk=session_id,
        )

    def respond(self, session):
        recorded = {a.student_id: a for a in session.attendances.all()}
        students = session.teaching_assignment.classroom.students.filter(is_active=True).order_by("full_name")
        return Response(
            {
                "session": session.id,
                "title": session.title,
                "starts_at": session.starts_at,
                "classroom_name": session.teaching_assignment.classroom.name,
                "subject_name": session.teaching_assignment.subject.name,
                "recorded": bool(recorded),
                "students": [
                    {
                        "student": s.id,
                        "student_name": s.full_name,
                        "nis": s.nis,
                        "status": recorded[s.id].status if s.id in recorded else None,
                        "note": recorded[s.id].note if s.id in recorded else "",
                    }
                    for s in students
                ],
            }
        )

    def get(self, request, session_id):
        return self.respond(self.get_session(request, session_id))

    def put(self, request, session_id):
        session = self.get_session(request, session_id)
        serializer = SessionAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.save_session_attendance(session, serializer.validated_data["records"], request.user)
        return self.respond(session)


class AttendanceSummaryView(APIView):
    """Rekap presensi per siswa.
    ?classroom=<id>: semua mapel di kelas itu (admin & wali kelas).
    ?teaching_assignment=<id>: satu kelas-mapel (admin, guru pengampu, wali kelasnya).
    Opsional ?date_from=&date_to= (YYYY-MM-DD)."""

    permission_classes = [IsAdminOrTeacher]

    def get(self, request):
        query = SummaryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        params = query.validated_data
        user, school = request.user, active_school(request)

        if params.get("classroom"):
            classroom = get_object_or_404(classrooms_for(user, school), pk=params["classroom"])
            if user.role == Role.TEACHER and classroom.homeroom_teacher_id != user.id:
                raise PermissionDenied("Rekap semua mapel hanya untuk wali kelas dan admin.")
            records = Attendance.objects.filter(session__teaching_assignment__classroom=classroom)
            title = classroom.name
        else:
            assignments = TeachingAssignment.objects.filter(classroom__school=school)
            if user.role == Role.TEACHER:
                # Guru pengampu kelas-mapel itu, atau wali kelas dari kelasnya.
                assignments = assignments.filter(Q(teacher=user) | Q(classroom__homeroom_teacher=user))
            assignment = get_object_or_404(
                assignments.select_related("classroom", "subject"), pk=params["teaching_assignment"]
            )
            classroom = assignment.classroom
            records = Attendance.objects.filter(session__teaching_assignment=assignment)
            title = f"{assignment.subject.name} · {classroom.name}"

        records = services.in_period(records, params.get("date_from"), params.get("date_to"))
        students = classroom.students.filter(is_active=True).order_by("full_name")
        meetings = records.values("session").distinct().count()
        return Response({"title": title, "meetings": meetings, "rows": services.summarize(students, records)})


class MyAttendanceView(APIView):
    """Rekap presensi siswa yang login: keseluruhan dan per mapel."""

    permission_classes = [IsStudent]

    def get(self, request):
        records = Attendance.objects.filter(student=request.user).select_related(
            "session__teaching_assignment__subject"
        )
        per_subject = {}
        for record in records:
            subject = record.session.teaching_assignment.subject.name
            per_subject.setdefault(subject, services.empty_counts())[record.status] += 1
        overall = services.empty_counts()
        for counts in per_subject.values():
            for status, value in counts.items():
                overall[status] += value
        return Response(
            {
                "overall": {**overall, "rate": services.rate(overall)},
                "subjects": [
                    {"subject_name": name, **counts, "rate": services.rate(counts)}
                    for name, counts in sorted(per_subject.items())
                ],
            }
        )
