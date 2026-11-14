"""Asesmen "Cek Pemahaman" otomatis untuk satu materi (gratis, tanpa internet).

Guru menulis "Konsep kunci" di materi, satu baris satu pasangan `istilah = penjelasan`, mis.
"Algoritma = Urutan langkah logis untuk menyelesaikan masalah". Dari pasangan itu dibuat soal:
- jodohkan istilah dengan penjelasannya,
- pilihan ganda dua arah (penjelasan -> istilah, istilah -> penjelasan; pengecoh = konsep lain),
- isian (menyebutkan istilah dari penjelasannya),
- benar/salah (pasangan yang benar dan yang ditukar).
Kunci jawaban pasti benar karena dibentuk dari pasangan yang ditulis guru.

Setiap soal tetap diperiksa dengan aturan impor Excel (normalize_item + QuestionSerializer), lalu
asesmen dibuat sebagai DRAF dan dipasang sebagai syarat materi. Fungsi pembuat soal murni (tanpa
database) agar mudah diuji.
"""

import random
import re
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from . import question_import
from .models import Assessment

MIN_CONCEPTS = 4
MAX_CONCEPTS = 12
LETTERS = "ABCDE"


class AutoAssessmentError(Exception):
    """Pesan untuk ditampilkan ke guru (Bahasa Indonesia)."""


def parse_concepts(lines):
    """["Istilah = penjelasan", ...] -> [(istilah, penjelasan)]. Baris tanpa "=" dilewati."""
    pairs = []
    for line in lines:
        term, sep, definition = line.partition("=")
        if sep and term.strip() and definition.strip():
            pairs.append((term.strip(), definition.strip().rstrip(".")))
    return pairs


def _item(kind, text, choices=(), key="", points="", labels=""):
    return {"kind": kind, "text": text, "choices": list(choices), "key": key, "points": str(points),
            "labels": labels, "direction": "otomatis", "scoring": "", "stimulus": ""}  # fmt: skip


def _lower_first(text):
    """Huruf pertama dikecilkan agar enak dibaca di tengah kalimat; singkatan (mis. CPU) dibiarkan."""
    return text if text[:2].isupper() else text[:1].lower() + text[1:]


def _answers(term):
    """Jawaban isian yang diterima: istilah lengkap, tanpa keterangan dalam kurung, dan isi kurungnya."""
    plain = re.sub(r"\s*\(.*?\)", "", term).strip()
    inside = re.findall(r"\((.*?)\)", term)
    options = [plain, term, *inside]
    return "|".join(dict.fromkeys(o.replace("*", "").strip() for o in options if o.strip()))


def _choice_question(rng, answer, others, count=4):
    """Pilihan = jawaban + pengecoh acak dari konsep lain. Mengembalikan (pilihan, huruf kunci)."""
    choices = rng.sample(others, min(count - 1, len(others))) + [answer]
    rng.shuffle(choices)
    return choices, LETTERS[choices.index(answer)]


def build_questions(pairs, seed=0):
    """Susun soal dari pasangan konsep. `seed` membuat hasil tetap sama untuk materi yang sama."""
    if len(pairs) < MIN_CONCEPTS:
        raise AutoAssessmentError(
            f"Tulis minimal {MIN_CONCEPTS} konsep kunci (satu baris: istilah = penjelasan)."
        )
    rng = random.Random(seed)
    pairs = pairs[:MAX_CONCEPTS]
    terms = [term for term, _ in pairs]
    definitions = [definition for _, definition in pairs]
    items = []

    # 1. Jodohkan: 4 pasangan + 1 penjelasan pengecoh jika konsepnya cukup.
    picked = rng.sample(range(len(pairs)), 4)
    rest = [i for i in range(len(pairs)) if i not in picked]
    lines = [f"{terms[i]} = {definitions[i]}" for i in picked]
    if rest:
        lines.append(f"= {definitions[rng.choice(rest)]}")
    items.append(_item("jodohkan", "Pasangkan setiap istilah dengan penjelasan yang tepat.", lines, points=4))

    # 2. Pilihan ganda untuk setiap konsep, arahnya bergantian agar tidak cukup menghafal satu arah.
    for index, (term, definition) in enumerate(pairs):
        if index % 2 == 0:
            others = [t for t in terms if t != term]
            choices, key = _choice_question(rng, term, others)
            text = f"Perhatikan pernyataan berikut.\n\n“{definition}.”\n\nIstilah yang tepat adalah ..."
        else:
            others = [d for d in definitions if d != definition]
            choices, key = _choice_question(rng, definition, others)
            text = f"Yang dimaksud dengan **{term}** adalah ..."
        items.append(_item("pg", text, choices, key, points=2))

    # 3. Isian: siswa menuliskan sendiri istilahnya (bukan memilih).
    for i in rng.sample(range(len(pairs)), 2):
        items.append(_item("isian", f"“{definitions[i]}” disebut [[{_answers(terms[i])}]].", points=2))

    # 4. Benar/salah: 2 pasangan benar + 2 pasangan yang penjelasannya ditukar.
    true_idx, false_idx = picked[:2], picked[2:4]
    statements = [(f"{terms[i]} adalah {_lower_first(definitions[i])}.", "B") for i in true_idx]
    a, b = false_idx
    statements += [(f"{terms[a]} adalah {_lower_first(definitions[b])}.", "S"),
                   (f"{terms[b]} adalah {_lower_first(definitions[a])}.", "S")]  # fmt: skip
    rng.shuffle(statements)
    items.append(
        _item("kategori", "Tentukan benar atau salah setiap pernyataan berikut.",
              [text for text, _ in statements], ", ".join(key for _, key in statements), points=3,
              labels="Benar / Salah")  # fmt: skip
    )
    return items


def create_check_assessment(material, request, raw_items, min_valid=3):
    """Periksa soal, buat asesmen DRAF, jadikan syarat materi. Mengembalikan (asesmen, jumlah soal
    yang dibuang karena tidak lolos pemeriksaan). Dipakai juga oleh pembuat soal AI."""
    items = [question_import.normalize_item(f"Soal {i}", {**raw, "images": question_import.empty_images()})
             for i, raw in enumerate(raw_items, start=1)]  # fmt: skip
    with transaction.atomic():
        assessment = Assessment.objects.create(
            teaching_assignment=material.teaching_assignment,
            title=f"Cek Pemahaman: {material.title}"[:200],
            instructions=(
                "Kerjakan dengan jujur. Asesmen ini memastikan kamu sudah memahami materi "
                f"“{material.title}” sebelum lanjut ke materi berikutnya."
            ),
            due_at=timezone.now() + timedelta(days=30),
            duration_minutes=20,
            passing_score=75,
            remedial_attempts=2,
            show_answers=True,
            is_published=False,
            created_by=request.user,
        )
        rows = question_import.prepare(assessment, request, items, None)
        valid = [row for row in rows if not row["errors"]]
        if len(valid) < min_valid:
            raise AutoAssessmentError(
                "Soal yang terbentuk kurang lengkap. Periksa isian konsep lalu coba lagi."
            )
        question_import.save(valid, None)
        material.required_assessment = assessment
        material.save(update_fields=["required_assessment"])
    return assessment, len(rows) - len(valid)


def generate_from_concepts(material, request):
    pairs = parse_concepts(material.concepts)
    return create_check_assessment(material, request, build_questions(pairs, seed=material.id))
