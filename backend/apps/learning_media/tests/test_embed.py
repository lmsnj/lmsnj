"""Langkah konten HTML5/H5P (embed) dan tugas HTML5 (embed_task)."""

from django.test import SimpleTestCase, override_settings

from ..importers.sources import is_h5p, read_links
from ..steps import KINDS, InvalidResponse, StepError, blocked_embed_host

TASK = {
    "text": "Selesaikan simulasi.",
    "url": "https://konten.contoh.id/simulasi/",
    "completion": "bridge",
    "min_score": 70,
}


@override_settings(
    EMBED_BLOCKED_DOMAINS=["sigmateknologi.my.id"],
    ALLOWED_HOSTS=["api.lms.test", ".kampus.test"],
    CORS_ALLOWED_ORIGINS=["https://smknj.lms.test"],
    CORS_ALLOWED_ORIGIN_REGEXES=[r"^https://\w+\.sekolah\.test$"],
)
class EmbedTests(SimpleTestCase):
    def test_lms_hosts_are_blocked(self):
        for host in ("sigmateknologi.my.id", "smknj.sigmateknologi.my.id", "api.lms.test", "kampus.test",
                     "a.kampus.test", "smknj.lms.test", "mts.sekolah.test"):  # fmt: skip
            self.assertTrue(blocked_embed_host(host), host)
        for host in ("h5p.org", "user.github.io", "sigmateknologi.my.id.palsu.com", "lms.test"):
            self.assertFalse(blocked_embed_host(host), host)

    def test_embed_url_rules(self):
        kind = KINDS["embed"]
        self.assertEqual(kind.validate({"url": "https://h5p.org/h5p/embed/1"})["height"], 480)
        for url, message in (
            ("http://h5p.org/h5p/embed/1", "https://"),
            ("https://smknj.sigmateknologi.my.id/guru", "alamat LMS"),
            ("https://u:p@h5p.org/x", "kata sandi"),
            ("javascript:alert(1)", "https://"),
        ):
            with self.assertRaisesMessage(StepError, message):
                kind.validate({"url": url})

    def test_task_grading(self):
        kind = KINDS["embed_task"]
        public, key = kind.compile({**kind.validate(TASK), "hints": [], "explanation": "Bagus"})
        self.assertEqual(key, {"explanation": "Bagus"})
        grade = lambda r: kind.grade(public, key, kind.clean(public, r))  # noqa: E731
        self.assertFalse(grade({"completed": False})[0])
        self.assertTrue(grade({"completed": True, "score": 8, "max": 10})[0])
        failed = grade({"completed": True, "score": 5, "max": 10})
        self.assertFalse(failed[0])
        self.assertIn("50% belum mencapai 70%", failed[2][0])
        self.assertFalse(grade({"completed": True})[0])  # bridge dengan skor minimal wajib membawa skor
        manual = kind.compile(
            {**kind.validate({**TASK, "completion": "manual"}), "hints": [], "explanation": ""}
        )[0]
        self.assertTrue(kind.grade(manual, {}, kind.clean(manual, {"completed": True}))[0])
        for bad in ({"completed": "ya"}, {"completed": True, "score": 11, "max": 10}, {"completed": True, "score": 1},
                    {"completed": True, "score": True, "max": 1}):  # fmt: skip
            with self.assertRaises(InvalidResponse):
                kind.clean(public, bad)
        self.assertEqual(
            kind.answer_text(public, {"completed": True, "score": 8, "max": 10}), "selesai, skor 8/10"
        )

    def test_links_import_detects_h5p(self):
        self.assertTrue(is_h5p("https://h5p.org/h5p/embed/612"))
        self.assertFalse(is_h5p("https://h5p.org/interactive-video"))
        result = read_links("Kuis | https://h5p.org/h5p/embed/612", "Tautan", "Bagian 1")
        step = result.parts[0]["stations"][0]["steps"][0]
        self.assertEqual(step["kind"], "embed")
        KINDS["embed"].validate(step)
