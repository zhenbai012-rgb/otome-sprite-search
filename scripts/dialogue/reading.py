"""Connect existing public scenes using verified script-controller transitions."""
from collections import defaultdict, deque
from pathlib import Path
import argparse
import gzip
import json

ROOT = Path(__file__).resolve().parents[2]


def build(manifest, routes):
    result = {'version': 1, 'datasets': {}}
    for dataset in manifest['datasets']:
        data = json.loads(gzip.decompress((ROOT / dataset['repositoryPath']).read_bytes()))
        by_path = {scene['script']: scene['id'] for scene in data['scenes']}
        edges = defaultdict(set)
        for edge in routes[dataset['work']]['transitions']:
            if edge['source'] != edge['target']:
                edges[edge['source']].add(edge['target'])
        scenes = {scene['id']: {key: scene[key] for key in ('title', 'period', 'routes')} | {'previous': [], 'next': []} for scene in data['scenes']}
        for path, scene_id in by_path.items():
            # Empty/filtered scenes are never published; follow their actual exits.
            queue, seen = deque(sorted(edges[path])), {path}
            while queue:
                target = queue.popleft()
                if target in seen:
                    continue
                seen.add(target)
                if target in by_path:
                    target_id = by_path[target]
                    scenes[scene_id]['next'].append(target_id)
                    scenes[target_id]['previous'].append(scene_id)
                else:
                    queue.extend(sorted(edges[target]))
        for scene in scenes.values():
            for direction in ('previous', 'next'):
                scene[direction] = sorted(set(scene[direction]))
        result['datasets'][dataset['id']] = {'work': dataset['work'], 'language': dataset['language'], 'scenes': scenes}
    return result


def write(manifest, routes):
    result = build(manifest, routes)
    path = ROOT / 'dist/dialogue/reading.json'
    path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--routes', type=Path)
    parser.add_argument('--texts', type=Path)
    args = parser.parse_args()
    if args.texts:
        from routes import build_routes
        routes = build_routes(json.loads(args.texts.read_text('utf8')))
    else:
        if not args.routes:
            parser.error('--routes or --texts is required')
        routes = json.loads(args.routes.read_text('utf8'))
    result = write(json.loads((ROOT / 'dist/dialogue/catalog.json').read_text('utf8')), routes)
    print(json.dumps({'datasets': len(result['datasets']), 'scenes': sum(len(d['scenes']) for d in result['datasets'].values())}))
