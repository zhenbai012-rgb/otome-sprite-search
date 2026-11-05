'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const layout=require('../dist/dialogue/scene-layout.js'),root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/dialogue/catalog.json'),'utf8'));
const read=spec=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,spec.repositoryPath))));
const assets=read(manifest.assets).assets;
let natives=0,scenes=0,layers=0,matchedReference=false;const works=new Set();
for(const [id,asset] of Object.entries(assets)){
 assert.ok(asset.width>0&&asset.height>0,id);
 if(asset.kind!=='game')continue;
 assert.equal(asset.crop.length,4,id);const [l,t,r,b]=asset.crop;
 assert.ok(0<=l&&l<=r&&r<=asset.width&&0<=t&&t<=b&&b<=asset.height,id);natives++;
}
for(const dataset of manifest.datasets){
 const data=read(dataset);works.add(data.work);
 for(const scene of data.scenes){
  const detail=read(scene.detail);scenes++;
  for(const state of detail.states){
   const plan=layout.plan(state,assets,{kind:0,speaker:''});
   for(const layer of plan.layers){assert.ok(Number.isFinite(layer.x)&&Number.isFinite(layer.y)&&Number.isFinite(layer.sx)&&Number.isFinite(layer.sy));assert.ok(layer.opacity>=0&&layer.opacity<=1);assert.ok(!/NaN|Infinity/.test(layer.transform));layers++;}
  }
  if(dataset.id==='02-zh'&&scene.id==='942a75629444ee44'){
   const row=detail.rows.find(row=>row[1].includes('但是哥哥却完全没有触及这件事'));
   assert.ok(row);const plan=layout.plan(detail.states[row[5]],assets,{kind:row[3],speaker:detail.speakers[row[2]].id});
   const body=plan.layers.find(l=>l.slot==='chara01'),background=plan.layers.find(l=>l.slot==='bg01');
   assert.equal(body.asset,'game-367086ba5c49f835');assert.equal(body.x,640);assert.equal(body.y,740);
   assert.equal(background.asset,'b06e60cfe2219d05');assert.ok(!plan.layers.some(l=>l.kind==='face'));
   assert.ok(body.crop[2]-body.crop[0]<body.width/2,'Use the original transparent margins, never stretch a cropped figure');matchedReference=true;
  }
 }
}
const sprites={a:{width:1280,height:750,crop:[415,9,865,750],kind:'game'}};
const char=layout.layer({asset:'a',slot:'chara01',layout:{x:'240',y:'740',scalex:'-120',scaley:'120',alignx:'center',aligny:'bottom',alpha:'$80',pri:'100',addpri:'20'}},sprites,0,'character');
assert.equal(char.sx,-1.2);assert.equal(char.sy,1.2);assert.equal(char.opacity,128/255);assert.equal(char.priority,120);assert.deepEqual(char.crop,[415,9,865,750]);
assert.ok(!char.approximate);assert.equal(layout.solid('bg/BG_wh'),'#ffffff');assert.equal(layout.number('process.exit()',17),17);
const variants={slot:'chara01',alternatives:[{visible:false},{visible:true,asset:'a',layout:{x:'640'}}]};
assert.equal(layout.layer(variants,sprites,0,'character'),null);assert.equal(layout.layer(variants,sprites,1,'character').asset,'a');
const repeated={slot:'chara01',alternatives:[{visible:true,asset:'a',layout:{x:'640'}},{visible:true,asset:'a',layout:{x:'640'}}]};
assert.equal(layout.plan({characters:[repeated]},sprites,{kind:0}).variants,1);
assert.equal(works.size,6);assert.ok(matchedReference&&natives>5000&&layers>50000);
const ui=JSON.parse(fs.readFileSync(path.join(root,'dist/dialogue/ui.json'),'utf8')),textures=new Set();
assert.equal(Object.keys(ui.works).length,6);
for(const work of Object.values(ui.works))for(const theme of [work,...Object.values(work.variants||{})])for(const layer of theme.layers){
 assert.match(layer.file,/^ui\/[a-f0-9]{20}\.webp$/);assert.match(layer.nativeSha256,/^[a-f0-9]{64}$/);
 const bytes=fs.readFileSync(path.join(root,'dist/dialogue',layer.file));assert.equal(bytes.toString('ascii',8,12),'WEBP');
 let w,h;const type=bytes.toString('ascii',12,16);
 if(type==='VP8L'){const bits=bytes.readUInt32LE(21);w=(bits&0x3fff)+1;h=((bits>>>14)&0x3fff)+1;}
 else if(type==='VP8X'){w=bytes.readUIntLE(24,3)+1;h=bytes.readUIntLE(27,3)+1;}
 else throw new Error('Unexpected shared lossless texture format: '+type);
 assert.equal(w,layer.width);assert.equal(h,layer.height);assert.ok(Number.isFinite(layer.x)&&Number.isFinite(layer.y));textures.add(layer.file);
}
console.log(JSON.stringify({status:'passed',works:works.size,scenePayloads:scenes,nativeSpriteBounds:natives,layerPlacements:layers,referenceScreenshot:'street + Aeo + correct line',originalSharedTextures:textures.size,storedFrameImages:0}));
