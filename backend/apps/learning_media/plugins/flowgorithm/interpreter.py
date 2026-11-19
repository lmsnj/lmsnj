"""Interpreter dialek Flowgorithm (penilaian di server, tanpa eval).

KEMBARAN dari frontend/src/mpi/plugins/flowgorithm/interpreter.js: aturan, batas, urutan hitungan langkah,
dan pesan kesalahan harus sama persis (siswa mencoba di browser, nilai dihitung di sini). Keduanya diuji
dengan berkas kasus yang sama: conformance.json di folder ini.

Semua angka disimpan sebagai float (seperti Number di JavaScript) agar hasil hitungan identik.
"""

import math
import re
import time
from decimal import Decimal

LIMITS = {"steps": 20000, "output": 500, "text": 10000, "array": 1000, "depth": 50}
TYPES = ("Integer", "Real", "String", "Boolean")
RESERVED = ("integer", "real", "string", "boolean", "and", "or", "not", "mod", "true", "false", "pi")
NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9]*$")
TARGET_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9]*)\s*(?:\[(.+)\])?\s*$")
NUMBER_RE = re.compile(r"[0-9]+(\.[0-9]+)?")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9]*")
INT_TEXT = re.compile(r"^-?[0-9]+$")
REAL_TEXT = re.compile(r"^-?[0-9]+(\.[0-9]+)?$")
COMPARE = ("==", "!=", "<", ">", "<=", ">=")
# Batas waktu satu kali menjalankan program di server (pengaman tambahan selain batas langkah).
TIME_LIMIT = 2.0


class FlowError(Exception):
    @property
    def message(self):
        return str(self.args[0])


# ---------------------------------------------------------------- nilai


def is_number(value):
    return isinstance(value, float) and not isinstance(value, bool)


def type_of(value):
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, float):
        return "number"
    return "string"


def js_length(text):
    """Panjang teks seperti JavaScript (satuan UTF-16)."""
    return len(text.encode("utf-16-le")) // 2


def js_number(value):
    """Angka -> teks persis seperti String(angka) di JavaScript."""
    if math.isnan(value):
        return "NaN"
    if math.isinf(value):
        return "Infinity" if value > 0 else "-Infinity"
    if value == 0:
        return "0"
    if value.is_integer() and abs(value) < 1e21:
        return str(int(value))
    if abs(value) >= 1e21 or abs(value) < 1e-6:
        return re.sub(r"e([+-])0*(\d)", r"e\1\2", repr(value))
    return format(Decimal(repr(value)), "f")


