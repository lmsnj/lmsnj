"""Impor isi media: Excel/CSV (bolak-balik dengan template), JSON, Word, PowerPoint, PDF, tautan, bank soal."""

import io
import json

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image

from apps.assessments.models import Assessment, Question
from apps.common.excel import open_workbook

from .. import schema
from ..importers import ImportResult, excel, merge
from ..importers.documents import read_docx, read_pdf, read_pptx, reflow
from ..importers.sources import is_video, parse_question_block, read_links
from ..models import InteractiveMedia
from .samples import media
from .test_api import TEMP_MEDIA, MediaTestCase


def png_bytes(size=(40, 30)):
    buffer = io.BytesIO()
    Image.new("RGB", size, (31, 138, 76)).save(buffer, format="PNG")
    return buffer.getvalue()


def xlsx(draft):
    return SimpleUploadedFile("media.xlsx", excel.build_workbook(draft))


def sheet_values(content, title):
    workbook = open_workbook(SimpleUploadedFile("m.xlsx", content))
    rows = [list(row) for row in workbook[title].iter_rows(values_only=True)]
    workbook.close()
    return rows


def edited_xlsx(draft, title, row_index, column_label, value):
    """Template draf dengan satu sel diubah (seperti guru mengedit di Excel)."""
    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(excel.build_workbook(draft)))
    sheet = workbook[title]
    header = [str(c.value or "").rstrip("*") for c in sheet[1]]
    sheet.cell(row=row_index, column=header.index(column_label) + 1, value=value)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return SimpleUploadedFile("media.xlsx", buffer.getvalue())


def apply(draft, result, mode="replace"):
    return schema.validate_media(merge(draft, result, mode), full=False)


class ExcelTests(SimpleTestCase):
    def test_example_template_imports_and_is_publishable(self):
        result = excel.read_excel(xlsx({}), {})
        self.assertEqual(result.errors, [])
        content = apply({}, result)
        schema.validate_media(content, full=True)  # contoh lolos pemeriksaan terbit
        kinds = {
            step["kind"]
            for station in schema.iter_stations(content)
            for _, step in schema.iter_steps(station)
        }
        self.assertTrue(set(excel.EXCEL_KINDS) <= kinds, set(excel.EXCEL_KINDS) - kinds)
        self.assertEqual(len(content["glossary"]), 2)

    def test_round_trip_keeps_ids_and_content(self):
        first = apply({}, excel.read_excel(xlsx({}), {}))
        again = apply(first, excel.read_excel(xlsx(first), first))
        self.assertEqual(json.dumps(again, sort_keys=True), json.dumps(first, sort_keys=True))

    def test_sample_media_round_trip_preserves_studio_only_steps(self):
        draft = schema.validate_media(media(), full=True)
        result = excel.read_excel(xlsx(draft), draft)
        self.assertEqual(result.errors, [])
        again = schema.validate_media(apply(draft, result), full=True)
        self.assertEqual(
            json.dumps(again["parts"], sort_keys=True), json.dumps(draft["parts"], sort_keys=True)
        )

    def test_edited_cell_changes_step_and_errors_name_the_row(self):
        draft = apply({}, excel.read_excel(xlsx({}), {}))
        # Baris ke-7 lembar Langkah = langkah PG contoh.
        rows = sheet_values(excel.build_workbook(draft), "Langkah")
        row = next(i for i, r in enumerate(rows, start=1) if r[2] == "pg")
        result = excel.read_excel(edited_xlsx(draft, "Langkah", row, "Kunci", "B"), draft)
        choice = next(
            s
            for s in schema.iter_stations(apply(draft, result))
            for _, s in schema.iter_steps(s)
            if s["kind"] == "choice"
        )
        self.assertEqual(choice["correct"], 1)
        result = excel.read_excel(edited_xlsx(draft, "Langkah", row, "Kunci", "F"), draft)
        self.assertEqual(
            result.errors,
            [
                f"Lembar Langkah baris {row}: Kunci 'F' tidak cocok dengan pilihan yang ada (tulis huruf, mis. B)."
            ],
        )

    def test_studio_only_kind_needs_existing_id(self):
        draft = schema.validate_media(media(), full=False)
        rows = sheet_values(excel.build_workbook(draft), "Langkah")
        row = next(i for i, r in enumerate(rows, start=1) if r[2] == "ketuk gambar")
        result = excel.read_excel(edited_xlsx(draft, "Langkah", row, "Id Langkah", ""), draft)
        self.assertIn("hanya bisa dibuat di Studio", result.errors[0])

    def test_prerequisite_by_title_and_csv(self):
        csv_text = (
            "Bagian;Stasiun;Jenis;Teks;Pilihan A;Pilihan B;Kunci\n"
            "Dasar;Pengenalan;teks;Halo semua;;;\n"
            'Dasar;Pengenalan;pg;"Mana yang benar?";Ini;Itu;A\n'
            "Lanjut;Latihan;benar salah;Langit biru;;;B\n"
        )
        result = excel.read_csv(SimpleUploadedFile("m.csv", csv_text.encode("utf-8-sig")), {})
        self.assertEqual(result.errors, [])
        content = apply({}, result)
        self.assertEqual([p["title"] for p in content["parts"]], ["Dasar", "Lanjut"])
        schema.validate_media(content, full=True)

    def test_unknown_prerequisite_and_kind_are_errors(self):
        draft = apply({}, excel.read_excel(xlsx({}), {}))
        result = excel.read_excel(
            edited_xlsx(draft, "Stasiun", 2, "Prasyarat (judul stasiun, satu per baris)", "Tidak ada"), draft
        )
        self.assertIn("prasyarat 'Tidak ada'", result.errors[0])
        result = excel.read_excel(edited_xlsx(draft, "Langkah", 2, "Jenis", "teka-teki"), draft)
        self.assertIn("jenis 'teka-teki' tidak dikenal", result.errors[0])


