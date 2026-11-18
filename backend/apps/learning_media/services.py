"""Aturan bermain media: kunci stasiun, jawaban, bintang, lencana, dan pengaturan per kelas.

Penilaian selalu di server memakai kunci versi media yang dipakai siswa (`InteractiveMediaVersion`).
Guru/admin dan Super Admin yang "masuk sebagai" siswa boleh mencoba semua langkah, tetapi tidak ada
yang disimpan (`save=False`).
"""

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from apps.assessments.models import Assessment, Attempt

from . import schema
from . import steps as step_kinds
from .models import (
    InteractiveMediaAttempt,
    InteractiveMediaBadge,
    InteractiveMediaProgress,
    InteractiveMediaReflection,
    InteractiveMediaVersion,
)

UNLOCK_RULES = ("sequential", "free")
DEFAULT_SETTINGS = {
    "unlock": "sequential",
    "leaderboard": True,
    "schedule": {},
    "pretest": None,
    "posttest": None,
}
MAX_VISIT_SECONDS = 30 * 60
REFLECTION_MIN, REFLECTION_MAX = 5, 2000
COMPLETE_BADGE = {"code": "media-complete", "title": "Penjelajah Tuntas", "icon": "trophy"}


# ---------------------------------------------------------------- pengaturan per kelas


def settings_of(material):
    """Pengaturan media di materi ini (None = pratinjau Studio: pengaturan bawaan)."""
    return {**DEFAULT_SETTINGS, **((material.media_settings if material else None) or {})}


def validate_settings(raw, assignment):
    """Pengaturan media di satu materi (= satu kelas). Tes Awal/Akhir = asesmen kelas-mapel yang sama."""
    if raw in (None, ""):
        raw = {}
    if not isinstance(raw, dict):
        raise ValidationError({"media_settings": "Pengaturan media tidak valid."})
    clean = dict(DEFAULT_SETTINGS)
    unlock = raw.get("unlock", "sequential")
    if unlock not in UNLOCK_RULES:
        raise ValidationError({"media_settings": "Aturan buka harus berurutan atau bebas."})
    clean["unlock"] = unlock
    clean["leaderboard"] = bool(raw.get("leaderboard", True))
    schedule = raw.get("schedule") or {}
    if not isinstance(schedule, dict):
        raise ValidationError({"media_settings": "Jadwal buka stasiun tidak valid."})
    clean["schedule"] = {}
    for station_id, value in schedule.items():
        moment = parse_datetime(str(value)) if value else None
        if value and moment is None:
            raise ValidationError({"media_settings": f"Tanggal buka stasiun '{station_id}' tidak valid."})
        if moment is not None:
            clean["schedule"][str(station_id)[:40]] = moment.isoformat()
    for field, label in (("pretest", "Tes Awal"), ("posttest", "Tes Akhir")):
        value = raw.get(field)
        if value in (None, ""):
            continue
        test = (
            Assessment.objects.filter(pk=value).select_related("teaching_assignment").first()
            if str(value).isdigit()
            else None
        )
        if (
            test is None
            or assignment is None
            or test.teaching_assignment.class_subject != assignment.class_subject
        ):
            raise ValidationError({"media_settings": f"{label} harus asesmen dari kelas-mapel yang sama."})
        clean[field] = test.id
    if clean["pretest"] and clean["pretest"] == clean["posttest"]:
        raise ValidationError({"media_settings": "Tes Awal dan Tes Akhir harus asesmen yang berbeda."})
    return clean


# ---------------------------------------------------------------- versi & ringkasan


def latest_versions(media_ids):
    """{id media: versi terbaru} dalam satu query."""
    result = {}
    for version in InteractiveMediaVersion.objects.filter(media_id__in=set(media_ids)).order_by(
        "media_id", "-number"
    ):
        result.setdefault(version.media_id, version)
    return result


def completed_stations(materials, student_ids):
    """{(id materi, id siswa): set id stasiun selesai} untuk materi bermedia."""
    result = {}
    rows = InteractiveMediaProgress.objects.filter(
        material__in=materials, student_id__in=student_ids, completed_at__isnull=False
    ).values_list("material_id", "student_id", "station_id")
    for material_id, student_id, station_id in rows:
        result.setdefault((material_id, student_id), set()).add(station_id)
    return result


# ---------------------------------------------------------------- keadaan stasiun


def _submitted(assessment_id, student):
    return Attempt.objects.filter(
        assessment_id=assessment_id, student=student, submitted_at__isnull=False
    ).exists()


