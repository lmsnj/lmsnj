/**
 * Fungsi murni untuk Praktik menulis kode (lihat backend `apps/materials/code_practice.py`).
 * Kode siswa dijalankan di browser: HTML/CSS/JS di iframe terpisah (sandbox), Python & PHP di Web Worker.
 */

export const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'php', label: 'PHP' },
  { value: 'html', label: 'HTML/CSS/JS' },
]

/** Bahasa yang diperiksa lewat masukan -> keluaran (bukan pemeriksaan halaman HTML). */
export function isIoLanguage(language) {
  return language === 'python' || language === 'php'
}

/** Nama perintah membaca masukan per bahasa (untuk label & petunjuk). */
export const INPUT_HINTS = { python: 'input()', php: 'fgets(STDIN)' }

export const LANGUAGE_LABELS = Object.fromEntries(LANGUAGES.map((l) => [l.value, l.label]))

/** Jenis pemeriksaan HTML: kolom yang wajib diisi + penjelasan untuk guru. */
export const HTML_CHECK_TYPES = [
  { value: 'exists', label: 'Elemen ada', fields: ['selector'] },
  { value: 'text', label: 'Teks elemen memuat', fields: ['selector', 'value'] },
  { value: 'style', label: 'Gaya CSS elemen', fields: ['selector', 'property', 'value'] },
  { value: 'console', label: 'console.log memuat', fields: ['value'] },
  { value: 'click', label: 'Klik lalu teks berubah', fields: ['selector', 'target', 'value'] },
]

export const FIELD_LABELS = {
  selector: 'Elemen (selector CSS)',
  property: 'Properti CSS',
  value: 'Nilai',
  target: 'Elemen hasil',
}

export const FIELD_PLACEHOLDERS = {
  selector: 'mis. h1, #judul, .kotak',
  property: 'mis. color, background-color',
  value: 'mis. Halo Dunia, red',
  target: 'mis. #hasil',
}

export function emptyCheck(language) {
  return isIoLanguage(language)
    ? { input: '', output: '' }
    : { type: 'exists', selector: '', property: '', value: '', target: '' }
}

/** Kalimat pemeriksaan yang dibaca siswa. */
export function checkLabel(check, language) {
  if (isIoLanguage(language)) {
    return check.input.trim()
      ? `Masukan ${inline(check.input)} menghasilkan ${inline(check.output)}`
      : `Program menampilkan ${inline(check.output)}`
  }
  switch (check.type) {
    case 'exists':
      return `Ada elemen ${check.selector}`
    case 'text':
      return `Elemen ${check.selector} berisi teks “${check.value}”`
    case 'style':
      return `Elemen ${check.selector} bergaya ${check.property}: ${check.value}`
    case 'console':
      return `console.log menampilkan “${check.value}”`
    case 'click':
      return `Klik ${check.selector}, lalu ${check.target} berisi “${check.value}”`
    default:
      return 'Pemeriksaan'
  }
}

function inline(text) {
  const lines = String(text).trim().split('\n')
  const shown = lines.length > 3 ? [...lines.slice(0, 3), '…'] : lines
  return `“${shown.join(' ⏎ ')}”`
}

/**
 * Rapikan keluaran program sebelum dibandingkan: baris baru Windows, spasi di akhir baris, dan baris
 * kosong di akhir diabaikan (siswa sering tidak sengaja menambahkannya).
 */