class MergeTests(SimpleTestCase):
    def test_append_merges_part_by_title_and_renews_ids(self):
        draft = schema.validate_media(media(), full=False)
        extra = ImportResult(
            parts=json.loads(json.dumps(draft["parts"])), glossary=[{"term": "Baru", "meaning": "x"}]
        )
        merged = apply(draft, extra, "append")
        self.assertEqual(len(merged["parts"]), len(draft["parts"]))
        stations = list(schema.iter_stations(merged))
        self.assertEqual(len(stations), 2 * len(list(schema.iter_stations(draft))))
        ids = [s["id"] for s in stations]
        self.assertEqual(len(ids), len(set(ids)))
        # Prasyarat stasiun salinan menunjuk salinan juga (bukan stasiun lama).
        copies = stations[len(stations) // 2 :]
        copy_ids = {s["id"] for s in copies}
        self.assertTrue(all(set(s["prerequisites"]) <= copy_ids for s in copies))
        self.assertIn("Baru", [g["term"] for g in merged["glossary"]])


class DocumentTests(SimpleTestCase):
    def docx(self):
        from docx import Document

        document = Document()
        document.add_heading("Petualangan", level=0)
        document.add_heading("Bagian Algoritma", level=1)
        document.add_heading("Mengenal Algoritma", level=2)
        paragraph = document.add_paragraph("Algoritma adalah ")
        paragraph.add_run("urutan langkah").bold = True
        paragraph.add_run(" yang logis.")
        document.add_paragraph("Rebus air", style="List Bullet")
        document.add_paragraph("1. Siapkan gelas")  # daftar bernomor biasa, bukan soal
        document.add_paragraph("2. Tuang air")
        document.add_heading("Contoh", level=3)
        table = document.add_table(rows=2, cols=2)
        table.cell(0, 0).text, table.cell(0, 1).text = "Simbol", "Arti"
        table.cell(1, 0).text, table.cell(1, 1).text = "Oval", "Mulai | selesai"
        document.add_picture(io.BytesIO(png_bytes()))
        document.add_heading("Latihan", level=2)
        for line in [
            "1. Langkah berurutan disebut ...",
            "A. Data",
            "B. Algoritma",
            "Kunci: B",
            "Pembahasan: Algoritma = urutan langkah.",
            "2. [esai] Jelaskan algoritma.",
            "3. Simbol input berbentuk [[jajaran genjang]].",
        ]:
            document.add_paragraph(line)
        buffer = io.BytesIO()
        document.save(buffer)
        return SimpleUploadedFile("Materi Algoritma.docx", buffer.getvalue())

    def test_word_headings_text_tables_images_and_questions(self):
        result = read_docx(self.docx())
        self.assertEqual(result.errors, [])
        self.assertEqual(len(result.images), 1)
        [part] = result.parts
        self.assertEqual(part["title"], "Bagian Algoritma")
        first, second = part["stations"]
        self.assertEqual(first["title"], "Mengenal Algoritma")
        body = first["steps"][0]["body"]
        self.assertIn("**urutan langkah**", body)
        self.assertIn("- Rebus air", body)
        self.assertIn("1. Siapkan gelas", body)
        example = first["steps"][1]
        self.assertEqual(example["title"], "Contoh")
        self.assertIn("| Oval | Mulai \\| selesai |", example["body"])
        self.assertEqual(example["image"], "pending:0")
        self.assertEqual([s["kind"] for s in second["steps"]], ["choice", "fill_blank"])
        self.assertEqual(second["steps"][0]["correct"], 1)
        self.assertEqual(second["steps"][0]["explanation"], "Algoritma = urutan langkah.")
        self.assertTrue(any("esai" in w for w in result.warnings))
        schema.validate_media(apply({}, result), full=True)

    def test_question_block_parser(self):
        result = ImportResult()
        steps = parse_question_block("1. [kategori] Tentukan\nA. Satu\nB. Dua\nKunci: B, S", result)
        self.assertEqual(steps[0]["kind"], "categorize")
        self.assertEqual([i["category"] for i in steps[0]["items"]], [0, 1])

    def test_pptx_slides_sections_and_pictures(self):
        from pptx import Presentation
        from pptx.util import Inches

        presentation = Presentation()
        slide = presentation.slides.add_slide(presentation.slide_layouts[1])
        slide.shapes.title.text = "Pengertian"
        body = slide.placeholders[1].text_frame
        body.text = "Algoritma adalah langkah"
        body.add_paragraph().text = "Harus berakhir"
        section = presentation.slides.add_slide(presentation.slide_layouts[2])
        section.shapes.title.text = "Stasiun Simbol"
        picture = presentation.slides.add_slide(presentation.slide_layouts[5])
        picture.shapes.title.text = "Simbol Flowchart"
        picture.shapes.add_picture(io.BytesIO(png_bytes()), Inches(1), Inches(1))
        presentation.slides.add_slide(presentation.slide_layouts[6])  # slide kosong dilewati
        buffer = io.BytesIO()
        presentation.save(buffer)
        result = read_pptx(SimpleUploadedFile("Flowchart.pptx", buffer.getvalue()))
        self.assertEqual(result.errors, [])
        stations = result.parts[0]["stations"]
        self.assertEqual([s["title"] for s in stations], ["Flowchart", "Stasiun Simbol"])
        self.assertEqual(stations[0]["steps"][0]["body"], "- Algoritma adalah langkah\n- Harus berakhir")
        self.assertEqual(stations[1]["steps"][0]["image"], "pending:0")

    def pdf(self, pages):
        """PDF kecil buatan tangan (tanpa pustaka tambahan) berisi teks per halaman."""
        objects = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            None,
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        ]
        kids = []
        for text in pages:
            stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode() if text else b""
            objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
            content = len(objects)
            objects.append(
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {content} 0 R "
                "/Resources << /Font << /F1 3 0 R >> >> >>"
            )
            kids.append(f"{len(objects)} 0 R")
        objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"
        out, offsets = bytearray(b"%PDF-1.4\n"), []
        for number_, body in enumerate(objects, start=1):
            offsets.append(len(out))
            out += (
                f"{number_} 0 obj\n".encode()
                + (body if isinstance(body, bytes) else body.encode())
                + b"\nendobj\n"
            )
        xref = len(out)
        out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
        out += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
        out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
        return SimpleUploadedFile("Modul.pdf", bytes(out))

    def test_pdf_pages_become_text_steps(self):
        result = read_pdf(self.pdf(["Algoritma adalah urutan langkah.", ""]))
        self.assertEqual(result.errors, [])
        [step] = result.parts[0]["stations"][0]["steps"]
        self.assertEqual(step["title"], "Halaman 1")
        self.assertIn("Algoritma adalah urutan langkah.", step["body"])
        self.assertIn("1 halaman tanpa teks", result.warnings[0])

    def test_reflow_joins_broken_lines(self):
        self.assertEqual(
            reflow("Algoritma adalah\nurutan langkah.\n• Satu\n• Dua"),
            "Algoritma adalah urutan langkah.\n\n- Satu\n\n- Dua",
        )

    def test_rejects_broken_office_files(self):
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            read_docx(SimpleUploadedFile("x.docx", b"bukan zip"))


