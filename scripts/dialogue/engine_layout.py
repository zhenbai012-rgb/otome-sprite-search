"""Recover visual templates from the already extracted, private engine scripts."""
from pathlib import Path
import json
import re


def enrich_resource(resource, private):
    jobs = json.loads((private / 'artwork-research/hash-jobs.json').read_text('utf8'))
    roots = {str(Path(job['archive']).parent): job['game'][:2] for job in jobs}
    latest = {}
    for line in (private / 'include-index.jsonl').read_text('utf-8-sig').splitlines():
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
        found = re.fullmatch(r'(avg2?)/imoscripter_template_(camera|message)\.txt', path)
        if found:
            model = context['models'].setdefault(found[1] + '|' + found[2], {})
            model['macros'] = {key: value.strip() for key, value in re.findall(r'^\s*(\$[^=\s,]+)=(.*)$', text, re.M)}
        found = re.fullmatch(r'(avg2?)/imoscripter_(camera|message)\.s', path)
        if found:
            label = '@@!Imo_' + found[2].capitalize() + '_DefaultParam'
            body = re.search(r'^' + re.escape(label) + r'\s*$(.*?)(?=^@@|\Z)', text, re.S | re.M)
            if body:
                defaults = {m[1]: m[2] if m[2] is not None else m[3] for m in re.finditer(r'\\v,"([^"]+)",(?:"([^"]*)"|([^,\s]+))', body[1])}
                context['models'].setdefault(found[1] + '|' + found[2], {})['defaults'] = defaults
        if re.fullmatch(r'include2?/[^/]+\.txt', path):
            context['includes'][path[:-4]] = [line.strip() for line in text.splitlines() if re.match(r'^\s*\^(?:bg\d+|ef\d+|chara\d+|face|camera|message|include)(?:,|$)', line, re.I)]
    return latest


LAYOUT_KEYS = ('x', 'y', 'z', 'ax', 'ay', 'az', 'scalex', 'scaley', 'rotx', 'roty', 'rotz', 'zoomx', 'zoomy', 'pri', 'pri1', 'pri2', 'addpri', 'alignx', 'aligny', 'alpha', 'mulcolor', 'addcolor', 'blend', 'imgfilter', 'genfilter', 'mode', 'disp', 'autoshow', 'textareaw', 'textareah', 'fontsizew', 'fontsizeh', 'fontcolor', 'fontedgecolor', 'fontedge', 'linespace', 'charspace')


def layout(properties):
    return {key: properties[key] for key in LAYOUT_KEYS if key in properties}
