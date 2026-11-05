'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),core=require('../dist/dialogue/search-core.js');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/dialogue/catalog.json'),'utf8'));
const dictionary=JSON.parse(fs.readFileSync(path.join(root,'dist/dialogue/normalization.json'),'utf8'));
const norm=core.normalizer(dictionary.characters,manifest.aliases);
const score=(line,query,mode='similar',breadth='normal')=>core.score(norm(line),core.prepare(query,norm,mode,breadth));
assert.equal(norm('「櫻小路露娜」，ＡＢＣ！'),norm('樱小路露娜 abc'));
assert.equal(norm('桜小路ルナ'),norm('樱小路露娜'));
assert.equal(score('请一直待在我的身边。','一直待在我身边').kind,'fuzzy');
assert.equal(score('请一直待在我的身边。','一直待在我身边','exact'),null);
assert.equal(score('今天的巴黎是一个好天气。','巴黎 天气').kind,'keywords');
assert.equal(score('完全无关的句子','巴黎 天气'),null);
assert.equal(core.prepare('x'.repeat(10000),norm).characters.length,160);
assert.equal(score('「我想和你一起去巴黎」','我想合你一起去巴黎').distance,1);
assert.ok(score('前文很长。还会一直陪在你的身边，后文也很长。','一直陪在你身边'));
// Verify the character prefilter cannot discard a permitted deletion/substitution.
for(const q of ['我们永远在一起','樱花开了以后再见','三个人的巴黎旅行']){
 for(let i=0;i<[...q].length;i++){
  const a=[...q];a.splice(i,1);assert.ok(score('前文'+a.join('')+'后文',q),q+' deletion '+i);
  a.splice(i,0,'呀');assert.ok(score(a.join(''),q),q+' substitution '+i);
 }
}
const all=[];
for(const spec of manifest.datasets.filter(d=>d.language==='zh')){
 const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,spec.repositoryPath))));
 for(const row of d.rows)all.push({text:row[3],key:spec.id+'/'+d.scenes[row[0]].id+'/'+row[1],normal:norm(row[3])});
}
const query='露娜大人',prepared=core.prepare(query,norm,'exact');
const expected=all.filter(r=>r.normal.includes(prepared.text)),actual=all.filter(r=>core.score(r.normal,prepared));
assert.ok(expected.length>100);
assert.deepEqual(actual.map(r=>r.key),expected.map(r=>r.key));
assert.equal(new Set(actual.map(r=>r.key)).size,actual.length);
const start=performance.now();
const fuzzy=core.prepare('一直陪在你的身旁',norm);
const results=all.filter(r=>core.score(r.normal,fuzzy));
console.log(JSON.stringify({status:'passed',paragraphs:all.length,repeatedLocations:actual.length,approximateMatches:results.length,fuzzySearchMs:Math.round(performance.now()-start)}));
