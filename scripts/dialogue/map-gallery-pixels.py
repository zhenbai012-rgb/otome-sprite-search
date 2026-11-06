"""Match existing public CGs to native resources by decoded pixels, not names."""
from pathlib import Path
from collections import defaultdict,Counter
import argparse,hashlib,json,struct,subprocess,sys
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT.parent
from visual_state import ArtworkResourceIndex,canonical
sys.path.insert(0,str(BASE/'background_extract'))
from convert_images import decode


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);parser.add_argument('--missing',type=Path);args=parser.parse_args();private=args.input
    out=private/'alias-research';out.mkdir(exist_ok=True)
    resource=json.loads((private/'artwork-resource-map.json').read_text('utf8'));index=ArtworkResourceIndex(resource)
    cg=json.loads((ROOT/'dist/cg-data.js').read_text('utf8').split('=',1)[1].strip().removesuffix(';'))['images']
    by_pixel={Path(image['file']).stem:image['id'] for image in cg}
    backgrounds=json.loads((ROOT/'dist/backgrounds/catalog.js').read_text('utf8').split('=',1)[1].strip().removesuffix(';'))['images']
    by_pixel.update({Path(image['file']).stem:image['id'] for image in backgrounds})
    roots={j['game'][:2]:Path(j['archive']).parent for j in json.loads((private/'artwork-research/hash-jobs.json').read_text('utf8'))}
    jobs=defaultdict(set);wanted={}
    for image in cg:
        for place in image.get('placements',[]):
            game=place['game'][:2];reference=str(Path(canonical(place['resource'])).with_suffix(''))
            native=index.resolve(game,reference)
            if not native or native.get('assetId'):continue
            archive=roots[game]/native['archive']
            if not archive.exists():continue
            key=game+'|'+canonical(native['resource']);jobs[str(archive)].add(native['resource']);wanted.setdefault(native['rawSha256'],{})[key]=native
    if args.missing:
        for game,reference,count in json.loads(args.missing.read_text('utf8')):
            native=index.resolve(game,reference)
            if not native or native.get('assetId'):continue
            archive=roots[game]/native['archive']
            if archive.exists():
                key=game+'|'+canonical(native['resource']);jobs[str(archive)].add(native['resource']);wanted.setdefault(native['rawSha256'],{})[key]=native
    file=out/'all-public-jobs.json';file.write_text(json.dumps([{'archive':a,'entries':sorted(e)} for a,e in jobs.items()],ensure_ascii=False),encoding='utf8')
    log=out/'all-public-index.jsonl'
    subprocess.run([str(BASE/'background_extract/tools/garbro/BackgroundTool.exe'),'extract',str(file),str(out/'raw'),str(log)],check=True,stdout=subprocess.DEVNULL)
    alias_file=private/'visual-aliases.json';known=json.loads(alias_file.read_text('utf8')) if alias_file.exists() else {}
    public_ids=set(by_pixel.values())
    aliases={key:alias for key,alias in known.items() if alias['asset'] in public_ids and resource['resources'].get(key,{}).get('rawSha256')==alias['rawSha256']};results={}
    for row in map(json.loads,log.read_text('utf8').splitlines()):
        digest=row.get('sha256')
        if digest not in wanted or digest in results:continue
        raw=Path(row['raw']).read_bytes();assert hashlib.sha256(raw).hexdigest()==digest
        try:image,fmt,tiles=decode(raw)
        except Exception:results[digest]='container';continue
        pixels=hashlib.sha256(struct.pack('<II',image.width,image.height)+image.convert('RGBA').tobytes()).hexdigest();asset=by_pixel.get(pixels)
        if asset:
            for key,native in wanted[digest].items():aliases[key]={'rawSha256':digest,'asset':asset,'pixelSha256':pixels}
        results[digest]='matched' if asset else 'different-pixels'
    alias_file.write_text(json.dumps(aliases,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    print(json.dumps({'eligibleNativeImages':len(wanted),'verifiedAliases':len(aliases),'results':dict(Counter(results.values()))}))


if __name__=='__main__':main()
