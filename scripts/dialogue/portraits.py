"""Resolve QLIE automatic portraits from loaded characters and native tables.

Hidden standing sprites still supply the current costume and expression. Explicit
face files take precedence for their message; the next message resumes auto mode.
"""
from copy import copy,deepcopy
from functools import lru_cache
import re,unicodedata


@lru_cache(maxsize=65536)
def key(value):
    return unicodedata.normalize('NFKC',str(value)).casefold().replace('蔵','藏').replace('倉','仓').replace('櫻','樱').replace('\\','/')


def replace_id(name,table):
    for before,after in sorted(table.items(),key=lambda pair:len(pair[0]),reverse=True):
        if key(name).startswith(key(before)):return after+name[len(before):]
    return name


def frame_snapshot(tracker,names,voice=''):
    context=tracker.index.context.get(tracker.game,{}).get('portraits',{})
    rules=context.get(tracker.namespace,context.get('avg'))
    if not rules or not tracker.layers.get('face'):return tracker.snapshot()
    ids=[replace_id(name,rules.get('ids',{})) for name in ([voice] if rules.get('type')==1 else names) if name]
    ids={key(re.split('[＠@]',name)[0]) for name in ids if name not in ('none','narration')}
    characters=[]
    for slot,variants in sorted(tracker.layers.items()):
        if slot.startswith('chara'):
            characters.extend({'resource':tracker.reference(slot,variant['properties']),'properties':variant['properties']} for variant in variants)
    output=[]
    for original in tracker.layers['face']:
        props=original['properties'];pending=original.get('_facePending',{})
        if not ids or props.get('mode','auto')!='auto' or props.get('show')!='true' or pending.get('file'):
            output.append(deepcopy(original));continue
        candidates=ids
        if rules.get('idOverride') and pending.get('id'):
            candidates={key(replace_id(pending['id'],rules.get('ids',{})))} if pending['id']!='none' else set()
        matched=[c for c in characters if key(c['properties'].get('id','')) in candidates]
        if not matched:
            matched=[c for c in characters if key(c['resource'].split('/')[0]) in candidates]
        resolved=[]
        for character in matched:
            filename=character['resource']
            for before,after in rules.get('files',{}).items():filename=filename.replace(before,after).replace(before.lower(),after.lower())
            native=tracker.index.resolve(tracker.game,filename,'face')
            if not native and rules.get('defaultFile'):
                filename=rules['defaultFile'].replace('[id]',sorted(candidates)[0]);native=tracker.index.resolve(tracker.game,filename,'face')
            if not native or not native.get('assetId'):continue
            variant=deepcopy(original);variant['properties']['file']=filename;variant['_automaticPortrait']=True
            resolved.append(variant)
        output.extend(resolved or [deepcopy(original)])
    # The actual engine keeps the resolved filename in its absolute face state.
    # Later narration/fallback must retain this face, not an old manual override.
    tracker.layers['face']=tracker._dedupe(output)
    frame=copy(tracker);frame.layers=dict(tracker.layers);frame.notes=list(tracker.notes);frame.layers['face']=deepcopy(tracker.layers['face'])
    for variant in frame.layers['face']:
        props=variant['properties'];filename=props.get('file','');table=rules.get('positions',{})
        # QLIE's op11Show requires a file update on disp:once frames. This is
        # source visibility, not a speaker/identity filter; keep mode is intact.
        if props.get('disp','once')=='once' and not variant.get('_automaticPortrait') and not variant.get('_facePending',{}).get('file'):
            props['show']='false'
        position=next((v for k,v in table.items() if k!='default' and key(k) in key(filename)),table.get('default','0,0,0'))
        for axis,offset in zip(('x','y','z'),position.split(',')):
            try:props[axis]=str(float(props.get(axis,'0'))+float(offset))
            except ValueError:pass
    return frame.snapshot()
