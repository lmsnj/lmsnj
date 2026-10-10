"""Test soal interaktif: fungsi penilaian (murni) dan API (kunci tidak bocor ke siswa)."""

import shutil
import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status

from . import interactive
from .models import Answer, Question
from .tests import AssessmentTestBase
from .videos import signed_video_url

PARTIAL = "partial"
ALL = "all_or_nothing"
# File unggahan test (gambar/video) disimpan di folder sementara, bukan di media/.
TEMP_MEDIA = tempfile.mkdtemp()


def tearDownModule():
    shutil.rmtree(TEMP_MEDIA, ignore_errors=True)


def built(kind, spec, **options):
    _, content, key, _ = interactive.build(kind, spec, **options)
    return content, key


class GapParserTests(SimpleTestCase):
    def test_parse_gaps_with_alternatives(self):
        parts, gaps = interactive.parse_gaps(
            "HTML singkatan dari [[HyperText| Hypertext ]] Markup [[Language]]"
        )
        self.assertEqual(parts, ["HTML singkatan dari ", " Markup ", ""])
        self.assertEqual(gaps, [["HyperText", "Hypertext"], ["Language"]])

    def test_template_needs_at_least_one_gap(self):
        for template in ["Tanpa celah", "Celah kosong [[ ]]", "Celah [[|]]"]:
            with self.assertRaises(interactive.ValidationError):
                interactive.build("fill_blank", {"template": template})


class FillBlankGradingTests(SimpleTestCase):
    def setUp(self):
        self.content, self.key = built(
            "fill_blank", {"template": "HTML singkatan dari [[HyperText|Hypertext]] Markup [[Language]]."}
        )

    def grade(self, gaps, points=4, mode=PARTIAL, content=None):
        return interactive.grade_fill_blank(content or self.content, self.key, {"gaps": gaps}, points, mode)

    def test_all_correct(self):
        self.assertEqual(self.grade(["HyperText", "Language"]), (Decimal(4), [True, True]))

    def test_partly_correct_is_proportional(self):
        self.assertEqual(self.grade(["HyperText", "Bahasa"]), (Decimal("2.00"), [True, False]))
        points, _ = self.grade(["HyperText", ""], points=3)
        self.assertEqual(points, Decimal("1.50"))

    def test_empty_answer_scores_zero(self):
        self.assertEqual(self.grade([]), (Decimal(0), [False, False]))
        self.assertEqual(self.grade(["  ", ""])[0], Decimal(0))

    def test_alternative_answer_is_accepted(self):
        self.assertEqual(self.grade(["Hypertext", "Language"])[1], [True, True])

    def test_case_and_extra_spaces_ignored_by_default(self):
        self.assertEqual(self.grade(["  hyPERtext ", "LANGUAGE"])[1], [True, True])
        content, key = built("fill_blank", {"template": "Ibu kota [[Daerah Khusus  Jakarta]]"})
        result = interactive.grade_fill_blank(
            content, key, {"gaps": [" daerah   khusus jakarta "]}, 1, PARTIAL
        )
        self.assertEqual(result[1], [True])

    def test_case_sensitive_option(self):
        content, _ = built("fill_blank", {"template": self.key["spec"]["template"], "case_sensitive": True})
        self.assertEqual(self.grade(["hypertext", "Language"], content=content)[1], [False, True])
        self.assertEqual(self.grade(["Hypertext", "Language"], content=content)[1], [True, True])

    def test_all_or_nothing(self):
        self.assertEqual(self.grade(["HyperText", "Bahasa"], mode=ALL)[0], Decimal(0))
        self.assertEqual(self.grade(["HyperText", "language"], mode=ALL)[0], Decimal(4))

    def test_clean_response_pads_and_rejects_bad_shape(self):
        clean = interactive.clean_response("fill_blank", self.content, {"gaps": ["a"]})
        self.assertEqual(clean, {"gaps": ["a", ""]})
        for bad in [{"gaps": ["a", "b", "c"]}, {"gaps": [1]}, {"gaps": "a"}, ["a"]]:
            with self.assertRaises(interactive.InvalidResponse):
                interactive.clean_response("fill_blank", self.content, bad)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class InteractiveApiTestBase(AssessmentTestBase):
    def add_interactive(self, assessment, kind, spec, points=4, mode=PARTIAL, order=5):
        _, content, key, total = interactive.build(kind, spec)
        return Question.objects.create(
            assessment=assessment, order=order, kind=kind, text="Soal interaktif", points=total or points,
            scoring_mode=mode, content=content, answer_key=key,
        )  # fmt: skip

    def assert_no_key(self, data):
        """Tidak ada kunci/teks jawaban di data soal untuk siswa."""
        text = str(data)
        self.assertNotIn("answer_key", text)
        self.assertNotIn("'spec'", text)
        self.assertNotIn("'key'", text)
        return text


