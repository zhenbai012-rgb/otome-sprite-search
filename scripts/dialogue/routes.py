"""Static QLIE route/choice metadata for the six locally supplied games.

Pure entry point: ``build_routes(texts) -> {game_id: game_metadata}``.
``texts`` is an iterable of {game, entry, text}; later rows replace earlier rows
with the same game/resource path. Resource paths in the result are slash-separated
and casefolded. Physical line numbers are 1-based ``text.splitlines()`` positions;
logical line numbers count nonempty lines only.

Scene ``routes`` is a list of Chinese labels, ``routeIds`` contains stable IDs.
Choices keep their direct targets and flag/condition evidence. ``entryChoices``
contains the nearest resolvable preceding decisions, *not* a unique walkthrough.
No evaluation of supplied Python/script text, game execution, network or file I/O.
"""
from __future__ import annotations

from collections import defaultdict, deque
from pathlib import PurePosixPath
import csv
import itertools
import re


SCHEMA_VERSION = 1
_LABEL = re.compile(r'^@@(?!@)([^\s,]+)')
_QUOTED = re.compile(r'^"([^"]*)"$')
_SCENE_COMMAND = re.compile(r'^\\(?:jmp|sub|go),', re.I)
_ASSIGN = re.compile(r'^\\cal,\s*([^=+\s]+)\s*=\s*(.+)$', re.I)
_SENSITIVE = re.compile(r'射精|精液|性交|口交|肛交|乳首|乳房|陰茎|陰部|膣|性器|おっぱい|フェラ|セックス|パイズリ|孕ませ|喉奥|勃起|插入|阴茎|阴部|阴道|肉棒|乳交|口爆|胸部|中出し|中出', re.I)
_ADULT_PLACEHOLDER = '成人片段选项（略）'
_NAMES = {
    'エスト': '艾斯特', 'パル子': '春心', '朔莉': '朔莉', 'ルミネ': '瑠美音',
    'ルナ': '露娜', 'りそな': '里想奈', 'ユルシュール': '尤希尔', 'メリル': '梅丽尔',
    'エッテ': '布琉艾特', '湊': '凑', '大蔵': '大藏', 'リンデ': '迪特琳德',
}


def normalize_script(path):
    value = str(path).replace('\\', '/').strip(' "').casefold()
    value = re.sub(r'/+', '/', value)
    while value.startswith('./'): value = value[2:]
    return value


def _args(line):
    try:
        return [v.strip() for v in next(csv.reader([line], delimiter=',', quotechar='"', doublequote=True))]
    except (csv.Error, StopIteration):
        return [v.strip().strip('"') for v in line.split(',')]


def _clean_option(text, sensitive=False):
    return _ADULT_PLACEHOLDER if sensitive or _SENSITIVE.search(text) else text


def _display_condition(value):
    for source, target in _NAMES.items(): value = value.replace(source, target)
    return value


def _unparen(value):
    value = value.strip()
    while value.startswith('(') and value.endswith(')'):
        level, complete = 0, True
        for i, character in enumerate(value):
            if character == '(': level += 1
            elif character == ')': level -= 1
            if level == 0 and i < len(value) - 1: complete = False; break
        if not complete: break
        value = value[1:-1].strip()
    return value


def _simple_string_truth(expression, env):
    match = re.fullmatch(r'\(?\s*([\w#\[\]]+)\s*(==|!=)\s*"([^"]*)"\s*\)?', expression)
    if match and match[1].casefold() in env:
        equal = env[match[1].casefold()] == match[3]
        return equal if match[2] == '==' else not equal
    return None


def _conditions_consistent(values):
    """Reject direct contradictory comparisons; leave complex formulas symbolic."""
    equal, unequal, bounds = {}, defaultdict(set), {}
    pending = list(values)
    while pending:
        value = pending.pop().strip(); negative = False
        if value.startswith('NOT (') and value.endswith(')'):
            negative = True; value = value[5:-1].strip()
        value = _unparen(value)
        not_in = re.fullmatch(r'([\w#\[\]]+)\s+NOT IN\s*\{([^}]*)\}', value)
        if not_in and not negative:
            variable = not_in[1].casefold()
            unequal[variable].update(v.strip().strip('"') for v in not_in[2].split(',')); continue
        # Expand positive top-level AND; NOT(AND) remains a disjunction.
        depth, quoted, start, parts = 0, False, 0, []
        for i, character in enumerate(value):
            if character == '"': quoted = not quoted
            elif not quoted:
                if character == '(': depth += 1
                elif character == ')': depth -= 1
                elif character == '&' and depth == 0:
                    if value[start:i].strip(): parts.append(value[start:i])
                    start = i + 1
        if parts and not negative:
            parts.append(value[start:]); pending.extend(parts); continue
        atom = re.fullmatch(r'([^<>=!&|()+*/]+?)\s*(==|!=|>=|<=|>|<)\s*("[^"]*"|-?\d+)', value)
        if not atom: continue
        variable, operator, raw = atom[1].strip().casefold(), atom[2], atom[3]
        if negative: operator = {'==': '!=', '!=': '==', '>=': '<', '<=': '>', '>': '<=', '<': '>='}[operator]
        scalar = raw[1:-1] if raw.startswith('"') else int(raw)
        if operator == '==':
            if variable in equal and equal[variable] != scalar: return False
            equal[variable] = scalar
        elif operator == '!=': unequal[variable].add(scalar)
        elif isinstance(scalar, int):
            low, high = bounds.get(variable, (None, None))
            if operator in ('>=', '>'):
                minimum = scalar + (operator == '>'); low = minimum if low is None else max(low, minimum)
            else:
                maximum = scalar - (operator == '<'); high = maximum if high is None else min(high, maximum)
            if low is not None and high is not None and low > high: return False
            bounds[variable] = low, high
    for variable, scalar in equal.items():
        if scalar in unequal[variable]: return False
        if isinstance(scalar, int) and variable in bounds:
            low, high = bounds[variable]
            if low is not None and scalar < low or high is not None and scalar > high: return False
    return True


