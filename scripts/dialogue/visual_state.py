"""QLIE visual state and exact gallery lookup, independent of text compilation.

API:
    index = ArtworkResourceIndex('artwork-resource-map.json')
    state = VisualStateTracker(index, '01')
    state.feed('^include,allset', source='scenario/...s', line_number=12)
    state.feed('^chara01,file0:ルナ/,file1:LUN_,file2:S_,file3:0_,file4:0_,file5:00')
    snapshot = state.snapshot()  # Emit immediately before a dialogue/narration unit.

The caller owns control-flow interpretation. Use fork()/merge() for alternative
paths, or conditional=... when a command is only possibly executed. Do not feed
all mutually exclusive branches linearly and present the result as exact.
"""
from pathlib import PurePosixPath, Path
from copy import deepcopy
import json
import re
import unicodedata


def canonical(value):
    return unicodedata.normalize('NFC', str(value)).replace('\\', '/').strip('/').casefold()


def split_arguments(value):
    """Split on commas outside quotes without consuming Windows path slashes."""
    output = []; start = 0; quoted = False
    for n, char in enumerate(value):
        if char == '"' and (n == 0 or value[n-1] != '\\'): quoted = not quoted
        if char == ',' and not quoted:
            output.append(value[start:n].strip()); start = n + 1
    output.append(value[start:].strip())
    return output


def unquote(value):
    return value[1:-1] if len(value) >= 2 and value[0] == value[-1] == '"' else value


class ArtworkResourceIndex:
    def __init__(self, value):
        self.data = value if isinstance(value, dict) else json.loads(Path(value).read_text(encoding='utf-8'))
        self.resources = self.data['resources']; self.assets = self.data['assets']
        self.context = self.data.get('engineContext', {})

    def resolve(self, game, reference, kind='image'):
        """Resolve the engine's extension priority, including unindexed native files.

        A native file that exists but is absent from the public gallery stops the
        search. Falling through to an older BMP/PNG would identify the wrong art.
        """
        game = str(game)[:2]; reference = canonical(unquote(reference.strip()))
        if not reference or reference in ('none', 'pass') or '$' in reference: return None
        root = '立ち絵/' if kind == 'chara' else 'face/' if kind == 'face' else '画像/'
        if not reference.startswith(('立ち絵/', '画像/', 'face/')): reference = root + reference
        extensions = ['.png', '.b', '.argb', '.ogv', '.bmp', '.jpg'] if kind in ('chara', 'face') else ['.png', '.bmp', '.jpg', '.b', '.ogv']
        candidates = [reference] if PurePosixPath(reference).suffix in extensions else [reference + ext for ext in extensions]
        for candidate in candidates:
            row = self.resources.get(game + '|' + candidate)
            if row is not None: return row
        return None

    def model(self, game, namespace, kind):
        models = self.context.get(str(game)[:2], {}).get('models', {})
        return models.get(namespace + '|' + kind, models.get('avg|' + kind, {}))


