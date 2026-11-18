"""Impor dokumen: Word (.docx), PowerPoint (.pptx), PDF.

Word  : Judul 1 (Heading 1) = bagian, Judul 2 = stasiun, Judul 3 = judul langkah; paragraf = langkah teks
        (tebal/miring, daftar, tabel, gambar ikut). Soal berformat impor soal (1. ... A. ... Kunci: B) menjadi
        latihan.
PPTX  : satu slide = satu langkah teks (judul slide, isi, gambar terbesar). Slide ber-layout "Section Header"
        memulai stasiun baru.
PDF   : satu halaman = satu langkah teks (hanya teks; PDF hasil pindai tidak berisi teks).
Hasil dokumen selalu bisa diedit lagi di Studio, jadi pembaca ini sengaja sederhana dan tidak pernah gagal
hanya karena format yang tidak dikenal (bagian itu dilewati dengan peringatan).
"""

import os
import re
import zipfile

from rest_framework.exceptions import ValidationError

from . import Builder, ImportResult, text_step
from .sources import parse_question_block

MAX_UNZIPPED = 300 * 1024 * 1024
MAX_ZIP_FILES = 5000
MAX_PAGES = 300
MAX_BODY = 4000  # langkah teks yang terlalu panjang dipecah agar enak dibaca di HP
HEADING_RE = re.compile(r"^(heading|judul)\s*(\d)$", re.IGNORECASE)
OPTION_LINE_RE = re.compile(r"^\s*\*?\s*\(?[A-Ea-e][.)]\s+\S")
KEY_LINE_RE = re.compile(r"^\s*(kunci|jawaban)\s*:", re.IGNORECASE)


def check_zip(file, label):
    """Dokumen Office = arsip zip. Tolak arsip rusak atau yang isinya membengkak (zip bomb)."""
    try:
        with zipfile.ZipFile(file) as archive:
            infos = archive.infolist()
    except zipfile.BadZipFile:
        raise ValidationError({"file": f"File rusak atau bukan dokumen {label}."})
    if len(infos) > MAX_ZIP_FILES or sum(info.file_size for info in infos) > MAX_UNZIPPED:
        raise ValidationError({"file": f"Dokumen {label} terlalu besar untuk diimpor."})
    file.seek(0)


def stem(name):
    return os.path.splitext(os.path.basename(name or ""))[0][:200] or "Materi impor"


def escape_cell(value):
    return " ".join(str(value or "").split()).replace("|", "\\|")


def table_text(rows):
    """Baris tabel -> tabel teks kaya (| a | b |, baris pertama = judul)."""
    rows = [[escape_cell(cell) for cell in row] for row in rows if any(str(c).strip() for c in row)]
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
    out += ["| " + " | ".join(row) + " |" for row in rows[1:]]
    return "\n".join(out)


def looks_like_questions(lines):
    text = "\n".join(lines)
    return "[[" in text or any(OPTION_LINE_RE.match(l) or KEY_LINE_RE.match(l) for l in lines)


# ---------------------------------------------------------------- Word


def _styled(text, bold, italic):
    core = text.strip()
    if not core:
        return text
    lead, tail = text[: len(text) - len(text.lstrip())], text[len(text.rstrip()) :]
    if bold:
        core = f"**{core}**"
    elif italic:
        core = f"*{core}*"
    return f"{lead}{core}{tail}"


def _paragraph(paragraph, document, result, name):
    """Paragraf Word -> (teks berformat, [rujukan gambar])."""
    from docx.oxml.ns import qn
    from docx.text.hyperlink import Hyperlink

    pieces, images = [], []
    group, style = [], None

    def close():
        if group:
            pieces.append(_styled("".join(group), *style))
            group.clear()

    for item in paragraph.iter_inner_content():
        runs = item.runs if isinstance(item, Hyperlink) else [item]
        for run in runs:
            for blip in run._element.iter(qn("a:blip")):
                part = document.part.related_parts.get(blip.get(qn("r:embed")))
                if part is not None and getattr(part, "blob", None):
                    ext = os.path.splitext(str(part.partname))[1] or ".png"
                    ref = result.add_image(f"{name}-{len(result.images) + 1}{ext}", part.blob)
                    if ref:
                        images.append(ref)
            current = (bool(run.bold), bool(run.italic))
            if current != style:
                close()
                style = current
            group.append(run.text or "")
        if isinstance(item, Hyperlink) and item.url:
            close()
            pieces.append(f" ({item.url})")
    close()
    text = "".join(pieces).strip()
    properties = paragraph._p.pPr
    is_list = (properties is not None and properties.numPr is not None) or "list" in (
        paragraph.style.name or ""
    ).lower()
    if text and is_list:
        text = f"- {text}"
    return text, images