def _merge_condition_alternatives(alternatives):
    sets = {frozenset(value) for value in alternatives if _conditions_consistent(value)}
    changed = True
    while changed:
        changed = False
        for left in tuple(sets):
            for right in tuple(sets):
                if left == right: continue
                if left < right:
                    sets.discard(right); changed = True; break
                a, b = left - right, right - left
                if len(a) == len(b) == 1:
                    x, y = next(iter(a)), next(iter(b))
                    if x == 'NOT (' + y + ')' or y == 'NOT (' + x + ')':
                        sets.discard(left); sets.discard(right); sets.add(left & right); changed = True; break
            if changed: break
    return [sorted(value) for value in sorted(sets, key=lambda x: (len(x), sorted(x)))]


def _rows(text, source):
    result = []
    for physical, line in enumerate(text.splitlines(), 1):
        if line.strip():
            result.append({'source': source, 'line': physical, 'logicalLine': len(result) + 1, 'text': line.strip()})
    return result


def _default_controls(game, script):
    route, select = 'scenario/root.s', 'scenario/select.s'
    if game == '01' and '/アフター/' in script:
        route, select = 'scenario/rootafter.s', 'scenario/selectafter.s'
    elif game == '01' and '/エイプリル/' in script:
        route, select = 'scenario/rootapril.s', 'scenario/selectapril.s'
    elif game == '02':
        route, select = 'scenario/roototo.s', 'scenario/selectoto.s'
    elif game == '06' and '/エイプリルフール2015/' in script:
        route, select = 'scenario/april15root.s', 'scenario/april15select.s'
    return route, select


def _assigned_control(rows, field, default):
    pattern = re.compile(r'^\\cal,\s*' + re.escape(field) + r'\s*=\s*"([^"]+)"', re.I)
    # Assignments in these scenario files are repeated around scene-skip setup;
    # the effective literal value is the same in the supplied versions.
    values = [m[1] for row in rows if (m := pattern.match(row['text']))]
    return normalize_script(values[-1]) if values else default


def adult_segments(text):
    """Return exact command-marked ranges; ordinary flashbacks are not adult tags.

    HsceneStart/End, Header_Hscene and the legacy savefilter 1/0 ranges are
    retained separately, so callers can cross-check the latter with reviewed CGs.
    An unclosed range ends at EOF and records continuation into another script.
    No dialogue text is included.
    """
    rows = _rows(text, '')
    total_lines = max(1, len(text.splitlines()))
    ranges, active = [], None
    for row in rows:
        command = row['text']
        header = bool(re.match(r'^@@@.*(?:^|[\\/])header_hscene\.s$', command, re.I))
        start = bool(re.match(r'^@@@.*(?:^|[\\/])hscenestart\.s$', command, re.I))
        end = bool(re.match(r'^@@@.*(?:^|[\\/])hsceneend\.s$', command, re.I))
        legacy = re.match(r'^\^savefilter,\s*([01])\b', command, re.I)
        if header or start or legacy and legacy[1] == '1':
            kind = 'hscene-header' if header else 'hscene' if start else 'savefilter'
            if active is None:
                active = {'startLine': row['line'], 'startLogicalLine': row['logicalLine'], 'marker': kind, 'certainty': 'explicit', 'startTag': command}
            elif command not in active.get('additionalStartTags', []):
                active.setdefault('additionalStartTags', []).append(command)
        if end or legacy and legacy[1] == '0':
            if active is not None:
                active.update(endLine=row['line'], endLogicalLine=row['logicalLine'], endTag=command, continuesToNext=False)
                ranges.append(active); active = None
            elif row['logicalLine'] <= 30 or end:
                ranges.append({'startLine': 1, 'endLine': row['line'], 'startLogicalLine': 1, 'endLogicalLine': row['logicalLine'], 'marker': 'inherited-end', 'certainty': 'inherited', 'endTag': command, 'continuesFromPrevious': True, 'continuesToNext': False})
    if active is not None:
        active.update(endLine=total_lines, endLogicalLine=len(rows), continuesToNext=True)
        ranges.append(active)
    return ranges


