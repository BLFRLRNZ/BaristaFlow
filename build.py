"""Assembla src/ in un unico file index.html (HTML, CSS e JavaScript insieme), pronto da aprire o pubblicare."""
import base64, json, pathlib, re, sys, urllib.parse

root = pathlib.Path(__file__).resolve().parent
src = root / "src"
shell = (src / "shell.html").read_text(encoding="utf-8")
css = (src / "style.css").read_text(encoding="utf-8")
# il carattere (Instrument Sans, licenza OFL in fonts/) entra nel file come data URI:
# l'app resta un solo file, funziona senza rete e non chiede nulla a server esterni
def font_uri(m):
    data = (root / m.group(1)).read_bytes()
    return "url(data:font/woff2;base64," + base64.b64encode(data).decode("ascii") + ")"
css, nfont = re.subn(r"url\((fonts/[\w.-]+\.woff2)\)", font_uri, css)
assert nfont == 1, "atteso 1 carattere in style.css"
js = "\n".join((src / f).read_text(encoding="utf-8") for f in ["core.js", "views.js", "details.js", "forms.js", "quick.js", "fatture.js", "posta.js", "notifiche.js", "esempi.js", "main.js"])
logo = re.search(r"const LOGO = `(.*?)`;", js, re.S).group(1)
# lo script di Google per le fatture dalla posta: l'app lo mostra e lo copia con la chiave del collegamento
gs = (root / "apps-script" / "fatture-dalla-posta.gs").read_text(encoding="utf-8")
assert js.count("/*POSTA_GS*/''") == 1 and gs.count("__CHIAVE__") == 1
js = js.replace("/*POSTA_GS*/''", json.dumps(gs))
if re.search(r"</script|<!--", js, re.I):
    sys.exit("Il JavaScript contiene una sequenza che romperebbe l'HTML")
script = '"use strict";\n{\n' + js + "\n}\n"
fav = "data:image/svg+xml," + urllib.parse.quote(" ".join((root / "icone" / "icon.svg").read_text(encoding="utf-8").split()), safe=" =:/,;'")
out = shell.replace("/*FAVICON*/", fav).replace("/*STYLE*/", css).replace("/*LOGO*/", logo).replace("/*SCRIPT*/", script)
(root / "index.html").write_text(out, encoding="utf-8")
print("index.html:", len(out), "byte,", out.count("\n"), "righe")
