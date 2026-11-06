"""Compile local QLIE text into a static, searchable corpus; never run game code.

Private inputs and unfiltered exports stay outside the checkout. Public datasets
contain narrative paragraphs, choices and resolved visual references only.
"""
from pathlib import Path
from collections import defaultdict, Counter, deque
import argparse, csv, gzip, hashlib, json, re, unicodedata
from routes import build_routes, normalize_script, adult_segments
from visual_state import ArtworkResourceIndex, VisualStateTracker, split_arguments
from engine_layout import enrich_resource, layout

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / 'dist'
RAW = 'https://raw.githubusercontent.com/zhenbai012-rgb/otome-sprite-search/main/'
CDN = 'https://cdn.jsdelivr.net/gh/zhenbai012-rgb/otome-sprite-search@main/'
LABELS = ['近月少女的礼仪', '少女理论及其周边 -Ecole de Paris-', '少女理论及其之后的周边 -Belle Epoque-', '近月少女的礼仪2', '近月少女的礼仪2.1', '近月少女的礼仪2.2']
SHORT = ['近月1', '少女理论', '少女理论之后', '近月2', '近月2.1', '近月2.2']
VOICE = re.compile(r'^[％%亾]([^\s,]+)')
IF = re.compile(r'^\\if(?:\b|,)', re.I)
ELSE = re.compile(r'^\\else(?:\b|,)', re.I)
END = re.compile(r'^\\end\s*(?://.*)?$', re.I)
LABEL = re.compile(r'^@@(?!@)([^\s,]+)')
JUMP = re.compile(r'^\\jmp,\s*(@@[^,\s]+)\s*$', re.I)
VISUAL = re.compile(r'^\^(?:bg\d+|ef\d+|chara\d+|face|camera|message|include)(?:,|$)', re.I)
EXPLICIT_CHOICE = re.compile(r'手コキ|手淫|手撸|自慰|射精|精液|性交|口交|阴茎|陰茎|陰部|阴部|性器|フェラ|パイズリ',re.I)

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8', newline='\n')

def sha(data): return hashlib.sha256(data).hexdigest()
def sid(game, path): return sha((game+'|'+path).encode())[:16]
def folded(text): return unicodedata.normalize('NFKC', text).casefold().replace(' ', '').replace('蔵', '藏').replace('倉', '仓').replace('櫻', '樱')

def chinese_text(row):
    """Legacy patches mix CP932 engine resources with GBK translated prose.

    Their custom font deliberately maps 【】％＠ to 亂亃亾仐 in GBK. Restore
    those delimiters in text, while keeping resource paths in their own codec.
    """
    raw = Path(row['raw']).read_bytes()
    if raw.startswith((b'\xff\xfe', b'\xfe\xff', b'\xef\xbb\xbf')):
        return raw.decode('utf-16' if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else 'utf-8-sig')
    lines = []
    for original in raw.splitlines():
        trimmed = original.lstrip()
        command = trimmed.startswith((b'^', b'\\', b'@'))
        translated_command = trimmed.lower().startswith((b'^savescene', b'^select,'))
        text = original.decode('cp932' if command and not translated_command else 'gb18030', errors='replace')
        if text.lstrip().startswith('亂') and '亃' in text:
            text = text.replace('亂', '【', 1).replace('亃', '】', 1).replace('仐', '＠')
        if text.lstrip().startswith('亾'): text = text.replace('亾', '％', 1)
        lines.append(text)
    return '\n'.join(lines)