def _route_definitions(game):
    common = [('common', '共通线', 'common')]
    definitions = {
        '01': common + [('lun', '樱小路露娜线', 'main'), ('miz', '花之宫瑞穗线', 'main'), ('yur', '尤希尔线', 'main'), ('min', '柳之濑凑线', 'main'), ('bad', '坏结局', 'ending'), ('after-common', '后日谈序章', 'after'), ('after-lun', '露娜后日谈', 'after'), ('after-miz', '瑞穗后日谈', 'after'), ('after-yur', '尤希尔后日谈', 'after'), ('after-min', '凑后日谈', 'after'), ('april', '愚人节番外', 'extra')],
        '02': common + [('res', '大藏里想奈线', 'main'), ('bnp', '布琉艾特线', 'main'), ('mer', '梅丽尔线', 'main'), ('bad-dietlinde', '迪特琳德分支坏结局', 'ending'), ('bad-blackbutler', '黑执事结局', 'ending')],
        '03': [('bnp-another', '布琉艾特另一篇', 'another'), ('after-bnp', '布琉艾特后日谈', 'after'), ('after-mer', '梅丽尔后日谈', 'after'), ('after-res', '里想奈后日谈', 'after'), ('april2016', '2016愚人节番外', 'extra')],
        '04': common + [('est', '艾斯特线', 'main'), ('lum', '大藏瑠美音线', 'main'), ('par', '银条春心线', 'main'), ('sak', '八日堂朔莉线', 'main'), ('bad', '坏结局', 'ending'), ('after-lun', '露娜后日谈', 'after'), ('april2014', '2014愚人节番外', 'extra')],
        '05': [('after-est', '艾斯特后日谈', 'after'), ('after-par', '春心后日谈', 'after'), ('before-ion', '衣远前传', 'before')],
        '06': [('after-atr', '亚十礼后日谈', 'after'), ('after-lum', '瑠美音后日谈', 'after'), ('after-sak', '朔莉后日谈', 'after'), ('after-mom', '亚十礼后日谈·红叶分支', 'extra'), ('april2015', '2015愚人节番外', 'extra')],
    }
    return [{'id': key, 'label': label, 'type': kind} for key, label, kind in definitions.get(game, [])]


def _classify_route(game, script):
    stem = PurePosixPath(script).stem
    kind, certainty = 'script-family', 'confirmed-family'
    ids = []
    if game == '01':
        if '/エイプリル/' in script: ids = ['april']
        elif '/アフター/' in script:
            ids = ['after-common'] if stem == 'as_00' else ['after-miz'] if stem.startswith('haas') else ['after-min'] if stem.startswith('yaas') else ['after-lun'] if stem.startswith('l') else ['after-yur'] if stem.startswith('u') else []
        elif stem.startswith('c07_bad'): ids = ['bad']
        else: ids = {'c': ['common'], 'h': ['miz'], 'l': ['lun'], 'u': ['yur'], 'y': ['min']}.get(stem[:1], [])
    elif game == '02':
        if stem == 'bad_02as': ids, kind = ['bad-blackbutler'], 'root-label-and-scene-title'
        elif stem == 'bad_01dz': ids, kind = ['bad-dietlinde'], 'root-route-selector'
        elif stem.startswith('c'): ids = ['common']
        elif stem.startswith('m'): ids = ['mer']
        elif stem in ('r43_04a', 'r43_05b'):
            ids, certainty, kind = ['res', 'bnp', 'bad-dietlinde', 'bad-blackbutler'], 'shared', 'multiple-root-return-labels'
        elif stem.startswith('r'): ids = ['res']
        elif stem.startswith(('b42_02b1', 'b42_02b2', 'b42_03a', 'b43_11', 'b43_12')): ids = ['bnp']
        elif stem.startswith('b'):
            ids, certainty, kind = ['bnp', 'bad-dietlinde', 'bad-blackbutler'], 'shared', 'shared-root-section-before-ending-selector'
    elif game == '03':
        ids = ['april2016'] if '/エイプリルフール/' in script else ['bnp-another'] if stem.startswith('ba') else {'b': ['after-bnp'], 'm': ['after-mer'], 'r': ['after-res']}.get(stem[:1], [])
    elif game == '04':
        ids = ['april2014'] if '/エイプリルフール2014/' in script else ['after-lun'] if '/アフター/' in script else ['bad'] if stem == 'c99_01a' else {'c': ['common'], 'e': ['est'], 'l': ['lum'], 'p': ['par'], 's': ['sak']}.get(stem[:1], [])
    elif game == '05':
        ids = ['before-ion'] if '衣遠ビフォア' in script else {'a': ['before-ion'], 'e': ['after-est'], 'p': ['after-par']}.get(stem[:1], [])
    elif game == '06':
        ids = ['april2015'] if '/エイプリルフール2015/' in script else ['after-mom'] if stem in ('a68_01a2', 'a99_02a') else {'a': ['after-atr'], 'l': ['after-lum'], 's': ['after-sak']}.get(stem[:1], [])
    return ids, certainty if ids else 'unresolved', kind