class FillBlankApiTests(InteractiveApiTestBase):
    SPEC = {"template": "HTML singkatan dari [[HyperText|Hypertext]] Markup [[Language]]."}

    def test_teacher_creates_fill_blank_from_spec(self):
        assessment = self.make_assessment(published=False)
        self.client.force_authenticate(self.teacher)
        url = reverse("assessment-question-list")
        res = self.client.post(
            url,
            {"assessment": assessment.id, "kind": "fill_blank", "spec": {"template": "Tanpa celah"}},
            format="json",
        )
        self.assertIn("spec", res.data)
        res = self.client.post(
            url, {"assessment": assessment.id, "kind": "fill_blank", "spec": self.SPEC}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["text"], "Lengkapi kalimat berikut.")  # petunjuk bawaan
        self.assertEqual(res.data["content"]["parts"], ["HTML singkatan dari ", " Markup ", "."])
        self.assertEqual(res.data["key"], {"gaps": [["HyperText", "Hypertext"], ["Language"]]})
        self.assertEqual(res.data["spec"]["template"], self.SPEC["template"])
        # Mengubah urutan saja tidak perlu mengirim spec lagi.
        detail = reverse("assessment-question-detail", args=[res.data["id"]])
        res = self.client.patch(detail, {"order": 9}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["key"]["gaps"][1], ["Language"])

    def test_student_questions_have_no_answer_key_and_answer_is_graded(self):
        assessment = self.make_assessment()
        question = self.add_interactive(assessment, "fill_blank", self.SPEC)
        res = self.act(self.student, "start", assessment)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        item = next(q for q in res.data["questions"] if q["id"] == question.id)
        text = self.assert_no_key(item)
        self.assertNotIn("HyperText", text)
        self.assertNotIn("Language", text)

        answer = {"question": question.id, "response": {"gaps": [" hypertext ", "Bahasa"]}}
        res = self.act(self.student, "draft", assessment, data={"answers": [answer]})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        res = self.act(self.student, "submit", assessment, data={"answers": [answer]})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        saved = Answer.objects.get(question=question)
        self.assertEqual(saved.points, Decimal("2.00"))
        self.assertEqual(saved.response, {"gaps": [" hypertext ", "Bahasa"]})
        item = next(q for q in res.data["questions"] if q["id"] == question.id)
        self.assertEqual(item["answer"]["result"], [True, False])
        self.assertIsNone(item["key"])  # kunci belum dibuka sebelum tenggat

    def test_invalid_response_is_rejected(self):
        assessment = self.make_assessment()
        question = self.add_interactive(assessment, "fill_blank", self.SPEC)
        self.act(self.student, "start", assessment)
        res = self.act(
            self.student,
            "draft",
            assessment,
            data={"answers": [{"question": question.id, "response": {"gaps": [1]}}]},
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class DragDropGradingTests(SimpleTestCase):
    SPEC = {
        "template": "Ibu kota Indonesia adalah [[Jakarta]] di pulau [[Jawa]].",
        "distractors": ["Bandung", "Bali"],
    }

    def setUp(self):
        self.content, self.key = built("drag_drop", self.SPEC)
        self.ids = {option["text"]: option["id"] for option in self.content["options"]}

    def grade(self, texts, points=4, mode=PARTIAL):
        gaps = [self.ids.get(text) for text in texts]
        return interactive.grade_drag_drop(self.content, self.key, {"gaps": gaps}, points, mode)

    def test_options_are_answers_then_distractors_with_random_ids(self):
        self.assertEqual([o["text"] for o in self.content["options"]], ["Jakarta", "Jawa", "Bandung", "Bali"])
        self.assertEqual(len(set(self.ids.values())), 4)
        self.assertNotIn("Jakarta", str(self.content["parts"]))

    def test_all_correct_partial_and_empty(self):
        self.assertEqual(self.grade(["Jakarta", "Jawa"]), (Decimal(4), [True, True]))
        self.assertEqual(self.grade(["Jakarta", "Bali"]), (Decimal("2.00"), [True, False]))
        self.assertEqual(self.grade([None, None]), (Decimal(0), [False, False]))
        self.assertEqual(interactive.grade_drag_drop(self.content, self.key, {}, 4, PARTIAL)[0], Decimal(0))

    def test_all_or_nothing(self):
        self.assertEqual(self.grade(["Jakarta", "Bali"], mode=ALL)[0], Decimal(0))
        self.assertEqual(self.grade(["Jakarta", "Jawa"], mode=ALL)[0], Decimal(4))

    def test_identical_answers_may_be_swapped(self):
        content, key = built("drag_drop", {"template": "[[Jawa]] dan [[Jawa]]", "distractors": []})
        first, second = (o["id"] for o in content["options"])
        result = interactive.grade_drag_drop(content, key, {"gaps": [second, first]}, 2, PARTIAL)
        self.assertEqual(result, (Decimal(2), [True, True]))

    def test_spec_rules(self):
        with self.assertRaises(interactive.ValidationError):
            built("drag_drop", {"template": "[[a|b]]"})  # alternatif hanya untuk isian
        with self.assertRaises(interactive.ValidationError):
            built("drag_drop", {"template": "[[a]]", "distractors": [""]})  # pengecoh kosong tanpa gambar
        content, _ = built("drag_drop", {"template": "[[a]]", "distractors": [""]}, image_options={1})
        self.assertEqual(len(content["options"]), 2)

    def test_clean_response_rejects_unknown_or_reused_option(self):
        jakarta = self.ids["Jakarta"]
        self.assertEqual(
            interactive.clean_response("drag_drop", self.content, {"gaps": [jakarta]}),
            {"gaps": [jakarta, None]},
        )
        for bad in [{"gaps": ["xxxx"]}, {"gaps": [jakarta, jakarta]}, {"gaps": [None, None, None]}]:
            with self.assertRaises(interactive.InvalidResponse):
                interactive.clean_response("drag_drop", self.content, bad)


class DragDropApiTests(InteractiveApiTestBase):
    def test_student_gets_shuffled_options_without_key_and_stable_order(self):
        assessment = self.make_assessment()
        question = self.add_interactive(assessment, "drag_drop", DragDropGradingTests.SPEC)
        res = self.act(self.student, "start", assessment)
        item = next(q for q in res.data["questions"] if q["id"] == question.id)
        self.assert_no_key(item)
        self.assertEqual(item["images"]["choices"], [])
        texts = sorted(o["text"] for o in item["content"]["options"])
        self.assertEqual(texts, ["Bali", "Bandung", "Jakarta", "Jawa"])
        again = self.act(self.student, "start", assessment)
        again_item = next(q for q in again.data["questions"] if q["id"] == question.id)
        self.assertEqual(
            item["content"]["options"], again_item["content"]["options"]
        )  # tetap setelah refresh

        ids = {o["text"]: o["id"] for o in item["content"]["options"]}
        answer = {"question": question.id, "response": {"gaps": [ids["Jakarta"], ids["Bali"]]}}
        res = self.act(self.student, "submit", assessment, data={"answers": [answer]})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(Answer.objects.get(question=question).points, Decimal("2.00"))

    def test_teacher_can_attach_image_to_distractor(self):
        assessment = self.make_assessment(published=False)
        self.client.force_authenticate(self.teacher)
        res = self.client.post(
            reverse("assessment-question-list"),
            {"assessment": assessment.id, "kind": "drag_drop", "image_choices": [1],
             "spec": {"template": "Logo [[HTML5]]", "distractors": [""]}},
            format="json",
        )  # fmt: skip
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        png = bytes.fromhex("89504e470d0a1a0a") + b"0" * 32
        url = reverse("assessment-question-images", args=[res.data["id"]])
        res = self.client.post(url, {"slot": "choice", "index": 1, "file": SimpleUploadedFile("a.png", png)})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertIsNotNone(res.data["content"]["options"][1]["image"])
        res = self.client.post(url, {"slot": "choice", "index": 2, "file": SimpleUploadedFile("b.png", png)})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class MatchingGradingTests(SimpleTestCase):
    SPEC = {
        "pairs": [{"left": "<h1>", "right": "Judul"}, {"left": "<p>", "right": "Paragraf"},
                  {"left": "<a>", "right": "Tautan"}],
        "distractors": ["Gambar"],
    }  # fmt: skip

    def setUp(self):
        self.content, self.key = built("matching", self.SPEC)
        self.left = {item["text"]: item["id"] for item in self.content["left"]}
        self.right = {item["text"]: item["id"] for item in self.content["right"]}

    def grade(self, pairs, points=3, mode=PARTIAL):
        response = {"pairs": {self.left[left]: self.right[right] for left, right in pairs.items()}}
        return interactive.grade_matching(self.content, self.key, response, points, mode)

    def test_all_correct(self):
        points, detail = self.grade({"<h1>": "Judul", "<p>": "Paragraf", "<a>": "Tautan"})
        self.assertEqual(points, Decimal(3))
        self.assertTrue(all(detail.values()))

    def test_partly_correct_and_empty(self):
        points, detail = self.grade({"<h1>": "Judul", "<p>": "Gambar"})
        self.assertEqual(points, Decimal("1.00"))
        self.assertEqual(detail[self.left["<h1>"]], True)
        self.assertEqual(detail[self.left["<p>"]], False)
        self.assertEqual(self.grade({})[0], Decimal(0))

    def test_all_or_nothing(self):
        self.assertEqual(self.grade({"<h1>": "Judul", "<p>": "Paragraf"}, mode=ALL)[0], Decimal(0))
        full = {"<h1>": "Judul", "<p>": "Paragraf", "<a>": "Tautan"}
        self.assertEqual(self.grade(full, mode=ALL)[0], Decimal(3))

    def test_spec_rules(self):
        for spec in [
            {"pairs": [{"left": "a", "right": "b"}]},  # minimal 2 pasangan
            {"pairs": [{"left": "a", "right": "b"}, {"left": "c", "right": ""}]},
            {"pairs": [{"left": "a", "right": "b"}, {"left": "A", "right": "c"}]},  # kiri kembar
            {"pairs": [{"left": "a", "right": "b"}, {"left": "c", "right": "d"}], "distractors": ["B"]},
        ]:
            with self.assertRaises(interactive.ValidationError):
                built("matching", spec)

    def test_clean_response_rejects_reused_right_or_unknown_id(self):
        h1, p = self.left["<h1>"], self.left["<p>"]
        judul = self.right["Judul"]
        clean = interactive.clean_response("matching", self.content, {"pairs": {h1: judul, p: None}})
        self.assertEqual(clean, {"pairs": {h1: judul}})
        for bad in [{"pairs": {h1: judul, p: judul}}, {"pairs": {"zzz": judul}}, {"pairs": [h1]}]:
            with self.assertRaises(interactive.InvalidResponse):
                interactive.clean_response("matching", self.content, bad)


class MatchingApiTests(InteractiveApiTestBase):
    def test_student_matching_without_key_and_graded(self):
        assessment = self.make_assessment()
        question = self.add_interactive(assessment, "matching", MatchingGradingTests.SPEC, points=3)
        res = self.act(self.student, "start", assessment)
        item = next(q for q in res.data["questions"] if q["id"] == question.id)
        self.assert_no_key(item)
        self.assertEqual(len(item["content"]["right"]), 4)
        left = {i["text"]: i["id"] for i in item["content"]["left"]}
        right = {i["text"]: i["id"] for i in item["content"]["right"]}
        response = {"pairs": {left["<h1>"]: right["Judul"], left["<p>"]: right["Tautan"]}}
        res = self.act(
            self.student,
            "submit",
            assessment,
            data={"answers": [{"question": question.id, "response": response}]},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(Answer.objects.get(question=question).points, Decimal("1.00"))


def video_spec(**extra):
    return {
        "source": "youtube",
        "url": "https://youtu.be/dQw4w9WgXcQ",
        "duration": 120,
        "mode": "exam",
        "checkpoints": [
            {"time": 10, "kind": "choice", "text": "Tag judul?", "points": 2, "choices": ["<p>", "<h1>"],
             "correct_choice": 1, "explanation": "h1 = judul"},
            {"time": 30, "kind": "fill_blank", "points": 2, "template": "[[HTML]] dan [[CSS]]"},
            {"time": 60, "kind": "matching", "text": "Pasangkan", "points": 2, "required": False,
             "pairs": [{"left": "a", "right": "1"}, {"left": "b", "right": "2"}]},
        ],
        **extra,
    }  # fmt: skip


class VideoTests(SimpleTestCase):
    def setUp(self):
        _, self.content, self.key, self.total = interactive.build("interactive_video", video_spec())
        self.cps = {cp["kind"]: cp for cp in self.content["checkpoints"]}

    def response(self, choice=None, gaps=None, pairs=None):
        answers = {}
        if choice is not None:
            answers[self.cps["choice"]["id"]] = {"choice": choice}
        if gaps is not None:
            answers[self.cps["fill_blank"]["id"]] = {"gaps": gaps}
        if pairs is not None:
            matching = self.cps["matching"]
            left = {i["text"]: i["id"] for i in matching["left"]}
            right = {i["text"]: i["id"] for i in matching["right"]}
            answers[matching["id"]] = {"pairs": {left[a]: right[b] for a, b in pairs.items()}}
        return {"checkpoints": answers}

    def grade(self, response, mode=PARTIAL):
        return interactive.grade_video(self.content, self.key, response, self.total, mode)

    def test_youtube_id_from_common_links(self):
        for url in ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5", "https://youtu.be/dQw4w9WgXcQ",
                    "https://youtube.com/shorts/dQw4w9WgXcQ", "https://m.youtube.com/embed/dQw4w9WgXcQ"]:  # fmt: skip
            self.assertEqual(interactive.youtube_id(url), "dQw4w9WgXcQ")
        self.assertIsNone(interactive.youtube_id("https://vimeo.com/123456"))
        self.assertEqual(self.content["youtube_id"], "dQw4w9WgXcQ")

    def test_total_points_is_sum_of_checkpoints_and_key_is_separate(self):
        self.assertEqual(self.total, 6)
        self.assertNotIn("correct_choice", str(self.content))
        self.assertNotIn("explanation", str(self.content))
        self.assertEqual(self.key["checkpoints"][self.cps["choice"]["id"]]["correct_choice"], 1)

    def test_grading_all_partial_empty_and_all_or_nothing(self):
        full = self.response(choice=1, gaps=["html", "CSS"], pairs={"a": "1", "b": "2"})
        self.assertEqual(self.grade(full)[0], Decimal(6))
        partly = self.response(choice=0, gaps=["HTML", "JS"], pairs={"a": "1"})
        points, detail = self.grade(partly)
        self.assertEqual(points, Decimal("2.00"))  # 0 + 1 + 1
        self.assertEqual(detail[self.cps["choice"]["id"]], {"correct": False, "points": 0.0})
        self.assertEqual(self.grade({})[0], Decimal(0))
        self.assertEqual(self.grade(partly, mode=ALL)[0], Decimal(0))

    def test_checkpoint_rules(self):
        too_late = video_spec()
        too_late["checkpoints"][0]["time"] = 121
        same_time = video_spec()
        same_time["checkpoints"][1]["time"] = 10
        no_text = video_spec()
        no_text["checkpoints"][0]["text"] = ""
        bad_sub = video_spec()
        bad_sub["checkpoints"][1]["template"] = "tanpa celah"
        for spec, message in [
            (too_late, "melebihi durasi"),
            (same_time, "detik yang sama"),
            (no_text, "tulis pertanyaannya"),
            (bad_sub, "Checkpoint nomor 2"),
            ({**video_spec(), "url": "https://example.com"}, "YouTube"),
            ({**video_spec(), "checkpoints": []}, "checkpoint"),
        ]:
            with self.assertRaises(interactive.ValidationError) as caught:
                interactive.build("interactive_video", spec)
            self.assertIn(message, str(caught.exception.detail))

    def test_clean_response_only_optional_checkpoints_can_be_skipped(self):
        optional = self.cps["matching"]["id"]
        clean = interactive.clean_response(
            "interactive_video", self.content, {"skipped": [optional], "position": 33.33}
        )
        self.assertEqual(clean, {"checkpoints": {}, "skipped": [optional], "position": 33.3})
        for bad in [{"skipped": [self.cps["choice"]["id"]]}, {"checkpoints": {"zzz": {}}},
                    {"checkpoints": {self.cps["choice"]["id"]: {"choice": 9}}}]:  # fmt: skip
            with self.assertRaises(interactive.InvalidResponse):
                interactive.clean_response("interactive_video", self.content, bad)


class VideoApiTests(InteractiveApiTestBase):
    def start(self, spec):
        self.assessment = self.make_assessment()
        self.question = self.add_interactive(self.assessment, "interactive_video", spec)
        res = self.act(self.student, "start", self.assessment)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        return next(q for q in res.data["questions"] if q["id"] == self.question.id)

    def check(self, checkpoint, response):
        return self.act(
            self.student, "checkpoint", self.assessment,
            data={"question": self.question.id, "checkpoint": checkpoint, "response": response},
        )  # fmt: skip

    def test_student_video_has_no_key_or_explanation(self):
        item = self.start(video_spec())
        text = self.assert_no_key(item)
        self.assertNotIn("correct_choice", text)
        self.assertNotIn("explanation", text)
        self.assertNotIn("h1 = judul", text)
        self.assertEqual(self.question.points, 6)

    def test_exam_mode_rejects_checkpoint_feedback(self):
        item = self.start(video_spec())
        res = self.check(item["content"]["checkpoints"][0]["id"], {"choice": 1})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_practice_feedback_locks_answer_and_counts_on_submit(self):
        item = self.start(video_spec(mode="practice"))
        choice_cp = item["content"]["checkpoints"][0]["id"]
        res = self.check(choice_cp, {"choice": 0})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual((res.data["correct"], res.data["explanation"]), (False, "h1 = judul"))
        self.assertEqual(res.data["key"], {"correct_choice": 1})
        # Setelah melihat kunci, jawaban tidak bisa diganti (lewat checkpoint lagi maupun draft/submit).
        res = self.check(choice_cp, {"choice": 1})
        self.assertFalse(res.data["correct"])
        res = self.act(self.student, "start", self.assessment)
        self.assertIn(choice_cp, res.data["checkpoints"][str(self.question.id)])
        cheat = {"question": self.question.id, "response": {"checkpoints": {choice_cp: {"choice": 1}}}}
        res = self.act(self.student, "submit", self.assessment, data={"answers": [cheat]})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        answer = Answer.objects.get(question=self.question)
        self.assertEqual(answer.points, Decimal(0))
        self.assertEqual(answer.response["checkpoints"][choice_cp], {"choice": 0})

    def test_file_video_upload_and_signed_streaming(self):
        assessment = self.make_assessment(published=False)
        self.client.force_authenticate(self.teacher)
        spec = {**video_spec(), "source": "file"}
        res = self.client.post(
            reverse("assessment-question-list"),
            {"assessment": assessment.id, "kind": "interactive_video", "spec": spec},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        question = Question.objects.get(pk=res.data["id"])
        self.assertFalse(question.has_answer_key)  # video belum diunggah -> belum bisa terbit
        url = reverse("assessment-question-images", args=[question.id])
        fake = SimpleUploadedFile("video.mp4", b"bukan video sama sekali")
        res = self.client.post(url, {"slot": "video", "file": fake})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        mp4 = b"\x00\x00\x00\x18ftypmp42" + b"x" * 2000
        res = self.client.post(url, {"slot": "video", "file": SimpleUploadedFile("video.mp4", mp4)})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(question.has_answer_key)
        video_url = res.data["content"]["video_url"]
        self.assertIn("/assessment-videos/", video_url)

        self.client.force_authenticate(None)  # elemen <video> tidak mengirim token login
        stream = self.client.get("/api" + video_url, HTTP_RANGE="bytes=0-99")
        self.assertEqual(stream.status_code, 206)
        self.assertEqual(stream["Content-Range"], f"bytes 0-99/{len(mp4)}")
        self.assertEqual(b"".join(stream.streaming_content), mp4[:100])
        self.assertEqual(self.client.get("/api" + video_url + "x").status_code, status.HTTP_403_FORBIDDEN)

        # Siswa yang belum mulai mengerjakan tidak bisa memutar walau memegang alamat bertanda tangan.
        student_url = signed_video_url(question.images.get(slot="video"), self.student)
        assessment.is_published = True
        assessment.save()
        self.assertEqual(self.client.get("/api" + student_url).status_code, status.HTTP_404_NOT_FOUND)


class InteractiveImportTests(InteractiveApiTestBase):
    def setUp(self):
        super().setUp()
        self.assessment = self.make_assessment(published=False)
        self.client.force_authenticate(self.teacher)
        self.url = reverse("assessment-import-questions", args=[self.assessment.id])

    def upload(self, dry_run=False, **data):
        return self.client.post(self.url, {"dry_run": str(dry_run).lower(), **data}, format="multipart")

    def imported(self):
        return list(self.assessment.questions.order_by("order")[2:])

    def test_paste_text_with_interactive_kinds(self):
        text = (
            "1. [isian] HTML singkatan dari [[HyperText|Hypertext]] Markup [[Language]].\n"
            "Poin: 2\n"
            "2. [seret] Ibu kota Indonesia adalah [[Jakarta]].\n"
            "A. Bandung\nB. Surabaya\n"
            "Mode skor: semua\n"
            "3. [jodohkan] Pasangkan tag dengan fungsinya.\n"
            "A. <h1> = Judul\nB. <p> = Paragraf\nC. = Gambar\n"
            "4. Kalimat tanpa jenis: ibu kota Jawa Timur adalah [[Surabaya]].\n"
        )
        res = self.upload(dry_run=True, mode="text", text=text)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        rows = res.data["rows"]
        self.assertTrue(all(not row["errors"] for row in rows), rows)
        self.assertEqual(rows[0]["key"], {"gaps": [["HyperText", "Hypertext"], ["Language"]]})
        res = self.upload(mode="text", text=text)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        fill, drag, match, auto = self.imported()
        self.assertEqual((fill.kind, fill.points, fill.text), ("fill_blank", 2, "Lengkapi kalimat berikut."))
        self.assertEqual(drag.scoring_mode, "all_or_nothing")
        self.assertEqual([o["text"] for o in drag.content["options"]], ["Jakarta", "Bandung", "Surabaya"])
        self.assertEqual([i["text"] for i in match.content["right"]], ["Judul", "Paragraf", "Gambar"])
        self.assertEqual(auto.kind, "fill_blank")

    def test_invalid_interactive_rows_report_errors(self):
        text = "1. [isian] Tanpa celah sama sekali.\n2. [jodohkan] Pasangkan.\nA. tanpa sama dengan\n"
        res = self.upload(dry_run=True, mode="text", text=text)
        rows = res.data["rows"]
        self.assertIn("[[", " ".join(rows[0]["errors"]))
        self.assertIn("kiri = kanan", " ".join(rows[1]["errors"]))
