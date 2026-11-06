"""Reverse-index the filtered dialogue corpus; never copy full scripts or frames."""
from __future__ import annotations
from collections import defaultdict, Counter
from pathlib import Path
import argparse, gzip, hashlib, json, re

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'scripts/cg-script-references.json'
OUTPUT = ROOT / 'dist/data/cg-story-index.json'


def read_catalog():
    return json.loads((ROOT / 'dist/cg-data.js').read_text('utf8').split('=', 1)[1].strip().removesuffix(';'))


def canonical(path):
    return str(path).replace('\\', '/').casefold()


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8', newline='\n')


def collect_evidence(private):
    """Keep only resource commands and route IDs, not unfiltered dialogue text."""
    metadata = json.loads((private / 'route-research.json').read_text('utf8'))
    images = [r for r in read_catalog()['images'] if r['kind'] == 'cg']
    by_work = defaultdict(dict)
    for image in images:
        for place in image['placements']:
            stem = Path(canonical(place['resource'])).stem
            by_work[place['game'][:2]].setdefault(stem, set()).add(image['id'])
    result, preloads = defaultdict(list), defaultdict(list)
    for work, names in by_work.items():
        folder = next((private / '整理文本').glob(work + '_*')) / '日文/原始脚本'
        pattern = re.compile(r'(?<![\w])(' + '|'.join(map(re.escape, sorted(names, key=len, reverse=True))) + r')(?![\w])', re.I)
        for script, scene in metadata[work]['scenes'].items():
            file = folder / script
            if not file.is_file():
                # Windows handles case, while the exported path may retain case.
                continue
            source = file.read_text('utf8')
            for line_number, line in enumerate(source.splitlines(), 1):
                command = line.strip()
                preload = command.casefold().startswith('\\s,')
                if not command.startswith('^') and not preload:
                    continue
                for match in pattern.finditer(command):
                    for asset in names[match[1].casefold()]:
                        (preloads if preload else result)[asset].append({'work': work, 'script': script, 'line': line_number,
                                              'routes': [work + '-' + r for r in scene['routeIds']],
                                              'command': command, 'preload': preload,
                                              'sourceSha256': hashlib.sha256(source.encode()).hexdigest()})
        # Ending movies are called directly after a story jump in root.s.
        # Their image preloads belong to the ending, not to a spoken frame.
        controller = folder / 'scenario/root.s'
        if controller.is_file():
            previous = None
            controller_lines = controller.read_text('utf8').splitlines()
            for number, line in enumerate(controller_lines, 1):
                match = re.match(r'^\\(?:jmp|sub|go),[^,]+,"([^"]+\.s)"', line.strip(), re.I)
                if not match:
                    continue
                target = canonical(match[1])
                if target in metadata[work]['scenes']:
                    previous = (target, line.strip(), number)
                elif target.startswith('scenario/ed_movie') and previous and (folder / target).is_file():
                    context, caller, caller_line = previous
                    intervening = [x.strip() for x in controller_lines[caller_line:number-1] if x.strip()]
                    expected_label = '@@' + Path(context).stem + '_end'
                    if any(x.casefold() != expected_label for x in intervening):
                        continue  # Do not infer a movie route across another jump.
                    movie = (folder / target).read_text('utf8')
                    for movie_line, command in enumerate(movie.splitlines(), 1):
                        if not command.strip().casefold().startswith(('^', '\\s,')):
                            continue
                        for hit in pattern.finditer(command):
                            for asset in names[hit[1].casefold()]:
                                result[asset].append({'work': work, 'script': context,
                                    'line': len((folder / context).read_text('utf8').splitlines()),
                                    'routes': [work + '-' + r for r in metadata[work]['scenes'][context]['routeIds']],
                                    'kind': 'ending', 'movieScript': target, 'movieLine': movie_line,
                                    'controller': 'scenario/root.s', 'controllerLine': number,
                                    'caller': caller, 'call': line.strip(), 'command': command.strip(),
                                    'sourceSha256': hashlib.sha256(movie.encode()).hexdigest()})
                else:
                    previous = None
    for asset, refs in preloads.items():
        if asset not in result:
            result[asset] = refs  # Association only; never proof of a visible frame.
    dump(EVIDENCE, {'version': 1, 'assets': dict(sorted(result.items()))})


def layers(snapshot):
    records = list(snapshot.get('backgrounds', [])) + list(snapshot.get('characters', []))
    if not snapshot.get('backgrounds') and snapshot.get('background'):
        records.append(snapshot['background'])
    if snapshot.get('face'):
        records.append(snapshot['face'])
    return records


def references(snapshot, ids):
    found = {}
    for layer in layers(snapshot):
        alternatives = layer.get('alternatives') or [layer]
        for variant in alternatives:
            if variant.get('visible') is False:
                continue
            asset = variant.get('asset', layer.get('asset'))
            if asset in ids:
                kind = 'conditional' if layer.get('conditional') or len(alternatives) > 1 else 'exact'
                if found.get(asset) != 'exact':
                    found[asset] = kind
    return found