class _Program:
    def __init__(self, path, scripts):
        self.path, self.scripts = path, scripts
        self.rows = []
        self._expand(path, set())
        self.labels = {}
        self.points = {}
        for i, row in enumerate(self.rows):
            self.points[(row['source'], row['line'])] = i
            m = _LABEL.match(row['text'])
            if m: self.labels.setdefault('@@' + m[1].casefold(), i)
        self.if_map, self.else_map, self.case_map, self.case_boundary_map = {}, {}, {}, {}
        stack = []
        for i, row in enumerate(self.rows):
            text = row['text'].casefold()
            if text.startswith('\\if,'): stack.append({'type': 'if', 'start': i})
            elif text.startswith('\\case,'): stack.append({'type': 'case', 'start': i, 'branches': []})
            elif text.startswith(('\\for,', '\\while,')): stack.append({'type': 'other', 'start': i})
            elif text.startswith('\\ans,') and stack and stack[-1]['type'] == 'case':
                args = _args(row['text']); stack[-1]['branches'].append((i, args[1] if len(args) > 1 else ''))
            elif text.startswith('\\else') and stack and stack[-1]['type'] in ('if', 'case'): stack[-1]['else'] = i
            elif text.startswith('\\end') and stack:
                frame = stack.pop()
                if frame['type'] == 'if':
                    self.if_map[frame['start']] = (frame.get('else'), i)
                    if 'else' in frame: self.else_map[frame['else']] = i
                elif frame['type'] == 'case':
                    self.case_map[frame['start']] = (frame['branches'], frame.get('else'), i)
                    for branch, _ in frame['branches']: self.case_boundary_map[branch] = i
                    if 'else' in frame: self.case_boundary_map[frame['else']] = i

    def _expand(self, path, seen):
        if path in seen or path not in self.scripts: return
        seen = seen | {path}
        for row in self.scripts[path]['rows']:
            text = row['text']
            if text.startswith('@@@') and not text.startswith('@@@!'):
                ref = normalize_script(text[3:])
                candidate = ref if ref.startswith('scenario/') else normalize_script(str(PurePosixPath(path).parent / ref))
                if candidate in self.scripts:
                    self._expand(candidate, seen); continue
            inline = re.search(r'\\(?:jmp|sub|go),', text, re.I) if text.casefold().startswith('\\ans,') else None
            if inline:
                self.rows.append({**row, 'text': text[:inline.start()]})
                self.rows.append({**row, 'text': text[inline.start():]})
            else:
                self.rows.append(row)


def _if_expression(text):
    value = re.sub(r'^\\if,', '', text, flags=re.I)
    return re.sub(r',?\\then.*$', '', value, flags=re.I).rstrip(',').strip()


def _literal_assignment(text):
    match = _ASSIGN.match(text)
    if not match: return None
    value = _QUOTED.fullmatch(match[2].strip())
    return (match[1].casefold(), value[1]) if value else None


def _target_file(arg, origin, scripts, default, env=None):
    env = env or {}
    value = arg.strip().strip('"')
    if value.casefold() in ('self', ''): return default
    if value.casefold() == '_routefile': return env.get('_routefile', scripts[origin]['controller'])
    if value.casefold() == '_selectfile': return env.get('_selectfile', scripts[origin]['selectionController'])
    if value.casefold().endswith('.s'):
        ref = normalize_script(value)
        if ref in scripts: return ref
        relative = normalize_script(str(PurePosixPath(origin).parent / ref))
        if relative in scripts: return relative
    return ''


def _safe_title(rows):
    for row in rows:
        if row['text'].casefold().startswith('^savescene,'):
            args = _args(row['text'])
            return _clean_option(args[1]) if len(args) > 1 else '', args[2] if len(args) > 2 else ''
    return '', ''


def _label_block(program, label):
    index = program.labels.get(label.casefold())
    if index is None: return []
    result = []
    for row in program.rows[index + 1:]:
        if _LABEL.match(row['text']) and result: break
        result.append(row)
    return result


