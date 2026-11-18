import django_filters

from .models import TeachingAssignment


class TeamContentFilter(django_filters.FilterSet):
    """Penyaring konten kelas (materi, bab, tugas, asesmen).

    `?teaching_assignment=<id>` berarti konten kelas-mapel pengampu itu, siapa pun guru tim yang
    membuatnya (lihat TeachingAssignment.team). Hak akses tetap dibatasi get_queryset view.
    Subclass cukup menulis `class Meta: model = ...; fields = [...]`.
    """

    teaching_assignment = django_filters.NumberFilter(method="filter_class_subject")

    def filter_class_subject(self, queryset, name, value):
        assignment = TeachingAssignment.objects.filter(pk=value).first()
        if assignment is None:
            return queryset.none()
        return queryset.filter(teaching_assignment__in=assignment.team())