class VisualStateTracker:
    """Keep loaded resources separate from visibility; never infer art from speaker."""
    def __init__(self, index, game, namespace='avg', max_alternatives=16):
        self.index = index; self.game = str(game)[:2]; self.namespace = namespace
        self.max_alternatives = max_alternatives; self.layers = {}; self.notes = []
        self.incomplete = False

    def fork(self):
        other = VisualStateTracker(self.index, self.game, self.namespace, self.max_alternatives)
        other.layers = deepcopy(self.layers); other.notes = list(self.notes); other.incomplete = self.incomplete
        return other

    @staticmethod
    def merge(states):
        if not states: raise ValueError('At least one state is required')
        result = states[0].fork()
        if any(s.index is not result.index or s.game != result.game for s in states):
            raise ValueError('States must use the same index and work')
        slots = set().union(*(s.layers for s in states)); result.layers = {}
        for slot in slots:
            variants = []
            for state in states: variants.extend(deepcopy(state.layers.get(slot, [state._empty(slot)])))
            result.layers[slot] = result._dedupe(variants)
        result.notes = list(dict.fromkeys(note for state in states for note in state.notes))
        result.incomplete |= any(s.incomplete for s in states)
        return result

    @staticmethod
    def _kind(slot):
        return 'chara' if slot.startswith('chara') else slot if slot in ('face', 'camera', 'message') else 'image'

    def _model(self, slot):
        return self.index.model(self.game, self.namespace, self._kind(slot))

    def _empty(self, slot):
        props = deepcopy(self._model(slot).get('defaults', {}))
        props.setdefault('show', 'true' if self._kind(slot) == 'chara' else 'false')
        props.setdefault('hide', 'false')
        if self._kind(slot) == 'chara':
            for n in range(8): props.setdefault('file' + str(n), 'none')
        else: props.setdefault('file', 'none')
        return {'properties': props, 'source': None, 'conditions': []}

    def _dedupe(self, variants):
        output = {}; key_order = []
        for variant in variants:
            key = json.dumps(variant['properties'], sort_keys=True, ensure_ascii=False)
            if key not in output:
                output[key] = variant; key_order.append(key)
            else:
                output[key]['conditions'] = list(dict.fromkeys(output[key]['conditions'] + variant['conditions']))
        if len(output) > self.max_alternatives:
            self.incomplete = True
            self._note('视觉分支状态超过上限，不能将展示当作唯一画面')
        return [output[key] for key in key_order[:self.max_alternatives]]

    def _note(self, value):
        if value not in self.notes: self.notes.append(value)

    def _include_name(self, value):
        name=canonical(unquote(value))
        if not re.match(r'^include\d*/',name):
            suffix=self.namespace[3:] if self.namespace.startswith('avg') else ''
            name='include'+suffix+'/'+name
        return name[:-4] if name.endswith('.txt') else name

    def flushes_text(self, line):
        args=split_arguments(line.strip())
        if args[0].casefold()=='^format':return any(a.casefold()=='clear:def' for a in args[1:])
        if args[0].casefold()!='^include' or len(args)<2:return False
        name=self._include_name(args[1])
        return name.rsplit('/',1)[-1]=='allclear' or name in self.index.context.get(self.game,{}).get('flushIncludes',[])

    def _expand(self, slot, arguments, depth=0):
        if depth > 16:
            self._note('宏展开超过上限'); return []
        macros = self._model(slot).get('macros', {}); result = []
        def scalar(value, level=0):
            if level > 16: return value
            changed = re.sub(r'\$[\w!]+', lambda m: macros[m[0]].strip() if m[0] in macros and ',' not in macros[m[0]] and ':' not in macros[m[0]] else m[0], value)
            return scalar(changed, level+1) if changed != value else changed
        for argument in arguments:
            if ':' not in argument:
                if argument in macros:
                    result.extend(self._expand(slot, split_arguments(macros[argument]), depth+1))
                elif argument.startswith('$'): self._note('未解析的视觉宏 ' + argument)
                continue
            key, value = argument.split(':', 1)
            result.append((key.strip().casefold(), scalar(unquote(value.strip()))))
        return result

    def feed(self, line, source=None, line_number=None, conditional=False, _include_depth=0):
        """Apply a visual directive; return False for dialogue/control-flow lines.

        conditional may be True or an engine-condition string. This conservatively
        retains old and new states. For precise branches, use fork()/merge().
        """
        line = line.strip()
        if not line.startswith('^'): return False
        arguments = split_arguments(line); slot = arguments[0][1:].casefold()
        if slot == 'include':
            if len(arguments) < 2: return True
            if _include_depth >= 16:
                self._note('include 展开超过上限'); return True
            name = self._include_name(arguments[1])
            # This is an engine-generated reset list; the empty allclear.txt is
            # deliberately bypassed by Imo_Include_Excute in the actual game.
            if name.rsplit('/',1)[-1]=='allclear':
                for current in list(self.layers):self.feed('^'+current+',clear:def',source,line_number,conditional,_include_depth+1)
                return True
            includes = self.index.context.get(self.game, {}).get('includes', {})
            if name not in includes:
                self._note('未解析的视觉 include ' + name); return True
            for child in includes[name]:
                self.feed(child, source, line_number, conditional, _include_depth+1)
            return True
        if not re.fullmatch(r'(?:bg\d+|ef\d+|chara\d+|face|camera|message)', slot): return False
        updates = self._expand(slot, arguments[1:]); variants = self.layers.get(slot, [self._empty(slot)])
        output = deepcopy(variants) if conditional else []
        for variant in variants:
            variant = deepcopy(variant); props = variant['properties']
            for key, value in updates:
                if key == 'clear' and value == 'def':
                    props = deepcopy(self._empty(slot)['properties']); variant['properties'] = props
                elif key == 'align':
                    axes = value.split(':')
                    props['alignx'] = axes[0]
                    if len(axes) > 1: props['aligny'] = axes[1]
                elif key in ('textarea','fontsize'):
                    axes=value.split(':')
                    prefix='textareaw' if key=='textarea' else 'fontsizew'
                    other='textareah' if key=='textarea' else 'fontsizeh'
                    if axes and re.fullmatch(r'\d+(?:\.\d+)?',axes[0]):props[prefix]=axes[0]
                    if len(axes)>1 and re.fullmatch(r'\d+(?:\.\d+)?',axes[1]):props[other]=axes[1]
                else: props[key] = value
            if self._kind(slot) == 'chara':
                missing = False
                for n in range(self._model(slot).get('fragmentCount', 8)):
                    key = 'file' + str(n)
                    if props.get(key, 'none') == 'none': missing = True
                    if missing: props[key] = 'none'
            variant['source'] = {'script': source, 'line': line_number}
            if conditional: variant['conditions'].append(str(conditional))
            output.append(variant)
        self.layers[slot] = self._dedupe(output)
        return True

    def apply(self, line, source=None, line_number=None, conditional=False):
        """Alias for callers that name an incremental state operation apply()."""
        return self.feed(line, source, line_number, conditional)

    def _materialize(self, slot, variant):
        props = variant['properties']; kind = self._kind(slot)
        if kind == 'chara' and not props.get('file'):
            count = self._model(slot).get('fragmentCount', 8)
            reference = ''.join(props.get('file'+str(n), '') for n in range(count) if props.get('file'+str(n), 'none') != 'none')
        else: reference = props.get('file', '')
        has_resource = bool(reference and reference not in ('none', 'pass'))
        visible = has_resource and props.get('show', 'false') == 'true' and props.get('hide', 'false') != 'true'
        if props.get('alpha', '$FF').lstrip('$').strip('0') == '': visible = False
        found = self.index.resolve(self.game, reference, kind) if has_resource else None
        replacements = []
        for key in ('rep0', 'rep1', 'rep2', 'rep3'):
            if props.get(key) not in (None, '', 'none', 'pass'):
                replacement = self.index.resolve(self.game, props[key], 'image')
                if replacement and replacement.get('assetId'): replacements.append(replacement['assetId'])
        return {
            'slot': slot, 'resource': reference, 'visible': bool(visible),
            'assetId': found.get('assetId') if found else None,
            'assetIds': found.get('assetIds', []) if found else [],
            'nativeResource': found.get('resource') if found else None,
            'rawSha256': found.get('rawSha256') if found else None,
            'properties': deepcopy(props), 'source': variant['source'],
            'conditions': list(variant['conditions']),
            'replacementAssetIds': replacements,
        }

    def snapshot(self, include_hidden=False):
        result = {'backgrounds': [], 'characters': [], 'face': None, 'camera': None, 'message': None, 'unresolved': [], 'notes': list(self.notes), 'incomplete': self.incomplete}
        for slot, variants in sorted(self.layers.items()):
            if slot in ('camera', 'message'):
                result[slot] = {'properties':deepcopy(variants[0]['properties']), 'conditional':len(variants)>1}
                continue
            alternatives = [self._materialize(slot, variant) for variant in variants]
            visible = [a for a in alternatives if a['visible']]
            if not include_hidden and not visible: continue
            if len(alternatives) == 1:
                record = alternatives[0]; record['certainty'] = 'exact'
            else:
                ids = sorted(set(asset_id for a in visible for asset_id in a['assetIds']))
                record = {'slot': slot, 'visible': bool(visible), 'assetId': None, 'assetIds': ids, 'certainty': 'conditional', 'alternatives': alternatives}
            for alternative in visible:
                if not alternative['assetIds']:
                    result['unresolved'].append({'slot': slot, 'resource': alternative['resource'], 'nativeExists': alternative['nativeResource'] is not None, 'dynamic': '$' in alternative['resource']})
            if slot.startswith(('bg', 'ef')): result['backgrounds'].append(record)
            elif slot.startswith('chara'): result['characters'].append(record)
            elif slot == 'face': result['face'] = record
        return result