def _walk(programs, start_program, start_index, scripts, choices_by_point, initial_conditions=(), initial_env=None, max_steps=1600):
    """Walk possible controller edges without assuming save flags or affection.

    Returns first narrative scene invocations, including decisions encountered on
    the way. Dynamic calls that cannot be resolved stop instead of guessing.
    """
    queue = deque([(start_program, start_index, tuple(initial_conditions), (), dict(initial_env or {}), '')])
    seen, results, count = set(), [], 0
    while queue and count < max_steps and len(results) < 32:
        path, index, conditions, via, env, frag = queue.popleft(); count += 1
        program = programs.get(path)
        if program is None or not 0 <= index < len(program.rows): continue
        signature = (path, index, conditions[-5:], via, tuple(sorted(env.items())), frag)
        if signature in seen: continue
        seen.add(signature)
        row = program.rows[index]; text = row['text']; low = text.casefold(); origin = row['source']
        def push(i=index + 1, p=path, c=conditions, v=via, e=env, f=frag):
            if len(c) <= 16 and _conditions_consistent(c): queue.append((p, i, c, v, dict(e), f))
        if index in program.if_map:
            alternate, end = program.if_map[index]
            expression = _if_expression(text)
            if frag and re.search(r'FragResultInt', expression, re.I): expression += ' [' + frag + ']'
            truth = _simple_string_truth(expression, env)
            if truth is not False: push(index + 1, c=conditions + (expression,))
            if truth is not True: push((alternate + 1) if alternate is not None else end + 1, c=conditions + ('NOT (' + expression + ')',))
            continue
        if index in program.else_map: push(program.else_map[index] + 1); continue
        if index in program.case_map:
            branches, alternate, end = program.case_map[index]
            variable = _args(text)[1] if len(_args(text)) > 1 else ''
            known = env.get(variable.casefold())
            keys = [value for _, value in branches]
            for branch, value in branches:
                if known is None or known == value:
                    push(branch + 1, c=conditions + (variable + ' == "' + value + '"',))
            if alternate is not None and (known is None or known not in keys):
                push(alternate + 1, c=conditions + (variable + ' NOT IN {' + ','.join(keys) + '}',))
            elif alternate is None and (known is None or known not in keys): push(end + 1)
            continue
        if index in program.case_boundary_map: push(program.case_boundary_map[index] + 1); continue
        choice = choices_by_point.get((origin, row['line']))
        if choice:
            for option in choice['options']:
                target_path = option['targetController']; target_label = option['targetLabel'].casefold()
                target_program = programs.get(target_path)
                if target_program and target_label in target_program.labels:
                    push(target_program.labels[target_label], p=target_path, v=via + ((choice['id'], option['index']),))
            continue
        if low.startswith('^fragcal,'):
            args = _args(text); push(f=args[1] if len(args) > 1 else ''); continue
        if low.startswith('^fragtrack,'):
            args = _args(text); updated = dict(env)
            if len(args) > 1: updated['resultstr[0]'] = args[1]
            push(e=updated); continue
        assignment = _literal_assignment(text)
        if assignment:
            updated = dict(env); updated[assignment[0]] = assignment[1]; push(e=updated); continue
        if re.match(r'^\\(?:ret|brk)\b', low) or re.match(r'^\\scp,sys\s+\\r\b', low): continue
        if _SCENE_COMMAND.match(text):
            args = _args(text); command = args[0].casefold(); target_label = args[1] if len(args) > 1 else ''
            target_label = env.get(target_label.casefold(), target_label)
            target_path = _target_file(args[2], origin, scripts, path, env) if len(args) > 2 else path
            if target_path in scripts and scripts[target_path]['isScene']:
                if command == '\\sub': push(); continue
                effective = list(conditions)
                for variable in ('oroutename', 'routename'):
                    if variable in env: effective.append(variable + ' == "' + env[variable] + '"')
                if _conditions_consistent(effective):
                    results.append({'target': target_path, 'targetLabel': target_label, 'conditions': list(dict.fromkeys(effective)), 'viaChoices': [{'choice': key, 'option': value} for key, value in via], 'certainty': 'possible-static-path'})
                continue
            # Movie wrappers return through FilejumpName to <file>_end in the
            # current route controller, just like narrative scene wrappers.
            # Follow that explicit label instead of ending the story at the OP.
            if target_path in scripts and re.fullmatch(r'(?:op_movie|(?:after)?ed_movie)', PurePosixPath(target_path).stem, re.I):
                return_label = '@@' + PurePosixPath(target_path).stem.casefold() + '_end'
                controller_path = env.get('_routefile', scripts[origin]['controller'])
                controller = programs.get(controller_path)
                if controller and return_label in controller.labels:
                    push(controller.labels[return_label], p=controller_path)
                    continue
            if target_label.casefold() == '@@orouteselect' and env.get('resultstr[0]'):
                target_path = env.get('_routefile', scripts[origin]['controller']); target_program = programs.get(target_path)
                for n, route in enumerate(('りそな', 'エッテ', '大蔵バッド', 'リンデバッド')):
                    label = '@@' + env['resultstr[0]'].lstrip('@') + '_' + str(n)
                    if target_program and label.casefold() in target_program.labels:
                        push(target_program.labels[label.casefold()], p=target_path, c=conditions + ('ORouteName == "' + route + '"',))
                continue
            target_program = programs.get(target_path)
            if target_label.startswith('@@') and target_program and target_label.casefold() in target_program.labels:
                if command == '\\sub': push(); continue
                push(target_program.labels[target_label.casefold()], p=target_path); continue
            # Unknown engine subroutines return; unknown jumps must not fall through.
            if command == '\\sub': push()
            continue
        push()
    grouped = defaultdict(list)
    for result in results:
        key = (result['target'], tuple((r['choice'], r['option']) for r in result['viaChoices']))
        grouped[key].append(result)
    merged = []
    for values in grouped.values():
        for conditions in _merge_condition_alternatives([value['conditions'] for value in values]):
            merged.append({**values[0], 'conditions': conditions})
    return merged


