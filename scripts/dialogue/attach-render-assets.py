"""Attach native canvas/crop metadata to the existing asset map without images."""
from pathlib import Path
import argparse,gzip,hashlib,json
ROOT=Path(__file__).resolve().parents[2]


def attach(private):
    catalog_file=ROOT/'dist/dialogue/catalog.json';catalog=json.loads(catalog_file.read_text('utf8'))
    old=catalog['assets'];data=json.loads(gzip.decompress((ROOT/old['repositoryPath']).read_bytes()))
    native={r['id']:r for r in map(json.loads,(private/'sprite-bounds.jsonl').read_text('utf8').splitlines()) if 'crop' in r}
    count=0
    for key,asset in data['assets'].items():
        if asset['kind']!='game':continue
        assert key in native,'Native alpha bounds missing: '+key
        row=native[key];assert key=='game-'+row['sha256'][:16]
        assert row['width']==asset['width'] and row['height']==asset['height'],key
        left,top,right,bottom=row['crop'];assert 0<=left<=right<=row['width'] and 0<=top<=bottom<=row['height'],key
        asset['crop']=row['crop'];count+=1
    raw=(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode();packed=gzip.compress(raw,compresslevel=9,mtime=0);digest=hashlib.sha256(packed).hexdigest()
    path=ROOT/'dialogue-data'/('assets.'+digest[:12]+'.json.gz');path.write_bytes(packed);relative=path.relative_to(ROOT).as_posix()
    catalog['assets']={'url':'https://raw.githubusercontent.com/zhenbai012-rgb/otome-sprite-search/main/'+relative,'fallbacks':['https://cdn.jsdelivr.net/gh/zhenbai012-rgb/otome-sprite-search@main/'+relative],'repositoryPath':relative,'sha256':digest,'jsonSha256':hashlib.sha256(raw).hexdigest(),'bytes':len(packed)}
    catalog_file.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8',newline='\n')
    original=(ROOT/old['repositoryPath']).resolve();assert original.is_relative_to((ROOT/'dialogue-data').resolve())
    if original!=path.resolve():original.unlink()
    print(json.dumps({'nativeCanvasesRestored':count,'composedImages':0,'assetMapBytes':len(packed)}))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);args=parser.parse_args();attach(args.input)
