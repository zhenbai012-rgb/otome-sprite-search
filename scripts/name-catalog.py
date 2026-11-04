"""Generate readable catalog and download names from reusable scene/character rules.

Resource IDs and storage paths remain stable. Running this script again is safe:
it updates labels, aliases, filenames, scene-pack members and the public name index.
"""
from pathlib import Path
from collections import defaultdict, Counter
import csv
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'dist'


def load(path):
    return json.loads(path.read_text(encoding='utf-8').split('=', 1)[1].strip().removesuffix(';'))


def save(path, variable, value):
    path.write_text('window.' + variable + '=' + json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + ';\n', encoding='utf-8', newline='\n')


def safe(text):
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', str(text)).strip(' .')


def unique(values):
    return list(dict.fromkeys(v for v in values if v))


def main():
    rules = json.loads((ROOT / 'scripts/naming-rules.json').read_text(encoding='utf-8'))
    catalog = load(SITE / 'catalog-data.js')
    sprites = load(SITE / 'game-data.js')
    artwork = load(SITE / 'cg-data.js')
    backgrounds = load(SITE / 'backgrounds/catalog.js')
    titles = load(SITE / 'backgrounds/title-data.js')
    roles = {c['id']: c for c in catalog['characters']}
    for key, value in rules['characterNames'].items():
        roles[key]['aliases'] = unique([*roles[key]['aliases'], roles[key]['display'], value])
        roles[key]['display'] = value
    names = {key: role['display'] for key, role in roles.items()}
    for variant in catalog['variantLabels']:
        base = variant.split('（', 1)[0]
        suffix = '（过去）' if '過去' in variant else '（近月2版）' if '2専用' in variant else ''
        catalog['variantLabels'][variant] = rules.get('variantNames', {}).get(variant, names.get(base, base) + suffix)
    works = {w['id']: w['label'] for w in catalog['works']}
    work_aliases = {w['legacyLabel']: w['id'] for w in catalog['works']}
    short_works = {key: value.replace('少女理论及其周边（巴黎篇）', '少女理论巴黎篇').replace('少女理论之后的周边（美好时代）', '少女理论美好时代') for key, value in works.items()}
    index = {}
    filenames = set()

    def attach(record, title, filename, category, aliases=(), games=()):
        filename = safe(filename)
        stem, suffix = filename.rsplit('.', 1)
        candidate = filename
        number = 2
        while candidate in filenames:
            candidate = f'{stem}_版本{number:02d}.{suffix}'
            number += 1
        filenames.add(candidate)
        record['displayName'] = title
        record['downloadName'] = candidate
        record['aliases'] = unique([*record.get('aliases', []), record.get('name'), *aliases])
        index[record['id']] = {'id': record['id'], 'category': category, 'name': title, 'downloadName': candidate, 'originalName': record.get('name', ''), 'works': [works.get(g, g) for g in games], 'file': record['file']}

    scales = {'s': '远景', 'm': '中景', 'l': '近景'}
    def number(value):
        return f'{int(value) + 1:02d}' if str(value).isdigit() else safe(value)

    for record in sorted(sprites, key=lambda r: (r['character'], r['variant'], r['costume'], r['name'], r['id'])):
        role = names[record['character']]
        old_outfit = record['outfit']
        outfit = rules['costumeNames'].get(record['variant'] + '|' + record['costume'], old_outfit)
        outfit = re.sub(r'^服装代码 (.+)$', lambda m: '服装' + number(m[1]), outfit)
        variant = catalog['variantLabels'].get(record['variant'], role)
        role = variant.split('（', 1)[0]
        extra = re.search(r'（(.+)）', variant)
        variant = extra[1] if extra else ''
        pieces = [role, variant, outfit, scales.get(record['scale'], '镜头' + record['scale']), '姿态' + number(record['pose']), '表情' + number(record['expression'])]
        title = ' · '.join(p for p in pieces if p)
        game_ids = record.get('gameIds') or [work_aliases[s] for s in record['sourceLabel'].split(' / ') if s in work_aliases]
        record['gameIds'] = game_ids
        record['outfit'] = outfit
        record['label'] = role + ' · ' + outfit
        attach(record, title, '_'.join(p for p in pieces if p) + '.png', '人物立绘', [old_outfit, record['label']], game_ids)

    for record in catalog['official']:
        cast = '、'.join(names.get(key, key) for key in record['characters'])
        description = record['label'].split(' · ', 1)[-1]
        title = cast + ' · ' + description
        attach(record, title, safe(title.replace(' · ', '_')) + Path(record['file']).suffix, '官方插画', [record['label']], record.get('gameIds', []))

    by_scene = defaultdict(list)
    for record in artwork['images']:
        by_scene[(record['gameIds'][0], record['kind'], record['scene'])].append(record)
    generic_reclassified = 0
    for (game, kind, scene), records in sorted(by_scene.items()):
        override = rules['cgScenes'].get(game[:2] + '|' + scene)
        digits = re.search(r'(\d+)$', scene)
        ordinal = f'{int(digits[1]):02d}' if digits else '01'
        for diff, record in enumerate(sorted(records, key=lambda r: (r['name'], r['id'])), 1):
            if override:
                record.setdefault('originalCharacters', record['characters'])
                if record['originalCharacters'] == ['作品素材']:
                    generic_reclassified += 1
                record['characters'] = override['characters']
                record['character'] = record['characters'][0]
            cast = '、'.join(names.get(c, c) for c in record['characters'] if c != '作品素材')
            scene_name = override['title'] if override else ('剧情场景' + ordinal if kind == 'cg' else record.get('titleType', '标题素材'))
            category = {'cg': '剧情CG', 'title': '标题Logo', 'title_character': '标题人物', 'title_background': '标题背景'}[kind]
            title = ' · '.join(p for p in [cast, scene_name, f'差分{diff:02d}' if len(records) > 1 else ''] if p)
            record['sceneName'] = scene_name
            record['label'] = title
            record.setdefault('sourceTags', record.get('tags', []))
            record['tags'] = unique([*record['sourceTags'], scene_name, category])
            filename = '_'.join(p for p in [short_works[game], cast, category, scene_name, f'差分{diff:02d}'] if p) + '.png'
            attach(record, title, filename, category, [scene], record['gameIds'])

    art_by_original = {record['original']: record for record in artwork['images']}
    for pack in artwork['packs']:
        scene_name = rules['cgScenes'].get(pack['game'][:2] + '|' + pack['scene'], {}).get('title')
        sample = next((art_by_original.get(f['original']) for f in pack['files'] if f['original'] in art_by_original), None)
        scene_name = scene_name or (sample['sceneName'] if sample else '标题图层')
        pack['title'] = scene_name
        if sample: pack['character'] = sample['character']
        cast = '、'.join(names.get(c, c) for c in (sample['characters'] if sample else [pack['character']]) if c != '作品素材')
        pack['filename'] = safe('_'.join(p for p in [short_works[pack['game']], cast, scene_name] if p)) + '.zip'
        for n, file in enumerate(pack['files'], 1):
            record = art_by_original.get(file['original'])
            file.setdefault('originalName', file['name'])
            file['name'] = record['downloadName'] if record else safe(short_works[pack['game']] + '_标题素材_组成图层' + f'{n:03d}.png')
    duplicate_packs = defaultdict(list)
    for pack in artwork['packs']: duplicate_packs[pack['filename']].append(pack)
    for filename, packs in duplicate_packs.items():
        if len(packs) > 1:
            for n, pack in enumerate(sorted(packs, key=lambda p: p['id']), 1):
                pack['filename'] = filename[:-4] + f'_场景组{n:02d}.zip'

    for role in catalog['characters']:
        role['cgCount'] = sum(record['kind'] == 'cg' and role['id'] in record['characters'] for record in artwork['images'])
    for pack in catalog['costumePacks']:
        pack['display'] = names[pack['character']]
        pack['variantLabel'] = catalog['variantLabels'].get(pack['variant'], pack['display'])
        pack['label'] = rules['costumeNames'].get(pack['variant'] + '|' + pack['costume'], pack['label'])
        pack['label'] = re.sub(r'^服装代码 (.+)$', lambda m: '服装' + number(m[1]), pack['label'])
        pack['downloadName'] = safe(pack['variantLabel'] + '_' + pack['label'] + '_立绘分包.zip')

    scene_names = backgrounds['labels']['scenes']
    places = rules['places']
    backgrounds['locations'] = {key: value['name'] for key, value in places.items()} | {'title': '标题背景'}
    def scene_rule(scene, fallback=''):
        if scene in rules['backgrounds']:
            label, place = rules['backgrounds'][scene]
            scene_names[scene] = label
            return label, place
        label = scene_names.get(scene, fallback or scene).replace('乙女理論_告知画像', '少女理论·宣传图层')
        if re.fullmatch(r'ec\d+', label): label = '过场插画' + str(int(label[2:]))
        if label.startswith('bg eff'): label = '背景光效图层' + re.sub(r'\D', '', label)
        if scene.startswith('雪'):
            snow_number = int(re.sub(r'\D', '', scene) or '1')
            label = f'飘雪图层{snow_number:02d}' + ('（小尺寸）' if scene.endswith('s') else '')
        if label == '纯色': label = '纯色背景'
        place = 'nature' if scene.startswith('雪') else 'hanamiya' if label.startswith('花之宫宅邸') else 'other'
        scene_names[scene] = label
        return label, place
    placement_groups = defaultdict(list)
    for record in backgrounds['images']:
        for placement in record['placements']:
            placement_groups[(placement['game'], placement['scene'])].append((record, placement))
    for (game, scene), members in sorted(placement_groups.items()):
        label, place = scene_rule(scene)
        for diff, (record, placement) in enumerate(sorted(members, key=lambda pair: (pair[0]['name'], pair[0]['id'], pair[1]['file'])), 1):
            placement['displayName'] = label + (f' · 差分{diff:02d}' if len(members) > 1 else '')
            placement['location'] = place
            placement['downloadName'] = safe(short_works[game] + '_' + label.replace('·', '_') + f'_差分{diff:02d}.png')
    grouped = defaultdict(list)
    for record in backgrounds['images']:
        grouped[record['scene']].append(record)
    for scene, records in sorted(grouped.items()):
        label, place = scene_rule(scene)
        scene_names[scene] = label
        for diff, record in enumerate(sorted(records, key=lambda r: (r['name'], r['id'])), 1):
            record.setdefault('sourceAliases', record['aliases'])
            record['aliases'] = list(record['sourceAliases'])
            title = label + f' · 差分{diff:02d}'
            record['location'] = place
            record['sceneName'] = label
            placement_aliases = [value for p in record['placements'] for value in [p['scene'], p['displayName'], places[p['location']]['name'], *places[p['location']]['aliases']]]
            attach(record, title, record['placements'][0]['downloadName'], '场景背景' if any(k in record['kinds'] for k in ['scene', 'large']) else '背景图层', [scene, label, places[place]['name'], *places[place]['aliases'], *placement_aliases], record['games'])
    bg_by_id = {record['id']: record for record in backgrounds['images']}
    for pack in backgrounds['packs']:
        label, place = scene_rule(pack['scene'], pack['title'])
        part = re.search(r'(?:part|分卷|分包|第)\D*(\d+)', pack['filename'], re.I)
        pack['title'] = label
        pack['location'] = place
        pack['aliases'] = unique([pack['scene'], label, places[place]['name'], *places[place]['aliases']])
        pack['filename'] = safe(short_works[pack['game']] + '_' + label.replace('·', '_') + (f'_分包{int(part[1]):02d}' if part else '')) + '.zip'
        for n, file in enumerate(pack['files'], 1):
            record = bg_by_id[file['image']]
            placement = next((p for p in record['placements'] if p['game'] == pack['game'] and p['scene'] == pack['scene']), record['placements'][0])
            file.setdefault('originalName', file['name'])
            file['name'] = placement['downloadName']
    # A scene can have multiple size-bounded packs. Assign readable volume numbers.
    pack_names = defaultdict(list)
    for pack in backgrounds['packs']: pack_names[pack['filename']].append(pack)
    for filename, packs in pack_names.items():
        if len(packs) > 1:
            for n, pack in enumerate(sorted(packs, key=lambda p: p['id']), 1): pack['filename'] = filename[:-4] + f'_分包{n:02d}.zip'

    for record in titles['images']:
        original = art_by_original[record['original']]
        for key in ['displayName', 'downloadName', 'sceneName']: record[key] = original[key]
        record['location'] = 'title'
        record['aliases'] = unique([*record['aliases'], original['displayName']])
        for p in record['placements']:
            p['displayName'] = original['displayName']; p['downloadName'] = original['downloadName']; p['location'] = 'title'
    title_by_original = {r['original']: r for r in titles['images']}
    for pack in titles['packs']:
        pack['location'] = 'title'
        for file in pack['files']:
            file.setdefault('originalName', file['name'])
            file['name'] = title_by_original[file['original']]['downloadName']

    catalog['updated'] = artwork['updated'] = backgrounds['updated'] = rules['updated']
    save(SITE / 'game-data.js', 'CATALOG_GAME_DATA', sprites)
    save(SITE / 'cg-data.js', 'CATALOG_CG_DATA', artwork)
    catalog['gameScript'] = 'game-data.js?v=' + hashlib.sha256((SITE / 'game-data.js').read_bytes()).hexdigest()[:12]
    catalog['cg']['script'] = 'cg-data.js?v=' + hashlib.sha256((SITE / 'cg-data.js').read_bytes()).hexdigest()[:12]
    save(SITE / 'catalog-data.js', 'CATALOG_DATA', catalog)
    save(SITE / 'backgrounds/catalog.js', 'BACKGROUND_DATA', backgrounds)
    save(SITE / 'backgrounds/title-data.js', 'BACKGROUND_TITLE_DATA', titles)
    public_packs = json.loads((SITE / 'data/costume-packs.json').read_text(encoding='utf-8'))
    public_packs['packs'] = catalog['costumePacks']
    public_packs['updated'] = catalog['updated']
    (SITE / 'data/costume-packs.json').write_text(json.dumps(public_packs, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    # Keep the downloadable source indexes in step with the search catalog.
    indexes = [
        (SITE / 'data/cg-sources.json', artwork['images']),
        (SITE / 'backgrounds/data/sources.json', backgrounds['images'] + titles['images']),
    ]
    for path, records in indexes:
        source = json.loads(path.read_text(encoding='utf-8'))
        by_id = {record['id']: record for record in records}
        source['updated'] = catalog['updated']
        for entry in source['images']:
            record = by_id[entry['id']]
            for key in ['displayName', 'downloadName', 'sceneName', 'aliases', 'location', 'characters']:
                if key in record: entry[key] = record[key]
            if 'placements' in record: entry['placements'] = record['placements']
        path.write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    path = SITE / 'data/sources.json'
    sources = json.loads(path.read_text(encoding='utf-8'))
    sources['updated'] = catalog['updated']; sources['official'] = catalog['official']
    path.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    path = SITE / 'data/chinese-labels.json'
    labels = json.loads(path.read_text(encoding='utf-8'))
    labels['characters'].update(names); labels['variants'] = catalog['variantLabels']
    path.write_text(json.dumps(labels, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    (SITE / 'data/naming-rules.json').write_text(json.dumps(rules, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    with (SITE / 'data/naming-index.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(['资源ID', '分类', '中文名称', '下载文件名', '作品', '原始代码', '资源路径'])
        for item in sorted(index.values(), key=lambda r: (r['category'], r['name'])):
            writer.writerow([item['id'], item['category'], item['name'], item['downloadName'], ' / '.join(item['works']), item['originalName'], item['file']])
    report = {'images': len(index), 'spriteImages': len(sprites), 'backgroundSceneFamilies': len(rules['backgrounds']), 'namedCGFamilies': len(rules['cgScenes']), 'genericCGReclassified': generic_reclassified, 'categories': dict(Counter(r['category'] for r in index.values()))}
    (SITE / 'data/naming-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
