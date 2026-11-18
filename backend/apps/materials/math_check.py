"""Praktik Matematika: soal berangka acak per siswa, jawaban diperiksa di SERVER dengan sympy.

Berbeda dengan Praktik kode (diperiksa di browser), kunci jawaban matematika TIDAK pernah dikirim ke siswa:
siswa hanya menerima teks soal yang angkanya sudah diisi, lalu mengirim jawabannya ke server.

Keamanan: jawaban siswa TIDAK dibaca dengan parse_expr/sympify (keduanya memakai eval). Teks dibaca
pembaca rumus kecil di bawah (hanya angka, huruf, + - * / ^ ( ) | dan fungsi yang diizinkan), dengan batas
panjang & besar pangkat agar server tidak bisa dibuat macet.

Bentuk soal (CodeExercise.language = "math"):
- variables: {"a": {"min": 1, "max": 10, "step": 1}} - angka acak per siswa (huruf tunggal).
- checks: [{"question": "Hitung $[a] + [b]$", "answer": "a + b", "tolerance": ""}] - [a] di teks soal diganti
  angkanya; `answer` = rumus jawaban memakai nama variabel (boleh memuat huruf lain, mis. x, untuk jawaban
  aljabar); `tolerance` = selisih yang masih dianggap benar (mis. 0.01 untuk jawaban dibulatkan).
"""

import random
import re
from decimal import Decimal, InvalidOperation

import sympy
from rest_framework.exceptions import ValidationError

MAX_LENGTH = 150
MAX_ITEMS = 10
MAX_VARIABLES = 8
MAX_EXPONENT = 1000
MAX_DIGITS = 15
SAMPLE_POINTS = 6
FUNCTIONS = {
    "sqrt": sympy.sqrt,
    "akar": sympy.sqrt,
    "sin": sympy.sin,
    "cos": sympy.cos,
    "tan": sympy.tan,
    "log": lambda value: sympy.log(value, 10),  # log di sekolah = basis 10
    "ln": sympy.log,
    "abs": sympy.Abs,
}
CONSTANTS = {"pi": sympy.pi, "e": sympy.E}
# Penulisan yang sering muncul dari HP/editor rumus (MathLive ascii-math: (1)/(2), 2 * 3, 6 -: 3,
# root(3)(8)) -> bentuk yang dibaca pembaca rumus.
REPLACEMENTS = [
    ("×", "*"), ("·", "*"), ("⋅", "*"), ("÷", "/"), ("−", "-"), ("–", "-"), ("√", "sqrt"),
    ("π", "pi"), ("²", "^2"), ("³", "^3"), ("**", "^"), ("-:", "/"), (" xx ", "*"), ("\\cdot", "*"), ("\\times", "*"),
]  # fmt: skip
TOKEN = re.compile(r"\s*(?:(\d+(?:[.,]\d+)?)|([A-Za-z]+)|(.))")
PLACEHOLDER = re.compile(r"\[([a-z])\]")


class MathError(ValueError):
    """Jawaban/rumus tidak bisa dibaca. Pesannya ditampilkan ke pengguna."""


# ---------------------------------------------------------------- pembaca rumus


def tokenize(text):
    text = str(text or "").strip()
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if not text:
        raise MathError("Jawaban masih kosong.")
    if len(text) > MAX_LENGTH:
        raise MathError(f"Jawaban terlalu panjang (maks. {MAX_LENGTH} karakter).")
    tokens = []
    for number, name, symbol in TOKEN.findall(text):
        if number:
            if len(number.replace(",", "").replace(".", "")) > MAX_DIGITS:
                raise MathError("Angka terlalu panjang.")
            tokens.append(("num", number.replace(",", ".")))
        elif name:
            tokens.append(("name", name.lower()))
        elif symbol.strip():
            if symbol not in "+-*/^()|":
                raise MathError(f"Tanda “{symbol}” tidak dikenali.")
            tokens.append(("op", symbol))
    return tokens


