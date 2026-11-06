'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),core=require('../dist/dialogue/scene-layout.js');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/dialogue/catalog.json'),'utf8'));
const read=s=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,s.repositoryPath))));
const assets=read(manifest.assets).assets,report={works:{},paragraphs:0,empty:0,reasons:{}};
for(const dataset of manifest.datasets){
 if(dataset.language!=='zh')continue;
 const counts={paragraphs:0,empty:0,reasons:{}},data=read(dataset);
 for(const info of data.scenes){const scene=read(info.detail);
  for(const row of scene.rows){
   const state=scene.states[row[5]],speaker=scene.speakers[row[2]],options={kind:row[3],speaker:speaker.id,speakerNames:[speaker.name,speaker.raw]},plan=core.plan(state,assets,{...options,variant:core.preferredVariant(state,assets,options)});counts.paragraphs++;report.paragraphs++;
   if(plan.layers.length)continue;
   counts.empty++;report.empty++;
   const records=state.backgrounds.concat(state.characters,state.face?[state.face]:[]);
   const other=records.some(r=>(r.alternatives||[]).some(a=>a.visible&&a.asset));
   const reason=records.length===0?'no_state':other?'empty_alternative':records.every(r=>r.slot==='face')?'portrait_only':'unmapped';
   counts.reasons[reason]=(counts.reasons[reason]||0)+1;report.reasons[reason]=(report.reasons[reason]||0)+1;
  }
 }
 report.works[dataset.work]=counts;
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
