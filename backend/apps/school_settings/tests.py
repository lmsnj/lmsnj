from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject
from apps.accounts.models import Role, User
from apps.common.testing import default_school
from apps.schools.models import Level, School

from . import services
from .models import SchoolFeature, SchoolSetting, SettingChange
from .registry import FEATURES, SETTINGS, SETTINGS_BY_KEY, clean_value


def make_user(username, role, school=None):
    user = User.objects.create_user(username=username, password="x", full_name=username.title(), role=role)
    if role != Role.FOUNDATION:
        user.schools.add(school or default_school())
    return user


def detail(key):
    return reverse("school-setting-detail", args=[key])


class RegistryTests(APITestCase):
    def test_every_default_passes_its_own_check(self):
        for setting in SETTINGS:
            with self.subTest(setting.key):
                self.assertEqual(clean_value(setting, setting.default), setting.default)

    def test_checks_reject_bad_values(self):
        bad = {
            "nilai.kkm": [101, -1, "75", True, 7.5],
            "nilai.skala": ["0-10"],
            "kuis_qr.boleh_pindai_ulang": [1, "ya"],
            "monitoring.jabatan_akses": [[], ["guru"], ["superadmin", "superadmin"]],
            "nilai.predikat": [
                [{"label": "A", "min": 90}],  # hanya satu rentang
                [
                    {"label": "A", "min": 80},
                    {"label": "B", "min": 90},
                    {"label": "C", "min": 0},
                ],  # tidak urut
                [{"label": "A", "min": 90}, {"label": "B", "min": 10}],  # terakhir bukan 0
                [{"label": "A", "min": 90}, {"label": "a", "min": 0}],  # label kembar
            ],
            "nilai.bobot": [
                [{"label": "Tugas", "weight": 50}, {"label": "Kuis", "weight": 40}],  # jumlah 90
                [{"label": "", "weight": 100}],
            ],
            "monitoring.indikator_guru": [[{"label": "Presensi", "weight": 100}]],  # label tetap
            "lkpd.kompresi_foto": [{"max_px": 100, "quality": 70}, {"max_px": 1600}],
        }
        for key, values in bad.items():
            for value in values:
                with self.subTest(key=key, value=value), self.assertRaises(Exception):
                    clean_value(SETTINGS_BY_KEY[key], value)

    def test_multi_keeps_option_order_and_labels_are_trimmed(self):
        jabatan = SETTINGS_BY_KEY["monitoring.jabatan_akses"]
        self.assertEqual(
            clean_value(jabatan, ["waka_kurikulum", "superadmin"]), ["superadmin", "waka_kurikulum"]
        )
        bobot = clean_value(SETTINGS_BY_KEY["nilai.bobot"], [{"label": " Tugas ", "weight": 100}])
        self.assertEqual(bobot, [{"label": "Tugas", "weight": 100}])


class ResolveTests(APITestCase):
    def setUp(self):
        self.school = default_school()
        self.admin = make_user("admin1", Role.ADMIN)
        self.subject = Subject.objects.create(school=self.school, code="MTK", name="Matematika")
        self.classroom = Classroom.objects.create(
            school=self.school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )

    def test_lookup_order_classroom_subject_school_default(self):
        reader = lambda: services.SettingReader(self.school)  # noqa: E731 - pembaca baru = data terbaru
        self.assertEqual(reader().resolve("nilai.kkm"), (75, "default"))
        services.save_setting(self.school, "nilai.kkm", "school", None, 70, self.admin)
        services.save_setting(self.school, "nilai.kkm", "subject", self.subject.id, 80, self.admin)
        services.save_setting(self.school, "nilai.kkm", "classroom", self.classroom.id, 85, self.admin)
        self.assertEqual(reader().resolve("nilai.kkm"), (70, "school"))
        self.assertEqual(reader().resolve("nilai.kkm", subject=self.subject), (80, "subject"))
        self.assertEqual(
            reader().resolve("nilai.kkm", subject=self.subject, classroom=self.classroom), (85, "classroom")
        )
        services.reset_setting(self.school, "nilai.kkm", "classroom", self.classroom.id, self.admin)
        self.assertEqual(
            services.get_setting(self.school, "nilai.kkm", classroom=self.classroom, subject=self.subject), 80
        )

    def test_other_school_and_no_school_use_their_own_values(self):
        other = School.objects.create(code="mtsnj", name="MTs", level=Level.MTS)
        services.save_setting(self.school, "nilai.kkm", "school", None, 60, self.admin)
        self.assertEqual(services.get_setting(other, "nilai.kkm"), 75)
        self.assertEqual(services.get_setting(None, "nilai.kkm"), 75)

    def test_same_value_is_not_logged_twice(self):
        services.save_setting(self.school, "nilai.kkm", "school", None, 70, self.admin)
        services.save_setting(self.school, "nilai.kkm", "school", None, 70, self.admin)
        self.assertEqual(SettingChange.objects.count(), 1)


