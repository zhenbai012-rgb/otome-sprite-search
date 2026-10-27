"""Verify native background files, small pack coverage, and costume downloads."""
import collections
import hashlib
import json
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'dist'
BG = SITE / 'backgrounds'

def load(path):
    return json.loads(path.read_text(encoding='utf-8').split('=', 1)[1].strip().removesuffix(';'))

def safe(path):
    assert not Path(path).is_absolute() and '..' not in Path(path).parts and '\\' not in path

def main():
    data = load(BG / 'catalog.js')
    assert len(data['images']) == 641 and len(data['packs']) == 453
    assert data['stats']['scenicImages'] == 591
    assert data['originalBase'] == 'https://raw.githubusercontent.com/zhenbai012-rgb/otome-sprite-search/main/originals/backgrounds/'
    by_id = {r['id']: r for r in data['images']}
    assert len(by_id) == 641
    expected = collections.Counter()
    originals = set()
    for r in data['images']:
        for key in ('file', 'thumb'):
            safe(r[key])
            assert (BG / r[key]).is_file(), r[key]
        safe(r['original'])
        path = ROOT / 'originals/backgrounds' / r['original']
        original = path.read_bytes()
        assert original[:8] == b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II', original[16:24]) == (r['width'], r['height'])
        assert len(original) == r['originalBytes']
        assert hashlib.sha256(original).hexdigest() == r['originalSha256']
        originals.add(path)
        for p in r['placements']:
            safe(p['file'])
            assert p['game'] in data['games'] and p['category'] in data['kinds'].values()
            expected[(p['game'], p['category'], p['scene'], p['file'].split('/')[-1], r['id'])] += 1
    assert set((ROOT / 'originals/backgrounds').rglob('*.png')) == originals
    covered = collections.Counter()
    assert len({p['id'] for p in data['packs']}) == 453
    for p in data['packs']:
        assert p['count'] == len(p['files'])
        assert p['bytes'] == sum(f['bytes'] for f in p['files']) <= 32 * 1024 * 1024
        assert len({f['name'] for f in p['files']}) == len(p['files'])
        safe(p['filename'])
        for f in p['files']:
            safe(f['name'])
            r = by_id[f['image']]
            assert (f['original'], f['bytes'], f['sha256']) == (r['original'], r['originalBytes'], r['originalSha256'])
            covered[(p['game'], p['category'], p['scene'], f['name'], r['id'])] += 1
    assert covered == expected, (covered - expected, expected - covered)
    catalog = load(SITE / 'catalog-data.js')
    games = load(SITE / 'game-data.js')
    packs = catalog['costumePacks']
    key = lambda r: (r['character'], r.get('variant') or r['character'], r['costume'])
    expected_groups = collections.Counter(key(r) for r in games)
    assert len(packs) == 195 and len({key(p) for p in packs}) == 195
    assert sum(p['count'] for p in packs) == len(games) == 9399
    assert {key(p): p['count'] for p in packs} == expected_groups
    for p in packs:
        assert re.fullmatch(r'[a-f0-9]{64}', p['sha256'])
        assert p['url'] == 'https://github.com/zhenbai012-rgb/otome-sprite-search/releases/download/sprites-costumes-v1/' + p['asset']
        assert p['asset'].endswith('.zip') and p['size'] > 0 and 'zipPath' not in p
    public = json.loads((SITE / 'data/costume-packs.json').read_text(encoding='utf-8'))
    assert public['packs'] == packs
    print(json.dumps({'status': 'passed', 'backgroundImages': len(originals), 'backgroundPacks': len(data['packs']), 'classifiedImagesCovered': sum(covered.values()), 'spritePacks': len(packs), 'spritesCovered': len(games)}))

if __name__ == '__main__':
    main()