def pretest_state(material, student):
    """{"id", "title", "done"} Tes Awal yang wajib dikerjakan sebelum stasiun pertama, atau None.
    Tes Awal yang belum terbit tidak mengunci (agar guru tidak lupa lalu siswa tertahan)."""
    test_id = settings_of(material)["pretest"]
    test = Assessment.objects.filter(pk=test_id, is_published=True).first() if test_id else None
    if test is None:
        return None
    return {"id": test.id, "title": test.title, "done": student is None or _submitted(test.id, student)}


def station_states(material, content, progress, pretest=None, preview=False, now=None):
    """{id stasiun: keadaan}. `progress` = {id stasiun: InteractiveMediaProgress}."""
    now = now or timezone.now()
    config = settings_of(material)
    states, done, previous = {}, set(), None
    for station in schema.iter_stations(content):
        mine = progress.get(station["id"])
        completed = bool(mine and mine.completed_at)
        locked_by = None
        if not preview and not completed:
            opens = config["schedule"].get(station["id"])
            missing = [p for p in station.get("prerequisites", []) if p not in done]
            if pretest and not pretest["done"]:
                locked_by = f"Kerjakan dulu “{pretest['title']}”."
            elif opens and parse_datetime(opens) > now:
                locked_by = f"Dibuka {timezone.localtime(parse_datetime(opens)):%d-%m-%Y %H:%M}."
            elif config["unlock"] == "sequential" and previous and previous["id"] not in done:
                locked_by = f"Selesaikan dulu “{previous['title']}”."
            elif missing:
                titles = [s["title"] for s in schema.iter_stations(content) if s["id"] in missing]
                locked_by = "Selesaikan dulu " + ", ".join(f"“{t}”" for t in titles) + "."
        states[station["id"]] = {
            "locked": locked_by is not None,
            "locked_by": locked_by,
            "completed": completed,
            "stars": mine.stars if mine else 0,
            "mistakes": mine.mistakes if mine else 0,
            "hints_used": mine.hints_used if mine else 0,
            "time_spent": mine.time_spent if mine else 0,
            "last_step_id": mine.last_step_id if mine else "",
            "run": mine.run if mine else {},
            "updated_at": mine.updated_at if mine else None,
        }
        if completed:
            done.add(station["id"])
        if not station.get("optional"):
            previous = station
    return states


def resume_point(content, states):
    """Stasiun & langkah untuk tombol "Lanjutkan dari terakhir"."""
    active = [
        (state["updated_at"], station_id)
        for station_id, state in states.items()
        if state["updated_at"] and not state["completed"] and not state["locked"]
    ]
    if active:
        station_id = max(active)[1]
        return {"station_id": station_id, "step_id": states[station_id]["last_step_id"]}
    for station in schema.iter_stations(content):
        state = states[station["id"]]
        if not state["completed"] and not state["locked"]:
            return {"station_id": station["id"], "step_id": ""}
    return None


# ---------------------------------------------------------------- bintang


def run_summary(station, run):
    """Jumlah salah/petunjuk/dibuka-jawaban pada latihan utama percobaan berjalan, dan apakah semua
    latihan utama sudah tuntas."""
    graded = [s["id"] for s in station["steps"] if s["graded"]]
    states = [run.get(step_id) or {} for step_id in graded]
    return {
        "graded": len(graded),
        "done": sum(1 for s in states if s.get("done")),
        "mistakes": sum(s.get("mistakes", 0) for s in states),
        "hints": sum(s.get("hints", 0) for s in states),
        "revealed": sum(1 for s in states if s.get("revealed")),
    }


def stars_for(summary):
    """3 bintang = tanpa salah & tanpa petunjuk. Setiap salah/petunjuk mengurangi, membuka jawaban
    dihitung dua kali. Minimal 1 bintang untuk yang menuntaskan (motivasi, bukan hukuman)."""
    penalty = summary["mistakes"] + summary["hints"] + 2 * summary["revealed"]
    if penalty == 0:
        return 3
    return 2 if penalty <= 2 else 1


def suggestion(station, stars, mistakes):
    """Jalur adaptif: tawarkan Belajar ulang jika kesulitan, Tantangan jika lancar."""
    if station.get("remedial") and (stars < 2 or mistakes >= 3):
        return "remedial"
    if station.get("challenge") and stars == 3:
        return "challenge"
    return None


# ---------------------------------------------------------------- aksi siswa


def _version(media, number):
    queryset = InteractiveMediaVersion.objects.filter(media=media)
    version = queryset.filter(number=number).first() if number else None
    return version or queryset.order_by("-number").first()


def _locate(version, station_id, step_id=None):
    station, list_name, step = schema.find_step(version.content, station_id, step_id or "")
    if station is None or (step_id and step is None):
        raise ValidationError(
            {"detail": "Langkah tidak ditemukan. Media mungkin sudah diperbarui; muat ulang halaman."}
        )
    return station, list_name, step