def _condition_context(rows):
    stack, result = [], {}
    for row in rows:
        low = row['text'].casefold()
        result[row['line']] = [frame['expression'] for frame in stack if frame['kind'] == 'if']
        if low.startswith('\\if,'): stack.append({'kind': 'if', 'expression': _if_expression(row['text'])})
        elif low.startswith(('\\case,', '\\for,', '\\while,')): stack.append({'kind': 'other'})
        elif low.startswith('\\else') and stack and stack[-1]['kind'] == 'if': stack[-1]['expression'] = 'NOT (' + stack[-1]['expression'] + ')'
        elif low.startswith('\\end') and stack: stack.pop()
    return result


def _make_choices(game, scripts, programs):
    choices = []
    for path, script in scripts.items():
        rows = script['rows']; conditions = _condition_context(rows)
        label, ordinal, anchor = '@@main', 0, path if script['isScene'] else ''
        for i, row in enumerate(rows):
            text = row['text']; matched = _LABEL.match(text)
            if matched: label = '@@' + matched[1].casefold()
            if _SCENE_COMMAND.match(text):
                args = _args(text)
                if len(args) > 2:
                    ref = _target_file(args[2], path, scripts, path)
                    if ref in scripts and scripts[ref]['isScene']: anchor = ref
            if not text.casefold().startswith('^select,'): continue
            ordinal += 1; values = _args(text)[1:]; target_labels = []
            explicit = False
            for following in rows[i + 1:i + 6]:
                low = following['text'].casefold()
                if low.startswith('^selectlabel,'):
                    target_labels = _args(following['text'])[1:]; explicit = True; break
                if low.startswith(('^selectset', '^selectjmp')): break
            if not explicit:
                target_labels = ['@@' + PurePosixPath(path).stem + '_sel1_' + str(n) for n in range(len(values))]
            sensitive_anchor = bool(anchor in scripts and any(r.get('continuesToNext') for r in scripts[anchor]['adultSegments']))
            inside_adult = any(r['startLine'] <= row['line'] <= r['endLine'] for r in script['adultSegments'])
            item = {'id': game + ':' + path + ':' + label.lstrip('@') + ':choice-' + str(ordinal), 'source': path, 'line': row['line'], 'logicalLine': row['logicalLine'], 'sourceLabel': label, 'anchorScene': anchor, 'mechanism': 'selectlabel' if explicit else 'selectset1', 'conditions': conditions[row['line']], 'options': [], 'pathNote': '直接选项/局部分支；不表示唯一通关步骤'}
            for n, value in enumerate(values):
                target = target_labels[n] if n < len(target_labels) else ''
                controller = path if explicit else script['controller']
                if explicit and target.casefold() not in programs[path].labels and target.casefold() in programs.get(script['controller'], programs[path]).labels:
                    controller = script['controller']
                block = _label_block(programs.get(script['selectionController'], programs[path]), target) if not explicit else []
                effects = [r['text'] for r in block if r['text'].casefold().startswith(('\\cal,', '^frag,'))]
                restricted = inside_adult or sensitive_anchor or bool(_SENSITIVE.search(value))
                item['options'].append({'index': n, 'text': _clean_option(value, restricted), 'sensitive': restricted, 'targetLabel': target, 'targetController': controller, 'effects': effects, 'directTargets': [], 'certainty': 'explicit-label' if explicit else 'legacy-select-route-label'})
            choices.append(item)
    return choices


def _nearest_entry_choices(scene, incoming, choices, limit=48, allowed_options=None):
    queue = deque([(scene, (), 0)]); seen = set(); found = {}
    while queue and len(seen) < 600 and len(found) < limit:
        target, conditions, distance = queue.popleft()
        if (target, conditions[-3:]) in seen or distance > 80: continue
        seen.add((target, conditions[-3:]))
        for edge in incoming.get(target, []):
            combined = tuple(dict.fromkeys((*edge['conditions'], *conditions)))
            if not _conditions_consistent(combined): continue
            if edge['viaChoices']:
                latest = edge['viaChoices'][-1]; choice = choices.get(latest['choice'])
                if not choice: continue
                option = choice['options'][latest['option']]
                if allowed_options is not None and (choice['id'], option['index']) not in allowed_options: continue
                key = (choice['id'], option['index'], combined)
                found.setdefault(key, {'choice': choice['id'], 'option': option['index'], 'optionText': option['text'], 'source': choice['source'], 'sourceLine': choice['line'], 'conditions': list(combined), 'displayConditions': [_display_condition(c) for c in combined], 'sceneDistance': distance, 'certainty': 'possible-preceding-choice', 'note': '最近可解析的前置选择之一；条件旗标与其他进入路径仍需结合游戏状态'})
            else: queue.append((edge['source'], combined, distance + 1))
    return sorted(found.values(), key=lambda x: (x['sceneDistance'], x['choice'], x['option']))


