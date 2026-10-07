"""Nilai akhir asesmen satu siswa: tuntas, remedial, atau belum tuntas.

- Nilai dihitung dalam skala 100: nilai / nilai maksimal x 100. KKM juga skala 100.
- Pengerjaan utama >= KKM -> Tuntas; nilai akhir = nilai pengerjaan utama.
- Di bawah KKM -> boleh remedial (mengerjakan ulang soal yang sama) jika guru memberi kesempatan
  dan tenggat remedial belum lewat. Lulus remedial -> nilai akhir = KKM (dibatasi KKM, nilai asli
  tetap terlihat guru).
- Kesempatan habis / tenggat lewat dan tetap di bawah KKM -> Belum Tuntas; nilai akhir = nilai terbaik.
- Selama ada esai yang belum dinilai -> menunggu penilaian guru (remedial belum bisa dimulai).
- Tanpa KKM -> hanya nilai, tanpa status tuntas/remedial.
"""

from django.utils import timezone

NONE = "none"  # belum mengumpulkan
PENDING = "pending"  # menunggu guru menilai esai
GRADED = "graded"  # sudah dinilai, asesmen tanpa KKM
PASSED = "passed"  # tuntas
REMEDIAL = "remedial"  # belum tuntas, masih ada kesempatan remedial
FAILED = "failed"  # belum tuntas, kesempatan habis


def percentage(score, max_score):
    if score is None or not max_score:
        return None
    return round(float(score) / max_score * 100, 2)


def max_score_of(assessment):
    """Jumlah poin semua soal. Memakai hasil annotate (daftar asesmen) atau soal yang sudah diambil."""
    annotated = getattr(assessment, "max_score", None)
    if annotated is not None:
        return annotated
    return sum(question.points for question in assessment.questions.all())


def final_result(assessment, attempts, max_score, now=None):
    """`attempts` = semua pengerjaan SATU siswa di asesmen ini (urutan bebas)."""
    now = now or timezone.now()
    submitted = sorted((a for a in attempts if a.submitted_at), key=lambda a: a.number)
    kkm = assessment.passing_score
    result = {
        "status": NONE,
        "passing_score": kkm,
        "final_score": None,
        "first_score": None,
        "best_score": None,
        "attempt_count": len(submitted),
        "remedial_used": max(len(submitted) - 1, 0),
        "remedial_left": 0,
        "remedial_due_at": None,
        "passed_by_remedial": False,
    }
    if not submitted:
        return result
    if any(a.score is None for a in submitted):
        return {**result, "status": PENDING}

    scores = [percentage(a.score, max_score) for a in submitted]
    first, best = scores[0], max(scores)
    result.update(first_score=first, best_score=best)
    if kkm is None:
        return {**result, "status": GRADED, "final_score": first}
    if first >= kkm:
        return {**result, "status": PASSED, "final_score": first}
    if best >= kkm:
        return {**result, "status": PASSED, "final_score": float(kkm), "passed_by_remedial": True}

    left = max(assessment.remedial_attempts - result["remedial_used"], 0)
    if left and now <= assessment.last_due_at:
        return {
            **result,
            "status": REMEDIAL,
            "final_score": best,
            "remedial_left": left,
            "remedial_due_at": assessment.last_due_at,
        }
    return {**result, "status": FAILED, "final_score": best}
