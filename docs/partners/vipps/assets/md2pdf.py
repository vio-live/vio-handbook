"""Markdown (handbook doc) -> HTML -> PDF with headless Chrome. usage: md2pdf.py <in.md> <out.pdf> [title]"""
import re, subprocess, sys, tempfile, pathlib, markdown
src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
text = src.read_text()
text = re.sub(r'^---\n.*?\n---\n', '', text, count=1, flags=re.S)          # drop the front matter
body = markdown.markdown(text, extensions=['tables', 'fenced_code'])
html = f"""<!doctype html><html><head><meta charset="utf-8"><title>{src.stem}</title>
<style>
 body {{ font: 11pt/1.45 Helvetica, Arial, sans-serif; color: #111; max-width: 760px; margin: 36px auto; }}
 h1 {{ font-size: 20pt; margin: 0 0 6px; }} h2 {{ font-size: 14pt; margin: 22px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }}
 table {{ border-collapse: collapse; width: 100%; font-size: 10pt; }} th, td {{ border: 1px solid #ccc; padding: 5px 7px; vertical-align: top; text-align: left; }}
 th {{ background: #f3f3f3; }} code {{ font: 9.5pt Menlo, monospace; background: #f4f4f4; padding: 0 3px; }}
 blockquote {{ border-left: 3px solid #ddd; margin: 0; padding: 0 12px; color: #333; }}
 pre {{ white-space: pre-wrap; word-break: break-all; font: 8.5pt Menlo, monospace; background: #f4f4f4; padding: 8px; }} pre code {{ background: none; padding: 0; font-size: inherit; }}
 p.meta {{ color: #666; font-size: 9.5pt; }}
</style></head><body>{body}<p class="meta">NewCo AS - Vio Commerce, {src.stem}, 2026-10-08.</p></body></html>"""
tmp = pathlib.Path(tempfile.mkdtemp()) / (src.stem + '.html'); tmp.write_text(html)
chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
r = subprocess.run([chrome, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', f'--print-to-pdf={out}', str(tmp)], capture_output=True, text=True, timeout=120)
print('ok' if out.exists() else r.stderr[-400:], out, out.stat().st_size if out.exists() else '')
