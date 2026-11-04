"""Check readable names, search aliases, pack members and repeatable generation."""
from collections import Counter
from pathlib import Path
import csv
import hashlib
import json
import re
import subprocess
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'dist'


def load(relative):
    return json.loads((SITE / relative).read_text(encoding='utf-8').split('=', 1)[1].strip().removesuffix(';'))


def safe_filename(value):
    assert value and len(value.encode('utf-8')) <= 240, value
    assert not re.search(r'[\\/:*?"<>|\x00-\x1f]', value), value
    assert not re.search(r'[\u3040-\u30ff]', value), value
    assert not value.endswith((' ', '.')), value


def main():
    catalog, sprites, artwork, backgrounds, titles = [load(p) for p in (
        'catalog-data.js', 'game-data.js', 'cg-data.js', 'backgrounds/catalog.js', 'backgrounds/title-data.js')]
    records = sprites + catalog['official'] + artwork['images'] + backgrounds['images']
    by_id = {r['id']: r for r in records}
    rules = json.loads((ROOT / 'scripts/naming-rules.json').read_text(encoding='utf-8'))
    assert len(rules['costumeNames']) == len(catalog['costumePacks']) == 195
    assert len(by_id) == len(records) == 10751
    assert len({r['downloadName'] for r in records}) == len(records)
    assert len({unicodedata.normalize('NFC', r['downloadName']).casefold() for r in records}) == len(records)
    for record in records:
        safe_filename(record['downloadName'])
        assert record['displayName'] and not re.search(r'[\u3040-\u30ff]', record['displayName'])
        assert record['name'] in record['aliases'], record['id']
    for record in sprites:
        assert record['outfit'] == rules['costumeNames'][record['variant'] + '|' + record['costume']]
        assert all(word in record['downloadName'] for word in ('姿态', '表情'))
        assert any(word in record['downloadName'] for word in ('远景', '中景', '近景', '镜头特殊'))
    for payload in (artwork, backgrounds, titles):
        assert len({p['filename'] for p in payload['packs']}) == len(payload['packs'])
        for pack in payload['packs']:
            safe_filename(pack['filename'])
            assert len({f['name'] for f in pack['files']}) == len(pack['files']), pack['id']
            for member in pack['files']: safe_filename(member['name'])
    for record in backgrounds['images'] + titles['images']:
        for placement in record['placements']:
            assert placement['location'] in backgrounds['locations']
            safe_filename(placement['downloadName'])
    assert backgrounds['labels']['scenes']['bg01'] == '樱公馆·外观'
    assert backgrounds['labels']['scenes']['bg52'] == '巴黎·商店街'
    butler = by_id['cg-4e9f853cbe1b8a01']
    assert butler['sceneName'] == '黑执事结局' and set(butler['characters']) == {'朝日', '大蔵衣遠', '駿我'}
    assert not any(r['characters'] == ['作品素材'] for r in artwork['images'] if r['kind'] == 'cg')
    report = json.loads((SITE / 'data/naming-report.json').read_text(encoding='utf-8'))
    assert report['images'] == len(records) and report['genericCGReclassified'] == 116
    assert report['backgroundSceneFamilies'] == 122
    verification = json.loads((SITE / 'data/named-sprites-verification.json').read_text(encoding='utf-8'))
    assert verification['status'] == 'passed' and verification['named_files_verified'] == len(sprites)
    assert verification['catalog_sha256'] == hashlib.sha256((SITE / 'game-data.js').read_bytes()).hexdigest()
    with (SITE / 'data/naming-index.csv').open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == len(records) and {r['资源ID'] for r in rows} == set(by_id)
    for row in rows:
        assert row['下载文件名'] == by_id[row['资源ID']]['downloadName']
    for file, expected in [('data/cg-sources.json', artwork['images']), ('backgrounds/data/sources.json', backgrounds['images'] + titles['images'])]:
        source = json.loads((SITE / file).read_text(encoding='utf-8'))
        assert {r['id']: r['downloadName'] for r in source['images']} == {r['id']: r['downloadName'] for r in expected}
    # Running the batch step twice must not append suffixes or change labels again.
    generated = [SITE / p for p in ('game-data.js', 'catalog-data.js', 'cg-data.js', 'backgrounds/catalog.js', 'backgrounds/title-data.js')]
    generated += list((SITE / 'data').glob('*.json')) + [SITE / 'data/naming-index.csv', SITE / 'backgrounds/data/sources.json']
    before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in generated}
    subprocess.run([sys.executable, str(ROOT / 'scripts/name-catalog.py')], check=True, capture_output=True)
    assert all(before[p] == hashlib.sha256(p.read_bytes()).hexdigest() for p in generated), 'Name generation is not repeatable'
    print(json.dumps({'status': 'passed', 'namedImages': len(records), 'backgroundSceneFamilies': 122, 'reclassifiedCGs': 116, 'uniqueDownloadNames': True, 'packMemberNames': 'passed', 'repeatableGeneration': True}))


if __name__ == '__main__':
    main()
