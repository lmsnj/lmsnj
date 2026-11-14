import copy

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User
from apps.common.testing import default_school
from apps.schools.models import Level, School

from .models import Day, SlotKind, TimeSlot, Timetable, TimetableEntry
from .services import find_conflicts
from .timetable_import import TimetableImportError, class_key, import_timetable, name_key

YEAR = "2026/2027"


def lesson(day, period, start, classroom, subject, teacher):
    return {"hari": day, "jam_ke": period, "mulai": start, "selesai": "09:00", "kelas": classroom,
            "kode_mapel": subject, "kode_guru": teacher}  # fmt: skip


def sample_data():
    """Jadwal kecil: 3 kelas, 3 guru; Bahasa Inggris (G) diajar gabungan di dua kelas putri."""
    return {
        "meta": {"tahun_pelajaran": YEAR, "semester": "Ganjil (pasca FA)", "kode_jadwal": "UJI-01",
                 "berlaku_sejak": "2026-10-10"},  # fmt: skip
        "kelas": [
            {"nama": "X-RPL", "tingkat": "X"},
            {"nama": "X-TKJ 2", "tingkat": "X"},
            {"nama": "X-DPB", "tingkat": "X"},
        ],
        "guru": [
            {"kode": "A0001", "nama": "Ahmad Fulan, S.Kom."},
            {"kode": "A0002", "nama": "Siti Fulanah, S.Pd."},
            {"kode": "A0003", "nama": "Budi Tanpa Jam, M.Pd."},
        ],
        "mapel": [
            {"kode": "DDP", "nama": "Dasar Dasar PPLG"},
            {"kode": "G", "nama": "Bahasa Inggris"},
            {"kode": "ZZZ", "nama": "Mapel Tidak Dipakai"},
        ],
        "slot_waktu": [
            {"hari": "Sabtu", "jam_ke": "0", "mulai": "07:30", "selesai": "08:00", "jenis": "NON_KBM",
             "kegiatan": "PEMBIASAAN KARAKTER BAIK"},
            {"hari": "Sabtu", "jam_ke": "1", "mulai": "08:00", "selesai": "08:35", "jenis": "KBM", "kegiatan": None},
            {"hari": "Sabtu", "jam_ke": "-", "mulai": "10:20", "selesai": "10:50", "jenis": "NON_KBM",
             "kegiatan": "ISTIRAHAT"},
            {"hari": "Ahad", "jam_ke": "1", "mulai": "08:00", "selesai": "08:35", "jenis": "KBM", "kegiatan": None},
            {"hari": "Ahad", "jam_ke": "2", "mulai": "08:35", "selesai": "09:10", "jenis": "NON_KBM",
             "kegiatan": "KBM DINIYAH"},
            {"hari": "Ahad", "jam_ke": "-", "mulai": "12:00", "selesai": "12:35", "jenis": "NON_KBM",
             "kegiatan": "SHOLAT DHUHUR BERJAMA'AH"},
        ],  # fmt: skip
        "jadwal": [
            lesson("Sabtu", 1, "08:00", "X-RPL", "DDP", "A0001"),
            lesson("Sabtu", 1, "08:00", "X-TKJ 2", "G", "A0002"),
            lesson("Sabtu", 1, "08:00", "X-DPB", "G", "A0002"),
            lesson("Ahad", 1, "08:00", "X-RPL", "G", "A0002"),
        ],
        "distribusi_jp": [
            {
                "kode_guru": "A0001",
                "kode_mapel": "DDP",
                "mapel": "Dasar Dasar PPLG",
                "kelas": "X-RPL",
                "jp": 12,
            },
            {
                "kode_guru": "A0001",
                "kode_mapel": "PKL",
                "mapel": "Praktik Kerja Lapangan",
                "kelas": "X-DPB",
                "jp": 4,
            },
        ],
    }


def make_user(username, role, school=None, **extra):
    # Password tidak di-hash agar test cepat; login diganti force_authenticate.
    extra.setdefault("full_name", username.title())
    user = User.objects.create(username=username, role=role, **extra)
    user.schools.add(school or default_school())
    return user


def run_import(data, school=None, **options):
    """Impor ke sekolah bawaan test (SMKS) kecuali disebut lain."""
    return import_timetable(data, school=school or default_school(), **options)