def _exact_game02_entry_paths(choices):
    stems = ('c42_01a0', 'c42_02b0', 'c42_03b0')
    by_stem = {PurePosixPath(choice['source']).stem: choice for choice in choices}
    if not all(stem in by_stem and len(by_stem[stem]['options']) == 2 for stem in stems): return []
    paths = []
    for combination in itertools.product(range(2), repeat=3):
        flags = dict.fromkeys(('merflag', 'resflag', 'bnpflag', 'rbadflag', 'obadflag'), 0)
        selected = []
        for stem, index in zip(stems, combination):
            choice = by_stem[stem]; option = choice['options'][index]
            for effect in option['effects']:
                match = re.fullmatch(r'\\cal,\s*(\w+)\+\+', effect, re.I)
                if not match or match[1].casefold() not in flags: return []
                flags[match[1].casefold()] += 1
            selected.append({'choice': choice['id'], 'option': index, 'text': option['text'], 'source': choice['source'], 'line': choice['line']})
        if flags['resflag'] == 2: route = 'res'
        elif flags['merflag'] == 2: route = 'mer'
        elif flags['bnpflag'] >= 1 and flags['merflag'] <= 1 and flags['resflag'] <= 1: route = 'bnp'
        elif flags['rbadflag'] == 1 and flags['obadflag'] == 1 and flags['merflag'] <= 1 and flags['resflag'] <= 1: route = 'bad-blackbutler'
        elif flags['rbadflag'] == 1 and flags['obadflag'] == 0 and flags['merflag'] <= 1 and flags['resflag'] <= 1: route = 'bad-dietlinde'
        else: continue
        paths.append({'id': '02-route-' + ''.join(map(str, combination)), 'routeId': route, 'choices': selected, 'flags': flags, 'certainty': 'resolved-from-three-choice-flag-logic', 'scope': 'route-entry-not-every-internal-scene', 'assumptions': ['从本轮游戏非持久剧情旗标清零状态出发', '原版SelectOto与RootOto的分支关系；不据此宣称补丁版本或二周目解锁条件'], 'evidence': ['scenario/selectoto.s', 'scenario/roototo.s', 'scenario/value.s']})
    return paths


