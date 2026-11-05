'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'dist/dialogue');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'catalog.json'),'utf8'));
const dictionary=JSON.parse(fs.readFileSync(path.join(folder,'normalization.json'),'utf8'));
const core=require('../dist/dialogue/search-core.js'),literal=core.normalizer(dictionary.characters);
const events=[];
const context=vm.createContext({setTimeout,clearTimeout,onmessage:null,location:{href:'http://localhost/dist/dialogue/search-worker.js'},postMessage:message=>events.push(message),DialogueSearchCore:core,DialogueData:{load:async spec=>spec.repositoryPath?JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,spec.repositoryPath)))):dictionary},importScripts:()=>{}});
vm.runInContext(fs.readFileSync(path.join(folder,'search-worker.js'),'utf8'),context);
let id=0;
async function search(options){events.length=0;await context.onmessage({data:{type:'search',id:++id,query:'大藏',language:'preferred',mode:'similar',breadth:'normal',...options}});const result=events.findLast(e=>e.type==='results');assert.ok(result,JSON.stringify(events));assert.equal(result.complete,true);return result;}
(async()=>{
 await context.onmessage({data:{type:'init',manifest}});assert.ok(events.some(e=>e.type==='ready'));
 const exact=await search({mode:'exact'});assert.ok(exact.total>50);
 assert.ok(exact.results.every(r=>literal(r.text).includes(literal('大藏'))));
 events.length=0;await context.onmessage({data:{type:'page',id,offset:50}});const page=events.find(e=>e.type==='page');assert.equal(page.results.length,50);assert.equal(page.total,exact.total);
 const ids=r=>r.dataset+'/'+r.scene+'/'+r.ordinal;assert.equal(new Set([...exact.results,...page.results].map(ids)).size,100);
 const named=await search({});assert.ok(named.total>=exact.total);assert.ok(named.results.some(r=>r.kind==='alias'));
 const approximate=await search({query:'一直陪在你的身旁'});assert.ok(approximate.total>=4);assert.ok(approximate.results.every(r=>r.distance<=2));
 const option=await search({query:'里想奈',work:'02',kind:'2'});assert.ok(option.total>=2);assert.ok(option.results.every(r=>r.work==='02'&&r.textKind===2));
 const japanese=await search({query:'朝日',work:'06',language:'ja'});assert.ok(japanese.total>0);assert.ok(japanese.results.every(r=>r.work==='06'&&r.language==='ja'));
 console.log(JSON.stringify({status:'passed',exactLocations:exact.total,nameAliasLocations:named.total,fuzzyLocations:approximate.total,optionLocations:option.total,japaneseLocations:japanese.total,pagination:'all results retained'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
