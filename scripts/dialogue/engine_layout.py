"""Recover visual templates from the already extracted, private engine scripts."""
from pathlib import Path
import json
import re


def enrich_resource(resource, private):
    jobs = json.loads((private / 'artwork-research/hash-jobs.json').read_text('utf8'))
    roots = {str(Path(job['archive']).parent): job['game'][:2] for job in jobs}
    latest = {}
    lines=[]
    for file in [private/'include-index.jsonl',private/'layout-index.jsonl']:
        if file.exists():lines.extend(file.read_text('utf-8-sig').splitlines())
    for line in lines:
        row = json.loads(line)
        if 'raw' not in row:
            continue
        game = roots.get(str(Path(row['archive']).parent))
        if not game:
            continue
        path = row['entry'].replace('\\', '/').casefold()
        priority = int(re.search(r'data(\d+)\.pack', row['archive'], re.I)[1])
        key = game, path
        if key in latest and latest[key][0] > priority:
            continue
        raw = Path(row['raw']).read_bytes()
        encoding = 'utf-16' if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else 'utf-8-sig' if raw[:3] == b'\xef\xbb\xbf' else 'cp932'
        latest[key] = priority, raw.decode(encoding, errors='replace')
    for (game, path), (_, text) in latest.items():
        context = resource['engineContext'][game]
        namespace=path.split('/',1)[0]
        if re.fullmatch(r'avg\d*/(?:projectsetting|imoscripter_face_(?:repid|repfile|poslist))\.txt',path):
            rules=context.setdefault('portraits',{}).setdefault(namespace,{})
            table={key.strip():value.strip() for key,value in re.findall(r'^\s*([^;#=\r\n]+)=(.*)$',text,re.M)}
            if path.endswith('projectsetting.txt'):
                rules['type']=int(table.get('FaceType','0'));rules['defaultFile']=table.get('FaceDefaultFile','')
            else:
                key='ids' if path.endswith('_repid.txt') else 'files' if path.endswith('_repfile.txt') else 'positions'
                rules[key]=table
        found = re.fullmatch(r'(avg\d*)/imoscripter_template_(camera|message|image|chara8e|face)\.txt', path)
        if found:
            kind='chara' if found[2]=='chara8e' else found[2]
            model = context['models'].setdefault(found[1] + '|' + kind, {})
            model['macros'] = {key: value.strip() for key, value in re.findall(r'^\s*(\$[^=\s,]+)=(.*)$', text, re.M)}
        found = re.fullmatch(r'(avg\d*)/imoscripter_(camera|message|image|chara8e|face)\.s', path)
        if found:
            kind='chara' if found[2]=='chara8e' else found[2]
            if kind=='face':
                block=re.search(r'^@@!Imo_Face_AutoEvent\s*$(.*?)(?=^@@|\Z)',text,re.M|re.S)
                context.setdefault('portraits',{}).setdefault(found[1],{})['idOverride']=bool(block and '"id"' in block[1])
            label = '@@!Imo_' + ('Chara8e' if kind=='chara' else kind.capitalize()) + '_DefaultParam'
            body = re.search(r'^' + re.escape(label) + r'\s*$(.*?)(?=^@@|\Z)', text, re.S | re.M)
            if body:
                defaults = {m[1]: m[2] if m[2] is not None else m[3] for m in re.finditer(r'\\v,"([^"]+)",(?:"([^"]*)"|([^,\s]+))', body[1])}
                context['models'].setdefault(found[1] + '|' + kind, {})['defaults'] = defaults
            if kind=='chara':
                block=re.search(r'^@@!Imo_Chara8e_01SubFile\s*$(.*?)(?=^@@|\Z)',text,re.S|re.M)
                count=re.search(r'\\for,i=0,i<(\d+),i\+\+',block[1]) if block else None
                if count:context['models'].setdefault(found[1]+'|chara',{})['fragmentCount']=int(count[1])
        if re.fullmatch(r'include\d*/[^/]+\.txt', path):
            context['includes'][path[:-4]] = [line.strip() for line in text.splitlines() if re.match(r'^\s*\^(?:bg\d+|ef\d+|chara\d+|face|camera|message|include)(?:,|$)', line, re.I)]
            if re.search(r'^\s*\^format,.*\bclear:def',text,re.M|re.I):
                boundaries=context.setdefault('flushIncludes',[])
                if path[:-4] not in boundaries:boundaries.append(path[:-4])
    aliases=private/'visual-aliases.json'
    if aliases.exists():
        for key,alias in json.loads(aliases.read_text('utf8')).items():
            native=resource['resources'].get(key)
            if native and native.get('rawSha256')==alias['rawSha256']:
                native.update(assetId=alias['asset'],assetIds=[alias['asset']],match='decoded-pixel-sha256')
    return latest


LAYOUT_KEYS = ('x', 'y', 'z', 'ax', 'ay', 'az', 'scalex', 'scaley', 'rotx', 'roty', 'rotz', 'zoomx', 'zoomy', 'pri', 'pri1', 'pri2', 'addpri', 'alignx', 'aligny', 'alpha', 'mulcolor', 'addcolor', 'blend', 'imgfilter', 'genfilter', 'mode', 'disp', 'autoshow', 'textareaw', 'textareah', 'fontsizew', 'fontsizeh', 'fontcolor', 'fontedgecolor', 'fontedge', 'linespace', 'charspace')


def layout(properties):
    return {key: properties[key] for key in LAYOUT_KEYS if key in properties}
