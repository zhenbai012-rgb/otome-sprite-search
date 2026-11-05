'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const core=require('../dist/dialogue/reader-core.js'),root=path.resolve(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'dist/dialogue/catalog.json'),'utf8'));
const reading=JSON.parse(fs.readFileSync(path.join(root,'dist/dialogue/reading.json'),'utf8'));
let edges=0,scenes=0;
assert.equal(Object.keys(reading.datasets).length,12);
for(const spec of catalog.datasets){
  const dataset=reading.datasets[spec.id],source=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,spec.repositoryPath))));
  assert.equal(dataset.work,spec.work);assert.equal(dataset.language,spec.language);
  assert.deepEqual(Object.keys(dataset.scenes).sort(),source.scenes.map(s=>s.id).sort());
  for(const scene of source.scenes){
    const nav=dataset.scenes[scene.id];scenes++;
    assert.equal(nav.title,scene.title);assert.deepEqual(nav.routes,scene.routes);
    // Opening movies must not leave a common-route reader stranded mid-story.
    if(scene.routes.some(route=>['01-common','02-common','04-common'].includes(route)))assert.ok(nav.next.length,scene.title);
    for(const next of nav.next){assert.ok(dataset.scenes[next]);assert.ok(dataset.scenes[next].previous.includes(scene.id));assert.notEqual(next,scene.id);edges++;}
    for(const prev of nav.previous)assert.ok(dataset.scenes[prev].next.includes(scene.id));
  }
}
// A match in the middle can be read to both ends, exactly once and without gaps.
for(const length of [1,17,60,61,459,2000])for(const index of [0,Math.floor(length/2),length-1]){
  let range=core.around(length,index),seen=new Set(Array.from({length:range.end-range.start},(_,i)=>range.start+i));
  assert.ok(index>=range.start&&index<range.end);
  while(range.start>0){const next=core.extend(length,range,-1);for(let i=next.start;i<range.start;i++){assert.ok(!seen.has(i));seen.add(i);}range=next;}
  while(range.end<length){const next=core.extend(length,range,1);for(let i=range.end;i<next.end;i++){assert.ok(!seen.has(i));seen.add(i);}range=next;}
  assert.equal(seen.size,length);assert.deepEqual(range,{start:0,end:length});
}
const nav={scenes:{common:{next:['a','b','return']},a:{routes:['01-lun']},b:{routes:['01-min']},return:{routes:['01-common']}}};
assert.deepEqual(core.neighbors(nav,'common',1,'01-lun',new Set(['return'])),['a']);
assert.deepEqual(core.neighbors(nav,'common',1,'',new Set(['return'])),['a','b']);
assert.deepEqual(core.neighbors(null,'common',1,'',new Set()),[]);
console.log(JSON.stringify({status:'passed',datasets:12,scenes,edges,bounds:'both directions, no gaps or duplicates',branches:'preserved, visited scenes excluded'}));
