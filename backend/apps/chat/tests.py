from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Classroom, Subject, TeachingAssignment
from apps.accounts.models import Role, User

from .rules import can_chat, contacts_for


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password="x", full_name=username.title(), role=role, **extra
    )


class ChatTestBase(APITestCase):
    def setUp(self):
        cache.clear()  # reset batas kirim pesan antar test
        self.admin = make_user("admin1", Role.ADMIN)
        self.teacher = make_user("guru1", Role.TEACHER)
        self.homeroom = make_user("wali", Role.TEACHER)
        self.other_teacher = make_user("guru2", Role.TEACHER)
        self.rpl = Classroom.objects.create(
            name="XI RPL 1",
            grade="XI",
            major="RPL",
            academic_year="2026/2027",
            homeroom_teacher=self.homeroom,
        )
        tkj = Classroom.objects.create(name="XI TKJ 1", grade="XI", major="TKJ", academic_year="2026/2027")
        web = Subject.objects.create(code="PWEB", name="Pemrograman Web")
        TeachingAssignment.objects.create(teacher=self.teacher, subject=web, classroom=self.rpl)
        TeachingAssignment.objects.create(teacher=self.other_teacher, subject=web, classroom=tkj)
        self.student = make_user("siswa1", Role.STUDENT, classroom=self.rpl)
        self.classmate = make_user("siswa2", Role.STUDENT, classroom=self.rpl)
        self.student_tkj = make_user("siswa3", Role.STUDENT, classroom=tkj)

    def start(self, user, other):
        self.client.force_authenticate(user)
        return self.client.post(reverse("conversation-list"), {"user": other.id})


class ChatRuleTests(ChatTestBase):
    def test_can_chat_rules(self):
        self.assertTrue(can_chat(self.admin, self.student_tkj))
        self.assertTrue(can_chat(self.teacher, self.other_teacher))
        self.assertTrue(can_chat(self.teacher, self.student))  # mengajar di kelasnya
        self.assertTrue(can_chat(self.student, self.homeroom))  # wali kelas
        self.assertFalse(can_chat(self.teacher, self.student_tkj))  # bukan kelasnya
        self.assertFalse(can_chat(self.student, self.classmate))  # siswa-siswa
        self.assertFalse(can_chat(self.student, self.student))
        self.classmate.is_active = False
        self.assertFalse(can_chat(self.admin, self.classmate))

    def test_contacts_match_rules(self):
        everyone = User.objects.all()
        for user in everyone:
            expected = {o.id for o in everyone if can_chat(user, o)}
            self.assertEqual(set(contacts_for(user).values_list("id", flat=True)), expected, user.username)


class ChatApiTests(ChatTestBase):
    def test_conversation_flow(self):
        res = self.start(self.teacher, self.student)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        conv_id = res.data["id"]
        self.assertEqual(res.data["other"]["full_name"], "Siswa1")
        # Membuka lagi tidak membuat percakapan ganda (dari sisi mana pun).
        self.assertEqual(self.start(self.student, self.teacher).data["id"], conv_id)

        url = reverse("conversation-messages", args=[conv_id])
        self.client.force_authenticate(self.teacher)
        first = self.client.post(url, {"body": "  Jangan lupa tugas besok  "}).data
        self.assertEqual(first["body"], "Jangan lupa tugas besok")
        self.assertEqual(self.client.post(url, {"body": "   "}).status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(reverse("conversation-unread-count")).data["unread"], 1)
        conversations = self.client.get(reverse("conversation-list")).data
        self.assertEqual((conversations[0]["unread"], conversations[0]["last_message"]), (1, first["body"]))
        self.assertEqual([m["body"] for m in self.client.get(url).data], ["Jangan lupa tugas besok"])
        self.assertEqual(
            self.client.get(reverse("conversation-unread-count")).data["unread"], 0
        )  # sudah dibaca

        reply = self.client.post(url, {"body": "Baik, Pak"}).data
        self.client.force_authenticate(self.teacher)
        new = self.client.get(url, {"after": first["id"]}).data
        self.assertEqual([m["id"] for m in new], [reply["id"]])

    def test_forbidden_pairs_and_outsiders(self):
        self.assertEqual(self.start(self.student, self.classmate).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.start(self.teacher, self.student_tkj).status_code, status.HTTP_403_FORBIDDEN)
        conv_id = self.start(self.teacher, self.student).data["id"]
        self.client.force_authenticate(self.classmate)
        url = reverse("conversation-messages", args=[conv_id])
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.post(url, {"body": "ikut"}).status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_send_after_student_moves_class(self):
        conv_id = self.start(self.teacher, self.student).data["id"]
        self.student.classroom = None
        self.student.save()
        self.client.force_authenticate(self.teacher)
        url = reverse("conversation-messages", args=[conv_id])
        self.assertEqual(self.client.post(url, {"body": "halo"}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(self.client.get(reverse("conversation-list")).data[0]["can_send"])

    def test_contacts_search(self):
        self.client.force_authenticate(self.student)
        names = [p["full_name"] for p in self.client.get(reverse("conversation-contacts")).data]
        self.assertEqual(sorted(names), ["Admin1", "Guru1", "Wali"])
        res = self.client.get(reverse("conversation-contacts"), {"search": "wal"})
        self.assertEqual([p["full_name"] for p in res.data], ["Wali"])

    def test_send_is_rate_limited(self):
        conv_id = self.start(self.teacher, self.student).data["id"]
        url = reverse("conversation-messages", args=[conv_id])
        codes = [self.client.post(url, {"body": f"pesan {i}"}).status_code for i in range(31)]
        self.assertEqual(codes[-1], status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)  # membaca tidak dibatasi