class Parser:
    """Pembaca rumus sederhana (recursive descent). Urutan: + - < * / (dan perkalian tanpa tanda,
    mis. 2x) < tanda minus di depan < pangkat ^ (dari kanan; -2^2 = -4)."""

    def __init__(self, tokens):
        self.tokens = tokens
        self.position = 0
        self.depth = 0

    def peek(self):
        return self.tokens[self.position] if self.position < len(self.tokens) else (None, None)

    def take(self, value=None):
        kind, token = self.peek()
        if kind is None or (value is not None and token != value):
            raise MathError(
                "Penulisan rumus belum lengkap."
                if kind is None
                else f"Ada “{token}” yang tidak pada tempatnya."
            )
        self.position += 1
        return kind, token

    def parse(self):
        result = self.expression()
        if self.position != len(self.tokens):
            raise MathError(f"Ada “{self.peek()[1]}” yang tidak pada tempatnya.")
        return result

    def expression(self):
        self.depth += 1
        if self.depth > 40:
            raise MathError("Rumus terlalu bertingkat.")
        result = self.term()
        while self.peek() in (("op", "+"), ("op", "-")):
            _, op = self.take()
            right = self.term()
            result = result + right if op == "+" else result - right
        self.depth -= 1
        return result

    def starts_atom(self):
        kind, token = self.peek()
        return kind in ("num", "name") or token == "("

    def term(self):
        result = self.unary()
        while True:
            kind, token = self.peek()
            if token in ("*", "/"):
                self.take()
                right = self.unary()
                if token == "/":
                    if right == 0:
                        raise MathError("Ada pembagian dengan nol.")
                    result = result / right
                else:
                    result = result * right
            elif self.starts_atom():  # perkalian tanpa tanda: 2x, 3(a+b), x y
                result = result * self.unary()
            else:
                return result

    def unary(self):
        if self.peek() in (("op", "-"), ("op", "+")):
            _, op = self.take()
            value = self.unary()
            return -value if op == "-" else value
        return self.power()

    def power(self):
        base = self.atom()
        if self.peek() == ("op", "^"):
            self.take()
            exponent = self.unary()
            if exponent.is_number and abs(sympy.N(exponent)) > MAX_EXPONENT:
                raise MathError(f"Pangkat terlalu besar (maks. {MAX_EXPONENT}).")
            if exponent.free_symbols and base.free_symbols:
                raise MathError("Pangkat berupa huruf tidak didukung.")
            return base**exponent
        return base

    def atom(self):
        kind, token = self.take()
        if kind == "num":
            return sympy.Rational(token)
        if token == "(":
            value = self.expression()
            self.take(")")
            return value
        if token == "|":
            value = self.expression()
            self.take("|")
            return sympy.Abs(value)
        if kind == "name":
            if token == "root":  # akar pangkat n dari editor rumus: root(n)(x)
                self.take("(")
                degree = self.expression()
                self.take(")")
                self.take("(")
                value = self.expression()
                self.take(")")
                if degree == 0:
                    raise MathError("Akar pangkat nol tidak terdefinisi.")
                return sympy.root(value, degree)
            if token in FUNCTIONS:
                if self.peek() == ("op", "("):
                    self.take("(")
                    value = self.expression()
                    self.take(")")
                else:  # sqrt 2, sin x
                    value = self.power()
                return FUNCTIONS[token](value)
            if token in CONSTANTS:
                return CONSTANTS[token]
            # Huruf beruntun tanpa tanda = perkalian: ab = a*b.
            result = sympy.Integer(1)
            for letter in token:
                result *= sympy.Symbol(letter)
            return result
        raise MathError(f"Ada “{token}” yang tidak pada tempatnya.")


def parse_math(text, values=None):
    """Teks rumus -> ekspresi sympy. `values` = {nama variabel: angka} untuk mengganti variabel soal."""
    expression = Parser(tokenize(text)).parse()
    if values:
        expression = expression.subs({sympy.Symbol(name): value for name, value in values.items()})
    return expression


# ---------------------------------------------------------------- angka acak per siswa


