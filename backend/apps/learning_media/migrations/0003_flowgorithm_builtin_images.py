"""Pasang gambar bawaan (/mpi/flowgorithm/) ke media "Petualangan Flowgorithm" yang sudah terlanjur diimpor.

Media yang diimpor sebelum gambar bawaan ada belum punya alamat gambar, sehingga kartu "Lemari buah" dan
kartu layar Flowgorithm tampil tanpa gambar. Migrasi ini mengisi draf DAN versi terbit (siswa memakai versi
terbit) tanpa perlu impor ulang. Hanya kolom gambar yang masih KOSONG yang diisi, jadi gambar yang sudah diganti
guru tidak tertimpa dan migrasi aman diulang. Pemetaan sama dengan docs/mpi/gambar_flowgorithm.py.
"""

from django.db import migrations

BASE = "/mpi/flowgorithm/"
# Sisi depan kartu -> file gambar (teks kartu ini hanya ada di media Petualangan Flowgorithm).
CARD_IMAGES = {
    "Toolbar": "toolbar.svg",
    "Jendela Flowchart": "jendela-flowchart.svg",
    "Console": "console.svg",
    "Variable Watch": "variable-watch.svg",
    **{f"buah[{i}]": f"laci-{i}.svg" for i in range(5)},
}
# Potongan teks soal/dialog -> file gambar.
STEP_IMAGES = {
    "Pernah membuat teh": "teh.svg",
    "Simbol bertuliskan **Main**": "simbol-main.svg",
    "Simbol bertuliskan **Input nama**": "simbol-input.svg",
    "Simbol bertuliskan **Output nama**": "simbol-output.svg",
    "Simbol bertuliskan **umur > 12**": "simbol-if.svg",
    "Simbol hijau ini": "simbol-output.svg",
}


def _step_text(step):
    if step.get("kind") == "dialog":
        return " ".join(line.get("text", "") for line in step.get("lines", []) if isinstance(line, dict))
    return step.get("text") or step.get("body") or ""


def _is_flowgorithm(media):
    """Kenali media lewat kartu "buah[0]" di samping maskot Bita, agar media lain tidak tersentuh."""
    if not isinstance(media, dict) or (media.get("mascot") or {}).get("name") != "Bita":
        return False
    for part in media.get("parts", []):
        for station in part.get("stations", []):
            for step in station.get("steps", []):
                if any(card.get("front") == "buah[0]" for card in step.get("cards", []) or []):
                    return True
    return False


def fill_images(media):
    """Isi gambar yang kosong (di tempat). Mengembalikan True jika ada yang berubah."""
    if not _is_flowgorithm(media):
        return False
    changed = False
    mascot = media["mascot"]
    if not mascot.get("image"):
        mascot["image"] = BASE + "bita.svg"
        changed = True
    for part in media.get("parts", []):
        for station in part.get("stations", []):
            for list_name in ("steps", "remedial", "challenge"):
                for step in station.get(list_name, []) or []:
                    for card in step.get("cards", []) or []:
                        name = CARD_IMAGES.get(card.get("front"))
                        if name and not card.get("image"):
                            card["image"] = BASE + name
                            changed = True
                    if "image" in step and not step["image"]:
                        text = _step_text(step)
                        for fragment, name in STEP_IMAGES.items():
                            if fragment in text:
                                step["image"] = BASE + name
                                changed = True
                                break
    return changed


def forwards(apps, schema_editor):
    InteractiveMedia = apps.get_model("learning_media", "InteractiveMedia")
    InteractiveMediaVersion = apps.get_model("learning_media", "InteractiveMediaVersion")
    for media in InteractiveMedia.objects.all():
        if fill_images(media.draft):
            media.save(update_fields=["draft"])
    for version in InteractiveMediaVersion.objects.all():
        changed = [name for name in ("source", "content") if fill_images(getattr(version, name))]
        if changed:
            version.save(update_fields=changed)


class Migration(migrations.Migration):
    dependencies = [("learning_media", "0002_media_asset")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
