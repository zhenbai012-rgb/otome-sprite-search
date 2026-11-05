"""Optional local audit against privately extracted texts, not used by Pages."""
from pathlib import Path
import argparse,gzip,json,sys
sys.path.insert(0,str(Path(__file__).parent/'dialogue'))
from routes import adult_segments,normalize_script
from compile import cleanup

p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--native',type=Path,required=True);args=p.parse_args()
root=Path(__file__).resolve().parents[1]
native={(r['game'],normalize_script(r['entry'])):r for r in json.loads(args.native.read_text('utf8'))}
translated={(r['game'],normalize_script(r['entry'])):r for r in json.loads((args.input/'chinese-decoded.json').read_text('utf8'))}
source={'ja':native,'zh':{**native,**translated}}
cache={};count=0;options=0;works=set()
m=json.loads((root/'dist/dialogue/catalog.json').read_text('utf8'))
for spec in m['sceneFiles'].values():
    scene=json.loads(gzip.decompress((root/spec['repositoryPath']).read_bytes()))
    works.add(scene['work'])
    for row in scene['rows']:
        script=row[8] if len(row)>8 else scene['script'];key=(scene['language'],scene['work'],script)
        if key not in cache:
            text=source[scene['language']][(scene['work'],script)]['text']
            cache[key]=(text.splitlines(),adult_segments(text))
        lines,ranges=cache[key];line=row[4]
        assert 0<line<=len(lines),(key,line)
        assert not any(r['startLine']<=line<=r['endLine'] for r in ranges),(key,line,'adult interval')
        if row[3]==2:
            assert lines[line-1].strip().casefold().startswith('^select,'),(key,line)
            assert row[1] in lines[line-1],(key,line,row[1]);options+=1
        else:
            first=cleanup(lines[line-1])
            assert row[1].startswith(first),(key,line,first,row[1])
        count+=1
assert len(works)==6
print(json.dumps({'status':'passed','works':len(works),'sourceParagraphsChecked':count,'optionSourcesChecked':options,'paragraphsInsideAdultIntervals':0}))
