"""Read the latest AVG / AVG2 layout templates without running the games."""
from pathlib import Path
from collections import defaultdict
import argparse,json,re,subprocess

ROOT=Path(__file__).resolve().parents[2];BASE=ROOT.parent


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True,help='Private dialogue extraction directory')
    parser.add_argument('--entries',type=Path,default=BASE/'background_extract/all-entries.json')
    args=parser.parse_args();private=args.input
    entries=json.loads(args.entries.read_text('utf8'))
    hashjobs=json.loads((private/'artwork-research/hash-jobs.json').read_text('utf8'))
    roots={j['game'][:2]:Path(j['archive']).parent for j in hashjobs}
    pattern=re.compile(r'^(?:avg\d*/(?:imoscripter_(?:template_)?(?:image|chara8e|face|camera|message)\.(?:s|txt)|imoscripter_face_(?:repid|repfile|poslist)\.txt|projectsetting\.txt|projectobjects\.txt|imoscripter_include\.s)|include[^/]*/[^/]+\.txt)$',re.I)
    latest={}
    for row in entries:
        game=row['game'][:2];path=row['name'].replace('\\','/').lower()
        if not pattern.match(path):continue
        archive=Path(row['archive'])
        if not archive.is_file():archive=roots[game]/archive.name
        if not archive.is_file():continue
        priority=int(re.search(r'data(\d+)\.pack',archive.name,re.I)[1]);key=game,path
        if key not in latest or latest[key]['priority']<priority:
            latest[key]={**row,'archive':str(archive),'priority':priority}
    jobs=defaultdict(list)
    for row in latest.values():jobs[row['archive']].append(row['name'])
    jobfile=private/'layout-jobs.json'
    jobfile.write_text(json.dumps([{'archive':a,'entries':v} for a,v in jobs.items()],ensure_ascii=False),encoding='utf8')
    subprocess.run([str(BASE/'background_extract/tools/garbro/BackgroundTool.exe'),'extract',str(jobfile),str(private/'layout-raw'),str(private/'layout-index.jsonl')],check=True,stdout=subprocess.DEVNULL)
    records=[json.loads(line) for line in (private/'layout-index.jsonl').read_text('utf8').splitlines()]
    errors=[r for r in records if 'error' in r]
    if errors:raise RuntimeError(f'{len(errors)} engine resources could not be read')
    print(json.dumps({'engineResources':len(latest),'packs':len(jobs),'avg2Resources':sum(key[1].startswith('avg2/') for key in latest),'errors':0}))


if __name__=='__main__':main()