def _progress(material, student, station_id, lock=False):
    queryset = InteractiveMediaProgress.objects
    if lock:
        queryset = queryset.select_for_update()
    progress, _ = queryset.get_or_create(material=material, student=student, station_id=station_id)
    return progress


def _graded_step(step):
    if not step["graded"]:
        raise ValidationError({"detail": "Langkah ini bukan latihan."})
    return step_kinds.KINDS[step["kind"]]


def check_answer(version, station_id, step_id, response):
    """Nilai satu jawaban (murni terhadap versi). -> (stasiun, daftar, langkah, jawaban bersih, hasil)."""
    station, list_name, step = _locate(version, station_id, step_id)
    kind = _graded_step(step)
    key = version.keys[step_id]
    if not isinstance(response, dict):
        raise ValidationError({"response": "Format jawaban tidak valid."})
    try:
        clean = kind.clean(step, response)
    except (step_kinds.InvalidResponse, KeyError, TypeError):
        raise ValidationError({"response": "Format jawaban tidak valid."})
    correct, detail, feedback = kind.grade(step, key, clean)
    result = {"correct": correct, "detail": detail, "feedback": feedback}
    if correct:
        result["explanation"] = key.get("explanation", "")
        result["key"] = kind.key_display(step, key)
    return station, list_name, step, clean, result


def submit_answer(
    material, student, version, station_id, step_id, response, hint_level=0, client_uid="", save=True
):
    station, list_name, step, clean, result = check_answer(version, station_id, step_id, response)
    result["saved"] = save
    if not save:
        return result
    hint_level = max(0, min(int(hint_level or 0), len(step.get("hints", []))))
    client_uid = str(client_uid or "")[:40]
    with transaction.atomic():
        if (
            client_uid
            and InteractiveMediaAttempt.objects.filter(student=student, client_uid=client_uid).exists()
        ):
            return {**result, "duplicate": True}
        try:
            with transaction.atomic():
                InteractiveMediaAttempt.objects.create(
                    material=material,
                    student=student,
                    version=version,
                    station_id=station_id,
                    step_id=step_id,
                    kind=step["kind"],
                    response=clean,
                    answer_text=step_kinds.KINDS[step["kind"]].answer_text(step, clean)[:500],
                    correct=result["correct"],
                    hint_level=hint_level,
                    client_uid=client_uid,
                )
        except IntegrityError:
            return {**result, "duplicate": True}
        progress = _progress(material, student, station_id, lock=True)
        state = dict(progress.run.get(step_id) or {})
        if list_name == "steps" and not state.get("done"):
            state["hints"] = max(state.get("hints", 0), hint_level)
            if result["correct"]:
                state["done"] = True
            else:
                state["mistakes"] = state.get("mistakes", 0) + 1
                progress.total_mistakes += 1
            progress.run = {**progress.run, step_id: state}
            progress.hints_used = sum(s.get("hints", 0) for s in progress.run.values())
        progress.last_step_id = step_id
        progress.save()
    result["step_state"] = state
    return result


def reveal_answer(material, student, version, station_id, step_id, save=True):
    """Tombol "Tunjukkan jawaban": kunci + pembahasan. Langkah dianggap tuntas tetapi bintang berkurang;
    langkah yang sudah benar boleh dilihat lagi tanpa pengurangan."""
    station, list_name, step = _locate(version, station_id, step_id)
    kind = _graded_step(step)
    key = version.keys[step_id]
    result = {"key": kind.key_display(step, key), "explanation": key.get("explanation", ""), "saved": save}
    if save and list_name == "steps":
        with transaction.atomic():
            progress = _progress(material, student, station_id, lock=True)
            state = dict(progress.run.get(step_id) or {})
            if not state.get("done"):
                state.update(done=True, revealed=True, hints=len(step.get("hints", [])))
                progress.run = {**progress.run, step_id: state}
                progress.hints_used = sum(s.get("hints", 0) for s in progress.run.values())
                progress.last_step_id = step_id
                progress.save()
            result["step_state"] = state
    return result


def visit_station(material, student, station_id, step_id="", seconds=0):
    """Catat posisi terakhir & waktu belajar (untuk "Lanjutkan" dan laporan guru)."""
    progress = _progress(material, student, station_id)
    if step_id:
        progress.last_step_id = str(step_id)[:40]
    seconds = int(seconds or 0) if str(seconds or 0).isdigit() else 0
    progress.time_spent += min(seconds, MAX_VISIT_SECONDS)
    progress.save()
    return progress