def build():
    manifest_path = ROOT / 'dist/dialogue/catalog.json'
    manifest = json.loads(manifest_path.read_text('utf8'))
    catalog = read_catalog()
    images = {r['id']: r for r in catalog['images'] if r['kind'] == 'cg'}
    evidence = json.loads(EVIDENCE.read_text('utf8'))['assets']
    locations = defaultdict(list)
    scenes, scripts, scene_rows = {}, defaultdict(dict), {}
    for key, spec in manifest['sceneFiles'].items():
        raw = (ROOT / spec['repositoryPath']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == spec['sha256'], key
        scene = json.loads(gzip.decompress(raw))
        scenes[key] = {'id': scene['id'], 'dataset': key.split('/')[0], 'work': scene['work'],
                       'language': scene['language'], 'title': scene['title'], 'period': scene['period'],
                       'routes': scene['routes'], 'script': scene['script'], 'spec': spec}
        scripts[(scene['work'], canonical(scene['script']))][scene['language']] = key
        scene_rows[key] = scene['rows']
        state_refs = {i: references(s, images) for i, s in enumerate(scene['states'])}
        active = {}
        for row in scene['rows']:
            refs = state_refs[row[5]]
            for asset in list(active):
                if asset not in refs or active[asset]['kind'] != refs[asset]:
                    active.pop(asset)
            for asset, kind in refs.items():
                if asset in active and active[asset]['to'] == row[0] - 1:
                    active[asset]['to'] = row[0]
                else:
                    entry = {'scene': key, 'from': row[0], 'to': row[0], 'kind': kind, 'target': asset}
                    locations[asset].append(entry)
                    active[asset] = entry
    # Explicit script loads can fall between dialogue units or in omitted text.
    # They locate the source scene, but are never called an exact dialogue frame.
    for asset, refs in evidence.items():
        if asset not in images:
            continue
        linked = {(scenes[e['scene']]['work'], canonical(scenes[e['scene']]['script'])) for e in locations[asset]}
        for ref in refs:
            if (ref['work'], canonical(ref['script'])) in linked:
                continue
            for key in scripts.get((ref['work'], canonical(ref['script'])), {}).values():
                row = min(scene_rows[key], key=lambda r: abs(r[4] - ref['line']))
                entry = {'scene': key, 'from': row[0], 'to': row[0], 'kind': ref.get('kind') or ('preload' if ref.get('preload') else 'script'), 'sourceLine': ref['line']}
                if entry not in locations[asset]:
                    locations[asset].append(entry)
    # Curated CG scene packs establish related differences, not exact uses.
    families = defaultdict(set)
    for asset, image in images.items():
        for place in image['placements']:
            families[(place['game'][:2], place['scene'])].add(asset)
    primary = {a: list(entries) for a, entries in locations.items()}
    for asset, image in images.items():
        if locations[asset]:
            continue
        for place in image['placements']:
            work = place['game'][:2]
            for peer in sorted(families[(work, place['scene'])] - {asset}):
                for entry in primary.get(peer, []):
                    if scenes[entry['scene']]['work'] != work:
                        continue
                    target = {'scene': entry['scene'], 'from': entry['from'], 'to': entry['to'],
                              'kind': 'difference', 'related': peer}
                    if entry.get('target'):
                        target['target'] = entry['target']
                    if target not in locations[asset]:
                        locations[asset].append(target)
                if locations[asset]:
                    break
    records = {}
    for asset, image in images.items():
        entries = sorted(locations[asset], key=lambda e: (0 if e['kind'] == 'exact' else 1 if e['kind'] == 'conditional' else 2,
                                                         scenes[e['scene']]['language'] != 'zh', e['scene'], e['from']))
        routes = {r for e in entries for r in scenes[e['scene']]['routes']}
        routes.update(r for ref in evidence.get(asset, []) for r in ref['routes'])
        status = 'exact' if any(e['kind'] in ('exact', 'conditional') for e in entries) else 'related' if entries else 'unlocated'
        records[asset] = {'routes': sorted(routes), 'status': status, 'locations': entries}
        image['story'] = {'routes': sorted(routes), 'status': status, 'locations': len(entries)}
    used = {e['scene'] for record in records.values() for e in record['locations']}
    output = {'version': 1, 'manifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
              'works': manifest['works'], 'routes': manifest['routes'],
              'scenes': {key: scenes[key] for key in sorted(used)}, 'assets': records,
              'stats': dict(Counter(record['status'] for record in records.values()))}
    dump(OUTPUT, output)
    catalog['storyRoutes'] = manifest['routes']
    cg_file = ROOT / 'dist/cg-data.js'
    cg_file.write_text('window.CATALOG_CG_DATA=' + json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8', newline='\n')
    main_file = ROOT / 'dist/catalog-data.js'
    main = json.loads(main_file.read_text('utf8').split('=', 1)[1].strip().removesuffix(';'))
    main['cg']['script'] = 'cg-data.js?v=' + hashlib.sha256(cg_file.read_bytes()).hexdigest()[:12]
    main_file.write_text('window.CATALOG_DATA=' + json.dumps(main, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8', newline='\n')
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, help='Optional private extraction root; refresh resource-command evidence first')
    args = parser.parse_args()
    if args.input:
        collect_evidence(args.input)
    result = build()
    print(json.dumps({'assets': len(result['assets']), 'scenes': len(result['scenes']), 'status': result['stats'], 'indexBytes': OUTPUT.stat().st_size}))