export function normalizeOutput(text) {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

export function outputMatches(actual, expected) {
  return normalizeOutput(actual) === normalizeOutput(expected)
}

/** Hasil pemeriksaan -> { passed, total, done } (done = semua lulus). */
export function summarizeResults(results = []) {
  const passed = results.filter((r) => r.ok).length
  return { passed, total: results.length, done: results.length > 0 && passed === results.length }
}

/** Pesan pemeriksaan yang belum dilengkapi guru di form (null = lengkap). */
export function checkProblem(check, language) {
  if (isIoLanguage(language)) return check.output.trim() ? null : 'Isi keluaran yang diharapkan.'
  const type = HTML_CHECK_TYPES.find((t) => t.value === check.type)
  const missing = type.fields.filter((field) => !String(check[field] ?? '').trim())
  return missing.length ? `Isi ${missing.map((f) => FIELD_LABELS[f]).join(', ')}.` : null
}

// Skrip yang disisipkan ke halaman siswa (di dalam iframe sandbox): meneruskan console.log & error ke
// LMS, lalu menjalankan pemeriksaan saat diminta. Ditulis dengan JavaScript biasa (tanpa build).
const RUNNER = `
(function () {
  var logs = [];
  function send(data) { data.source = 'lms-run'; parent.postMessage(data, '*'); }
  function show(value) {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (e) { return String(value); }
  }
  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      var text = Array.prototype.map.call(arguments, show).join(' ');
      logs.push(text);
      send({ kind: 'log', level: level, text: text });
      original.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (event) {
    send({ kind: 'log', level: 'error', text: event.message + (event.lineno ? ' (baris ' + event.lineno + ')' : '') });
  });
  function norm(text) { return String(text || '').replace(/\\s+/g, ' ').trim().toLowerCase(); }
  function style(element, property) { return getComputedStyle(element).getPropertyValue(property).trim(); }
  // Nilai CSS guru (mis. "red") diubah browser ke bentuk yang sama dengan hasil siswa (rgb(255, 0, 0)).
  function expectedStyle(property, value) {
    var probe = document.createElement('div');
    probe.style.setProperty(property, value);
    document.body.appendChild(probe);
    var result = style(probe, property);
    probe.remove();
    return result;
  }
  function textOf(element) { return element.textContent.trim().slice(0, 80); }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  async function check(c) {
    if (c.type === 'console') {
      var found = logs.some(function (line) { return norm(line).indexOf(norm(c.value)) >= 0; });
      return { ok: found, detail: found ? '' : 'Belum ada console.log yang memuat teks itu.' };
    }
    var element = document.querySelector(c.selector);
    if (!element) return { ok: false, detail: 'Elemen ' + c.selector + ' tidak ditemukan.' };
    if (c.type === 'exists') return { ok: true, detail: '' };
    if (c.type === 'text') {
      var ok = norm(element.textContent).indexOf(norm(c.value)) >= 0;
      return { ok: ok, detail: ok ? '' : 'Teks sekarang: “' + textOf(element) + '”' };
    }
    if (c.type === 'style') {
      var actual = style(element, c.property);
      var same = actual === expectedStyle(c.property, c.value);
      return { ok: same, detail: same ? '' : c.property + ' sekarang: ' + (actual || '(kosong)') };
    }
    if (c.type === 'click') {
      element.click();
      await wait(150);
      var target = document.querySelector(c.target);
      if (!target) return { ok: false, detail: 'Elemen ' + c.target + ' tidak ditemukan.' };
      var changed = norm(target.textContent).indexOf(norm(c.value)) >= 0;
      return { ok: changed, detail: changed ? '' : 'Setelah diklik, teks: “' + textOf(target) + '”' };
    }
    return { ok: false, detail: 'Jenis pemeriksaan tidak dikenal.' };
  }
  window.addEventListener('message', async function (event) {
    if (!event.data || event.data.source !== 'lms-parent') return;
    var results = [];
    for (var i = 0; i < event.data.checks.length; i++) {
      try { results.push(await check(event.data.checks[i])); }
      catch (error) { results.push({ ok: false, detail: String(error.message || error) }); }
    }
    send({ kind: 'results', results: results });
  });
  window.addEventListener('load', function () { send({ kind: 'ready' }); });
})();
`

/** Isi iframe pratinjau: skrip LMS dulu (agar console.log sejak awal tertangkap), lalu kode siswa. */
export function buildSrcdoc(code) {
  return `<script>${RUNNER}</script>\n${code ?? ''}`
}

// Program Python pembungkus (dijalankan Pyodide di Web Worker). input() membaca dari Masukan; saat
// "Jalankan" teks pertanyaan input & jawabannya ikut tampil, saat "Periksa" tidak (agar keluaran yang
// dibandingkan hanya hasil print).
export const PYTHON_RUNNER = `
import builtins, io, sys, traceback

MAX_OUTPUT = 100_000


class LimitedOutput(io.StringIO):
    # Perulangan tanpa akhir berisi print() bisa menghabiskan memori browser sebelum dihentikan.
    def write(self, text):
        if self.tell() + len(text) > MAX_OUTPUT:
            raise RuntimeError("Keluaran terlalu panjang (lebih dari 100.000 karakter). Periksa perulanganmu.")
        return super().write(text)


def __lms_run(code, stdin_text, show_prompt):
    out = LimitedOutput()
    stdin = io.StringIO(stdin_text)

    def lms_input(prompt=""):
        if show_prompt:
            out.write(str(prompt))
        line = stdin.readline()
        if line == "":
            raise EOFError("Masukan habis: program memanggil input() lebih banyak dari baris Masukan.")
        line = line.rstrip("\\n")
        if show_prompt:
            out.write(line + "\\n")
        return line

    sys.stdout, sys.stderr = out, out
    builtins.input = lms_input
    error = None
    try:
        exec(compile(code, "<kode>", "exec"), {"__name__": "__main__"})
    except SystemExit:
        pass
    except SyntaxError as e:
        error = f"Baris {e.lineno}: {type(e).__name__}: {e.msg}"
    except BaseException as e:
        line = None
        for frame in traceback.extract_tb(e.__traceback__):
            if frame.filename == "<kode>":
                line = frame.lineno
        where = f"Baris {line}: " if line else ""
        error = f"{where}{type(e).__name__}: {e}"
    finally:
        sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__
    return out.getvalue(), error
`

/**
 * Kode pembuka PHP (dijalankan sebelum kode siswa, di proses PHP yang sama): PHP di browser bukan PHP
 * baris perintah, jadi STDIN dibuat sendiri berisi Masukan agar fgets(STDIN)/fscanf(STDIN, ...) bisa
 * dipakai. Dijalankan terpisah supaya nomor baris error kode siswa tetap benar.
 */
export function phpPrelude(input) {
  // Base64: teks masukan (mis. berisi $ atau kutip) tidak pernah dibaca PHP sebagai kode.
  const bytes = new TextEncoder().encode(String(input ?? ''))
  const encoded = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
  return (
    "<?php $__lms_in = fopen('php://memory', 'r+'); " +
    `fwrite($__lms_in, base64_decode('${encoded}')); rewind($__lms_in); ` +
    "define('STDIN', $__lms_in); unset($__lms_in);"
  )
}

// Pesan PHP: "\nFatal error: ... in php-wasm run script:2\nStack trace:\n#0 {main}\n  thrown in ... on line 2"
// atau "\nWarning: ... in php-wasm run script on line 3".
const PHP_MESSAGE =
  /\n?(Parse error|Fatal error|Warning|Notice|Deprecated): ([\s\S]*?) in php-wasm run script(?::(\d+)| on line (\d+))[^\n]*(?:\nStack trace:\n(?:#.*\n?)*(?:\s*thrown in php-wasm run script on line \d+\n?)?)?/g
const PHP_TYPES = {
  'Parse error': 'Kesalahan penulisan',
  'Fatal error': 'Error',
  Warning: 'Peringatan',
  Notice: 'Catatan',
  Deprecated: 'Usang',
}

/**
 * Pisahkan keluaran PHP dari pesan error-nya. Pesan PHP ("... in php-wasm run script on line 3") diubah
 * menjadi "Baris 3: ..." . Error fatal (program berhenti) -> `error`; peringatan tetap di keluaran
 * (seperti PHP biasa) agar siswa melihatnya, dengan bentuk yang sama.
 * Mengembalikan { output, error }.
 */
export function splitPhpOutput(text) {
  let error = null
  const output = String(text ?? '').replace(PHP_MESSAGE, (_, type, message, line1, line2) => {
    const line = line1 ?? line2
    const clean = message.replace(/^Uncaught (\w+): /, '$1: ').trim()
    const formatted = `Baris ${line}: ${PHP_TYPES[type]}: ${clean}`
    if (type === 'Parse error' || type === 'Fatal error') {
      error = formatted
      return ''
    }
    return `\n${formatted}\n`
  })
  return { output, error }
}

/** Contoh soal untuk tombol "Gunakan contoh" di form guru (semuanya lolos validasi backend). */
export const EXERCISE_TEMPLATES = [
  {
    label: 'Python: penjumlahan dua bilangan',
    values: {
      title: 'Menjumlahkan Dua Bilangan',
      language: 'python',
      instructions:
        'Buat program yang membaca dua bilangan bulat (masing-masing satu baris), lalu menampilkan jumlahnya.',
      starter_code: 'a = int(input())\nb = int(input())\n# tampilkan jumlah a dan b\n',
      checks: [
        { input: '3\n4', output: '7' },
        { input: '10\n-2', output: '8' },
      ],
    },
  },
  {
    label: 'Python: sapaan dengan nama',
    values: {
      title: 'Menyapa Pengguna',
      language: 'python',
      instructions: 'Baca sebuah nama, lalu tampilkan sapaan dengan format: Halo, <nama>!',
      starter_code: 'nama = input("Siapa namamu? ")\n',
      checks: [
        { input: 'Ani', output: 'Halo, Ani!' },
        { input: 'Budi', output: 'Halo, Budi!' },
      ],
    },
  },
  {
    label: 'PHP: penjumlahan dua bilangan',
    values: {
      title: 'Menjumlahkan Dua Bilangan (PHP)',
      language: 'php',
      instructions:
        'Baca dua bilangan bulat dengan fgets(STDIN) (masing-masing satu baris), lalu tampilkan jumlahnya dengan echo.',
      starter_code:
        '<?php\n$a = (int) fgets(STDIN);\n$b = (int) fgets(STDIN);\n// tampilkan jumlah $a dan $b\n',
      checks: [
        { input: '3\n4', output: '7' },
        { input: '10\n-2', output: '8' },
      ],
    },
  },
  {
    label: 'PHP: lulus atau tidak (if)',
    values: {
      title: 'Menentukan Kelulusan',
      language: 'php',
      instructions:
        'Baca sebuah nilai. Jika nilai 75 atau lebih tampilkan "Lulus", selain itu tampilkan "Remedial".',
      starter_code: '<?php\n$nilai = (int) fgets(STDIN);\n',
      checks: [
        { input: '80', output: 'Lulus' },
        { input: '75', output: 'Lulus' },
        { input: '60', output: 'Remedial' },
      ],
    },
  },
  {
    label: 'HTML/CSS/JS: halaman perkenalan',
    values: {
      title: 'Halaman Perkenalan',
      language: 'html',
      instructions:
        'Buat judul h1 berisi "Halo", latar halaman berwarna lightblue, dan tombol yang saat diklik ' +
        'mengubah teks paragraf #hasil menjadi "Terima kasih".',
      starter_code:
        '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body {  }\n  </style>\n</head>\n<body>\n' +
        '  <h1></h1>\n  <button>Klik saya</button>\n  <p id="hasil"></p>\n\n  <script>\n    // tulis kode JavaScript di sini\n' +
        '  </script>\n</body>\n</html>\n',
      checks: [
        { type: 'text', selector: 'h1', value: 'Halo', property: '', target: '' },
        {
          type: 'style',
          selector: 'body',
          property: 'background-color',
          value: 'lightblue',
          target: '',
        },
        {
          type: 'click',
          selector: 'button',
          target: '#hasil',
          value: 'Terima kasih',
          property: '',
        },
      ],
    },
  },
]
