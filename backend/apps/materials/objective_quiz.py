"""Kuis kecil per capaian materi.

Capaian yang punya kuis tidak bisa dicentang sendiri oleh siswa: capaian itu tercentang otomatis
setelah semua soal kuisnya dijawab benar (boleh dicoba berulang). Bentuk soalnya sama dengan
sub-soal checkpoint video interaktif (pilihan ganda, isian, tarik & lepas, menjodohkan), jadi
pemeriksaan rancangan, pengacakan pilihan, dan penilaiannya memakai apps/assessments/interactive.py.

Rancangan satu soal (dari guru / file JSON):
    {"kind": "choice", "text": "...", "choices": [...], "correct_choice": 1, "explanation": "..."}
    {"kind": "fill_blank", "text": "...", "template": "Hasil 7 % 3 adalah [[1]]."}
    {"kind": "drag_drop", "text": "...", "template": "... [[Input]] ...", "distractors": ["If"]}
    {"kind": "matching", "text": "...", "pairs": [{"left": "Input", "right": "..."}], "distractors": [...]}
"""

from types import SimpleNamespace

from rest_framework.exceptions import ValidationError

from apps.assessments import interactive

MAX_QUESTIONS = 5
KINDS = interactive.CHECKPOINT_KINDS


def build_quiz(items):
    """Periksa rancangan soal satu capaian. Mengembalikan {"spec", "content", "key"}."""
    if not isinstance(items, list) or not 1 <= len(items) <= MAX_QUESTIONS:
        raise ValidationError({"quizzes": f"Setiap capaian berisi 1 sampai {MAX_QUESTIONS} soal."})
    spec, content, key = [], [], {}
    for number, item in enumerate(items, start=1):
        if not isinstance(item, dict) or item.get("kind") not in KINDS:
            raise ValidationError(
                {"quizzes": f"Soal nomor {number}: jenis harus choice, fill_blank, drag_drop, atau matching."}
            )
        kind = item["kind"]
        text = str(item.get("text", "")).strip()[:2000]
        explanation = str(item.get("explanation", "")).strip()[:2000]
        if not text and kind in ("choice", "matching"):
            raise ValidationError({"quizzes": f"Soal nomor {number}: tulis pertanyaannya."})
        try:
            sub_spec, sub_content, sub_key = interactive.checkpoint_part("BUILDERS", kind)(item)
        except ValidationError as error:
            detail = error.detail.get("spec") if isinstance(error.detail, dict) else error.detail
            message = detail[0] if isinstance(detail, list) else detail
            raise ValidationError({"quizzes": f"Soal nomor {number}: {message}"})
        question_id = interactive.new_id()
        spec.append({"kind": kind, "text": text, "explanation": explanation, **sub_spec})
        content.append({"id": question_id, "kind": kind, "text": text, **sub_content})
        key[question_id] = {**sub_key, "explanation": explanation}
    return {"spec": spec, "content": content, "key": key}


def set_quizzes(material, quizzes):
    """quizzes: {indeks capaian (angka/teks): [rancangan soal]}; daftar kosong = hapus kuis capaian itu.
    Kuis capaian lain tidak berubah. Kuis milik capaian yang sudah dihapus ikut dibuang."""
    if not isinstance(quizzes, dict):
        raise ValidationError({"quizzes": "Format kuis tidak valid."})
    current = {text: quiz for text, quiz in material.objective_quizzes.items() if text in material.objectives}
    for raw_index, items in quizzes.items():
        index = int(raw_index) if str(raw_index).isdigit() else -1
        if not 0 <= index < len(material.objectives):
            raise ValidationError({"quizzes": f"Capaian nomor {raw_index} tidak ada di materi ini."})
        objective = material.objectives[index]
        if items:
            current[objective] = build_quiz(items)
        else:
            current.pop(objective, None)
    material.objective_quizzes = current
    material.save(update_fields=["objective_quizzes"])


def quiz_for(material, index):
    """Kuis capaian nomor `index` (mulai 0), atau None."""
    if not 0 <= index < len(material.objectives):
        return None
    return material.objective_quizzes.get(material.objectives[index])


def quiz_counts(material):
    """Jumlah soal kuis per capaian (urut capaian; 0 = capaian dicentang sendiri)."""
    return [
        len((material.objective_quizzes.get(text) or {}).get("content", [])) for text in material.objectives
    ]


def student_items(quiz, seed):
    """Soal tanpa kunci; pilihan tarik & lepas dan pasangan menjodohkan diacak per percobaan."""
    owner = SimpleNamespace(id="kuis")
    items = []
    for item in quiz["content"]:
        builder = interactive.STUDENT_CONTENT.get(item["kind"])
        items.append({**item, **builder(owner, item, f"{seed}-{item['id']}", {})} if builder else dict(item))
    return items


def grade(quiz, answers):
    """answers: {id soal: jawaban}. Mengembalikan {"passed", "results": {id: {correct, detail}}}.
    Pembahasan hanya dikirim setelah lulus, agar percobaan berikutnya tidak sekadar menyalin."""
    if not isinstance(answers, dict):
        raise ValidationError({"answers": "Format jawaban tidak valid."})
    results = {}
    for item in quiz["content"]:
        key = quiz["key"][item["id"]]
        try:
            response = interactive.clean_checkpoint(item, answers.get(item["id"]))
        except interactive.InvalidResponse:
            raise ValidationError({"answers": "Format jawaban tidak valid."})
        _, detail = interactive.grade_checkpoint({**item, "points": 1}, key, response, "all_or_nothing")
        results[item["id"]] = {"correct": interactive.all_correct(detail), "detail": detail}
    passed = all(result["correct"] for result in results.values())
    if passed:
        for item in quiz["content"]:
            results[item["id"]]["explanation"] = quiz["key"][item["id"]].get("explanation", "")
    return {"passed": passed, "results": results}
