from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject
from apps.accounts.models import Role, User
from apps.common.testing import default_school
from apps.schools.models import Level, School

from . import services
from .models import ClassMode, SchoolFeature, SchoolSetting, SettingChange, SubjectProfile
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
            (detail("nilai.bobot"), {"scope": "category", "scope_id": 999, "value": []}, "scope_id"),
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


class CategoryModeTests(APITestCase):
    """Tahap 2: kategori mapel, mode kelas, dan urutan kelas -> mapel -> kategori -> sekolah."""

    def setUp(self):
        self.school = default_school()
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.foundation = make_user("yayasan", Role.FOUNDATION)
        self.other = School.objects.create(code="mtsnj", name="MTs", level=Level.MTS)
        self.other_admin = make_user("admin2", Role.ADMIN, school=self.other)
        self.mtk = Subject.objects.create(school=self.school, code="MTK", name="Matematika")
        self.rpl = Subject.objects.create(school=self.school, code="RPL", name="Pemrograman")
        self.other_subject = Subject.objects.create(school=self.other, code="MTK", name="Matematika MTs")
        self.classroom = Classroom.objects.create(
            school=self.school, name="X RPL 1", grade="X", major="RPL", academic_year="2026/2027"
        )

    def create_category(self, name, mode=None):
        self.client.force_authenticate(self.admin)
        body = {"name": name, **({"mode": mode} if mode else {})}
        res = self.client.post(reverse("subject-category-list"), body, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        return res.data

    def profile(self, subject, body):
        return self.client.put(reverse("subject-profile-detail", args=[subject.id]), body, format="json")

    def bulk(self, body):
        return self.client.post(reverse("subject-profiles-bulk"), body, format="json")

    def effective(self, **params):
        return self.client.get(reverse("school-settings-effective"), params).data

    def test_seeded_modes_and_only_foundation_can_change_them(self):
        self.client.force_authenticate(self.teacher)
        res = self.client.get(reverse("class-mode-list"))
        self.assertEqual([m["code"] for m in res.data], ["tanpa_perangkat", "lab", "perangkat_kelompok"])
        url = reverse("class-mode-detail", args=[res.data[0]["id"]])
        self.assertEqual(self.client.patch(url, {"name": "X"}).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(url, {"name": "X"}).status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.foundation)
        res = self.client.patch(url, {"name": "Kelas biasa"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(self.client.patch(url, {"code": "baru"}).status_code, status.HTTP_400_BAD_REQUEST)
        lab = ClassMode.objects.get(code="lab")
        res = self.client.patch(
            reverse("class-mode-detail", args=[lab.id]), {"is_active": False}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)  # mode bawaan sistem
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_inactive_mode_cannot_be_chosen(self):
        ClassMode.objects.filter(code="perangkat_kelompok").update(is_active=False)
        self.client.force_authenticate(self.admin)
        res = self.client.put(detail("kelas.mode_default"), {"value": "perangkat_kelompok"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        settings = self.client.get(reverse("school-settings")).data["settings"]
        options = next(s for s in settings if s["key"] == "kelas.mode_default")["options"]
        self.assertEqual([o["value"] for o in options], ["tanpa_perangkat", "lab"])

    def test_category_crud_with_mode_and_isolation(self):
        umum = self.create_category("Umum", mode="tanpa_perangkat")
        self.assertEqual((umum["mode"], umum["order"]), ("tanpa_perangkat", 1))
        produktif = self.create_category("Produktif")
        self.assertEqual((produktif["mode"], produktif["order"]), (None, 2))
        res = self.client.post(reverse("subject-category-list"), {"name": "umum"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)  # nama kembar

        url = reverse("subject-category-detail", args=[umum["id"]])
        res = self.client.patch(url, {"mode": None}, format="json")
        self.assertIsNone(res.data["mode"])
        res = self.client.post(
            reverse("subject-category-reorder"), {"categories": [produktif["id"], umum["id"]]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        names = [c["name"] for c in self.client.get(reverse("subject-category-list")).data]
        self.assertEqual(names, ["Produktif", "Umum"])

        self.client.force_authenticate(self.other_admin)
        self.assertEqual(self.client.get(reverse("subject-category-list")).data, [])
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(
            self.client.get(reverse("subject-category-list")).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_mode_lookup_classroom_subject_category_school(self):
        umum = self.create_category("Umum", mode="tanpa_perangkat")
        self.assertEqual(self.effective(subject=self.mtk.id)["class_mode"]["code"], "lab")  # bawaan sistem

        res = self.profile(self.mtk, {"category": umum["id"]})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(
            (res.data["effective_mode"], res.data["mode_source"]), ("tanpa_perangkat", "category")
        )
        mode = self.effective(subject=self.mtk.id)["class_mode"]
        self.assertEqual((mode["code"], mode["needs_student_device"]), ("tanpa_perangkat", False))

        self.profile(self.mtk, {"mode": "perangkat_kelompok"})
        self.assertEqual(self.effective(subject=self.mtk.id)["class_mode"]["code"], "perangkat_kelompok")
        body = {"scope": "classroom", "scope_id": self.classroom.id, "value": "lab"}
        self.client.put(detail("kelas.mode_default"), body, format="json")
        both = self.effective(subject=self.mtk.id, classroom=self.classroom.id)
        self.assertEqual(both["class_mode"]["code"], "lab")
        # Mode per mapel dikosongkan -> kembali ke kategori.
        self.profile(self.mtk, {"mode": None})
        self.assertEqual(self.effective(subject=self.mtk.id)["class_mode"]["code"], "tanpa_perangkat")
        # Pengaturan lain per kategori (bobot) ikut berlaku untuk mapel di kategori itu.
        weights = [{"label": "Tugas", "weight": 100}]
        body = {"scope": "category", "scope_id": umum["id"], "value": weights}
        res = self.client.put(detail("nilai.bobot"), body, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(services.get_setting(self.school, "nilai.bobot", subject=self.mtk), weights)
        self.assertNotEqual(services.get_setting(self.school, "nilai.bobot", subject=self.rpl), weights)
        history = self.client.get(reverse("school-settings-history")).data["results"]
        self.assertEqual(history[0]["target"], "Kategori mapel: Umum")

    def test_bulk_assign_and_list(self):
        produktif = self.create_category("Produktif", mode="lab")
        res = self.bulk({"subjects": [self.mtk.id, self.rpl.id], "category": produktif["id"]})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        rows = self.client.get(reverse("subject-profiles")).data
        self.assertEqual([r["category_name"] for r in rows], ["Produktif", "Produktif"])
        self.bulk({"subjects": [self.mtk.id], "category": None})
        self.assertEqual(SubjectProfile.objects.count(), 1)
        # Mapel sekolah lain ditolak, tanpa perubahan apa pun.
        res = self.bulk({"subjects": [self.rpl.id, self.other_subject.id], "category": None})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(SubjectProfile.objects.count(), 1)
        self.assertEqual(self.bulk({"subjects": [self.rpl.id]}).status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(self.other_admin)
        self.assertEqual(self.profile(self.mtk, {"category": None}).status_code, status.HTTP_404_NOT_FOUND)
        res = self.bulk({"subjects": [self.other_subject.id], "category": produktif["id"]})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)  # kategori sekolah lain

    def test_used_category_cannot_be_deleted_inactive_cannot_be_assigned(self):
        umum = self.create_category("Umum", mode="tanpa_perangkat")
        url = reverse("subject-category-detail", args=[umum["id"]])
        self.profile(self.mtk, {"category": umum["id"]})
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_400_BAD_REQUEST)
        self.client.patch(url, {"is_active": False}, format="json")
        self.assertEqual(
            self.profile(self.rpl, {"category": umum["id"]}).status_code, status.HTTP_400_BAD_REQUEST
        )
        # Kosongkan, lalu hapus: pengaturan di cakupan kategori ikut terhapus.
        self.profile(self.mtk, {"category": None})
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(SchoolSetting.objects.filter(scope="category").exists())

    def test_deleting_subject_still_works_and_removes_profile(self):
        umum = self.create_category("Umum")
        self.profile(self.rpl, {"category": umum["id"]})
        res = self.client.delete(reverse("subject-detail", args=[self.rpl.id]))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(SubjectProfile.objects.exists())
