Object.fromEntries([{value:`python`,label:`Python`},{value:`php`,label:`PHP`},{value:`html`,label:`HTML/CSS/JS`},{value:`flowchart`,label:`Flowchart`},{value:`math`,label:`Matematika`}].map(e=>[e.value,e.label]));let e=null;function t(t){return e||(e=import(
/* @vite-ignore */
`${t}pyodide.mjs`).then(async({loadPyodide:e})=>{let n=await e({indexURL:t});return n.runPython(`
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
`),n}),e.catch(()=>{e=null})),e}self.onmessage=async({data:e})=>{let{id:n,code:r,runs:i,indexURL:a}=e;try{let e=await t(a);self.postMessage({id:n,kind:`started`});let o=e.globals.get(`__lms_run`),s=i.map(({input:e,showPrompt:t})=>{let n=o(r,e,t),[i,a]=n.toJs();return n.destroy(),{output:i,error:a??null}});o.destroy(),self.postMessage({id:n,kind:`done`,results:s})}catch(e){self.postMessage({id:n,kind:`error`,message:String(e?.message??e)})}};