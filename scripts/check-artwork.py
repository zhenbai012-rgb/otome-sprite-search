"""Check full-canvas artwork, native downloads, scene packs and Chinese labels."""
from pathlib import Path
import collections
import hashlib
import json
import re
import struct

ROOT=Path(__file__).resolve().parents[1]
SITE=ROOT/'dist'

def load(path):
    return json.loads(path.read_text(encoding='utf-8').split('=',1)[1].strip().removesuffix(';'))

def webp_size(path):
    data=path.read_bytes()[:40]
    assert data[:4]==b'RIFF' and data[8:12]==b'WEBP',path
    if data[12:16]==b'VP8X':
        return int.from_bytes(data[24:27],'little')+1,int.from_bytes(data[27:30],'little')+1
    if data[12:16]==b'VP8L':
        assert data[20]==0x2f
        bits=int.from_bytes(data[21:25],'little')
        return (bits&0x3fff)+1,((bits>>14)&0x3fff)+1
    assert data[12:16]==b'VP8 ' and data[23:26]==b'\x9d\x01\x2a',path
    return struct.unpack_from('<H',data,26)[0]&0x3fff,struct.unpack_from('<H',data,28)[0]&0x3fff

def safe(value):
    assert not Path(value).is_absolute() and '..' not in Path(value).parts and '\\' not in value,value

def main():
    catalog=load(SITE/'catalog-data.js')
    payload=load(SITE/'cg-data.js')
    images=payload['images']
    assert len({r['id'] for r in images})==len(images)
    assert collections.Counter(r['kind'] for r in images)=={'cg':481,'title':12,'title_character':11,'title_background':11}
    assert len(payload['originals'])==604
    originals={r['file']:r for r in payload['originals']}
    expected=set()
    for original in originals.values():
        safe(original['file'])
        path=ROOT/'originals/cg'/original['file'];raw=path.read_bytes();expected.add(path)
        assert raw[:8]==b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II',raw[16:24])==(original['width'],original['height'])
        assert len(raw)==original['bytes'] and hashlib.sha256(raw).hexdigest()==original['sha256']
    assert set((ROOT/'originals/cg').rglob('*.png'))==expected
    works={w['id'] for w in catalog['works']}
    roles={c['id'] for c in catalog['characters']}
    pack_ids={p['id'] for p in payload['packs']}
    assert len(pack_ids)==len(payload['packs'])==213
    for r in images:
        assert r['character'] in roles and set(r['characters'])<=roles
        assert set(r['gameIds'])<=works and r['gameIds']
        assert r['packIds'] and set(r['packIds'])<=pack_ids
        original=originals[r['original']]
        assert (r['width'],r['height'],r['originalBytes'],r['originalSha256'])==(original['width'],original['height'],original['bytes'],original['sha256'])
        for key in ('file','thumb'):
            safe(r[key]); assert r[key].startswith('cg-assets/')
            w,h=webp_size(ROOT/r[key])
            if key=='file':
                assert (w,h)==(r['previewWidth'],r['previewHeight']) and w<=1600 and h<=1600
            else:
                assert w<=420 and h<=300
            assert abs(w*r['height']-h*r['width'])<=max(r['width'],r['height']),r['id']
    coverage=set()
    for p in payload['packs']:
        assert p['game'] in works and p['character'] in roles
        safe(p['filename'])
        assert p['count']==len(p['files']) and p['bytes']==sum(f['bytes'] for f in p['files'])<=32*1024*1024
        assert len({f['name'] for f in p['files']})==p['count']
        for f in p['files']:
            safe(f['name'])
            original=originals[f['original']]
            assert (f['width'],f['height'],f['bytes'],f['sha256'])==(original['width'],original['height'],original['bytes'],original['sha256'])
            coverage.add(f['original'])
    assert coverage==set(originals)
    luna=[r for r in images if r['kind']=='cg' and r['scene']=='lun21' and '01_近月少女的礼仪' in r['gameIds']]
    assert len(luna)==3 and all((r['width'],r['height'])==(1280,1440) for r in luna)
    jp=re.compile(r'[\u3040-\u30ff]')
    assert all(not jp.search(c['display']) for c in catalog['characters'])
    assert all(not jp.search(label) for label in catalog['variantLabels'].values())
    assert all(not jp.search(w['label']) for w in catalog['works'])
    background=load(SITE/'backgrounds/catalog.js')
    assert all(not jp.search(label) for label in background['labels']['scenes'].values())
    assert catalog['stats']['cgImages']==481 and catalog['stats']['titleImages']==12
    assert catalog['stats']['titleCharacterImages']==11 and catalog['stats']['titleBackgroundImages']==11
    titles=load(SITE/'backgrounds/title-data.js')
    moved={r['id']:r for r in images if r['kind']=='title_background'}
    assert {r['id'] for r in titles['images']}==set(moved) and len(titles['packs'])==6
    expected=collections.Counter()
    for r in titles['images']:
        source=moved[r['id']]
        assert source['collection']=='backgrounds' and source['titleType'] in ('标题背景','标题图层')
        assert r['originalCollection']=='cg' and r['kinds']==['title']
        for key in ('file','thumb','width','height','original','originalSha256','originalBytes'):
            assert r[key]==source[key]
        for p in r['placements']:
            safe(p['file']);assert p['game'] in works and p['category']==titles['kinds']['title']
            expected[(p['game'],r['id'],p['file'].split('/')[-1])]+=1
    covered=collections.Counter()
    for pack in titles['packs']:
        safe(pack['filename']);assert pack['game'] in works
        assert pack['count']==len(pack['files']) and pack['bytes']==sum(f['bytes'] for f in pack['files'])<=32*1024*1024
        for f in pack['files']:
            safe(f['name']);assert f['originalCollection']=='cg'
            source=moved[f['image']]
            assert (f['original'],f['bytes'],f['sha256'])==(source['original'],source['originalBytes'],source['originalSha256'])
            covered[(pack['game'],f['image'],f['name'])]+=1
    assert covered==expected
    assert all(r.get('titleType')=='人物图层' for r in images if r['kind']=='title_character')
    assert all(r.get('titleType') in ('日文Logo','标题画面') for r in images if r['kind']=='title')
    assert catalog['cg']['script'].split('?')[0]=='cg-data.js'
    assert catalog['cg']['assetBase']=='https://raw.githubusercontent.com/zhenbai012-rgb/otome-sprite-search/main/'
    print(json.dumps({'status':'passed','cg':481,'titles':12,'titleCharacters':11,'titleBackgrounds':11,'titleBackgroundPacks':6,'originals':len(originals),'packs':len(payload['packs']),'lunaFullCanvas':'1280x1440 x3','previewAspectRatios':'passed','chineseOptionLabels':'passed'}))

if __name__=='__main__':main()
