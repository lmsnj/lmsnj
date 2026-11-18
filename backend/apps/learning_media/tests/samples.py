"""Contoh isi media untuk test: dua stasiun, semua jenis latihan bawaan."""

import copy

STEPS = [
    {"id": "intro", "kind": "dialog", "lines": [{"speaker": "mascot", "text": "Halo, aku Bita!"}]},
    {"id": "teori", "kind": "text", "body": "Algoritma = langkah yang **jelas** dan berurutan."},
    {
        "id": "pg",
        "kind": "choice",
        "text": "Langkah berurutan untuk menyelesaikan masalah disebut ...",
        "choices": [
            {"text": "algoritma"},
            {"text": "variabel", "why": "Variabel adalah tempat menyimpan nilai."},
            {"text": "konsol"},
        ],
        "correct": 0,
        "explanation": "Itulah arti algoritma.",
        "hints": ["Ingat resep teh.", "Kata itu diawali huruf a."],
    },
    {"id": "bs", "kind": "true_false", "text": "Komputer bisa menebak maksud kita.", "answer": False,
     "why_true": "Komputer hanya mengikuti langkah."},  # fmt: skip
    {
        "id": "urut",
        "kind": "ordering",
        "items": ["Rebus air", "Masukkan teh", "Tuang air"],
        "why": "Air dulu.",
    },
    {
        "id": "wadah",
        "kind": "categorize",
        "categories": ["Baik", "Kurang baik"],
        "items": [
            {"text": "Langkah jelas", "category": 0},
            {"text": "Garam secukupnya", "category": 1, "why": "Secukupnya tidak pasti."},
        ],
    },
    {"id": "isian", "kind": "fill_blank", "template": "Hasil 7 % 3 adalah [[1]]."},
    {"id": "jodoh", "kind": "matching", "text": "Pasangkan.",
     "pairs": [{"left": "Input", "right": "Membaca"}, {"left": "Output", "right": "Menampilkan"}]},  # fmt: skip
    {"id": "seret", "kind": "drag_drop", "template": "Simbol [[Input]] miring.", "distractors": ["If"]},
    {
        "id": "ketuk",
        "kind": "hotspot",
        "text": "Ketuk tombol Run.",
        "image": "https://example.com/layar.png",
        "areas": [
            {"x": 0, "y": 0, "w": 10, "h": 10, "label": "Run", "correct": True},
            {"x": 50, "y": 50, "w": 10, "h": 10, "label": "Console", "why": "Itu Console."},
        ],
    },
]

MEDIA = {
    "schema_version": 1,
    "mascot": {"name": "Bita"},
    "glossary": [{"term": "Algoritma", "meaning": "Langkah yang jelas dan berurutan."}],
    "parts": [
        {
            "id": "p1",
            "title": "Dasar",
            "stations": [
                {
                    "id": "s1",
                    "title": "Apa Itu Algoritma?",
                    "objectives": ["Menjelaskan arti algoritma"],
                    "minutes": 10,
                    "steps": STEPS,
                    "summary": ["Algoritma = langkah berurutan", "Harus jelas", "Harus berhenti"],
                    "reflection": "Apa yang paling kamu pahami?",
                    "badge": {"title": "Juru Resep", "icon": "chef-hat"},
                    "remedial": [{"id": "s1-ulang", "kind": "text", "body": "Penjelasan lain."}],
                },
                {
                    "id": "s2",
                    "title": "Flowchart",
                    "steps": [
                        {"id": "s2-pg", "kind": "choice", "text": "Bentuk Input?",
                         "choices": [{"text": "Jajaran genjang"}, {"text": "Oval"}], "correct": 0},  # fmt: skip
                    ],
                },
            ],
        }
    ],
}


def media():
    return copy.deepcopy(MEDIA)


def correct_response(step):
    """Jawaban benar untuk langkah versi siswa (dicari lewat teks, karena id pilihan acak)."""
    kind = step["kind"]
    if kind == "choice":
        source = next(s for s in all_steps() if s["id"] == step["id"])
        right = source["choices"][source["correct"]]["text"]
        return {"choice": next(c["id"] for c in step["choices"] if c["text"] == right)}
    if kind == "true_false":
        return {"answer": False}
    if kind == "ordering":
        source = next(s for s in all_steps() if s["id"] == step["id"])
        by_text = {item["text"]: item["id"] for item in step["items"]}
        return {"order": [by_text[t] for t in source["items"]]}
    if kind == "categorize":
        source = next(s for s in all_steps() if s["id"] == step["id"])
        labels = {c["label"]: c["id"] for c in step["categories"]}
        names = {i["text"]: i["id"] for i in step["items"]}
        return {
            "items": {names[i["text"]]: labels[source["categories"][i["category"]]] for i in source["items"]}
        }
    if kind == "fill_blank":
        return {"gaps": ["1"]}
    if kind == "matching":
        right = {r["text"]: r["id"] for r in step["right"]}
        left = {item["text"]: item["id"] for item in step["left"]}
        return {"pairs": {left["Input"]: right["Membaca"], left["Output"]: right["Menampilkan"]}}
    if kind == "drag_drop":
        return {"gaps": [next(o["id"] for o in step["options"] if o["text"] == "Input")]}
    if kind == "hotspot":
        return {"area": next(a["id"] for a in step["areas"] if a["label"] == "Run")}
    raise AssertionError(kind)


def wrong_response(step):
    kind = step["kind"]
    if kind == "choice":
        good = correct_response(step)["choice"]
        return {"choice": next(c["id"] for c in step["choices"] if c["id"] != good)}
    if kind == "true_false":
        return {"answer": True}
    if kind == "ordering":
        return {"order": list(reversed(correct_response(step)["order"]))}
    if kind == "hotspot":
        return {"area": next(a["id"] for a in step["areas"] if a["label"] == "Console")}
    if kind == "fill_blank":
        return {"gaps": ["2"]}
    raise AssertionError(kind)


def all_steps():
    for part in MEDIA["parts"]:
        for station in part["stations"]:
            yield from station["steps"]