def read_docx(file):
    from docx import Document
    from docx.oxml.ns import qn
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    check_zip(file, "Word (.docx)")
    try:
        document = Document(file)
    except Exception:
        raise ValidationError({"file": "Dokumen Word tidak bisa dibaca. Simpan ulang sebagai .docx."})
    name = stem(file.name)
    result = ImportResult()
    builder = Builder(name)
    state = {"buffer": [], "title": "", "image": "", "questions": None}

    def flush():
        if state["buffer"] or state["image"]:
            body = "\n\n".join(state["buffer"]).strip()
            builder.add(text_step(state["title"], body, state["image"]))
        state.update(buffer=[], title="", image="")

    def end_questions():
        lines = state["questions"]
        state["questions"] = None
        if lines is None:
            return
        if not looks_like_questions(lines):
            state["buffer"].extend(lines)  # ternyata daftar bernomor biasa, bukan soal
            return
        flush()
        for step in parse_question_block("\n".join(lines), result):
            builder.add(step)

    def add_text(text):
        if sum(len(t) for t in state["buffer"]) + len(text) > MAX_BODY and state["buffer"]:
            title = state["title"]
            flush()
            state["title"] = f"{title} (lanjutan)" if title else ""
        state["buffer"].append(text)

    from apps.assessments.question_import import QUESTION_RE

    for child in document.element.body.iterchildren():
        if child.tag == qn("w:tbl"):
            end_questions()
            rows = [[cell.text for cell in row.cells] for row in Table(child, document).rows]
            table = table_text(rows)
            if table:
                add_text(table)
            continue
        if child.tag != qn("w:p"):
            continue
        paragraph = Paragraph(child, document)
        style = paragraph.style.name if paragraph.style is not None else ""
        heading = HEADING_RE.match(style.strip())
        text, images = _paragraph(paragraph, document, result, name)
        if heading or style.lower() == "title":
            end_questions()
            flush()
            level = int(heading.group(2)) if heading else 0
            if not text:
                continue
            if level == 0:
                builder.default_title = builder.part_title = text[:200]
            elif level == 1:
                builder.part(text)
            elif level == 2:
                builder.station(text)
            else:
                state["title"] = text[:200]
            continue

        if state["questions"] is not None:
            if images:
                end_questions()
            elif text and not QUESTION_RE.match(text) and _question_block_closed(state["questions"], text):
                end_questions()
            else:
                if text:
                    state["questions"].append(text)
                continue
        if text and QUESTION_RE.match(text):
            state["questions"] = [text]
            continue
        for ref in images:
            if state["image"]:
                flush()
            state["image"] = ref
        if text:
            add_text(text)
    end_questions()
    flush()
    result.parts = builder.result_parts()
    if not result.parts:
        result.errors.append("Dokumen tidak berisi teks atau gambar yang bisa diimpor.")
    return result


def _question_block_closed(lines, text):
    """Setelah baris 'Kunci:' soal terakhir, teks biasa berikutnya kembali menjadi penjelasan."""
    if not lines or not KEY_LINE_RE.match(lines[-1]) and not re.match(r"^\s*pembahasan\s*:", lines[-1], re.I):
        return False
    return not (
        KEY_LINE_RE.match(text) or re.match(r"^\s*(pembahasan|poin|grup|label|jenis)\s*:", text, re.I)
    )


# ---------------------------------------------------------------- PowerPoint


def _shape_texts(shapes, title_shape, texts, pictures):
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    for shape in shapes:
        if title_shape is not None and shape.shape_id == title_shape.shape_id:
            continue
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            _shape_texts(shape.shapes, title_shape, texts, pictures)
            continue
        try:
            image = shape.image  # gambar biasa maupun placeholder gambar
        except (AttributeError, ValueError, KeyError):
            image = None
        if image is not None:
            pictures.append(shape)
            continue
        if getattr(shape, "has_table", False) and shape.has_table:
            rows = [[cell.text for cell in row.cells] for row in shape.table.rows]
            table = table_text(rows)
            if table:
                texts.append(table)
            continue
        if getattr(shape, "has_text_frame", False) and shape.has_text_frame:
            paragraphs = [p for p in shape.text_frame.paragraphs if "".join(r.text for r in p.runs).strip()]
            bullets = shape.is_placeholder and len(paragraphs) > 1
            for paragraph in paragraphs:
                line = "".join(r.text for r in paragraph.runs).strip()
                texts.append(f"{'  ' * paragraph.level}- {line}" if bullets else line)


