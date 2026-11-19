"""Baca file Flowgorithm asli (.fprg, XML) menjadi program MPI.

Flowgorithm asli lebih longgar: `=` boleh untuk membandingkan, `<>`, `&&`, `||`, `!`. Dialek MPI sengaja
lebih ketat (mengajarkan `==`), jadi ekspresi diterjemahkan saat impor.
"""

import re
import xml.etree.ElementTree as ET

from .interpreter import TYPES
from .programs import ProgramError, clean_program

MAX_BYTES = 1_000_000
STRING_RE = re.compile(r'("[^"]*")')


class FprgError(ValueError):
    pass


def convert_expression(expr):
    """Sintaks Flowgorithm asli -> dialek MPI (bagian dalam tanda kutip tidak diubah)."""
    parts = STRING_RE.split(str(expr or ""))
    for index in range(0, len(parts), 2):
        code = parts[index]
        code = code.replace("<>", "!=").replace("&&", " and ").replace("||", " or ")
        code = re.sub(r"!(?!=)", " not ", code)
        code = re.sub(r"(?<![=!<>])=(?!=)", "==", code)
        parts[index] = code
    return re.sub(r"[ \t]{2,}", " ", "".join(parts)).strip()


def _type(value):
    for type_ in TYPES:
        if str(value or "").lower() == type_.lower():
            return type_
    return None


def _block(element, warnings):
    tag = element.tag.lower()
    get = element.get
    if tag == "declare":
        type_ = _type(get("type"))
        if type_ is None:
            raise FprgError(f"Tipe '{get('type')}' belum didukung.")
        node = {
            "t": "decl",
            "type": type_,
            "names": [n.strip() for n in (get("name") or "").split(",") if n.strip()],
        }
        if (get("array") or "").lower() == "true":
            size = (get("size") or "").strip()
            if not size.isdigit():
                raise FprgError(f"Ukuran array {get('name')} harus angka (bukan '{size}').")
            node["size"] = int(size)
        return node
    if tag == "assign":
        return {"t": "assign", "target": get("variable") or "", "expr": convert_expression(get("expression"))}
    if tag == "input":
        return {"t": "input", "target": get("variable") or ""}
    if tag == "output":
        if (get("newline") or "true").lower() == "false":
            warnings.append("Output tanpa baris baru (newline) dianggap satu baris.")
        return {"t": "output", "expr": convert_expression(get("expression"))}
    if tag == "if":
        yes = element.find("then")
        no = element.find("else")
        return {
            "t": "if",
            "cond": convert_expression(get("expression")),
            "yes": _blocks(yes if yes is not None else [], warnings),
            "no": _blocks(no if no is not None else [], warnings),
        }
    if tag == "while":
        return {
            "t": "while",
            "cond": convert_expression(get("expression")),
            "body": _blocks(element, warnings),
        }
    if tag == "do":
        return {"t": "do", "cond": convert_expression(get("expression")), "body": _blocks(element, warnings)}
    if tag == "for":
        step = convert_expression(get("step") or "1")
        if (get("direction") or "inc").lower() == "dec" and not step.startswith("-"):
            step = f"-{step}" if re.fullmatch(r"[0-9.]+", step) else f"-({step})"
        return {
            "t": "for",
            "v": get("variable") or "",
            "from": convert_expression(get("start")),
            "to": convert_expression(get("end")),
            "step": step,
            "body": _blocks(element, warnings),
        }
    if tag == "call":
        return {"t": "call", "expr": convert_expression(get("expression"))}
    if tag == "comment":
        return {"t": "cm", "text": get("text") or ""}
    warnings.append(f"Blok '{element.tag}' belum didukung dan dilewati.")
    return None


def _blocks(parent, warnings):
    nodes = []
    for child in list(parent):
        node = _block(child, warnings)
        if node is not None:
            nodes.append(node)
    return nodes


def parse_fprg(data):
    """bytes .fprg -> (program, peringatan). Raise FprgError dengan pesan berbahasa Indonesia."""
    if len(data) > MAX_BYTES:
        raise FprgError("File .fprg maksimal 1 MB.")
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise FprgError("File .fprg tidak valid.")
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        raise FprgError("File bukan .fprg Flowgorithm yang valid.")
    if root.tag.lower() != "flowgorithm":
        raise FprgError("File bukan .fprg Flowgorithm yang valid.")
    warnings, program = [], {"body": [], "funcs": {}}
    for function in root.findall("function"):
        body_element = function.find("body")
        body = _blocks(body_element if body_element is not None else [], warnings)
        name = function.get("name") or ""
        if name.lower() == "main":
            program["body"] = body
            continue
        params = []
        parameters = function.find("parameters")
        for param in parameters if parameters is not None else []:
            type_ = _type(param.get("type"))
            if type_ is None or (param.get("array") or "").lower() == "true":
                raise FprgError(f"Parameter fungsi {name} belum didukung (array atau tipe lain).")
            params.append([param.get("name") or "", type_])
        program["funcs"][name] = {
            "params": params,
            "type": _type(function.get("type")) or "",
            "body": body,
            "ret": function.get("variable") or "",
        }
    if not program["funcs"]:
        del program["funcs"]
    try:
        return clean_program(program, where="Program .fprg"), list(dict.fromkeys(warnings))
    except ProgramError as error:
        raise FprgError(str(error))