class LinkTests(SimpleTestCase):
    def test_links_video_and_stations(self):
        result = read_links(
            "# Tonton\nVideo algoritma | https://youtu.be/abc\nhttps://flowgorithm.org\n# Baca\nwww.salah.com",
            "Tautan belajar",
            "Bagian 1",
        )
        self.assertEqual(result.errors, ["Baris 5: alamat harus diawali https:// (www.salah.com)."])
        steps = result.parts[0]["stations"][0]["steps"]
        self.assertEqual([s["kind"] for s in steps], ["video", "link"])
        self.assertEqual(steps[0]["title"], "Video algoritma")

    def test_is_video(self):
        self.assertTrue(is_video("https://www.youtube.com/watch?v=x"))
        self.assertTrue(is_video("https://drive.google.com/file/d/abc/view"))
        self.assertFalse(is_video("https://drive.google.com/drive/folders/abc"))
        self.assertFalse(is_video("https://youtube.com.palsu.id/x"))


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class ImportApiTests(MediaTestCase):
    def call(self, data, dry_run=True, user=None, fmt="multipart"):
        self.client.force_authenticate(user or self.teacher)
        return self.client.post(
            reverse("learning-media-import-content", args=[self.media.id]),
            {**data, "dry_run": dry_run},
            format=fmt,
        )

    def test_template_download_contains_draft(self):
        response = self.client.get(reverse("learning-media-import-template", args=[self.media.id]))
        self.assertEqual(response.status_code, 200)
        titles = [row[2] for row in sheet_values(response.content, "Stasiun")[1:] if row[2]]
        self.assertEqual(titles, [s["title"] for s in schema.iter_stations(self.media.draft)])

    def test_json_template_contains_draft_and_imports_back(self):
        response = self.client.get(reverse("learning-media-json-template", args=[self.media.id]))
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        self.assertEqual(payload["format"], "lms-sigma-media")
        self.assertEqual(payload["media"]["parts"], self.media.draft["parts"])
        file = SimpleUploadedFile("t.json", response.content)
        response = self.call({"source": "json", "mode": "replace", "file": file})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["errors"], [])

    def test_json_template_of_empty_media_is_example_that_imports(self):
        self.media.draft = {}
        self.media.save()
        response = self.client.get(reverse("learning-media-json-template", args=[self.media.id]))
        payload = json.loads(response.content)
        self.assertEqual(payload["media"]["parts"][0]["title"], excel.EXAMPLE["parts"][0]["title"])
        file = SimpleUploadedFile("t.json", response.content)
        response = self.call({"source": "json", "mode": "replace", "file": file})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["errors"], [])
        self.assertEqual(response.data["summary"]["stations"], 2)

    def test_dry_run_does_not_save_then_apply_saves(self):
        before = json.dumps(self.media.draft, sort_keys=True)
        file = lambda: SimpleUploadedFile("t.xlsx", excel.build_workbook({}))  # noqa: E731
        response = self.call({"source": "excel", "mode": "replace", "file": file()})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["summary"]["stations"], 2)
        self.assertEqual(len(response.data["removed"]), len(list(schema.iter_stations(self.media.draft))))
        self.media.refresh_from_db()
        self.assertEqual(json.dumps(self.media.draft, sort_keys=True), before)
        response = self.call({"source": "excel", "mode": "replace", "file": file()}, dry_run=False)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["imported"])
        self.media.refresh_from_db()
        self.assertEqual(
            [s["title"] for s in schema.iter_stations(self.media.draft)],
            ["Apa itu algoritma?", "Latihan algoritma"],
        )

    def test_errors_block_apply(self):
        bad = SimpleUploadedFile("m.csv", "Stasiun;Jenis;Teks;Kunci\nA;benar salah;Langit;X\n".encode())
        response = self.call({"source": "excel", "file": bad}, dry_run=False)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Kunci benar salah", response.data["errors"][0])

    def test_word_images_are_uploaded_on_apply(self):
        response = self.call({"source": "word", "file": DocumentTests().docx()}, dry_run=False)
        self.assertEqual(response.status_code, 200, response.data)
        self.media.refresh_from_db()
        [asset] = self.media.assets.all()
        steps = [s for st in schema.iter_stations(self.media.draft) for _, s in schema.iter_steps(st)]
        self.assertIn(asset.ref, [s.get("image") for s in steps])
        self.assertNotIn("pending", json.dumps(self.media.draft))

    def test_json_from_other_media_drops_foreign_assets(self):
        other = InteractiveMedia.objects.create(
            school=self.school, title="Lain", draft=media(), created_by=self.teacher
        )
        payload = {
            "format": "lms-sigma-media",
            "media": {**other.draft, "mascot": {"name": "Bita", "image": "asset:999"}},
        }
        file = SimpleUploadedFile("m.json", json.dumps(payload).encode())
        response = self.call({"source": "json", "mode": "append", "file": file}, dry_run=False)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("gambar unggahan dari media lain", response.data["warnings"][0])
        self.media.refresh_from_db()
        self.assertNotIn("asset:999", json.dumps(self.media.draft))
        ids = [s["id"] for s in schema.iter_stations(self.media.draft)]
        self.assertEqual(len(ids), len(set(ids)))

    def test_links_and_bank(self):
        response = self.call({"source": "links", "text": "https://youtu.be/abc"}, dry_run=False, fmt="json")
        self.assertEqual(response.status_code, 200, response.data)
        assessment = Assessment.objects.create(
            teaching_assignment=self.assignment, title="Kuis 1", due_at=timezone.now()
        )
        Question.objects.create(
            assessment=assessment, kind="choice", text="2+2?", choices=["3", "4"], correct_choice=1
        )
        Question.objects.create(
            assessment=assessment,
            kind="multiple",
            text="Genap?",
            choices=["2", "3", "4"],
            correct_choices=[0, 2],
        )
        Question.objects.create(assessment=assessment, kind="essay", text="Jelaskan")
        response = self.call({"source": "bank", "assessment": assessment.id}, dry_run=False, fmt="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.media.refresh_from_db()
        station = list(schema.iter_stations(self.media.draft))[-1]
        self.assertEqual(station["title"], "Latihan: Kuis 1")
        self.assertEqual([s["kind"] for s in station["steps"]], ["choice", "categorize"])
        self.assertEqual([i["category"] for i in station["steps"][1]["items"]], [0, 1, 0])
        # Admin boleh memakai asesmen sekolahnya; guru lain (bukan tim kelas-mapel itu) tidak.
        response = self.call({"source": "bank", "assessment": assessment.id}, user=self.admin, fmt="json")
        self.assertEqual(response.status_code, 200)
        other_media = InteractiveMedia.objects.create(
            school=self.school, title="M2", draft={}, created_by=self.other_teacher
        )
        self.client.force_authenticate(self.other_teacher)
        response = self.client.post(
            reverse("learning-media-import-content", args=[other_media.id]),
            {"source": "bank", "assessment": assessment.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_only_editor_can_import(self):
        response = self.call({"source": "links", "text": "https://a.id"}, user=self.other_teacher, fmt="json")
        self.assertIn(response.status_code, (403, 404))
