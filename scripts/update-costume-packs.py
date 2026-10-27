"""Merge the public release manifest and label packs from the sprite catalog."""
import argparse
import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'dist'

def load_script(path):
    return json.loads(path.read_text(encoding='utf-8').split('=', 1)[1].strip().removesuffix(';'))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path, help='Public costume-packs.json from the release')
    args = parser.parse_args()
    source = json.loads(args.manifest.read_text(encoding='utf-8'))
    catalog = load_script(SITE / 'catalog-data.js')
    games = load_script(SITE / 'game-data.js')
    key = lambda r: (r['character'], r.get('variant') or r['character'], r['costume'])
    outfits = collections.defaultdict(set)
    for r in games:
        outfits[key(r)].add(r['outfit'])
    fields = ('character', 'variant', 'costume', 'label', 'asset', 'count', 'size', 'sha256', 'url', 'display')
    packs = [{k: p[k] for k in fields} for p in source['packs']]
    assert len(packs) == 195 and sum(p['count'] for p in packs) == len(games)
    assert {key(p) for p in packs} == set(outfits)
    counts = collections.Counter(key(r) for r in games)
    for p in packs:
        assert counts[key(p)] == p['count']
        names = outfits[key(p)]
        if len(names) == 1:
            p['label'] = next(iter(names))
    catalog['updated'] = '2026-10-27'
    catalog['costumePacks'] = packs
    (SITE / 'catalog-data.js').write_text('window.CATALOG_DATA=' + json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    manifest = {'updated': catalog['updated'], 'count': len(packs), 'images': len(games), 'packs': packs}
    (SITE / 'data/costume-packs.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'packs': len(packs), 'images': len(games), 'groupsVerified': True}))

if __name__ == '__main__':
    main()
