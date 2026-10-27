"""Give changed entry scripts and styles their content hash in page references."""
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / 'dist'

for folder, assets in [(ROOT, ['styles.css', 'catalog-data.js', 'app.js']), (ROOT / 'backgrounds', ['styles.css', 'catalog.js', 'zip-store.js', 'app.js'])]:
    path = folder / 'index.html'
    text = path.read_text(encoding='utf-8')
    for asset in assets:
        digest = hashlib.sha256((folder / asset).read_bytes()).hexdigest()[:12]
        text, count = re.subn(r'((?:src|href)=")' + re.escape(asset) + r'(?:\?v=[a-f0-9]+)?"', lambda m: m[1] + asset + '?v=' + digest + '"', text)
        assert count == 1, (path, asset, count)
    path.write_text(text, encoding='utf-8')
print('Stamped both entry pages.')