def build_routes(texts):
    """Build all six games' route, direct choice and conservative transition data."""
    grouped = defaultdict(dict)
    for entry in texts:
        game_value = str(entry.get('game', entry.get('gameId', '')))
        match = re.match(r'\d{2}', game_value)
        if not match: continue
        game = match[0]
        path = normalize_script(entry.get('entry', entry.get('script', entry.get('resource', ''))))
        if not path.startswith('scenario/') or not path.endswith('.s') or not isinstance(entry.get('text'), str): continue
        grouped[game][path] = entry
    result = {}
    for game, entries in sorted(grouped.items()):
        scripts = {}
        definitions = _route_definitions(game); definition_by_id = {r['id']: r for r in definitions}
        for path, entry in sorted(entries.items()):
            rows = _rows(entry['text'], path); title, date = _safe_title(rows)
            basename = PurePosixPath(path).name
            narrative_code = re.match(r'^[a-z]{1,8}(?:\d|_\d)', PurePosixPath(path).stem)
            is_scene = bool(title or narrative_code) and not re.match(r'(?:root|select|value|scenereplay|(?:after)?ed_movie|op_movie|april15root|april15select)', basename)
            root, select = _default_controls(game, path)
            ids, certainty, evidence = _classify_route(game, path) if is_scene else ([], 'controller', 'not-a-story-scene')
            scripts[path] = {'rows': rows, 'title': title, 'date': date, 'isScene': is_scene, 'controller': _assigned_control(rows, '_RouteFile', root), 'selectionController': _assigned_control(rows, '_SelectFile', select), 'routeIds': ids, 'routes': [definition_by_id[r]['label'] for r in ids if r in definition_by_id], 'routeCertainty': certainty, 'routeEvidence': evidence, 'adultSegments': adult_segments(entry['text']), 'lineCount': len(entry['text'].splitlines())}
        programs = {path: _Program(path, scripts) for path in scripts}
        choices = _make_choices(game, scripts, programs)
        choice_by_point = {(r['source'], r['line']): r for r in choices}; choice_by_id = {r['id']: r for r in choices}
        route_entry_paths = _exact_game02_entry_paths(choices) if game == '02' else []
        scenes = {}
        for path, script in scripts.items():
            if not script['isScene']: continue
            scenes[path] = {key: script[key] for key in ('title', 'date', 'controller', 'selectionController', 'routeIds', 'routes', 'routeCertainty', 'routeEvidence', 'adultSegments', 'lineCount')}
            scenes[path].update(choiceIds=[], incomingChoiceIds=[], entryChoices=[], entryPaths=[], internalChoiceIds=[], hasChoices=False)
        for choice in choices:
            if choice['anchorScene'] in scenes:
                scenes[choice['anchorScene']]['choiceIds'].append(choice['id'])
                scenes[choice['anchorScene']]['hasChoices'] = True
            if choice['source'] in scenes: scenes[choice['source']]['internalChoiceIds'].append(choice['id'])
            for option in choice['options']:
                target_program = programs.get(option['targetController'])
                target_index = target_program.labels.get(option['targetLabel'].casefold()) if target_program else None
                if target_index is not None:
                    if option['targetController'] in scenes:
                        option['directTargets'] = [option['targetController']]
                        option['targetKind'] = 'within-scene'
                        start = target_program.rows[target_index]
                        later = next((r for r in target_program.rows[target_index + 1:] if r['source'] == start['source'] and _LABEL.match(r['text'])), None)
                        option['localBranchRange'] = {'startLine': start['line'], 'endLine': later['line'] - 1 if later else scenes[option['targetController']]['lineCount'], 'certainty': 'lexical-label-block-only', 'note': '这是标签词法范围；分支可能跳转或汇合，不能据此断言后续全部台词只属于一个选项'}
                    else:
                        controls = {'_routefile': scripts[choice['source']]['controller'], '_selectfile': scripts[choice['source']]['selectionController']}
                        resolved = _walk(programs, option['targetController'], target_index, scripts, choice_by_point, initial_env=controls)
                        option['directTargets'] = list(dict.fromkeys(r['target'] for r in resolved))
                        option['targetKind'] = 'controller-label'
                else:
                    option['certainty'] = 'unresolved-target'; option['targetKind'] = 'unresolved'
                for target in option['directTargets']:
                    if target in scenes and choice['id'] not in scenes[target]['incomingChoiceIds']:
                        scenes[target]['incomingChoiceIds'].append(choice['id'])
        transitions, unresolved = [], []
        for path, scene in scenes.items():
            program = programs.get(scene['controller']); stem = PurePosixPath(path).stem
            # Terminal legacy choices transfer to their explicit root labels.
            local = [c for c in choices if c['source'] == path and c['mechanism'] == 'selectset1']
            if local:
                for choice in local:
                    for option in choice['options']:
                        for target in option['directTargets']:
                            transitions.append({'source': path, 'target': target, 'conditions': choice['conditions'], 'viaChoices': [{'choice': choice['id'], 'option': option['index']}], 'certainty': option['certainty']})
                continue
            label = '@@' + stem + '_end'
            if program and label in program.labels:
                controls = {'_routefile': scene['controller'], '_selectfile': scene['selectionController']}
                for edge in _walk(programs, scene['controller'], program.labels[label], scripts, choice_by_point, initial_env=controls):
                    transitions.append({'source': path, **edge})
            else:
                unresolved.append({'source': path, 'controller': scene['controller'], 'expectedReturnLabel': label, 'reason': '未在现有控制脚本中找到确定返回标签，不据文件排列猜测后继'})
        incoming = defaultdict(list)
        for edge in transitions: incoming[edge['target']].append(edge)
        for path, scene in scenes.items():
            if route_entry_paths and 'common' not in scene['routeIds']:
                scene['entryPaths'] = [p for p in route_entry_paths if p['routeId'] in scene['routeIds']]
            allowed = {(v['choice'], v['option']) for p in scene['entryPaths'] for v in p['choices']} if scene['entryPaths'] else None
            scene['entryChoices'] = _nearest_entry_choices(path, incoming, choice_by_id, allowed_options=allowed)
            scene['entryChoiceNote'] = '列出最近可解析的前置选项与条件，存在多条进入路径时并列展示；不是唯一攻略。' if scene['entryChoices'] else '此位置没有解析到直接前置选项；可能为线性剧情、标题菜单入口或仍含动态跳转。'
        result[game] = {'schemaVersion': SCHEMA_VERSION, 'routes': definitions, 'scenes': scenes, 'choices': choices, 'routeEntryPaths': route_entry_paths, 'transitions': transitions, 'unresolvedTransitions': unresolved, 'stats': {'scenarioFiles': len(scripts), 'storyScenes': len(scenes), 'choices': len(choices), 'choiceOptions': sum(len(c['options']) for c in choices), 'explicitAdultRanges': sum(len(s['adultSegments']) for s in scenes.values()), 'transitions': len(transitions), 'unresolvedTransitions': len(unresolved)}, 'notes': ['路线由原版控制入口、脚本分组和明确返回分支交叉判定。', '共通文件与共享分支不能归为唯一个人线；条件依赖保留原式。', '这里没有把代表性最短路径当成唯一攻略，也没有从原版文本擅自推断二周目要求。', '普通回想白框效果不视为成人段落；成人标记只输出范围和证据指令。']}
    return result