def _number(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def variable_choices(spec):
    """Semua angka yang mungkin untuk satu variabel (min..max dengan langkah step)."""
    low, high, step = _number(spec["min"]), _number(spec["max"]), _number(spec.get("step") or 1)
    count = int((high - low) / step) + 1
    return [low + step * index for index in range(count)]


def values_for(exercise, user):
    """Angka soal untuk satu pengguna: selalu sama untuk pengguna & soal yang sama (dibuka ulang tetap)."""
    rng = random.Random(f"{exercise.id}-{user.id}")
    return {
        name: sympy.Rational(str(rng.choice(variable_choices(spec))))
        for name, spec in sorted((exercise.variables or {}).items())
    }


def show_number(value):
    """Angka untuk teks soal: 2,5 (koma desimal), -3, 1/3 ditulis desimal secukupnya."""
    if value == int(value):
        return str(int(value))
    text = f"{float(value):.6f}".rstrip("0").rstrip(".")
    return text.replace(".", ",")


def render_question(text, values):
    return PLACEHOLDER.sub(
        lambda m: show_number(values[m.group(1)]) if m.group(1) in values else m.group(0), text
    )


def questions_for(exercise, user):
    values = values_for(exercise, user)
    return [{"question": render_question(item["question"], values)} for item in exercise.checks]


# ---------------------------------------------------------------- memeriksa jawaban


def _finite(value):
    return value.is_finite is not False and not value.has(sympy.zoo, sympy.nan, sympy.oo, -sympy.oo)


def same_value(student, expected, tolerance=0):
    """Apakah dua ekspresi bernilai sama. Tanpa huruf: dibandingkan angkanya (boleh selisih `tolerance`).
    Dengan huruf (jawaban aljabar): dicoba di beberapa titik acak, lalu disederhanakan bila perlu."""
    symbols = sorted(expected.free_symbols | student.free_symbols, key=str)
    tolerance = float(tolerance or 0)
    if not symbols:
        a, b = complex(sympy.N(student)), complex(sympy.N(expected))
        return abs(a - b) <= max(tolerance, 1e-9 * max(1.0, abs(b)))
    rng = random.Random(42)
    checked = 0
    for _ in range(SAMPLE_POINTS * 3):
        point = {s: sympy.Rational(rng.randint(-50, 50), rng.randint(1, 7)) for s in symbols}
        a, b = student.subs(point), expected.subs(point)
        if not (_finite(a) and _finite(b)):
            continue
        a, b = complex(sympy.N(a)), complex(sympy.N(b))
        if abs(a - b) > max(tolerance, 1e-7 * max(1.0, abs(b))):
            return False
        checked += 1
        if checked >= SAMPLE_POINTS:
            return True
    return sympy.simplify(student - expected) == 0


def check_answer(item, answer, values):
    """Periksa satu jawaban siswa. Mengembalikan {"ok": bool, "message": teks untuk siswa}."""
    try:
        student = parse_math(answer)
    except MathError as error:
        return {"ok": False, "message": str(error)}
    expected = parse_math(item["answer"], values)
    extra = student.free_symbols - expected.free_symbols
    if extra:
        letters = ", ".join(sorted(str(s) for s in extra))
        return {"ok": False, "message": f"Jawaban memuat huruf yang tidak diharapkan: {letters}."}
    try:
        ok = same_value(student, expected, item.get("tolerance") or 0)
    except (TypeError, ValueError, ArithmeticError):
        return {"ok": False, "message": "Jawaban tidak bisa dihitung."}
    return {"ok": ok, "message": "" if ok else "Belum tepat. Periksa lagi perhitunganmu."}


def check_answers(exercise, user, answers):
    values = values_for(exercise, user)
    answers = list(answers or [])
    return [
        check_answer(item, answers[index] if index < len(answers) else "", values)
        for index, item in enumerate(exercise.checks)
    ]


# ---------------------------------------------------------------- validasi soal guru


def clean_variables(variables):
    if variables in (None, ""):
        return {}
    if not isinstance(variables, dict):
        raise ValidationError("Format variabel tidak valid.")
    if len(variables) > MAX_VARIABLES:
        raise ValidationError(f"Maksimal {MAX_VARIABLES} variabel.")
    cleaned = {}
    for name, spec in variables.items():
        if not re.fullmatch(r"[a-z]", str(name)) or name == "e":
            raise ValidationError(f"Nama variabel “{name}” harus satu huruf kecil (selain e).")
        if not isinstance(spec, dict):
            raise ValidationError(f"Variabel {name} tidak valid.")
        low, high = _number(spec.get("min")), _number(spec.get("max"))
        step = _number(spec.get("step") or 1)
        if low is None or high is None or step is None:
            raise ValidationError(f"Variabel {name}: isi angka terkecil, terbesar, dan langkah.")
        if step <= 0 or low > high:
            raise ValidationError(f"Variabel {name}: terkecil harus ≤ terbesar dan langkah > 0.")
        if (high - low) / step > 10_000:
            raise ValidationError(f"Variabel {name}: terlalu banyak kemungkinan angka (perbesar langkah).")
        cleaned[name] = {"min": float(low) if low % 1 else int(low), "max": float(high) if high % 1 else int(high),
                         "step": float(step) if step % 1 else int(step)}  # fmt: skip
    return cleaned


def clean_math_items(items, variables):
    """Periksa soal guru: teks soal ada, rumus jawaban bisa dibaca & bernilai untuk angka acak."""
    if not isinstance(items, list) or not items:
        raise ValidationError("Tambahkan minimal satu soal.")
    if len(items) > MAX_ITEMS:
        raise ValidationError(f"Maksimal {MAX_ITEMS} soal per latihan matematika.")
    samples = [
        {
            name: sympy.Rational(str(random.Random(seed).choice(variable_choices(spec))))
            for name, spec in variables.items()
        }
        for seed in range(5)
    ]
    cleaned = []
    for number, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ValidationError(f"Soal {number} tidak valid.")
        question = str(item.get("question") or "").strip()
        answer = str(item.get("answer") or "").strip()
        tolerance = str(item.get("tolerance") or "").strip().replace(",", ".")
        if not question:
            raise ValidationError(f"Soal {number}: tulis pertanyaannya.")
        if len(question) > 5000:
            raise ValidationError(f"Soal {number}: pertanyaan terlalu panjang.")
        unknown = set(PLACEHOLDER.findall(question)) - set(variables)
        if unknown:
            raise ValidationError(f"Soal {number}: [{sorted(unknown)[0]}] belum dibuat di daftar variabel.")
        if tolerance and (_number(tolerance) is None or _number(tolerance) < 0):
            raise ValidationError(f"Soal {number}: toleransi harus angka ≥ 0.")
        try:
            for values in samples:
                expected = parse_math(answer, values)
                if not expected.free_symbols and not _finite(sympy.N(expected)):
                    raise MathError(
                        "Rumus jawaban tidak bernilai (mis. pembagian dengan nol) untuk angka acak."
                    )
        except MathError as error:
            raise ValidationError(f"Soal {number}: rumus jawaban — {error}")
        cleaned.append({"question": question, "answer": answer, "tolerance": tolerance})
    return cleaned
