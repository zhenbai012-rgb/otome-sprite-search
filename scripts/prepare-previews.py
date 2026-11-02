"""Serve artwork thumbnails with Pages; original previews and downloads stay separate."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'cg-assets' / 'thumbs'
target = ROOT / 'dist' / 'cg-assets' / 'thumbs'
files = list(source.rglob('*.webp'))
assert files, 'Artwork thumbnails are missing'
for file in files:
    destination = target / file.relative_to(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.is_file() or file.read_bytes() != destination.read_bytes():
        shutil.copyfile(file, destination)
print(f'Prepared {len(files)} same-site artwork thumbnails ({sum(f.stat().st_size for f in files):,} bytes).')
