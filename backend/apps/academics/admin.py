from django.contrib import admin

from .models import Classroom, Subject, TeachingAssignment


@admin.register(Classroom)
class ClassroomAdmin(admin.ModelAdmin):
    list_display = ["name", "grade", "major", "academic_year", "homeroom_teacher"]
    list_filter = ["academic_year", "grade", "major"]
    search_fields = ["name"]


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ["code", "name"]
    search_fields = ["code", "name"]


@admin.register(TeachingAssignment)
class TeachingAssignmentAdmin(admin.ModelAdmin):
    list_display = ["subject", "classroom", "teacher"]
    list_filter = ["classroom__academic_year", "subject"]
    search_fields = ["subject__name", "classroom__name", "teacher__full_name"]
    list_select_related = ["subject", "classroom", "teacher"]
