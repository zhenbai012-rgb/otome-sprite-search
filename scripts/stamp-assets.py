"""Give changed entry scripts and styles their content hash in page references."""
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / 'dist'

stage = ROOT / 'archive-stage.js'
scene_digest = hashlib.sha256((ROOT / 'archive-scene.js').read_bytes()).hexdigest()[:12]
stage_text, count = re.subn(r'archive-scene\.js(?:\?v=[a-f0-9]+)?', 'archive-scene.js?v=' + scene_digest, stage.read_text(encoding='utf-8'))
assert count == 1, (stage, count)
stage.write_text(stage_text, encoding='utf-8', newline='\n')

worker = ROOT / 'dialogue/search-worker.js'
worker_text = worker.read_text(encoding='utf-8')
for dependency in ['search-core.js', 'data-loader.js']:
    digest = hashlib.sha256((worker.parent / dependency).read_bytes()).hexdigest()[:12]
    worker_text, count = re.subn(re.escape(dependency) + r'(?:\?v=[a-f0-9]+)?', dependency + '?v=' + digest, worker_text)
    assert count == 1, (dependency, count)
worker.write_text(worker_text, encoding='utf-8', newline='\n')
app = ROOT / 'dialogue/app.js'
app_text = app.read_text(encoding='utf-8')
for dependency in ['search-worker.js', 'catalog.json']:
    digest = hashlib.sha256((app.parent / dependency).read_bytes()).hexdigest()[:12]
    app_text, count = re.subn(re.escape(dependency) + r'(?:\?v=[a-f0-9]+)?', dependency + '?v=' + digest, app_text)
    assert count == 1, (dependency, count)
app.write_text(app_text, encoding='utf-8', newline='\n')

for folder, assets in [(ROOT, ['styles.css', 'gallery-nav.css', 'experience.css', 'archive-stage.css', 'mobile.css', 'catalog-data.js', 'backgrounds/zip-store.js','artwork-downloads.js','experience.js','archive-stage.js','app.js','mobile-ui.js']), (ROOT / 'backgrounds', ['styles.css','../gallery-nav.css','../experience.css','../archive-stage.css','../mobile.css', 'catalog.js', 'title-data.js', 'zip-store.js','../experience.js','../archive-stage.js', 'app.js','../mobile-ui.js']), (ROOT / 'dialogue', ['../gallery-nav.css', 'styles.css', 'data-loader.js', 'app.js'])]:
    path = folder / 'index.html'
    text = path.read_text(encoding='utf-8')
    for asset in assets:
        digest = hashlib.sha256((folder / asset).read_bytes()).hexdigest()[:12]
        text, count = re.subn(r'((?:src|href)=")' + re.escape(asset) + r'(?:\?v=[a-f0-9]+)?"', lambda m: m[1] + asset + '?v=' + digest + '"', text)
        assert count == 1, (path, asset, count)
    path.write_text(text, encoding='utf-8', newline='\n')
print('Stamped all three entry pages and dialogue worker dependencies.')
