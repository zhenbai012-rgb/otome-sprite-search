"""Apply the current naming catalog to existing native sprite ZIPs, without decoding images."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads(path.read_text(encoding='utf-8').split('=', 1)[1].strip().removesuffix(';'))


def safe(text):
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', text).strip(' .')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='Directory containing the 195 existing sprite ZIPs')
    parser.add_argument('output', type=Path, help='An empty output directory')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if any(args.output.iterdir()): raise RuntimeError('Output directory must be empty')
    if args.input.resolve() == args.output.resolve(): raise RuntimeError('Input and output must differ')
    catalog = load(ROOT / 'dist/catalog-data.js')
    sprites = load(ROOT / 'dist/game-data.js')
    by_hash = {PurePosixPath(r['file']).stem: r for r in sprites}
    covered = set(); result = []
    for index, pack in enumerate(catalog['costumePacks'], 1):
        target = args.output / pack['asset']
        with zipfile.ZipFile(args.input / pack['asset']) as source, zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as output:
            manifest = json.loads(source.read('manifest.json'))
            member_names = set()
            for entry in manifest['files']:
                row = by_hash[entry['raw_sha256']]
                assert (row['character'], row['variant'], row['costume']) == (pack['character'], pack['variant'], pack['costume'])
                assert entry['raw_sha256'] not in covered
                png = source.read(entry['file'])
                assert hashlib.sha256(png).hexdigest() == entry['png_sha256']
                filename = '/'.join([safe(pack['display']), safe(pack['variantLabel']), safe(pack['label']), row['downloadName']])
                assert filename not in member_names
                member_names.add(filename); covered.add(entry['raw_sha256'])
                output.writestr(filename, png)
                entry.update(file=filename, name=row['downloadName'][:-4], character=pack['display'], variant=pack['variantLabel'], outfit=row['outfit'])
            manifest.update(character=pack['display'], variant=pack['variantLabel'], label=pack['label'], naming_version=1)
            output.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8'), compress_type=zipfile.ZIP_DEFLATED)
        with zipfile.ZipFile(target) as archive:
            assert archive.testzip() is None
        with target.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        result.append(dict(pack, size=target.stat().st_size, sha256=digest))
        if index % 20 == 0: print(f'Named and verified {index} / {len(catalog["costumePacks"])} packs', flush=True)
    assert covered == set(by_hash) and len(covered) == 9399
    (args.output / 'costume-packs.json').write_text(json.dumps({'count': len(result), 'images': len(covered), 'packs': result}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Completed: {len(result)} ZIPs, {len(covered)} unchanged PNGs')


if __name__ == '__main__':
    main()