def artifact(value, folder, stem, onsite=False):
    data = (json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n').encode()
    packed = gzip.compress(data, compresslevel=9, mtime=0)
    name = stem+'.'+sha(packed)[:12]+'.json.gz'
    path = ROOT / folder / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(packed)
    rel = path.relative_to(ROOT).as_posix()
    url = ('data/'+name) if onsite else RAW+rel
    return {'url':url, 'fallbacks':[CDN+rel, RAW+rel] if onsite else [CDN+rel], 'repositoryPath':rel, 'sha256':sha(packed), 'jsonSha256':sha(data), 'bytes':len(packed)}

class Speakers:
    def __init__(self, catalog):
        self.roles = catalog['characters']; self.lookup = {}; self.people = {}
        for role in self.roles:
            if role.get('resourceGroup'): continue
            for name in [role['id'],role['display'],*role.get('aliases',[])]:
                self.lookup[folded(name)] = {'id':role['id'],'name':role['display']}
    def get(self, raw):
        if not raw: return {'id':'narration','name':'旁白','raw':''}
        names = [p.strip() for p in re.split('[＠@]', raw) if p.strip()]
        known = next((self.lookup[folded(n)] for n in reversed(names) if folded(n) in self.lookup), None)
        result = dict(known) if known else {'id':'npc-'+sha(folded(names[-1] if names else raw).encode())[:12], 'name':names[-1] if names else raw}
        result['raw'] = raw; self.people[result['id']] = result
        return result

def public_state(tracker):
    snapshot = tracker.snapshot()
    def layer(item):
        if item.get('certainty') == 'exact':
            return {'asset':item.get('assetId'), 'raw':item.get('resource',''), 'slot':item['slot'], 'layout':layout(item.get('properties',{}))}
        alternatives=[{'asset':a.get('assetId'),'raw':a.get('resource',''),'visible':a.get('visible',False),'layout':layout(a.get('properties',{}))} for a in item.get('alternatives',[])]
        return {'asset':None,'slot':item['slot'],'candidates':list(dict.fromkeys(a['asset'] for a in alternatives if a['visible'] and a['asset'])), 'conditional':True, 'alternatives':alternatives}
    # Higher priority is rendered on top. Preserve every background layer too.
    backgrounds = sorted(snapshot['backgrounds'], key=lambda a:float(a.get('properties',{}).get('pri','0').lstrip('$')) if re.fullmatch(r'\d+(?:\.\d+)?', a.get('properties',{}).get('pri','0')) else 0)
    collected=[x for x in backgrounds if x['slot'].startswith('bg') and (x.get('assetId') or x.get('assetIds'))]
    primary=collected[-1] if collected else backgrounds[-1] if backgrounds else None
    result = {'background':layer(primary) if primary else None, 'backgrounds':[layer(x) for x in backgrounds], 'characters':[layer(x) for x in snapshot['characters']], 'face':layer(snapshot['face']) if snapshot['face'] else None}
    if any(x.get('certainty') == 'conditional' for x in backgrounds+snapshot['characters']+([snapshot['face']] if snapshot['face'] else [])): result['conditional'] = True
    if snapshot['unresolved']: result['unresolved'] = snapshot['unresolved']
    if snapshot['incomplete']: result['incomplete'] = True
    for key in ('camera','message'):
        if snapshot.get(key):
            result[key]=layout(snapshot[key]['properties'])
            if key=='message':result[key]['file']=snapshot[key]['properties'].get('file','none')
    return result

def cleanup(text):
    text = re.sub(r'\[(?:n|r|br)\]', ' ', text, flags=re.I)
    text = re.sub(r'\[rb,([^,\]]+),[^\]]*\]', r'\1', text, flags=re.I)
    text = text.replace('\u3000', ' ').strip()
    return text

def scene_compile(row, meta, initial, speakers, choices):
    lines = row['text'].splitlines(); tracker = initial.fork()
    states = []; state_ids = {}; rows = []; people = []; person_ids = {}
    branches = []; pending_targets = defaultdict(list); dead = False; unknown_control = False
    adult = adult_segments(row['text'])
    speaker = ''; voice = ''; paragraph = None; in_quote = False
    ignored = 0; skip_guard = None; was_marked = False; selection_labels = []
    labels = {m[1].casefold():n for n,line in enumerate(lines,1) if (m:=LABEL.match(line.strip()))}
    local_ranges = []
    for c in choices:
        for option in c['options']:
            r = option.get('localBranchRange')
            if r: local_ranges.append((r['startLine'],r['endLine'],c['id']+':'+str(option['index'])))
    def finish():
        nonlocal paragraph
        if not paragraph: return
        text, who, kind, line, vid, flags = paragraph
        # QLIE commits the pending message after the following visual directives.
        # The supplied reference screenshot (02/C20_01B) confirms this ordering.
        state=public_state(tracker)
        if unknown_control: state['incomplete'] = True
        encoded = json.dumps(state,ensure_ascii=False,sort_keys=True,separators=(',', ':'))
        if encoded not in state_ids: state_ids[encoded]=len(states);states.append(state)
        person = speakers.get(who)
        key = person['id']+'|'+person['raw']
        if key not in person_ids: person_ids[key]=len(people);people.append(person)
        rows.append([len(rows),cleanup(text),person_ids[key],kind,line,state_ids[encoded],flags,vid])
        paragraph = None
    for number, original in enumerate(lines,1):
        line = original.strip()
        if not line: continue
        marked = any(number>=r['startLine'] and (r.get('endLine') is None or number<=r['endLine']) for r in adult)
        if marked and not was_marked:
            finish();speaker='';voice='';in_quote=False
        was_marked=marked
        if IF.match(line):
            if skip_guard is not None: skip_guard += 1;continue
            if 'ResultInt==1' in line and any('SceneSkipjudge' in x for x in lines[max(0,number-8):number]): skip_guard=1;continue
            finish(); branches.append({'start':tracker.fork(),'dead':dead,'ends':[],'else':False});continue
        if skip_guard is not None:
            if END.match(line):
                skip_guard-=1
                if not skip_guard: skip_guard=None
            continue
        if ELSE.match(line):
            finish()
            if branches:
                item=branches[-1]
                if not dead: item['ends'].append(tracker.fork())
                tracker=item['start'].fork();dead=item['dead'];item['else']=True
            continue
        if END.match(line) and branches:
            finish();item=branches.pop();ends=item['ends']
            if not dead: ends.append(tracker)
            if not item['else'] and not item['dead']: ends.append(item['start'])
            if ends: tracker=VisualStateTracker.merge(ends);dead=False
            else: dead=True
            continue
        label = LABEL.match(line)
        if label:
            finish();incoming=pending_targets.pop(label[1].casefold(),[])
            if incoming:
                if not dead:incoming.append(tracker)
                tracker=VisualStateTracker.merge(incoming);dead=False
            continue
        if line.casefold().startswith('^selectlabel,'):
            selection_labels=[v.strip('"').lstrip('@').casefold() for v in split_arguments(line)[1:]]
            continue
        if line.casefold().startswith('\\jmp,') and 'avg_selectcurlabel' in line.casefold():
            finish()
            targets=[v for v in selection_labels if v in labels and labels[v]>number]
            if targets and not dead:
                for target in targets:pending_targets[target].append(tracker.fork())
                dead=True
            else:unknown_control=True
            continue
        jump = JUMP.match(line)
        if jump and jump[1][2:].casefold() in labels:
            finish();target=jump[1][2:].casefold()
            if labels[target]>number and not dead: pending_targets[target].append(tracker.fork());dead=True
            elif labels[target]<=number: unknown_control=True
            continue
        if dead: continue
        if line.casefold().startswith('\\jmp,') and not jump:unknown_control=True
        if line.lower().startswith(('\\case', '\\switch')): unknown_control=True
        if tracker.flushes_text(line):finish()
        if VISUAL.match(line):tracker.feed(line,source=normalize_script(row['entry']),line_number=number);continue
        if marked:
            if not line.startswith(('^','\\','@','％','%','【','//',';','#')):ignored+=1
            continue
        if line.casefold().startswith('^select,'):
            finish()
            if EXPLICIT_CHOICE.search(line):continue
            for option in split_arguments(line)[1:]:
                paragraph=[option.strip('"'),'',2,number,'',[]];finish()
            continue
        vm=VOICE.match(line)
        if vm:finish();speaker='';voice=vm[1];in_quote=False;continue
        if line.startswith('【') and '】' in line:
            finish();speaker=line[1:line.index('】')];in_quote=False;continue
        if line.startswith(('^','\\','@','％','%','//',';','#')): continue
        text=cleanup(line)
        if not text:continue
        flags=[key for start,end,key in local_ranges if start<=number<=end]
        if in_quote and paragraph:
            paragraph[0]+=' '+text
        else:
            finish();kind=0 if speaker or text.startswith(('「','『','“')) else 1
            paragraph=[text,speaker if kind==0 else '',kind,number,voice,flags]
        in_quote = bool(paragraph and paragraph[2]==0 and ('「' in paragraph[0] or '“' in paragraph[0]) and not paragraph[0].endswith(('」','”')))
        if not in_quote:speaker='';voice=''
    finish()
    return {'rows':rows,'states':states,'speakers':people}, tracker, ignored

def ordered_scenes(meta):
    keys=set(meta['scenes']);parents=defaultdict(set);children=defaultdict(set)
    for edge in meta['transitions']:
        a,b=edge['source'],edge['target']
        if a in keys and b in keys and a!=b:parents[b].add(a);children[a].add(b)
    counts={p:len(parents[p]) for p in keys};queue=deque(sorted(p for p,n in counts.items() if n==0));order=[]
    while queue:
        p=queue.popleft();order.append(p)
        for child in sorted(children[p]):
            counts[child]-=1
            if counts[child]==0:queue.append(child)
    order.extend(sorted(keys-set(order)))
    return order,parents

def choice_public(choice, selected=None, label=None):
    options=[{'text':o['text'],'targets':o.get('directTargets',[])} for o in choice['options'] if not o.get('sensitive')]
    # Do not renumber a choice after silently deleting an explicit option.
    if len(options)!=len(choice['options']) or any(EXPLICIT_CHOICE.search(o['text']) for o in options):return None
    result={'id':choice['id'],'label':label or '本场景选项','line':choice['line'],'source':choice['source'],'options':options}
    if selected is not None:result['selected']=selected
    if choice.get('conditions'):result['note']='此选项是否出现还取决于此前的选择。'
    return result

def portrait_thumbnails(ids, assets, private):
    """Keep portraits used by public scenes on Pages for reliable first paint."""
    from PIL import Image
    from io import BytesIO
    import shutil
    keep=set();total=0
    for key in sorted(ids):
        asset=assets[key]
        if asset['kind']!='face':continue
        source=ROOT/('dialogue-assets/'+asset['file'].split('/main/dialogue-assets/')[1])
        cached=private/'artwork-research/face-previews'/source.name
        if not source.exists() and cached.exists():
            source.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(cached,source)
        with Image.open(source) as image:
            image=image.convert('RGBA');image.thumbnail((192,192),Image.Resampling.LANCZOS)
            buffer=BytesIO();image.save(buffer,format='WEBP',quality=86,method=4);data=buffer.getvalue()
        digest=sha(data);file=SITE/'dialogue/faces'/digest[:2]/(digest+'.webp')
        file.parent.mkdir(parents=True,exist_ok=True)
        if not file.exists():file.write_bytes(data)
        keep.add(file.resolve());total+=len(data)
        asset['thumb']='https://zhenbai012-rgb.github.io/otome-sprite-search/'+file.relative_to(SITE).as_posix()
    folder=SITE/'dialogue/faces'
    for file in folder.rglob('*.webp'):
        assert file.resolve().is_relative_to(folder.resolve())
        if file.resolve() not in keep and re.fullmatch(r'[a-f0-9]{64}\.webp',file.name):file.unlink()
    return {'portraits':len(keep),'bytes':total,'maximumEdge':192,'canvasUncropped':True}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);parser.add_argument('--native',type=Path,required=True);args=parser.parse_args()
    private=args.input; native=json.loads(args.native.read_text('utf8')); chinese=json.loads((private/'chinese-texts.json').read_text('utf8'))
    catalog=json.loads((SITE/'catalog-data.js').read_text('utf8').split('=',1)[1].strip().removesuffix(';'))
    cn=[]
    for row in chinese:
        if row['entry'].lower().endswith('.s'):
            cn.append({**row,'text':chinese_text(row)})
    dump(private/'chinese-decoded.json',cn)
    native_rows={(r['game'],normalize_script(r['entry'])):r for r in native if r['entry'].lower().endswith('.s')}
    cn_rows={(r['game'],normalize_script(r['entry'])):r for r in cn if r['entry'].lower().endswith('.s')}
    print('Parsing route controllers and translated choices',flush=True)
    native_cache=private/'route-research.json'
    routes=build_routes(list(native_rows.values()))
    dump(native_cache,routes)
    combined={**native_rows,**cn_rows}
    cn_key=sha(json.dumps([(g,p,sha(r['text'].encode())) for (g,p),r in sorted(combined.items())],ensure_ascii=False).encode()+ (Path(__file__).parent/'routes.py').read_bytes())
    cn_cache=private/'chinese-route-research.json';cn_key_file=private/'chinese-route-key.txt'
    cn_routes=json.loads(cn_cache.read_text('utf8')) if cn_cache.exists() and cn_key_file.exists() and cn_key_file.read_text()==cn_key else build_routes(list(combined.values()))
    dump(private/'chinese-route-research.json',cn_routes)
    cn_key_file.write_text(cn_key)
    resource=json.loads((private/'artwork-resource-map.json').read_text('utf8'))
    enrich_resource(resource,private)
    faces=json.loads((private/'artwork-research/faces-map.json').read_text('utf8'))
    for row in faces['nativeEntries']:
        image=faces['images'][row['sha256']];key=row['game'][:2]+'|'+row['resource'].replace('\\','/').casefold()
        resource['resources'][key]={'resource':row['resource'],'assetId':image['id'],'assetIds':[image['id']],'rawSha256':row['sha256'],'archive':row['archive']}
    for image in faces['images'].values():resource['assets'][image['id']]=image
    index=ArtworkResourceIndex(resource);speakers=Speakers(catalog)
    assets={'version':1,'assets':{key:{'name':r['name'],'label':r['name'],'kind':r['kind'],'thumb':r['thumbnail'],'file':r['preview'],'link':r['galleryUrl'],'characters':r.get('characters',[]),'width':r.get('originalWidth',r.get('width')),'height':r.get('originalHeight',r.get('height'))} for key,r in resource['assets'].items()}}
    bounds_file=private/'sprite-bounds.jsonl'
    if bounds_file.exists():
        for bound in map(json.loads,bounds_file.read_text('utf8').splitlines()):
            if 'crop' in bound and bound['id'] in assets['assets']:
                item=assets['assets'][bound['id']]
                assert item['width']==bound['width'] and item['height']==bound['height']
                item['crop']=bound['crop']
    asset_spec=artifact(assets,'dialogue-data','assets')
    manifest={'version':1,'works':[{'id':f'{i+1:02}','label':label,'short':SHORT[i]} for i,label in enumerate(LABELS)],'routes':[],'speakers':[],'aliases':[{'name':r['display'],'aliases':[r['id'],*r.get('aliases',[])]} for r in catalog['characters'] if not r.get('resourceGroup')], 'normalization':{'url':'normalization.json'},'assets':asset_spec,'datasets':[],'sceneFiles':{},'total':0}
    report={'version':1,'games':[],'faces':faces['stats'],'exclusion':'Only engine-marked adult intervals; ordinary flashbacks and remaining route paragraphs retained.','visualPolicy':'Exact native resource hashes; conditional states retain alternatives. Missing inherited state and uncollected resources are reported.'}
    used_faces=set();used_assets=set()
    private_export=private/'整理文本';private_export.mkdir(exist_ok=True)
    for language,source in [('zh',combined),('ja',native_rows)]:
        for (game,path),row in source.items():
            folder=private_export/(game+'_'+SHORT[int(game)-1])/('中文' if language=='zh' else '日文')/'原始脚本'
            file=folder/path
            assert file.resolve().is_relative_to(folder.resolve())
            file.parent.mkdir(parents=True,exist_ok=True)
            file.write_text(row['text'],encoding='utf8',newline='\n')
    for game,meta in routes.items():
        manifest['routes'].extend({'id':game+'-'+r['id'],'work':game,'name':r['label'],'type':r['type']} for r in meta['routes'])
        order,parents=ordered_scenes(meta)
        game_report={'work':game,'title':LABELS[int(game)-1],'languages':{}}
        for language,source,choice_meta in [('zh',cn_rows,cn_routes[game]),('ja',native_rows,meta)]:
            dataset_id=game+'-'+language;d_scenes=[];d_rows=[];d_people=[];d_person_ids={};end_states={};ignored=0;missing=[];visual_rows=0
            choice_map={c['id']:c for c in choice_meta['choices']};local_map=defaultdict(list)
            for choice in choice_meta['choices']:local_map[choice['anchorScene']].append(choice)
            export_dir=private_export/(game+'_'+SHORT[int(game)-1])/('中文' if language=='zh' else '日文');export_dir.mkdir(parents=True,exist_ok=True)
            csv_path=export_dir/'台词与画面.csv'
            with csv_path.open('w',encoding='utf-8-sig',newline='') as handle:
                writer=csv.writer(handle);writer.writerow(['场景','路线','原始脚本','段落','行号','人物','文本','背景素材','人物素材','头像素材','选项分支'])
                for path in order:
                    row=source.get((game,path))
                    if row is None:missing.append(path);continue
                    smeta=meta['scenes'][path];translated=choice_meta['scenes'].get(path,{})
                    prior=[end_states[p] for p in sorted(parents[path]) if p in end_states]
                    initial=VisualStateTracker.merge(prior) if prior else VisualStateTracker(index,game,namespace='avg2' if '@@@AVG2' in row['text'].upper() else 'avg')
                    initial.namespace='avg2' if '@@@AVG2' in row['text'].upper() else 'avg'
                    compiled,end,skipped=scene_compile(row,smeta,initial,speakers,local_map[path]);end_states[path]=end;ignored+=skipped
                    if not compiled['rows']:continue
                    scene_id=sid(game,path);title=translated.get('title') or smeta['title'] or Path(path).stem;period=translated.get('date') or smeta.get('date','')
                    route_ids=[game+'-'+r for r in smeta['routeIds']]
                    local=[p for c in local_map[path] if (p:=choice_public(c))]
                    # Newer games put choices in a separate controller after the
                    # story scene. Index their text at the anchor scene as well.
                    for choice in local:
                        if choice['source']==path:continue
                        for option in choice['options']:
                            compiled['rows'].append([len(compiled['rows']),option['text'],0,2,choice['line'],compiled['rows'][-1][5],[],'',choice['source']])
                    entry=[];entry_paths=[]
                    for p in smeta.get('entryPaths',[]):
                        steps=[]
                        for step in p['choices']:
                            c=choice_map.get(step['choice'])
                            if c and (v:=choice_public(c,step['option'])):steps.append(v)
                        if steps:entry_paths.append({'route':game+'-'+p['routeId'],'steps':steps,'note':'为路线入口选择组合；场景内仍可能有其他条件。'})
                    grouped=defaultdict(set)
                    for e in smeta.get('entryChoices',[]):grouped[e['choice']].add(e['option'])
                    for cid,options in grouped.items():
                        c=choice_map.get(cid)
                        if c and (p:=choice_public(c,next(iter(options)) if len(options)==1 else None,'可能的前置选项')):
                            p['note']='由脚本跳转追溯；共享场景可能有多种进入方式。';entry.append(p)
                    scene={'version':1,'id':scene_id,'work':game,'language':language,'title':title,'period':period,'script':path,'routes':route_ids,**compiled,'choices':local,'entryChoices':entry,'entryPaths':entry_paths,'choiceNote':'从标题菜单进入该段剧情。' if game=='03' else '此处未解析到单独选项，可能为线性剧情或菜单入口。','inheritedStateKnown':len(prior)==len(parents[path]) and bool(prior)}
                    spec=artifact(scene,'dialogue-data/scenes/'+dataset_id,scene_id)
                    manifest['sceneFiles'][dataset_id+'/'+scene_id]=spec
                    scene_index=len(d_scenes);d_scenes.append({'id':scene_id,'title':title,'period':period,'routes':route_ids,'script':path,'detail':spec,'fallbackOnly':language=='ja' and (game,path) not in cn_rows})
                    for paragraph in compiled['rows']:
                        who=compiled['speakers'][paragraph[2]];person_key=who['id']+'|'+who['raw']
                        if person_key not in d_person_ids:d_person_ids[person_key]=len(d_people);d_people.append(who)
                        d_rows.append([scene_index,paragraph[0],d_person_ids[person_key],paragraph[1],paragraph[3],paragraph[4],paragraph[7]])
                        st=compiled['states'][paragraph[5]]
                        face=st.get('face') or {}
                        used_faces.update(x for x in [face.get('asset'),*face.get('candidates',[])] if x)
                        for layer in st.get('backgrounds',[])+st.get('characters',[])+([face] if face else []):
                            used_assets.update(x for x in [layer.get('asset'),*layer.get('candidates',[])] if x)
                        chars=[x.get('asset') or '|'.join(x.get('candidates',[])) for x in st['characters']]
                        if st.get('background') or chars or st.get('face'):visual_rows+=1
                        writer.writerow([title,' / '.join(smeta['routes']),path,paragraph[0]+1,paragraph[4],who['name'],paragraph[1],(st.get('background') or {}).get('asset') or '',';'.join(x for x in chars if x),(st.get('face') or {}).get('asset') or '',';'.join(paragraph[6])])
                    safe=re.sub(r'[<>:"/\\|?*\x00-\x1f]','_',title)[:60]
                    (export_dir/(scene_id+'_'+safe+'.txt')).write_text(row['text'],encoding='utf8',newline='\n')
            payload={'version':1,'work':game,'language':language,'scenes':d_scenes,'speakers':d_people,'rows':d_rows}
            spec=artifact(payload,'dist/dialogue/data' if language=='zh' else 'dialogue-data/indices',dataset_id,onsite=language=='zh')
            manifest['datasets'].append({'id':dataset_id,'work':game,'language':language,'preferred':language=='zh',**spec,'paragraphs':len(d_rows),'scenes':len(d_scenes)})
            if language=='zh':manifest['total']+=len(d_rows)
            game_report['languages'][language]={'paragraphs':len(d_rows),'scenes':len(d_scenes),'excludedAdultParagraphs':ignored,'scenesMissing':missing,'paragraphsWithVisualState':visual_rows,'indexBytes':spec['bytes']}
            print(game,language,'scenes',len(d_scenes),'paragraphs',len(d_rows),'index',spec['bytes'],flush=True)
        report['games'].append(game_report)
    report['onsitePortraits']=portrait_thumbnails(used_faces,assets['assets'],private)
    assets['assets']={key:value for key,value in assets['assets'].items() if key in used_assets}
    # Keep unused generated portraits in the private cache, outside publication.
    public_faces=ROOT/'dialogue-assets/faces';cache=private/'artwork-research/face-previews';cache.mkdir(parents=True,exist_ok=True)
    for image in faces['images'].values():
        source=ROOT/image['file']
        if image['id'] in used_assets or not source.exists():continue
        target=cache/source.name
        assert source.resolve().is_relative_to(public_faces.resolve()) and target.resolve().is_relative_to(cache.resolve())
        assert sha(source.read_bytes())==image['previewSha256']
        if target.exists():
            assert target.read_bytes()==source.read_bytes();source.unlink()
        else:source.replace(target)
    asset_spec=artifact(assets,'dialogue-data','assets');manifest['assets']=asset_spec
    manifest['speakers']=sorted(({'id':r['id'],'name':r['name']} for r in speakers.people.values() if not r['id'].startswith('npc-')),key=lambda r:r['name'])
    dump(SITE/'dialogue/catalog.json',manifest);dump(ROOT/'dialogue-data/report.json',report)
    from reading import write as write_reading
    write_reading(manifest, routes)
    # Remove only obsolete, content-addressed outputs owned by this compiler.
    keep={s['repositoryPath'] for s in manifest['sceneFiles'].values()}|{d['repositoryPath'] for d in manifest['datasets']}|{asset_spec['repositoryPath']}
    for folder in [ROOT/'dialogue-data',SITE/'dialogue/data']:
        for old in folder.rglob('*.json.gz'):
            assert old.resolve().is_relative_to(folder.resolve())
            if old.relative_to(ROOT).as_posix() not in keep and re.search(r'\.[0-9a-f]{12}\.json\.gz$',old.name):old.unlink()
    dump(private_export/'目录.json',{'games':report['games'],'note':'UTF-8原始剧情文本保存在此本地目录；网站排除游戏标记的成人区间。','publicCatalog':manifest})
    print('COMPLETE',manifest['total'],'Chinese paragraphs;',len(manifest['sceneFiles']),'scene datasets',flush=True)

if __name__=='__main__':main()
