/* Audit every CG jump against the actual scene renderer and filtered text. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const parseScript=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8').split('=').slice(1).join('=').trim().replace(/;$/,''));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const layout=require('../dist/dialogue/scene-layout.js'),index=read('dist/data/cg-story-index.json'),manifest=read('dist/dialogue/catalog.json');
const catalog=parseScript('dist/cg-data.js'),images=new Map(catalog.images.filter(r=>r.kind==='cg').map(r=>[r.id,r]));
const evidence=read('scripts/cg-script-references.json').assets,routes=new Set(manifest.routes.map(r=>r.id));
const renderAssets=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,manifest.assets.repositoryPath)))).assets;
assert.equal(index.manifestSha256,sha(fs.readFileSync(path.join(root,'dist/dialogue/catalog.json'))),'Rebuild CG links after compiling dialogue');
assert.deepEqual(Object.keys(index.assets).sort(),[...images.keys()].sort());
const scenes=new Map();let exact=0,related=0,ranges=0,frames=0;const byWork=new Set();
for(const [key,info] of Object.entries(index.scenes)){
 const spec=manifest.sceneFiles[key];assert.deepEqual(info.spec,spec);
 const bytes=fs.readFileSync(path.join(root,spec.repositoryPath));assert.equal(sha(bytes),spec.sha256);
 const scene=JSON.parse(zlib.gunzipSync(bytes));assert.equal(scene.id,info.id);assert.equal(scene.title,info.title);assert.equal(scene.script,info.script);assert.deepEqual(scene.routes,info.routes);
 scenes.set(key,scene);
}
for(const [id,story] of Object.entries(index.assets)){
 const image=images.get(id);assert.deepEqual(image.story,{routes:story.routes,status:story.status,locations:story.locations.length});
 assert.ok(story.routes.every(r=>routes.has(r)));const states=new Map();
 for(const entry of story.locations){
  ranges++;const scene=scenes.get(entry.scene);assert.ok(scene);byWork.add(scene.work);
  assert.ok(Number.isInteger(entry.from)&&entry.from>=0&&entry.to>=entry.from&&entry.to<scene.rows.length);
  if(['exact','conditional'].includes(entry.kind)){
   assert.equal(entry.target,id);exact++;
   for(const row of scene.rows.slice(entry.from,entry.to+1)){
    frames++;const stateKey=entry.scene+'/'+row[5];
    if(!states.has(stateKey)){
     const snapshot=scene.states[row[5]],plan=layout.plan(snapshot,renderAssets),visible=new Set();
     for(let variant=0;variant<plan.variants;variant++)for(const l of layout.plan(snapshot,renderAssets,{variant}).layers)if(l.asset&&l.opacity>0)visible.add(l.asset);
     states.set(stateKey,visible);
    }
    assert.ok(states.get(stateKey).has(id),`${id} is not rendered at ${entry.scene}:${row[0]}`);
   }
  }else if(entry.kind==='difference'){
   related++;assert.ok(images.has(entry.related));
   assert.ok(image.placements.some(p=>images.get(entry.related).placements.some(other=>p.game===other.game&&p.scene===other.scene)),'A related image must share the curated scene pack');
   assert.ok(index.assets[entry.related].locations.some(e=>e.scene===entry.scene&&e.from===entry.from));
  }else{
   related++;assert.ok(['script','preload','ending'].includes(entry.kind));
   const ref=(evidence[id]||[]).find(r=>r.work===scene.work&&r.script===scene.script&&r.line===entry.sourceLine&&(r.kind|| (r.preload?'preload':'script'))===entry.kind);
   assert.ok(ref,`No native command evidence: ${id} ${entry.scene}`);
   assert.ok(image.placements.some(p=>ref.command.toLowerCase().includes(path.posix.basename(p.resource.replace(/\\/g,'/')).replace(/\.[^.]+$/,'').toLowerCase())));
   assert.ok(!entry.target,'An indirect link must not pretend to be the exact displayed image');
   if(entry.kind==='ending'){assert.match(ref.call,/ed_movie/i);assert.ok(ref.caller.toLowerCase().includes(scene.script.replace(/\//g,'\\').toLowerCase()));}
  }
 }
 assert.equal(story.status,story.locations.some(e=>['exact','conditional'].includes(e.kind))?'exact':story.locations.length?'related':'unlocated');
 if(story.status==='unlocated')assert.equal(story.routes.length,0,'Do not guess an unused image route from its character');
}
assert.equal(byWork.size,6);assert.ok(exact>500&&related>0);
console.log(JSON.stringify({status:'passed',images:images.size,works:byWork.size,exactRanges:exact,relatedRanges:related,checkedFrames:frames,locations:ranges,coverage:index.stats}));
