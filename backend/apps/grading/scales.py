"""Aturan skala nilai (fungsi murni, ada test-nya; frontend utils/grading.js memakai rumus yang SAMA).

Skala diambil dari pengaturan nilai.skala:
- "0-100"    : angka 0-100, maks. 2 desimal; nilai skala 100 = angka itu
- "0-4"      : angka 0-4, maks. 2 desimal; nilai skala 100 = angka x 25
- "predikat" : huruf dari pengaturan nilai.predikat; nilai skala 100 = nilai tengah rentangnya
               (batas bawah + batas bawah predikat di atasnya) // 2, predikat teratas sampai 100.
               Bawaan A>=90, B>=80, C>=75, D>=0 -> A 95, B 85, C 77, D 37.
"""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

SCALES = ("0-100", "0-4", "predikat")
TWO_PLACES = Decimal("0.01")


class ScaleError(ValueError):
    """Isian tidak sesuai skala; pesannya ditampilkan ke guru."""


def predicate_scores(bands):
    """{label: nilai skala 100} dari rentang predikat [{label, min}] (urut dari tertinggi)."""
    scores = {}
    upper = 100
    for band in bands:
        scores[band["label"]] = Decimal((band["min"] + upper) // 2)
        upper = band["min"]
    return scores


def _number(raw, low, high):
    text = str(raw).strip().replace(",", ".")  # koma desimal (kebiasaan Indonesia) diterima
    try:
        number = Decimal(text)
    except InvalidOperation:
        raise ScaleError("Isi dengan angka.") from None
    if not number.is_finite() or not low <= number <= high:
        raise ScaleError(f"Isi angka {low}–{high}.")
    if number != number.quantize(TWO_PLACES):
        raise ScaleError("Maksimal 2 angka di belakang koma.")
    return number.normalize()


def clean_value(scale, raw, bands=None):
    """(value, score): isian yang dirapikan + nilai skala 100, atau ScaleError."""
    if scale == "0-100":
        number = _number(raw, 0, 100)
        return _text(number), number.quantize(TWO_PLACES)
    if scale == "0-4":
        number = _number(raw, 0, 4)
        return _text(number), (number * 25).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    if scale == "predikat":
        text = str(raw).strip().upper()
        scores = predicate_scores(bands or [])
        # Huruf besar/kecil tidak dibedakan; yang disimpan = label persis dari pengaturan.
        label = next((name for name in scores if name.upper() == text), None)
        if label is None:
            raise ScaleError(f"Pilih salah satu: {', '.join(scores)}.")
        return label, scores[label].quantize(TWO_PLACES)
    raise ScaleError("Skala nilai tidak dikenal.")


def _text(number):
    # Decimal("85") -> "85", Decimal("3.5") -> "3.5" (tanpa notasi ilmiah seperti "1E+2").
    return format(number, "f")
