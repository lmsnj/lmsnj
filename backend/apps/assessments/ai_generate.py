"""Buat asesmen "Cek Pemahaman" otomatis dari capaian materi memakai AI (Claude API).

Alur: guru menulis capaian di materi -> menekan "Buat Asesmen Otomatis" -> Claude menyusun soal
yang menguji SETIAP capaian (bukan sekadar hafalan) -> setiap soal diperiksa dengan aturan yang sama
dengan impor Excel (question_import.normalize_item + QuestionSerializer) -> asesmen dibuat sebagai
DRAF dan dipasang sebagai syarat materi. Guru cukup memeriksa lalu menerbitkan, karena kunci
jawaban buatan AI tetap bisa keliru.

Semua soal dinilai otomatis (tanpa esai), jadi siswa langsung tahu tuntas atau belum.
Yang dikirim ke Anthropic hanya judul, deskripsi, dan capaian materi (tanpa data siswa).
"""

import json

import anthropic
from django.conf import settings

from .auto_assessment import AutoAssessmentError, create_check_assessment

MIN_QUESTIONS, MAX_QUESTIONS = 5, 20

KINDS = {
    "pg": "pg",
    "pg_kompleks": "pg kompleks",
    "kategori": "kategori",
    "isian": "isian",
    "jodohkan": "jodohkan",
}

SYSTEM_PROMPT = """Anda penyusun soal asesmen untuk guru sekolah di Indonesia. Tugas Anda membuat soal \
"cek pemahaman" yang membuktikan siswa BENAR-BENAR memahami capaian pembelajaran, bukan sekadar \
menghafal kalimat.

Aturan isi soal:
- Setiap capaian diuji minimal 2 soal dengan tingkat berbeda: mengingat/memahami, lalu menerapkan atau \
menganalisis (mis. menilai contoh, menemukan kesalahan, memilih contoh yang tepat dari sebuah kasus).
- Gunakan Bahasa Indonesia baku yang sederhana sesuai jenjang siswa. Istilah asing ditulis miring \
dengan *bintang*, mis. *output*.
- Soal pilihan ganda punya tepat satu jawaban benar yang tidak bisa diperdebatkan. Pengecoh masuk akal \
dan diambil dari miskonsepsi yang umum. Jangan memakai pilihan "semua benar" atau "semua salah".
- Jangan menyalin kalimat deskripsi materi apa adanya untuk soal tingkat menerapkan/menganalisis.
- Tidak ada soal esai.

Format setiap jenis soal:
- pg: 4-5 pilihan di `choices`; `key` = satu huruf, mis. "B".
- pg_kompleks: 4-5 pilihan, jawaban benar 2 atau 3; pertanyaan diakhiri "(Pilih SEMUA jawaban yang \
benar.)"; `key` = huruf dipisah koma, mis. "A, C".
- kategori: `choices` = 3-4 pernyataan; `key` = B atau S per pernyataan sesuai urutan, mis. "B, S, B".
- isian: kalimat di `text` dengan jawaban di dalam [[...]]; jawaban berupa 1-3 kata dan sertakan \
ejaan/sinonim lain yang benar dipisah |, mis. "Proses ini disebut [[iterasi|perulangan]]."; \
`choices` kosong, `key` kosong.
- jodohkan: `choices` = 3-5 pasangan berbentuk "kiri = kanan"; `key` kosong.
- `stimulus` (boleh kosong) = kasus/teks/langkah yang dibaca sebelum pertanyaan; baris baru dengan \\n.
- `points`: pg 2, pg_kompleks 3, kategori 3, isian 2, jodohkan = jumlah pasangan.
- `objective` = nomor capaian (mulai 1) yang diuji soal itu."""

QUESTION_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "objective": {"type": "integer"},
                    "kind": {"type": "string", "enum": list(KINDS)},
                    "stimulus": {"type": "string"},
                    "text": {"type": "string"},
                    "choices": {"type": "array", "items": {"type": "string"}},
                    "key": {"type": "string"},
                    "points": {"type": "integer"},
                },
                "required": ["objective", "kind", "stimulus", "text", "choices", "key", "points"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["questions"],
    "additionalProperties": False,
}