class SettingApiTests(APITestCase):
    def setUp(self):
        self.school = default_school()
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.foundation = make_user("yayasan", Role.FOUNDATION)
        self.other = School.objects.create(code="mtsnj", name="MTs Nurul Jadid", level=Level.MTS)
        self.other_admin = make_user("admin2", Role.ADMIN, school=self.other)
        self.subject = Subject.objects.create(school=self.school, code="MTK", name="Matematika")
        self.other_subject = Subject.objects.create(school=self.other, code="MTK", name="Matematika MTs")

    def test_list_shows_defaults_and_scope_filter(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(reverse("school-settings"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        kkm = next(s for s in res.data["settings"] if s["key"] == "nilai.kkm")
        self.assertEqual(
            (kkm["default"], kkm["stored"], kkm["effective"], kkm["source"]), (75, None, 75, "default")
        )
        self.assertEqual(len(res.data["settings"]), len(SETTINGS))

        res = self.client.get(reverse("school-settings"), {"scope": "subject", "scope_id": self.subject.id})
        self.assertEqual(res.data["target"], "Matematika")
        keys = {s["key"] for s in res.data["settings"]}
        self.assertIn("nilai.kkm", keys)
        self.assertNotIn("nilai.skala", keys)  # skala hanya per sekolah

    def test_put_saves_logs_and_applies_immediately(self):
        self.client.force_authenticate(self.admin)
        res = self.client.put(detail("nilai.kkm"), {"value": 70}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        effective = self.client.get(reverse("school-settings-effective")).data
        self.assertEqual(effective["values"]["nilai.kkm"], 70)

        res = self.client.put(
            detail("nilai.kkm"), {"scope": "subject", "scope_id": self.subject.id, "value": 80}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        effective = self.client.get(reverse("school-settings-effective"), {"subject": self.subject.id}).data
        self.assertEqual(effective["values"]["nilai.kkm"], 80)

        history = self.client.get(reverse("school-settings-history")).data["results"]
        self.assertEqual([h["new_value"] for h in history], [80, 70])
        self.assertEqual(history[0]["target"], "Mata pelajaran: Matematika")
        self.assertEqual(history[1]["old_value"], None)
        self.assertEqual(history[1]["changed_by_name"], "Admin1")

    def test_reset_to_default(self):
        self.client.force_authenticate(self.admin)
        self.client.put(detail("nilai.kkm"), {"value": 70}, format="json")
        res = self.client.delete(detail("nilai.kkm"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(SchoolSetting.objects.exists())
        self.assertEqual(
            self.client.get(reverse("school-settings-effective")).data["values"]["nilai.kkm"], 75
        )
        latest = SettingChange.objects.first()
        self.assertEqual((latest.old_value, latest.new_value), (70, None))

    def test_invalid_values_and_scopes_are_rejected(self):
        self.client.force_authenticate(self.admin)
        cases = [
            (detail("nilai.kkm"), {"value": 150}, "value"),
            (
                detail("nilai.skala"),
                {"scope": "subject", "scope_id": self.subject.id, "value": "0-4"},
                "scope",
            ),
            (
                detail("nilai.kkm"),
                {"scope": "subject", "scope_id": self.other_subject.id, "value": 70},
                "scope_id",
            ),
            (detail("nilai.kkm"), {"scope": "subject", "value": 70}, "scope_id"),
            (detail("nilai.bobot"), {"scope": "category", "scope_id": 1, "value": []}, "scope"),
            (detail("tidak.ada"), {"value": 1}, "key"),
        ]
        for url, body, field in cases:
            with self.subTest(body=body):
                res = self.client.put(url, body, format="json")
                self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, res.data)
        self.assertFalse(SchoolSetting.objects.exists())

    def test_only_admins_can_manage_settings(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(reverse("school-settings")).status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.put(detail("nilai.kkm"), {"value": 70}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.get(reverse("school-settings-history")).status_code, status.HTTP_403_FORBIDDEN
        )
        # Semua pengguna login boleh membaca nilai yang berlaku.
        self.assertEqual(
            self.client.get(reverse("school-settings-effective")).status_code, status.HTTP_200_OK
        )

    def test_settings_are_isolated_per_school(self):
        self.client.force_authenticate(self.admin)
        self.client.put(detail("nilai.kkm"), {"value": 70}, format="json")
        self.client.force_authenticate(self.other_admin)
        self.assertEqual(
            self.client.get(reverse("school-settings-effective")).data["values"]["nilai.kkm"], 75
        )
        self.assertEqual(self.client.get(reverse("school-settings-history")).data["count"], 0)
        # Admin sekolah lain tidak bisa membuka sekolah ini lewat header.
        res = self.client.get(reverse("school-settings"), HTTP_X_SCHOOL=str(self.school.id))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.get(reverse("school-settings-effective"), {"subject": self.subject.id})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_foundation_mode_without_school(self):
        self.client.force_authenticate(self.foundation)
        res = self.client.get(reverse("school-settings-effective"))
        self.assertEqual(res.data["values"]["nilai.kkm"], 75)
        self.assertEqual(set(res.data["features"].values()), {False})
        self.assertEqual(self.client.get(reverse("school-settings")).status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.get(reverse("school-settings"), HTTP_X_SCHOOL=str(self.school.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class FeatureApiTests(APITestCase):
    def setUp(self):
        self.school = default_school()
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.foundation = make_user("yayasan", Role.FOUNDATION)
        self.url = reverse("school-feature-detail", args=["kuis_qr"])
        self.header = {"HTTP_X_SCHOOL": str(self.school.id)}

    def test_features_are_off_by_default(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(reverse("school-features"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([f["code"] for f in res.data], [f.code for f in FEATURES])
        self.assertFalse(any(f["is_active"] for f in res.data))

    def test_only_foundation_can_toggle_and_change_is_logged(self):
        for user in (self.admin, self.teacher):
            self.client.force_authenticate(user)
            res = self.client.put(self.url, {"is_active": True}, format="json")
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.foundation)
        res = self.client.put(self.url, {"is_active": True}, format="json", **self.header)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(services.feature_enabled(self.school, "kuis_qr"))
        self.assertFalse(services.feature_enabled(self.school, "presentasi"))

        self.client.force_authenticate(self.teacher)
        self.assertTrue(self.client.get(reverse("school-settings-effective")).data["features"]["kuis_qr"])

        self.client.force_authenticate(self.admin)
        history = self.client.get(reverse("school-settings-history")).data["results"]
        self.assertEqual(history[0]["label"], "Fitur: Kuis Kartu QR")
        self.assertEqual((history[0]["old_value"], history[0]["new_value"]), (False, True))

    def test_unknown_feature_and_no_school(self):
        self.client.force_authenticate(self.foundation)
        res = self.client.put(
            reverse("school-feature-detail", args=["x"]), {"is_active": True}, **self.header
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.put(self.url, {"is_active": True}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)  # mode Super Admin, belum buka sekolah
        self.assertFalse(SchoolFeature.objects.exists())