def format_value(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return js_number(value)
        return js_number(float(format(value, ".12g")))
    return str(value)


def trunc(value):
    return float(math.trunc(value)) if math.isfinite(value) else value


def check_text(text):
    if js_length(text) > LIMITS["text"]:
        raise FlowError(f"Teks terlalu panjang (maks. {LIMITS['text']} karakter).")
    return text


# ---------------------------------------------------------------- ekspresi


def tokenize(src):
    tokens, i = [], 0
    while i < len(src):
        c = src[i]
        if c.isspace():
            i += 1
            continue
        if c == '"':
            j = src.find('"', i + 1)
            if j < 0:
                raise FlowError("Tanda kutip ganda belum ditutup.")
            tokens.append(("str", src[i + 1 : j]))
            i = j + 1
            continue
        match = NUMBER_RE.match(src, i)
        if match:
            tokens.append(("num", float(match.group(0))))
            i = match.end()
            continue
        match = WORD_RE.match(src, i)
        if match:
            word = match.group(0)
            lower = word.lower()
            if lower in ("and", "or", "not", "mod"):
                tokens.append(("op", lower))
            elif lower in ("true", "false"):
                tokens.append(("bool", lower == "true"))
            elif lower == "pi":
                tokens.append(("num", math.pi))
            else:
                tokens.append(("id", word))
            i = match.end()
            continue
        two = src[i : i + 2]
        if two in ("==", "!=", "<=", ">="):
            tokens.append(("op", two))
            i += 2
            continue
        if c in "+-*/%^&<>()[],":
            tokens.append(("op", c))
            i += 1
            continue
        if c == "=":
            raise FlowError("Untuk membandingkan, pakai == (dua sama dengan).")
        if c == "_":
            raise FlowError("Garis bawah (_) tidak boleh dipakai di Flowgorithm.")
        raise FlowError(f"Ada karakter yang tidak dikenal: {c}")
    return tokens


class _Parser:
    def __init__(self, src):
        self.tokens = tokenize(src)
        self.p = 0

    def peek(self):
        return self.tokens[self.p] if self.p < len(self.tokens) else None

    def is_op(self, value):
        token = self.peek()
        return token is not None and token[0] == "op" and token[1] == value

    def take(self, value):
        if not self.is_op(value):
            raise FlowError(f'Seharusnya ada "{value}" di sini.')
        self.p += 1

    def parse(self):
        if not self.tokens:
            raise FlowError("Isian masih kosong.")
        result = self.or_e()
        if self.p < len(self.tokens):
            raise FlowError(f'Ada bagian ekspresi yang tidak dipahami: "{_show_token(self.tokens[self.p])}".')
        return result

    def or_e(self):
        left = self.and_e()
        while self.is_op("or"):
            self.p += 1
            left = ("bin", "or", left, self.and_e())
        return left

    def and_e(self):
        left = self.not_e()
        while self.is_op("and"):
            self.p += 1
            left = ("bin", "and", left, self.not_e())
        return left

    def not_e(self):
        if self.is_op("not"):
            self.p += 1
            return ("un", "not", self.not_e())
        return self.cmp_e()

    def cmp_e(self):
        left = self.cat_e()
        while (token := self.peek()) is not None and token[0] == "op" and token[1] in COMPARE:
            self.p += 1
            left = ("bin", token[1], left, self.cat_e())
        return left

    def cat_e(self):
        left = self.add_e()
        while self.is_op("&"):
            self.p += 1
            left = ("bin", "&", left, self.add_e())
        return left

    def add_e(self):
        left = self.mul_e()
        while self.is_op("+") or self.is_op("-"):
            op = self.tokens[self.p][1]
            self.p += 1
            left = ("bin", op, left, self.mul_e())
        return left

    def mul_e(self):
        left = self.un_e()
        while self.is_op("*") or self.is_op("/") or self.is_op("%") or self.is_op("mod"):
            op = self.tokens[self.p][1]
            self.p += 1
            left = ("bin", "%" if op == "mod" else op, left, self.un_e())
        return left

    def un_e(self):
        if self.is_op("-"):
            self.p += 1
            return ("un", "-", self.un_e())
        return self.pow_e()

    def pow_e(self):
        left = self.post()
        if self.is_op("^"):
            self.p += 1
            return ("bin", "^", left, self.un_e())
        return left

    def post(self):
        token = self.peek()
        if token is None:
            raise FlowError("Ekspresi belum lengkap.")
        self.p += 1
        kind, value = token
        if kind in ("num", "str", "bool"):
            return ("lit", value)
        if kind == "op" and value == "(":
            expr = self.or_e()
            self.take(")")
            return expr
        if kind == "id":
            if self.is_op("("):
                self.p += 1
                args = []
                if not self.is_op(")"):
                    args.append(self.or_e())
                    while self.is_op(","):
                        self.p += 1
                        args.append(self.or_e())
                self.take(")")
                return ("call", value, args)
            if self.is_op("["):
                self.p += 1
                index = self.or_e()
                self.take("]")
                return ("idx", value, index)
            return ("var", value)
        raise FlowError(f'Ekspresi tidak bisa dibaca di dekat "{_show_token(token)}".')


def _show_token(token):
    kind, value = token
    if kind == "num":
        return js_number(value)
    if kind == "bool":
        return "true" if value else "false"
    return value


def parse_expr(src):
    return _Parser(str(src if src is not None else "")).parse()


# ---------------------------------------------------------------- menjalankan


class Run:
    def __init__(self, program, deadline=None):
        self.funcs = {str(name).lower(): fn for name, fn in ((program or {}).get("funcs") or {}).items()}
        self.count = 0
        self.depth = 0
        self.out = []
        self.cache = {}
        self.deadline = deadline

    def parsed(self, src):
        key = str(src if src is not None else "")
        if key not in self.cache:
            self.cache[key] = parse_expr(key)
        return self.cache[key]

    def tick(self):
        if self.count > LIMITS["steps"]:
            raise FlowError(
                "Program tidak berhenti sendiri (loop tak berhenti). Cek perubahan nilai di dalam perulangan."
            )
        self.count += 1
        if self.deadline is not None and self.count % 500 == 0 and time.monotonic() > self.deadline:
            raise FlowError("Program terlalu lama dijalankan.")

    def emit(self, text):
        if len(self.out) >= LIMITS["output"]:
            raise FlowError(f"Output terlalu banyak (maks. {LIMITS['output']} baris).")
        self.out.append(text)


def lookup(scope, name):
    variable = scope.get(name.lower())
    if variable is None:
        raise FlowError(f'Variabel "{name}" belum dibuat. Buat dulu dengan Declare.')
    return variable


def array_index(variable, name, raw):
    if not is_number(raw) or raw != math.floor(raw):
        raise FlowError("Nomor laci harus bilangan bulat.")
    if raw < 0 or raw >= len(variable["val"]):
        raise FlowError(
            f"Laci nomor {format_value(raw)} tidak ada. Indeks {name} hanya 0 sampai {len(variable['val']) - 1}."
        )
    return int(raw)


def coerce(type_, value, name):
    if type_ == "Integer":
        if not is_number(value):
            raise FlowError(f"Variabel {name} bertipe Integer, hanya bisa diisi bilangan.")
        return trunc(value)
    if type_ == "Real":
        if not is_number(value):
            raise FlowError(f"Variabel {name} bertipe Real, hanya bisa diisi bilangan.")
        return value
    if type_ == "String":
        if not isinstance(value, str):
            raise FlowError(f"Variabel {name} bertipe String, hanya bisa diisi teks (pakai tanda kutip).")
        return value
    if not isinstance(value, bool):
        raise FlowError(f"Variabel {name} bertipe Boolean, hanya bisa diisi true atau false.")
    return value


def default_value(type_):
    if type_ in ("Integer", "Real"):
        return 0.0
    return "" if type_ == "String" else False


def typed_input(type_, raw, name):
    text = str(raw if raw is not None else "").strip()
    if type_ == "Integer":
        if not INT_TEXT.match(text):
            raise FlowError(f"Isian untuk {name} harus bilangan bulat.")
        return float(text)
    if type_ == "Real":
        if not REAL_TEXT.match(text):
            raise FlowError(f"Isian untuk {name} harus bilangan.")
        return float(text)
    if type_ == "Boolean":
        if text.lower() not in ("true", "false"):
            raise FlowError(f"Isian untuk {name} harus true atau false.")
        return text.lower() == "true"
    return check_text(text)


def _need_number(value, name):
    if not is_number(value):
        raise FlowError(f"{name} hanya untuk angka.")


def _sqrt(value):
    _need_number(value, "Sqrt")
    if value < 0:
        raise FlowError("Akar dari bilangan negatif tidak bisa dihitung.")
    return math.sqrt(value)


def _len(value):
    if not isinstance(value, str):
        raise FlowError("Len hanya untuk teks.")
    return float(js_length(value))


def _to_integer(value):
    text = (format_value(value) if is_number(value) else str(value)).strip()
    if not INT_TEXT.match(text):
        raise FlowError(f'"{text}" tidak bisa diubah menjadi Integer.')
    return float(text)


def _to_real(value):
    text = (format_value(value) if is_number(value) else str(value)).strip()
    if not REAL_TEXT.match(text):
        raise FlowError(f'"{text}" tidak bisa diubah menjadi Real.')
    return float(text)


def _abs(value):
    _need_number(value, "Abs")
    return abs(value)


def _int(value):
    _need_number(value, "Int")
    return trunc(value)


BUILTINS = {
    "abs": _abs,
    "int": _int,
    "sqrt": _sqrt,
    "len": _len,
    "tostring": lambda value: check_text(format_value(value)),
    "tointeger": _to_integer,
    "toreal": _to_real,
}


def _power(left, right):
    try:
        return math.pow(left, right)
    except OverflowError:
        odd = right.is_integer() and math.fmod(right, 2) != 0
        return -math.inf if left < 0 and odd else math.inf
    except ValueError:
        return math.inf if left == 0 else math.nan


def evaluate(ast, scope, run):
    kind = ast[0]
    if kind == "lit":
        return ast[1]
    if kind == "var":
        variable = lookup(scope, ast[1])
        if variable.get("arr"):
            raise FlowError(f'"{ast[1]}" adalah array. Tulis nomor lacinya, contoh {ast[1]}[0].')
        return variable["val"]
    if kind == "idx":
        variable = lookup(scope, ast[1])
        if not variable.get("arr"):
            raise FlowError(f'"{ast[1]}" bukan array.')
        return variable["val"][array_index(variable, ast[1], evaluate(ast[2], scope, run))]
    if kind == "call":
        value = call_function(ast, scope, run)
        if value is None:
            raise FlowError(f"Fungsi {ast[1]} tidak mengembalikan nilai.")
        return value
    if kind == "un":
        value = evaluate(ast[2], scope, run)
        if ast[1] == "not":
            if not isinstance(value, bool):
                raise FlowError("not hanya untuk nilai true atau false.")
            return not value
        if not is_number(value):
            raise FlowError("Tanda minus hanya untuk angka.")
        return -value
    if kind == "bin":
        return binary(ast, scope, run)
    raise FlowError("Ekspresi tidak bisa dihitung.")


def binary(ast, scope, run):
    _, op, left_ast, right_ast = ast
    if op in ("and", "or"):
        left = evaluate(left_ast, scope, run)
        if not isinstance(left, bool):
            raise FlowError(f"{op} hanya untuk nilai true atau false.")
        if op == "and" and not left:
            return False
        if op == "or" and left:
            return True
        right = evaluate(right_ast, scope, run)
        if not isinstance(right, bool):
            raise FlowError(f"{op} hanya untuk nilai true atau false.")
        return right
    left = evaluate(left_ast, scope, run)
    right = evaluate(right_ast, scope, run)
    if op == "&":
        return check_text(format_value(left) + format_value(right))
    if op in COMPARE:
        if type_of(left) != type_of(right):
            raise FlowError("Tidak bisa membandingkan angka dengan teks.")
        return {
            "==": lambda: left == right,
            "!=": lambda: left != right,
            "<": lambda: left < right,
            ">": lambda: left > right,
            "<=": lambda: left <= right,
            ">=": lambda: left >= right,
        }[op]()
    if not is_number(left) or not is_number(right):
        raise FlowError(f"Operator {op} hanya untuk angka. Untuk menggabungkan teks pakai &.")
    if op == "+":
        return left + right
    if op == "-":
        return left - right
    if op == "*":
        return left * right
    if op in ("/", "%"):
        if right == 0:
            raise FlowError("Tidak bisa dibagi nol.")
        return left / right if op == "/" else math.fmod(left, right)
    return _power(left, right)


def call_function(ast, scope, run):
    _, name, arg_asts = ast
    fn = run.funcs.get(name.lower())
    if fn is None:
        builtin = BUILTINS.get(name.lower())
        if builtin is None:
            raise FlowError(f'Fungsi "{name}" tidak ditemukan.')
        if len(arg_asts) != 1:
            raise FlowError(f"Fungsi {name} butuh 1 argumen.")
        return builtin(evaluate(arg_asts[0], scope, run))
    params = fn.get("params") or []
    args = [evaluate(arg, scope, run) for arg in arg_asts]
    if len(args) != len(params):
        raise FlowError(f"Fungsi {name} butuh {len(params)} argumen.")
    if run.depth >= LIMITS["depth"]:
        raise FlowError("Fungsi memanggil dirinya terlalu dalam (rekursi tak berhenti).")
    local = {}
    for (param, type_), value in zip(params, args):
        local[param.lower()] = {"type": type_, "val": coerce(type_, value, param), "name": param}
    # Kedalaman dihitung sampai nilai return selesai dihitung (return boleh memanggil fungsi lagi).
    run.depth += 1
    try:
        execute(fn.get("body") or [], local, run, None, quiet=True)
        if not str(fn.get("ret") or "").strip():
            return None
        value = evaluate(run.parsed(fn["ret"]), local, run)
        return coerce(fn["type"], value, name) if fn.get("type") in TYPES else value
    finally:
        run.depth -= 1


def assign_target(target, value, scope, run):
    match = TARGET_RE.match(str(target if target is not None else ""))
    if not match:
        raise FlowError("Bagian kiri tanda = harus nama variabel.")
    name, index_src = match.group(1), match.group(2)
    variable = lookup(scope, name)
    if index_src is not None:
        if not variable.get("arr"):
            raise FlowError(f'"{name}" bukan array.')
        index = array_index(variable, name, evaluate(run.parsed(index_src), scope, run))
        variable["val"][index] = coerce(variable["type"], value, name)
    else:
        if variable.get("arr"):
            raise FlowError(f'"{name}" adalah array. Tulis nomor lacinya, contoh {name}[0].')
        variable["val"] = coerce(variable["type"], value, name)


def condition(run, src, scope, label):
    value = evaluate(run.parsed(src), scope, run)
    if not isinstance(value, bool):
        raise FlowError(f"Syarat {label} harus bernilai true atau false.")
    return value


def declare(node, scope):
    type_ = node.get("type")
    if type_ not in TYPES:
        raise FlowError(f'Tipe "{type_}" tidak dikenal.')
    size = node.get("size") or 0
    if isinstance(size, str) and size.strip().isdigit():
        size = int(size)
    if size and (not isinstance(size, int) or isinstance(size, bool) or not 1 <= size <= LIMITS["array"]):
        raise FlowError(f"Jumlah laci array harus 1 sampai {LIMITS['array']}.")
    for raw in node.get("names") or []:
        name = str(raw).strip()
        if not name:
            continue
        if not NAME_RE.match(name):
            raise FlowError(
                f'Nama variabel "{name}" tidak boleh: harus diawali huruf, tanpa spasi dan garis bawah.'
            )
        lower = name.lower()
        if lower in RESERVED:
            raise FlowError(f'"{name}" adalah kata yang sudah dipakai Flowgorithm.')
        if lower in scope:
            raise FlowError(f'Variabel "{name}" sudah dibuat.')
        if size:
            scope[lower] = {
                "type": type_,
                "val": [default_value(type_) for _ in range(size)],
                "arr": True,
                "name": name,
            }
        else:
            scope[lower] = {"type": type_, "val": default_value(type_), "name": name}


def execute(nodes, scope, run, inputs, quiet=False):
    """Jalankan daftar blok. `inputs` = antrean isian (list, diambil dari depan)."""
    for node in nodes:
        run.tick()
        kind = node.get("t")
        if kind == "cm":
            continue
        if kind == "decl":
            declare(node, scope)
        elif kind == "assign":
            assign_target(node.get("target"), evaluate(run.parsed(node.get("expr")), scope, run), scope, run)
        elif kind == "input":
            match = TARGET_RE.match(str(node.get("target") or ""))
            if not match:
                raise FlowError("Input harus menyebut nama variabel.")
            variable = lookup(scope, match.group(1))
            if quiet:
                raise FlowError("Input tidak bisa dipakai di dalam fungsi.")
            if not inputs:
                raise FlowError("Program meminta isian, tetapi tidak ada isian tersedia.")
            raw = inputs.pop(0)
            assign_target(node["target"], typed_input(variable["type"], raw, match.group(1)), scope, run)
        elif kind == "output":
            run.emit(format_value(evaluate(run.parsed(node.get("expr")), scope, run)))
        elif kind == "call":
            ast = run.parsed(node.get("expr"))
            if ast[0] != "call":
                raise FlowError('Blok Call harus berisi pemanggilan fungsi, contoh sapa("Ani").')
            call_function(ast, scope, run)
        elif kind == "if":
            branch = node.get("yes") if condition(run, node.get("cond"), scope, "If") else node.get("no")
            execute(branch or [], scope, run, inputs, quiet)
        elif kind == "while":
            while condition(run, node.get("cond"), scope, "While"):
                execute(node.get("body") or [], scope, run, inputs, quiet)
                run.tick()
        elif kind == "do":
            while True:
                execute(node.get("body") or [], scope, run, inputs, quiet)
                if not condition(run, node.get("cond"), scope, "Do While"):
                    break
                run.tick()
        elif kind == "for":
            for_loop(node, scope, run, inputs, quiet)
        else:
            raise FlowError(f'Blok "{kind}" tidak dikenal.')


def for_loop(node, scope, run, inputs, quiet):
    variable = lookup(scope, str(node.get("v") or "").strip() or "?")
    start = evaluate(run.parsed(node.get("from")), scope, run)
    end = evaluate(run.parsed(node.get("to")), scope, run)
    has_step = node.get("step") is not None and str(node.get("step")).strip() != ""
    step = evaluate(run.parsed(node["step"]), scope, run) if has_step else 1.0
    if not is_number(start) or not is_number(end) or not is_number(step):
        raise FlowError("Nilai awal, akhir, dan langkah For harus angka.")
    if step == 0:
        raise FlowError("Langkah (Step) tidak boleh 0.")
    if variable.get("arr"):
        raise FlowError(f'"{variable["name"]}" adalah array, tidak bisa dipakai di For.')
    variable["val"] = coerce(variable["type"], start, variable["name"])
    while variable["val"] <= end if step > 0 else variable["val"] >= end:
        execute(node.get("body") or [], scope, run, inputs, quiet)
        variable["val"] = coerce(variable["type"], variable["val"] + step, variable["name"])
        run.tick()


def run_program(program, inputs=(), time_limit=TIME_LIMIT):
    """Jalankan sampai selesai. -> {"out": [baris], "error": pesan atau ""}."""
    run = Run(program, deadline=time.monotonic() + time_limit if time_limit else None)
    try:
        execute((program or {}).get("body") or [], {}, run, [str(i) for i in inputs])
    except FlowError as error:
        return {"out": run.out, "error": error.message}
    except RecursionError:
        return {"out": run.out, "error": "Fungsi memanggil dirinya terlalu dalam (rekursi tak berhenti)."}
    return {"out": run.out, "error": ""}


# ---------------------------------------------------------------- pemeriksaan uji


def normalize_line(text):
    return " ".join(str(text).split()).lower()


def output_matches(out, expected, compare="tail"):
    want = [normalize_line(line) for line in expected]
    if compare != "exact" and len(out) < len(want):
        return False
    got = [normalize_line(line) for line in (out if compare == "exact" else out[len(out) - len(want) :])]
    return got == want


def check_tests(program, tests, compare="tail"):
    results = []
    for test in tests:
        result = run_program(program, test.get("inputs") or [])
        ok = not result["error"] and output_matches(result["out"], test.get("expected") or [], compare)
        results.append({"ok": ok, "out": result["out"], "error": result["error"]})
    return results