def restart_station(material, student, station_id):
    """Ulangi stasiun (mis. mengejar 3 bintang). Bintang terbaik & status selesai tetap."""
    progress = _progress(material, student, station_id)
    progress.run = {}
    progress.last_step_id = ""
    progress.save()
    return progress


def finish_station(material, student, version, station_id, save=True):
    station, _, _ = _locate(version, station_id)
    if not save:
        return {"stars": 3, "suggestion": None, "badges": [], "saved": False}
    with transaction.atomic():
        progress = _progress(material, student, station_id, lock=True)
        summary = run_summary(station, progress.run)
        if summary["done"] < summary["graded"]:
            left = summary["graded"] - summary["done"]
            raise ValidationError(
                {"detail": f"Masih ada {left} latihan yang belum dituntaskan di stasiun ini."}
            )
        stars = stars_for(summary)
        progress.stars = max(progress.stars, stars)
        progress.mistakes = summary["mistakes"]
        if progress.completed_at is None:
            progress.completed_at = timezone.now()
        progress.save()
        badges = _award_badges(material, student, version, station)
    return {
        "stars": stars,
        "best_stars": progress.stars,
        "suggestion": suggestion(station, stars, summary["mistakes"]),
        "badges": badges,
        "saved": True,
    }


def _award_badges(material, student, version, station):
    candidates = []
    if station.get("badge"):
        candidates.append({"code": f"station-{station['id']}", **station["badge"]})
    done = set(
        InteractiveMediaProgress.objects.filter(
            material=material, student=student, completed_at__isnull=False
        ).values_list("station_id", flat=True)
    )
    if version.required_stations and set(version.required_stations) <= done:
        candidates.append(COMPLETE_BADGE)
    earned = []
    for badge in candidates:
        _, created = InteractiveMediaBadge.objects.get_or_create(
            material=material,
            student=student,
            code=badge["code"],
            defaults={"title": badge["title"], "icon": badge.get("icon") or "award"},
        )
        if created:
            earned.append(
                {"code": badge["code"], "title": badge["title"], "icon": badge.get("icon") or "award"}
            )
    return earned


def save_reflection(material, student, version, station_id, text, save=True):
    station, _, _ = _locate(version, station_id)
    text = str(text or "").strip()
    if not REFLECTION_MIN <= len(text) <= REFLECTION_MAX:
        raise ValidationError({"text": f"Tulis refleksi {REFLECTION_MIN} sampai {REFLECTION_MAX} karakter."})
    if save:
        InteractiveMediaReflection.objects.update_or_create(
            material=material, student=student, station_id=station_id, defaults={"text": text}
        )
    return {"text": text, "saved": save}


# ---------------------------------------------------------------- data pemutar


def player_data(material, version, user, student=None, preview=False):
    """Semua data pemutar: isi (acak per siswa), keadaan stasiun, refleksi, lencana, posisi lanjut.
    `student` = siswa pemilik progres (None untuk pratinjau guru)."""
    seed = f"{material.id if material else 'pratinjau'}-{(student or user).id}"
    content = schema.student_content(version.content, seed)
    progress, reflections, badges = {}, {}, []
    if student is not None:
        progress = {
            p.station_id: p
            for p in InteractiveMediaProgress.objects.filter(material=material, student=student)
        }
        reflections = dict(
            InteractiveMediaReflection.objects.filter(material=material, student=student).values_list(
                "station_id", "text"
            )
        )
        badges = list(
            InteractiveMediaBadge.objects.filter(material=material, student=student).values(
                "code", "title", "icon", "earned_at"
            )
        )
    pretest = pretest_state(material, student) if material and not preview else None
    states = station_states(material, content, progress, pretest, preview=preview)
    config = settings_of(material)
    total_stars = sum(state["stars"] for state in states.values())
    stations = list(schema.iter_stations(content))
    return {
        "material": material.id if material else None,
        "media": version.media_id,
        "version": version.number,
        "content": content,
        "settings": {"unlock": config["unlock"], "leaderboard": config["leaderboard"]},
        "pretest": pretest,
        "posttest": _test_info(config["posttest"], student),
        "preview": preview,
        "stations": states,
        "reflections": reflections,
        "badges": badges,
        "resume": resume_point(content, states),
        "totals": {
            "stars": total_stars,
            "max_stars": 3 * len(stations),
            "completed": sum(1 for state in states.values() if state["completed"]),
            "stations": len(stations),
        },
    }


def _test_info(test_id, student):
    test = Assessment.objects.filter(pk=test_id, is_published=True).first() if test_id else None
    if test is None:
        return None
    return {"id": test.id, "title": test.title, "done": bool(student) and _submitted(test.id, student)}
