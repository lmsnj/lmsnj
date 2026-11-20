"""Pasang gambar bawaan (frontend/public/mpi/flowgorithm/) ke isi media Petualangan Flowgorithm.

Dipanggil oleh buat_petualangan_flowgorithm.py, atau langsung untuk memperbarui JSON yang sudah ada:
    python docs/mpi/gambar_flowgorithm.py
Gambar bawaan dirujuk dengan alamat /mpi/... sehingga ikut tersaji di semua subdomain sekolah tanpa diunggah.
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = "/mpi/flowgorithm/"

# Kartu: (id stasiun, sisi depan) -> file gambar
CARD_IMAGES = {
    ("st04", "Toolbar"): "toolbar.svg",
    ("st04", "Jendela Flowchart"): "jendela-flowchart.svg",
    ("st04", "Console"): "console.svg",
    ("st04", "Variable Watch"): "variable-watch.svg",
    **{("st08", f"buah[{i}]"): f"laci-{i}.svg" for i in range(5)},
}
# Soal/dialog: (id stasiun, potongan teks) -> file gambar
STEP_IMAGES = {
    ("st01", "Pernah membuat teh"): "teh.svg",
    ("st03", "Simbol bertuliskan **Main**"): "simbol-main.svg",
    ("st03", "Simbol bertuliskan **Input nama**"): "simbol-input.svg",
    ("st03", "Simbol bertuliskan **Output nama**"): "simbol-output.svg",
    ("st03", "Simbol bertuliskan **umur > 12**"): "simbol-if.svg",
    ("st05", "Simbol hijau ini"): "simbol-output.svg",
}


def _step_text(step):
    if step.get("kind") == "dialog":
        return " ".join(line.get("text", "") for line in step.get("lines", []))
    return step.get("text") or step.get("body") or ""


def pasang_gambar(media):
    """Isi kolom gambar (di tempat) dan kembalikan jumlah gambar yang dipasang."""
    count = 0
    media.setdefault("mascot", {})["image"] = BASE + "bita.svg"
    for part in media["parts"]:
        for station in part["stations"]:
            for list_name in ("steps", "remedial", "challenge"):
                for step in station.get(list_name, []):
                    for card in step.get("cards", []):
                        name = CARD_IMAGES.get((station["id"], card.get("front")))
                        card["image"] = BASE + name if name else card.get("image", "")
                        count += bool(name)
                    for (station_id, fragment), name in STEP_IMAGES.items():
                        if station["id"] == station_id and fragment in _step_text(step):
                            step["image"] = BASE + name
                            count += 1
    return count


if __name__ == "__main__":
    path = HERE / "petualangan-flowgorithm.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    total = pasang_gambar(payload["media"])
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"OK: {total} gambar dipasang (+ maskot).")