class TimetableImportTests(TestCase):
    def test_import_creates_everything(self):
        report = run_import(sample_data())

        self.assertEqual(set(Subject.objects.values_list("code", flat=True)), {"DDP", "G", "PKL"})
        self.assertEqual(Classroom.objects.filter(academic_year=YEAR).count(), 3)
        self.assertEqual(Classroom.objects.get(name="X-TKJ 2").major, "TKJ")
        # Guru tanpa jam mengajar tidak dibuatkan akun.
        self.assertEqual(set(User.objects.values_list("teacher_code", flat=True)), {"A0001", "A0002"})
        teacher = User.objects.get(teacher_code="A0001")
        self.assertEqual((teacher.username, teacher.role), ("a0001", Role.TEACHER))
        self.assertTrue(teacher.check_password(report["teachers"]["created"][0]["password"]))
        self.assertEqual(TeachingAssignment.objects.count(), 5)
        self.assertEqual(TeachingAssignment.objects.get(subject__code="DDP").weekly_hours, 12)
        self.assertIsNone(
            TeachingAssignment.objects.get(subject__code="G", classroom__name="X-DPB").weekly_hours
        )

        timetable = Timetable.objects.get(code="UJI-01")
        self.assertTrue(timetable.is_active)
        self.assertEqual(timetable.slots.count(), 6)
        self.assertEqual(TimetableEntry.objects.count(), 4)
        activity = timetable.slots.get(day=Day.SATURDAY, period=0)
        self.assertEqual((activity.kind, activity.label), (SlotKind.ACTIVITY, "Pembiasaan Karakter Baik"))
        self.assertIsNone(timetable.slots.get(label="Istirahat").period)
        labels = set(timetable.slots.filter(day=Day.SUNDAY).values_list("label", flat=True))
        self.assertEqual(labels, {"", "KBM Diniyah", "Sholat Dhuhur Berjama'ah"})

    def test_import_twice_does_not_duplicate(self):
        run_import(sample_data())
        report = run_import(sample_data())

        self.assertEqual(report["teachers"]["created"], [])
        self.assertEqual(report["assignments"], {"created": 0, "existing": 5, "hours_set": 0})
        self.assertEqual(
            (User.objects.count(), Classroom.objects.count(), Subject.objects.count()), (2, 3, 3)
        )
        self.assertEqual(
            (Timetable.objects.count(), TimeSlot.objects.count(), TimetableEntry.objects.count()), (1, 6, 4)
        )

    def test_dry_run_saves_nothing(self):
        default_school()  # sekolah dibuat di luar impor; yang diuji: data impor tidak tersimpan
        report = run_import(sample_data(), dry_run=True)

        self.assertEqual(len(report["teachers"]["created"]), 2)
        self.assertEqual(report["timetable"]["entries"], 4)
        for model in (User, Classroom, Subject, TeachingAssignment, Timetable):
            self.assertFalse(model.objects.exists())

    def test_matches_existing_data_instead_of_duplicating(self):
        school = default_school()
        classroom = Classroom.objects.create(
            school=school, name="X RPL 1", grade="X", major="RPL", academic_year=YEAR
        )
        subject = Subject.objects.create(school=school, code="DDP", name="Dasar-Dasar PPLG")
        teacher = make_user("pak.ahmad", Role.TEACHER, full_name="AHMAD FULAN S.Kom")

        report = run_import(sample_data())

        teacher.refresh_from_db()
        subject.refresh_from_db()
        self.assertEqual(teacher.teacher_code, "A0001")
        self.assertEqual(subject.name, "Dasar-Dasar PPLG")  # nama mapel yang sudah ada tidak ditimpa
        self.assertEqual(report["classrooms"]["matched"], ["X-RPL -> X RPL 1"])
        self.assertEqual(Classroom.objects.count(), 3)
        self.assertEqual(User.objects.filter(role=Role.TEACHER).count(), 2)
        self.assertTrue(
            TeachingAssignment.objects.filter(teacher=teacher, subject=subject, classroom=classroom).exists()
        )

    def test_same_code_different_subject_stops_import(self):
        # Kode G sudah dipakai mapel lain di sekolah ini: jangan salah tempel jam Bahasa Inggris.
        Subject.objects.create(school=default_school(), code="G", name="Matrikulasi Informatika")
        with self.assertRaises(TimetableImportError) as caught:
            run_import(sample_data())
        self.assertIn(
            "kode G di sekolah ini sudah dipakai 'Matrikulasi Informatika'", caught.exception.messages[0]
        )
        self.assertFalse(Timetable.objects.exists())

    def test_same_name_other_code_is_reused_not_duplicated(self):
        english = Subject.objects.create(school=default_school(), code="J", name="Bahasa  Inggris.")
        report = run_import(sample_data())
        self.assertEqual(report["subjects"]["matched"], ["G - Bahasa Inggris -> J (nama sama)"])
        self.assertFalse(Subject.objects.filter(code="G").exists())
        self.assertEqual(TeachingAssignment.objects.filter(subject=english).count(), 3)

    def test_ambiguous_subject_name_stops_import(self):
        school = default_school()
        Subject.objects.create(school=school, code="BINGG", name="Bahasa Inggris")
        Subject.objects.create(school=school, code="J", name="Bahasa Inggris")
        with self.assertRaises(TimetableImportError) as caught:
            run_import(sample_data())
        self.assertIn("ada 2 mapel bernama sama (BINGG, J)", caught.exception.messages[0])

    def test_ambiguous_teacher_name_stops_import(self):
        make_user("ahmad1", Role.TEACHER, full_name="Ahmad Fulan")
        make_user("ahmad2", Role.TEACHER, full_name="Ahmad Fulan, S.Kom.")

        with self.assertRaises(TimetableImportError) as caught:
            run_import(sample_data())

        self.assertIn("ahmad1, ahmad2", caught.exception.messages[0])
        self.assertFalse(Timetable.objects.exists())
        self.assertFalse(Subject.objects.exists())

    def test_all_teachers_option(self):
        run_import(sample_data(), all_teachers=True)
        self.assertTrue(User.objects.filter(teacher_code="A0003").exists())

    def test_new_version_replaces_active_timetable(self):
        run_import(sample_data())
        data = sample_data()
        data["meta"]["kode_jadwal"] = "UJI-02"
        run_import(data)

        self.assertEqual(
            list(Timetable.objects.filter(is_active=True).values_list("code", flat=True)), ["UJI-02"]
        )
        # Versi lama tetap tersimpan sebagai riwayat.
        self.assertEqual(Timetable.objects.get(code="UJI-01").slots.count(), 6)

    def test_conflicts_are_rejected(self):
        data = sample_data()
        data["jadwal"].append(lesson("Sabtu", 1, "08:00", "X-RPL", "G", "A0002"))  # kelas dobel
        data["jadwal"].append(lesson("Ahad", 1, "08:00", "X-DPB", "DDP", "A0002"))  # guru di dua mapel
        with self.assertRaises(TimetableImportError) as caught:
            run_import(data)
        text = " ".join(caught.exception.messages)
        self.assertIn("kelas X-RPL punya lebih dari satu pelajaran", text)
        self.assertIn("guru A0002 mengajar mapel berbeda sekaligus", text)

    def test_unknown_references_are_rejected(self):
        data = sample_data()
        data["jadwal"].append(lesson("Senin", 1, "08:00", "X-TIDAK-ADA", "G", "A9999"))
        with self.assertRaises(TimetableImportError) as caught:
            run_import(data)
        self.assertEqual(len(caught.exception.messages), 3)

    def test_combined_class_is_not_a_conflict(self):
        rows = [
            {"slot": "s1", "classroom": "A", "teacher": "T", "subject": "G"},
            {"slot": "s1", "classroom": "B", "teacher": "T", "subject": "G"},
        ]
        self.assertEqual(find_conflicts(rows), [])

    def test_name_helpers(self):
        self.assertEqual(class_key("x-tkj 1"), class_key("X TKJ1"))
        self.assertEqual(name_key("Fulanuddin. S.Kom."), name_key("FULANUDDIN, S.Kom"))
        self.assertEqual(name_key("Moh. Fulan, S.Kom."), "mohfulan")
        self.assertNotEqual(name_key("M. Fulan Abadi, S.Sos."), name_key("Fulan Abadi"))

    def test_command_reports_bad_file(self):
        default_school()
        with self.assertRaises(CommandError):
            call_command("import_timetable", "tidak-ada.json", school="smknj")

    def test_command_requires_known_school(self):
        with self.assertRaises(CommandError) as caught:
            call_command("import_timetable", "tidak-ada.json", school="tidakada")
        self.assertIn("tidak ditemukan", str(caught.exception))


