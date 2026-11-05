"""Publish original shared dialogue-box textures, never composed scene frames."""
from pathlib import Path
from collections import defaultdict
from PIL import Image
import argparse,hashlib,json
ROOT=Path(__file__).resolve().parents[2]


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);args=parser.parse_args()
    folder=args.input/'ui-research';selected=json.loads((folder/'selected.json').read_text('utf8'))
    records=[]
    for file in [folder/'raw-index.jsonl',*folder.glob('parts*index*.jsonl')]:records.extend(json.loads(line) for line in file.read_text('utf8').splitlines() if line)
    records=[r for r in records if 'raw' in r]
    roots={(r['archive'],r['entry']):r for r in records if not r['archive'].endswith('.bin')}
    children=defaultdict(dict)
    for r in records:
        if r['archive'].endswith('.bin'):children[Path(r['archive']).stem][r['entryIndex']]=r
    def default_images(record,depth=0):
        if depth>5:return []
        raw=Path(record['raw']).read_bytes()
        if raw[:4]!=b'abmp':
            return [record] if raw.startswith(b'\x89PNG') else []
        items=list(sorted(children[record['sha256']].items()))
        # Character-specific window variants are sibling subcontainers. Default
        # is the first frame, while the older engine splits Back and Frame.
        usable=[r for _,r in items if r['entryIndex'] and not r['entry'].startswith('_MesSurface')]
        if usable and usable[0]['entry'].lower().startswith('window_def'):return default_images(usable[0],depth+1)
        if usable and usable[0]['entry'].startswith('_MesAlpha.b'):
            chosen=[usable[0]]+[r for r in usable[1:] if r['entry'].lower()=='windowframe.b']
            return [image for r in chosen for image in default_images(r,depth+1)]
        if usable and usable[0]['entry'].lower().startswith(('frame','window_frame')):
            chosen=[usable[0]]+[r for r in usable[1:] if r['entry'].startswith('_MesAlpha,')]
            return [image for r in chosen for image in default_images(r,depth+1)]
        if usable:return default_images(usable[0],depth+1)
        return []
    works={};used={}
    for record in selected:
        path=record['name'].replace('\\','/').casefold();game=record['game'][:2]
        variant=None
        if path=='avg/window/windowframe_window.b':pass
        elif path=='avg/window/windowframe_full.b':variant='full'
        elif path=='avg/window/windowframe_window_ion.b':variant='ion'
        elif path=='avg/window/windowframe_window_april.b' or path=='avg/window_april/windowframe_window.b':variant='april'
        elif path=='avg/window_afaf/windowframe_window.b':variant='afaf'
        else:continue
        source=roots[(record['archive'],record['name'])];images=default_images(source)
        if not images:continue
        decoded=[]
        for row in images:
            raw=Path(row['raw']).read_bytes();assert hashlib.sha256(raw).hexdigest()==row['sha256']
            with Image.open(row['raw']) as image:
                image=image.convert('RGBA');width,height=image.size
                file=ROOT/'dist/dialogue/ui'/(row['sha256'][:20]+'.webp');file.parent.mkdir(parents=True,exist_ok=True)
                image.save(file,format='WEBP',lossless=True,exact=True,method=6)
                with Image.open(file) as check:assert check.convert('RGBA').tobytes()==image.tobytes()
            decoded.append({'file':'ui/'+file.name,'width':width,'height':height,'nativeSha256':row['sha256']});used[file.name]=file.stat().st_size
        reference=max(decoded,key=lambda x:x['height']);center=720-reference['height']/2
        # Inner texture first, ornamental frame second. Preserve native canvases.
        decoded.sort(key=lambda x:x['height'])
        layers=[{**r,'x':(1280-r['width'])/2,'y':center-r['height']/2} for r in decoded]
        item={'layers':layers,'text':{'x':180 if variant=='full' else 340,'y':80 if variant=='full' else 554,'width':920 if variant=='full' else 875},'sharedOriginalTextures':True}
        work=works.setdefault(game,{})
        if variant:work.setdefault('variants',{})[variant]=item
        else:work.update(item)
    assert set(works)=={'01','02','03','04','05','06'},set(works)
    assert all(work.get('layers') for work in works.values())
    result={'version':1,'width':1280,'height':720,'works':works}
    (ROOT/'dist/dialogue/ui.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    target_folder=(ROOT/'dist/dialogue/ui').resolve()
    for file in target_folder.glob('*.webp'):
        assert file.resolve().is_relative_to(target_folder)
        if file.name not in used:file.unlink()
    print(json.dumps({'works':len(works),'sharedTextures':len(used),'bytes':sum(used.values()),'composedFrameImages':0}))


if __name__=='__main__':main()
