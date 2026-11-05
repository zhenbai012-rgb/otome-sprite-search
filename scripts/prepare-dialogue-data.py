"""Publish compressed dialogue details on the same origin without Git duplicates."""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'dist/dialogue/records'
manifest=json.loads((ROOT/'dist/dialogue/catalog.json').read_text('utf8'))
specs=[manifest['assets'],*manifest['datasets'],*manifest['sceneFiles'].values()]
keep=set();total=0
for spec in specs:
    name=spec['repositoryPath']
    if not name.startswith('dialogue-data/'):continue
    source=(ROOT/name).resolve();target=folder/name.removeprefix('dialogue-data/')
    assert source.is_relative_to((ROOT/'dialogue-data').resolve()) and target.resolve().is_relative_to(folder.resolve())
    raw=source.read_bytes();assert hashlib.sha256(raw).hexdigest()==spec['sha256']
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists() or target.read_bytes()!=raw:shutil.copyfile(source,target)
    keep.add(target.resolve());total+=len(raw)
for target in folder.rglob('*.json.gz'):
    assert target.resolve().is_relative_to(folder.resolve())
    if target.resolve() not in keep:target.unlink()
print(json.dumps({'status':'passed','sameOriginDialogueFiles':len(keep),'bytes':total}))