class AIGenerationError(Exception):
    """Pesan untuk ditampilkan ke guru (Bahasa Indonesia)."""


def ai_enabled():
    return bool(settings.ANTHROPIC_API_KEY)


def build_prompt(material, count):
    assignment = material.teaching_assignment
    objectives = "\n".join(f"{i}. {text}" for i, text in enumerate(material.objectives, start=1))
    return (
        f"Mata pelajaran: {assignment.subject.name}\n"
        f"Kelas: {assignment.classroom.name} (jenjang {assignment.classroom.school.get_level_display()})\n"
        f"Judul materi: {material.title}\n"
        f"Deskripsi materi:\n{material.description or '-'}\n\n"
        f"Capaian pembelajaran:\n{objectives}\n\n"
        f"Buat {count} soal yang mencakup semua capaian di atas, dengan jenis soal yang bervariasi."
    )


def ask_claude(material, count):
    """Minta soal ke Claude. Mengembalikan daftar soal (dict sesuai QUESTION_SCHEMA)."""
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    try:
        response = client.beta.messages.create(
            model=settings.AI_MODEL,
            max_tokens=16000,
            # Jika model utama menolak permintaan, server otomatis mencoba model cadangan.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={
                "effort": "medium",
                "format": {"type": "json_schema", "schema": QUESTION_SCHEMA},
            },
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": build_prompt(material, count)}],
        )
    except anthropic.AuthenticationError:
        raise AIGenerationError("Kunci API AI tidak valid. Hubungi admin server (ANTHROPIC_API_KEY).")
    except anthropic.RateLimitError:
        raise AIGenerationError("Layanan AI sedang sibuk. Coba lagi beberapa menit lagi.")
    except anthropic.APIConnectionError:
        raise AIGenerationError("Server tidak bisa terhubung ke layanan AI. Periksa koneksi internet server.")
    except anthropic.APIStatusError as error:
        raise AIGenerationError(f"Layanan AI mengembalikan kesalahan ({error.status_code}). Coba lagi nanti.")

    if response.stop_reason == "refusal":
        raise AIGenerationError(
            "AI menolak membuat soal untuk materi ini. Ubah kalimat capaiannya lalu coba lagi."
        )
    if response.stop_reason == "max_tokens":
        raise AIGenerationError("Jawaban AI terpotong. Kurangi jumlah soal lalu coba lagi.")
    text = next((block.text for block in response.content if block.type == "text"), "")
    try:
        return json.loads(text)["questions"]
    except (ValueError, KeyError, TypeError):
        raise AIGenerationError("Jawaban AI tidak bisa dibaca. Coba lagi.")


def to_import_item(question):
    """Soal dari AI -> bentuk data impor (diperiksa dengan aturan yang sama dengan impor Excel)."""
    kind = KINDS.get(question.get("kind"), question.get("kind", ""))
    return {
        "kind": kind,
        "stimulus": question.get("stimulus", ""),
        "text": question.get("text", ""),
        "choices": question.get("choices") or [],
        "key": question.get("key", ""),
        "points": str(question.get("points") or ""),
        "labels": "Benar / Salah" if kind == "kategori" else "",
        "direction": "otomatis",
        "scoring": "",
    }


def generate_for_material(material, request, count):
    """Buat asesmen draf berisi soal buatan AI dan jadikan syarat materi. Mengembalikan
    (asesmen, jumlah soal yang dibuang karena tidak lolos pemeriksaan)."""
    if not material.objectives:
        raise AIGenerationError("Isi dulu daftar capaian materi ini; soal disusun dari capaian tersebut.")
    questions = ask_claude(material, count)
    try:
        return create_check_assessment(material, request, [to_import_item(q) for q in questions])
    except AutoAssessmentError as error:
        raise AIGenerationError(str(error))