def read_pptx(file):
    from pptx import Presentation

    check_zip(file, "PowerPoint (.pptx)")
    try:
        presentation = Presentation(file)
    except Exception:
        raise ValidationError({"file": "File PowerPoint tidak bisa dibaca. Simpan ulang sebagai .pptx."})
    slides = list(presentation.slides)
    if len(slides) > MAX_PAGES:
        raise ValidationError({"file": f"Maksimal {MAX_PAGES} slide sekali impor."})
    name = stem(file.name)
    result = ImportResult()
    builder = Builder(name)
    for number_, slide in enumerate(slides, start=1):
        title_shape = slide.shapes.title
        title = (
            title_shape.text_frame.text.strip()
            if title_shape is not None and title_shape.has_text_frame
            else ""
        )
        texts, pictures = [], []
        _shape_texts(slide.shapes, title_shape, texts, pictures)
        layout = (slide.slide_layout.name or "").casefold()
        if title and not pictures and len(texts) <= 1 and ("section" in layout or "bagian" in layout):
            builder.station(title)
            continue
        image = ""
        if pictures:
            largest = max(pictures, key=lambda shape: (shape.width or 0) * (shape.height or 0))
            image = result.add_image(f"{name}-slide{number_}.{largest.image.ext}", largest.image.blob)
            if len(pictures) > 1:
                result.warnings.append(f"Slide {number_}: hanya gambar terbesar yang diambil.")
        if not title and not texts and not image:
            continue
        builder.add(text_step(title or f"Slide {number_}", "\n".join(texts), image))
    result.parts = builder.result_parts()
    if not result.parts:
        result.errors.append("Presentasi tidak berisi teks atau gambar yang bisa diimpor.")
    return result


# ---------------------------------------------------------------- PDF


def reflow(text):
    """Teks halaman PDF terpotong per baris; gabungkan baris yang masih satu kalimat."""
    paragraphs, current = [], []
    for raw in str(text or "").splitlines():
        line = " ".join(raw.split())
        if not line:
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        starts_item = re.match(r"^([•\-–*]|\d+[.)])\s", line)
        if current and (starts_item or current[-1].endswith((".", ":", "!", "?"))):
            paragraphs.append(" ".join(current))
            current = []
        current.append(re.sub(r"^[•–]\s", "- ", line))
    if current:
        paragraphs.append(" ".join(current))
    return "\n\n".join(paragraphs)


def read_pdf(file):
    from pypdf import PdfReader

    try:
        reader = PdfReader(file)
        if reader.is_encrypted and not reader.decrypt(""):
            raise ValidationError({"file": "PDF terkunci kata sandi. Buka kuncinya dulu."})
        pages = list(reader.pages)
    except ValidationError:
        raise
    except Exception:
        raise ValidationError({"file": "PDF tidak bisa dibaca. Pastikan file PDF yang valid."})
    if len(pages) > MAX_PAGES:
        raise ValidationError({"file": f"Maksimal {MAX_PAGES} halaman sekali impor."})
    result = ImportResult()
    builder = Builder(stem(file.name))
    empty = []
    for number_, page in enumerate(pages, start=1):
        try:
            text = reflow(page.extract_text() or "")
        except Exception:
            text = ""
        if not text.strip():
            empty.append(number_)
            continue
        chunks, current = [], ""
        for paragraph in text.split("\n\n"):
            if current and len(current) + len(paragraph) > MAX_BODY:
                chunks.append(current)
                current = ""
            current = f"{current}\n\n{paragraph}".strip()
        chunks.append(current)
        for index, chunk in enumerate(chunks):
            suffix = f" ({index + 1})" if len(chunks) > 1 else ""
            builder.add(text_step(f"Halaman {number_}{suffix}", chunk[:10_000]))
    if empty:
        listed = ", ".join(map(str, empty[:10])) + (" ..." if len(empty) > 10 else "")
        result.warnings.append(
            f"{len(empty)} halaman tanpa teks dilewati (mungkin gambar/hasil pindai): halaman {listed}."
        )
    result.parts = builder.result_parts()
    if not result.parts:
        result.errors.append("PDF tidak berisi teks yang bisa dibaca (mungkin hasil pindai).")
    return result
