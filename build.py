"""Assembla src/ in un unico file index.html (HTML, CSS e JavaScript insieme), pronto da aprire o pubblicare."""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent
src = root / "src"
shell = (src / "shell.html").read_text(encoding="utf-8")
css = (src / "style.css").read_text(encoding="utf-8")
js = "\n".join((src / f).read_text(encoding="utf-8") for f in ["core.js", "views.js", "details.js", "forms.js", "quick.js", "fatture.js", "esempi.js", "main.js"])
logo = re.search(r"const LOGO = `(.*?)`;", js, re.S).group(1)
if re.search(r"</script|<!--", js, re.I):
    sys.exit("Il JavaScript contiene una sequenza che romperebbe l'HTML")
script = '"use strict";\n{\n' + js + "\n}\n"
out = shell.replace("/*STYLE*/", css).replace("/*LOGO*/", logo).replace("/*SCRIPT*/", script)
(root / "index.html").write_text(out, encoding="utf-8")
print("index.html:", len(out), "byte,", out.count("\n"), "righe")
