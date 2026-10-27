"""Separate title backgrounds, logos and character layers without copying images."""
from pathlib import Path
import collections
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'dist'
BASE = 'https://raw.githubusercontent.com/zhenbai012-rgb/otome-sprite-search/main/'


def load(path):
    return json.loads(path.read_text(encoding='utf-8').split('=', 1)[1].strip().removesuffix(';'))


def script(path, name, value):
    path.write_text(name + '=' + json.dumps(value, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')


def main():
    artwork = load(SITE / 'cg-data.js')
    catalog = load(SITE / 'catalog-data.js')
    works = {w['id']: w['label'] for w in catalog['works']}
    title_images = [r for r in artwork['images'] if r.get('titleType')]
    for r in title_images:
        if r['titleType'] in ('标题背景', '标题图层'):
            r.update(kind='title_background', collection='backgrounds')
        elif r['titleType'] == '人物图层':
            r.update(kind='title_character', collection='characters')
        else:
            r.update(kind='title', collection='characters')
    counts = collections.Counter(r['kind'] for r in artwork['images'])
    additions = {'titleImages': counts['title'], 'titleCharacterImages': counts['title_character'], 'titleBackgroundImages': counts['title_background']}
    artwork['stats'].update(additions)
    catalog['stats'].update(additions)
    catalog['cg'].update(titles=counts['title'], titleCharacters=counts['title_character'], titleBackgrounds=counts['title_background'])
    script(SITE / 'cg-data.js', 'window.CATALOG_CG_DATA', artwork)
    digest = hashlib.sha256((SITE / 'cg-data.js').read_bytes()).hexdigest()[:12]
    catalog['cg']['script'] = 'cg-data.js?v=' + digest
    script(SITE / 'catalog-data.js', 'window.CATALOG_DATA', catalog)
    sources = json.loads((SITE / 'data/cg-sources.json').read_text(encoding='utf-8'))
    by_id = {r['id']: r for r in artwork['images']}
    sources['stats'] = artwork['stats']
    for r in sources['images']:
        source = by_id[r['id']]
        r['kind'] = source['kind']
        if source.get('collection'):
            r['collection'] = source['collection']
    (SITE / 'data/cg-sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    images, groups = [], collections.defaultdict(list)
    category = '07_标题背景'
    for r in artwork['images']:
        if r['kind'] != 'title_background':
            continue
        filename = r['name'] + '__' + r['original'].split('/')[-1][:8] + '.png'
        places = [{'game': game, 'category': category, 'scene': 'title-background', 'file': works[game] + '/标题背景/' + filename} for game in r['gameIds']]
        image = {key: r[key] for key in ('id', 'name', 'file', 'thumb', 'width', 'height', 'alpha', 'original', 'originalBytes', 'originalSha256', 'previewWidth', 'previewHeight')}
        image.update(scene='title-background', scenes=['title-background'], games=r['gameIds'], kinds=['title'], aliases=[r['name'], r['titleType'], '标题背景', '游戏标题', *r['tags']], placements=places, originalCollection='cg')
        images.append(image)
        for game in r['gameIds']:
            groups[game].append({'image': r['id'], 'name': filename, 'original': r['original'], 'bytes': r['originalBytes'], 'sha256': r['originalSha256'], 'originalCollection': 'cg'})
    packs = []
    for game, files in groups.items():
        packs.append({'id': 'title-background-' + game.split('_')[0], 'game': game, 'category': category, 'scene': 'title-background', 'title': '标题背景', 'filename': works[game] + '_标题背景.zip', 'count': len(files), 'bytes': sum(f['bytes'] for f in files), 'files': files})
    payload = {'images': images, 'packs': packs, 'kinds': {'title': category}, 'assetBase': BASE, 'originalBases': {'cg': BASE + 'originals/cg/'}}
    script(SITE / 'backgrounds/title-data.js', 'window.BACKGROUND_TITLE_DATA', payload)
    print(json.dumps({'categories': dict(counts), 'titleBackgroundPacks': len(packs)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
