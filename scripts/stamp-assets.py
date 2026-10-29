"""Give changed entry scripts and styles their content hash in page references."""
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / 'dist'

stage = ROOT / 'archive-stage.js'
scene_digest = hashlib.sha256((ROOT / 'archive-scene.js').read_bytes()).hexdigest()[:12]
stage_text, count = re.subn(r'archive-scene\.js(?:\?v=[a-f0-9]+)?', 'archive-scene.js?v=' + scene_digest, stage.read_text(encoding='utf-8'))
assert count == 1, (stage, count)
stage.write_text(stage_text, encoding='utf-8')

for folder, assets in [(ROOT, ['styles.css', 'gallery-nav.css', 'experience.css', 'archive-stage.css', 'catalog-data.js', 'backgrounds/zip-store.js','artwork-downloads.js','experience.js','archive-stage.js','app.js']), (ROOT / 'backgrounds', ['styles.css','../gallery-nav.css','../experience.css','../archive-stage.css', 'catalog.js', 'title-data.js', 'zip-store.js','../experience.js','../archive-stage.js', 'app.js'])]:
    path = folder / 'index.html'
    text = path.read_text(encoding='utf-8')
    for asset in assets:
        digest = hashlib.sha256((folder / asset).read_bytes()).hexdigest()[:12]
        text, count = re.subn(r'((?:src|href)=")' + re.escape(asset) + r'(?:\?v=[a-f0-9]+)?"', lambda m: m[1] + asset + '?v=' + digest + '"', text)
        assert count == 1, (path, asset, count)
    path.write_text(text, encoding='utf-8')
print('Stamped both entry pages.')
