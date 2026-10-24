#!/usr/bin/env python3
"""Bundle VOID SERPENT into a single self-contained HTML file."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
template = (ROOT / "template.html").read_text(encoding="utf-8")
style = (ROOT / "src" / "style.css").read_text(encoding="utf-8")
game = (ROOT / "src" / "game.js").read_text(encoding="utf-8")
three = (ROOT / "vendor" / "three.min.js").read_text(encoding="utf-8")

for name, text in (("three", three), ("game", game)):
    if "</script" in text.lower():
        raise SystemExit(f"ERROR: {name} contains a literal </script> and cannot be inlined safely")

scripts = (
    '<script>\n/* Three.js r128 — MIT License — Copyright 2010-2021 Three.js Authors */\n'
    + three
    + "\n</script>\n<script>\n"
    + game
    + "\n</script>"
)
out = template.replace("/*__STYLE__*/", style).replace("<!--__SCRIPTS__-->", scripts)
(ROOT / "index.html").write_text(out, encoding="utf-8")
print(f"Built {ROOT / 'index.html'}")
print(f"Size: {len(out.encode('utf-8')):,} bytes")
