"""Bentuk program Flowgorithm (JSON) dan bagian kosong {{}}.

Program yang dikirim siswa/guru diperiksa bentuk & ukurannya sebelum dijalankan, agar penilaian di server
tidak bisa dibebani program raksasa. Urutan bagian kosong HARUS sama dengan `blanks.js` di frontend.
"""

from .interpreter import NAME_RE, RESERVED, TYPES

BLANK = "{{}}"
MAX_NODES = 300
MAX_DEPTH = 12
MAX_FUNCS = 10
MAX_PARAMS = 8
MAX_TEXT = 500
MAX_NAMES = 20
MAX_ARRAY = 1000
# Field teks per jenis blok (urutan ini = urutan bagian kosong) dan daftar blok anaknya.
FIELDS = {
    "decl": (),
    "assign": ("target", "expr"),
    "input": ("target",),
    "output": ("expr",),
    "if": ("cond",),
    "while": ("cond",),
    "for": ("v", "from", "to", "step"),
    "do": ("cond",),
    "call": ("expr",),
    "cm": ("text",),
}
CHILDREN = {"if": ("yes", "no"), "while": ("body",), "for": ("body",), "do": ("body",)}


class ProgramError(ValueError):
    pass


def _text(value, name):
    if value is None:
        value = ""
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ProgramError(f"{name} harus berupa teks.")
    value = str(value)
    if len(value) > MAX_TEXT:
        raise ProgramError(f"{name} maksimal {MAX_TEXT} karakter.")
    return value


def _nodes(raw, counter, depth, where):
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise ProgramError(f"{where}: daftar blok tidak valid.")
    if depth > MAX_DEPTH:
        raise ProgramError(f"Blok bersarang terlalu dalam (maks. {MAX_DEPTH} tingkat).")
    result = []
    for node in raw:
        counter[0] += 1
        if counter[0] > MAX_NODES:
            raise ProgramError(f"Program maksimal {MAX_NODES} blok.")
        if not isinstance(node, dict) or node.get("t") not in FIELDS:
            raise ProgramError(f"{where}: ada blok yang tidak dikenal.")
        kind = node["t"]
        clean = {"t": kind}
        if isinstance(node.get("id"), str) and 0 < len(node["id"]) <= 40:
            clean["id"] = node["id"]
        for field in FIELDS[kind]:
            clean[field] = _text(node.get(field), f"Blok {kind} ({field})")
        if kind == "decl":
            if node.get("type") not in TYPES:
                raise ProgramError("Tipe Declare harus Integer, Real, String, atau Boolean.")
            names = node.get("names")
            if not isinstance(names, list) or not 1 <= len(names) <= MAX_NAMES:
                raise ProgramError(f"Declare berisi 1 sampai {MAX_NAMES} nama variabel.")
            size = node.get("size") or 0
            if isinstance(size, str) and size.strip().isdigit():
                size = int(size)
            if isinstance(size, bool) or not isinstance(size, int) or not 0 <= size <= MAX_ARRAY:
                raise ProgramError(f"Jumlah laci array harus 0 sampai {MAX_ARRAY}.")
            clean.update(type=node["type"], names=[_text(n, "Nama variabel")[:40] for n in names])
            if size:
                clean["size"] = size
        for child in CHILDREN.get(kind, ()):
            clean[child] = _nodes(node.get(child), counter, depth + 1, where)
        result.append(clean)
    return result


def clean_program(raw, allow_blanks=False, where="Program"):
    """Periksa & rapikan program. Raise ProgramError (pesan untuk guru/siswa)."""
    if not isinstance(raw, dict):
        raise ProgramError(f"{where} tidak valid.")
    counter = [0]
    program = {"body": _nodes(raw.get("body"), counter, 1, where)}
    funcs = raw.get("funcs") or {}
    if not isinstance(funcs, dict) or len(funcs) > MAX_FUNCS:
        raise ProgramError(f"Maksimal {MAX_FUNCS} fungsi.")
    if funcs:
        program["funcs"] = {}
    for name, fn in funcs.items():
        if not NAME_RE.match(str(name)) or str(name).lower() in RESERVED or not isinstance(fn, dict):
            raise ProgramError(f'Nama fungsi "{name}" tidak boleh.')
        params = fn.get("params") or []
        if not isinstance(params, list) or len(params) > MAX_PARAMS:
            raise ProgramError(f"Fungsi {name}: maksimal {MAX_PARAMS} parameter.")
        clean_params = []
        for param in params:
            if (
                not isinstance(param, (list, tuple))
                or len(param) != 2
                or not NAME_RE.match(str(param[0]))
                or param[1] not in TYPES
            ):
                raise ProgramError(f"Fungsi {name}: parameter harus [nama, tipe].")
            clean_params.append([str(param[0]), param[1]])
        type_ = fn.get("type") or ""
        if type_ not in ("", "None", *TYPES):
            raise ProgramError(f"Fungsi {name}: tipe hasil tidak dikenal.")
        program["funcs"][str(name)] = {
            "params": clean_params,
            "type": "" if type_ == "None" else type_,
            "body": _nodes(fn.get("body"), counter, 1, f"Fungsi {name}"),
            "ret": _text(fn.get("ret"), f"Fungsi {name} (return)"),
        }
    if not allow_blanks and count_blanks(program):
        raise ProgramError(f"{where} masih berisi bagian kosong {BLANK}.")
    return program


def _walk_fields(program):
    """(kontainer, field) untuk setiap field teks, dalam urutan tetap."""

    def walk(nodes):
        for node in nodes:
            for field in FIELDS[node["t"]]:
                yield node, field
            for child in CHILDREN.get(node["t"], ()):
                yield from walk(node.get(child) or [])

    yield from walk(program.get("body") or [])
    for fn in (program.get("funcs") or {}).values():
        yield from walk(fn.get("body") or [])
        yield fn, "ret"


def count_blanks(program):
    return sum(str(container.get(field) or "").count(BLANK) for container, field in _walk_fields(program))


def fill_blanks(program, answers):
    """Salinan program dengan setiap {{}} diganti jawaban berurutan."""
    import copy

    filled = copy.deepcopy(program)
    queue = list(answers)
    for container, field in _walk_fields(filled):
        pieces = str(container.get(field) or "").split(BLANK)
        value = pieces[0]
        for piece in pieces[1:]:
            value += (str(queue.pop(0)) if queue else "") + piece
        if field in container:
            container[field] = value
    return filled


def node_count(program):
    count = 0

    def walk(nodes):
        nonlocal count
        for node in nodes:
            if node["t"] != "cm":
                count += 1
            for child in CHILDREN.get(node["t"], ()):
                walk(node.get(child) or [])

    walk(program.get("body") or [])
    for fn in (program.get("funcs") or {}).values():
        walk(fn.get("body") or [])
    return count
