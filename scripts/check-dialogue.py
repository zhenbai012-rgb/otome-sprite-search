"""Verify all static search indices, detail targets and image references."""
from pathlib import Path
from collections import Counter
import gzip, hashlib, json, re

ROOT=Path(__file__).resolve().parents[1]
SITE=ROOT/'dist/dialogue'
manifest=json.loads((SITE/'catalog.json').read_text('utf8'))

def read(spec):
    path=(ROOT/spec['repositoryPath']).resolve()
    assert path.is_relative_to(ROOT)
    raw=path.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==spec['sha256'],path
    data=gzip.decompress(raw)
    assert hashlib.sha256(data).hexdigest()==spec['jsonSha256'],path
    return json.loads(data)

assets=read(manifest['assets'])['assets']
routes={r['id']:r for r in manifest['routes']}
assert {d['work'] for d in manifest['datasets']}=={'01','02','03','04','05','06'}
assert len(manifest['datasets'])==12
assert len({d['id'] for d in manifest['datasets']})==12
total=0;paragraphs=0;scenes=0;face_refs=0;choice_rows=0;known_black=False
unresolved=Counter();visual=Counter();details=set()
for dataset in manifest['datasets']:
    data=read(dataset)
    assert data['work']==dataset['work'] and data['language']==dataset['language']
    assert len(data['rows'])==dataset['paragraphs']
    assert dataset['scenes']==len(data['scenes'])
    if dataset['language']=='zh':total+=len(data['rows'])
    pointers={}
    for scene_index,scene_info in enumerate(data['scenes']):
        assert all(r in routes for r in scene_info['routes'])
        key=dataset['id']+'/'+scene_info['id'];details.add(key)
        assert manifest['sceneFiles'][key]==scene_info['detail']
        scene=read(scene_info['detail']);scenes+=1
        assert scene['id']==scene_info['id'] and scene['script']==scene_info['script']
        assert scene['routes']==scene_info['routes']
        assert [r[0] for r in scene['rows']]==list(range(len(scene['rows'])))
        for row in scene['rows']:
            assert row[1].strip() and not re.match(r'^[\\^@％亾]',row[1]),(key,row[:5])
            assert not ('亂'==row[1][:1] and '亃'==row[1][-1:]),(key,row[:5])
            assert row[3] in [0,1,2] and row[4]>0
            assert 0<=row[2]<len(scene['speakers']) and 0<=row[5]<len(scene['states'])
            pointers[(scene_index,row[0])]=(row,scene['speakers'][row[2]])
            paragraphs+=1;choice_rows+=row[3]==2
            state=scene['states'][row[5]]
            layers=state.get('backgrounds',[])+state.get('characters',[])+([state['face']] if state.get('face') else [])
            for layer in layers:
                ids=[layer.get('asset')]+layer.get('candidates',[])
                for image in filter(None,ids):
                    assert image in assets,(key,image)
                    visual[assets[image]['kind']]+=1
                    if assets[image]['kind']=='face':face_refs+=1
                if layer.get('conditional'):assert not layer.get('asset')
            for u in state.get('unresolved',[]):unresolved[u['resource']]+=1
        for choice in scene['choices']+scene['entryChoices']:
            assert choice['options'] and all(o['text'] for o in choice['options'])
            if 'selected' in choice:assert 0<=choice['selected']<len(choice['options'])
        if dataset['id']=='02-zh' and scene['script'].endswith('/bad_02as.s'):
            assert scene['routes']==['02-bad-blackbutler'],scene['routes']
            assert scene['entryPaths']
            path=scene['entryPaths'][0]
            assert [step['selected'] for step in path['steps']]==[0,1,0]
            selected=[step['options'][step['selected']]['text'] for step in path['steps']]
            assert any('迪特琳德' in t for t in selected),selected
            assert any('里想奈' in t for t in selected),selected
            known_black=True
    for row in data['rows']:
        detail,person=pointers[(row[0],row[1])]
        assert detail[1]==row[3] and detail[3]==row[4] and detail[4]==row[5]
        assert data['speakers'][row[2]]==person

assert details==set(manifest['sceneFiles'])
assert total==manifest['total'] and total>100000
assert known_black and face_refs>100 and choice_rows>20
for key,item in assets.items():
    assert item['name'] and item['thumb'].startswith('https://')
    if item['kind']=='face':
        path=ROOT/('dialogue-assets/'+item['file'].split('/main/dialogue-assets/')[1])
        assert path.is_file(),path
for path in [SITE/'catalog.json',ROOT/'dialogue-data/report.json']:
    text=path.read_text('utf8')
    assert not re.search(r'(?<!\w)[A-Za-z]:[\\/]|github_pat_|ghp_',text)
print(json.dumps({'status':'passed','works':6,'datasets':12,'chineseParagraphs':total,'allParagraphs':paragraphs,'scenes':scenes,'choiceRows':choice_rows,'portraitReferences':face_refs,'visualReferences':visual,'mostCommonUncollected':unresolved.most_common(8)},ensure_ascii=False))