class TimetableApiTests(APITestCase):
    url = reverse("timetable")
    loads_url = reverse("timetable-teacher-loads")

    @classmethod
    def setUpTestData(cls):
        run_import(sample_data(), dry_run=False)
        cls.admin = make_user("admin1", Role.ADMIN)
        cls.teacher = User.objects.get(teacher_code="A0002")
        cls.rpl = Classroom.objects.get(name="X-RPL")
        cls.student = make_user("siswa1", Role.STUDENT, classroom=cls.rpl)

    def get(self, user, url=None, **params):
        self.client.force_authenticate(user)
        return self.client.get(url or self.url, params)

    def test_requires_login(self):
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_student_sees_only_own_class(self):
        response = self.get(self.student)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["timetable"]["code"], "UJI-01")
        self.assertEqual(len(response.data["slots"]), 6)
        self.assertEqual({e["classroom_name"] for e in response.data["entries"]}, {"X-RPL"})
        self.assertEqual(len(response.data["entries"]), 2)

    def test_student_cannot_peek_other_class(self):
        other = Classroom.objects.get(name="X-DPB")
        response = self.get(self.student, classroom=other.id)
        self.assertEqual({e["classroom_name"] for e in response.data["entries"]}, {"X-RPL"})

    def test_teacher_sees_own_lessons(self):
        response = self.get(self.teacher)
        self.assertEqual({e["teacher"] for e in response.data["entries"]}, {self.teacher.id})
        self.assertEqual(len(response.data["entries"]), 3)

    def test_admin_sees_all_and_can_filter(self):
        self.assertEqual(len(self.get(self.admin).data["entries"]), 4)
        self.assertEqual(len(self.get(self.admin, classroom=self.rpl.id).data["entries"]), 2)
        self.assertEqual(len(self.get(self.admin, teacher=self.teacher.id).data["entries"]), 3)
        self.assertEqual(self.get(self.admin, classroom="abc").status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_active_timetable(self):
        Timetable.objects.update(is_active=False)
        response = self.get(self.student)
        self.assertEqual(response.data, {"timetable": None, "slots": [], "entries": []})
        self.assertEqual(self.get(self.admin, self.loads_url).data, [])

    def test_teacher_loads_admin_only(self):
        self.assertEqual(self.get(self.teacher, self.loads_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.get(self.student, self.loads_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_loads_count_combined_class_once(self):
        loads = {row["teacher_code"]: row for row in self.get(self.admin, self.loads_url).data}
        # A0002: Sabtu jam 1 di dua kelas gabungan (dihitung sekali) + Ahad jam 1.
        self.assertEqual(loads["A0002"]["scheduled_periods"], 2)
        self.assertIsNone(loads["A0002"]["official_hours"])
        self.assertEqual(loads["A0001"]["scheduled_periods"], 1)
        # DDP 12 JP ada di jadwal; PKL 4 JP tidak dijadwalkan.
        self.assertEqual(loads["A0001"]["official_hours"], 16)
        self.assertEqual(loads["A0001"]["unscheduled_hours"], 4)
        self.assertEqual(loads["A0002"]["unscheduled_hours"], 0)


class TimetableSchoolIsolationTests(APITestCase):
    """Setiap sekolah punya jadwal, mapel, kelas, dan kode guru sendiri."""

    def setUp(self):
        self.smk = default_school()
        self.other = School.objects.create(code="smk-lain", name="SMK Lain", level=Level.SMK)

    def test_import_to_other_school_does_not_touch_first_school(self):
        run_import(sample_data())
        data = sample_data()
        data["meta"]["kode_jadwal"] = "UJI-01"  # kode jadwal sama boleh di sekolah lain
        run_import(data, school=self.other)

        for school in (self.smk, self.other):
            self.assertEqual(Subject.objects.filter(school=school).count(), 3)
            self.assertEqual(Classroom.objects.filter(school=school).count(), 3)
            self.assertEqual(Timetable.objects.get(school=school).is_active, True)
        # Kode guru A0001 boleh ada di dua sekolah: dua akun berbeda, masing-masing di sekolahnya.
        teachers = User.objects.filter(teacher_code="A0001")
        self.assertEqual(teachers.count(), 2)
        self.assertEqual({t.schools.get().code for t in teachers}, {"smknj", "smk-lain"})
        # Username "a0001" sudah dipakai SMKS, jadi akun sekolah kedua diberi akhiran kode sekolah.
        self.assertEqual(set(teachers.values_list("username", flat=True)), {"a0001", "a0001.smk-lain"})
        self.assertEqual(TeachingAssignment.objects.filter(classroom__school=self.smk).count(), 5)

    def test_new_version_only_deactivates_same_school(self):
        run_import(sample_data())
        run_import(sample_data(), school=self.other)
        data = sample_data()
        data["meta"]["kode_jadwal"] = "UJI-02"
        run_import(data, school=self.other)
        self.assertTrue(Timetable.objects.get(school=self.smk, code="UJI-01").is_active)
        self.assertFalse(Timetable.objects.get(school=self.other, code="UJI-01").is_active)

    def test_teacher_of_other_school_is_not_matched(self):
        # Guru bernama sama di sekolah lain tidak boleh diambil alih oleh impor SMKS.
        outsider = make_user("pak.ahmad", Role.TEACHER, school=self.other, full_name="Ahmad Fulan, S.Kom.")
        run_import(sample_data())
        outsider.refresh_from_db()
        self.assertIsNone(outsider.teacher_code)

    def test_api_shows_only_active_school_timetable(self):
        run_import(sample_data())
        admin_other = make_user("admin.lain", Role.ADMIN, school=self.other)
        self.client.force_authenticate(admin_other)
        response = self.client.get(reverse("timetable"))
        self.assertEqual(response.data, {"timetable": None, "slots": [], "entries": []})
        self.assertEqual(self.client.get(reverse("timetable-teacher-loads")).data, [])

    def test_class_grade_must_fit_school_level(self):
        smp = School.objects.create(code="smp", name="SMP", level=Level.SMP)
        with self.assertRaises(TimetableImportError) as caught:
            run_import(sample_data(), school=smp)
        self.assertIn("tidak ada di jenjang SMP", caught.exception.messages[0])
