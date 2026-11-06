'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const layout=require('../dist/dialogue/scene-layout.js'),root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/dialogue/catalog.json'),'utf8'));
const read=spec=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,spec.repositoryPath))));
const assets=read(manifest.assets).assets;
let natives=0,scenes=0,layers=0,automaticPortraits=0,matchedReference=false,fixedApril=false,checkedAfterStory=false,restoredPortrait=false,checkedEntrance=false;const works=new Set();
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
  for(const row of detail.rows){
   if(row[3]!==0)continue;
   const who=detail.speakers[row[2]],face=detail.states[row[5]].face;if(!face)continue;
   for(const variant of face.alternatives||[face]){
    if(!variant.automatic)continue;automaticPortraits++;
    const cast=assets[variant.asset]?.characters||[];
    if(cast.length&&!who.id.startsWith('npc-'))assert.ok(cast.includes(who.id),dataset.id+'/'+scene.id+':'+row[0]+' portrait belongs to '+cast+', speaker is '+who.id);
   }
  }
  for(const state of detail.states){
   const plan=layout.plan(state,assets,{kind:0,speaker:''});
   for(const layer of plan.layers){assert.ok(Number.isFinite(layer.x)&&Number.isFinite(layer.y)&&Number.isFinite(layer.sx)&&Number.isFinite(layer.sy));assert.ok(layer.opacity>=0&&layer.opacity<=1);assert.ok(!/NaN|Infinity/.test(layer.transform));layers++;}
  }
  if(dataset.id==='02-zh'&&scene.id==='942a75629444ee44'){
   const row=detail.rows.find(row=>row[1].includes('但是哥哥却完全没有触及这件事'));
   assert.ok(row);const plan=layout.plan(detail.states[row[5]],assets,{kind:row[3],speaker:detail.speakers[row[2]].id});
   const body=plan.layers.find(l=>l.slot==='chara01'),background=plan.layers.find(l=>l.slot==='bg01');
   assert.equal(body.asset,'game-367086ba5c49f835');assert.equal(body.x,640);assert.equal(body.y,740);
   assert.equal(background.asset,'b06e60cfe2219d05');
   if(detail.states[row[5]].face?.asset)assert.ok(plan.layers.some(l=>l.kind==='face'&&l.asset===detail.states[row[5]].face.asset),'Keep the script portrait during narration');
   assert.ok(body.crop[2]-body.crop[0]<body.width/2,'Use the original transparent margins, never stretch a cropped figure');matchedReference=true;
  }
  if(dataset.id==='01-zh'&&scene.id==='f23753f35e97095f'){
   const row=detail.rows.find(row=>row[1].includes('赶快从我眼前消失'));
   const plan=layout.plan(detail.states[row[5]],assets,{kind:row[3],speaker:detail.speakers[row[2]].id});
   assert.ok(plan.layers.some(layer=>layer.slot==='bg01'&&layer.asset),'AVG2 April initialization must restore the real background');
   const face=plan.layers.find(layer=>layer.kind==='face');assert.equal(face.asset,'face-129374d0642c313f');assert.match(face.raw,/AEO_F_0_0_07$/);fixedApril=true;
  }
  if(dataset.id==='01-zh'&&scene.id==='35f761577c5fe7f2'){
   const row=detail.rows.find(row=>row[1].includes('对，说得太好了'));assert.ok(row);
   const who=detail.speakers[row[2]],plan=layout.plan(detail.states[row[5]],assets,{kind:row[3],speaker:who.id,speakerNames:[who.name,who.raw]});
   assert.ok(plan.layers.some(layer=>layer.slot==='bg01'&&layer.asset));checkedAfterStory=true;
  }
  if(dataset.id==='04-zh'&&scene.id==='a909496a5c0e58a3'){
   const row=detail.rows.find(row=>row[0]===37),plan=layout.plan(detail.states[row[5]],assets,{kind:row[3],speaker:detail.speakers[row[2]].id});
   const face=plan.layers.find(layer=>layer.kind==='face');assert.ok(face,'Restore the portrait in the reported April scene');
   assert.equal(face.asset,'face-8ff01cce7b2a8330');assert.match(face.raw,/SUR_F_0_0_05$/);assert.equal(face.x,188);assert.equal(face.y,720);restoredPortrait=true;
  }
  if(dataset.id==='01-zh'&&scene.id==='241d680ef49961a3'){
   const first=detail.states[detail.rows[0][5]],second=detail.states[detail.rows[1][5]];
   assert.equal(first.characters.length,0,'The source explicitly hides Asahi before Luna enters');
   assert.match(first.face.raw,/ASA_F_5_0_06$/);assert.ok(first.face.automatic);
   assert.ok(second.characters.some(layer=>/LUN_S_2_2_04$/.test(layer.raw)));assert.match(second.face.raw,/LUN_F_2_2_04$/);checkedEntrance=true;
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
assert.equal(layout.preferredVariant({characters:[variants]},sprites,{kind:0}),1);
for(const text of ['「对，说得太好了。等下又会接到一些过分的命令哦，比如转三圈说『ang』。」'.repeat(12),'中文 English\n第二段\n\n「保留全部文字」'.repeat(5),'😀あいうえお東京Paris'.repeat(30)]){
 const pages=layout.paginate(text,t=>Array.from(t).length*24,240,3);assert.equal(pages.join(''),text);assert.ok(pages.length>1);
 for(const page of pages)assert.ok(Array.from(page.replace(/\n/g,'')).length<=30);
}
const portrait={slot:'face',asset:'portrait',raw:'その他/FAC_0018',layout:{mode:'auto'}},portraitAssets={portrait:{width:278,height:220,characters:[]}};
for(const kind of [0,1]){
 const face=layout.plan({face:portrait},portraitAssets,{kind,speaker:'大蔵りそな'}).layers.find(layer=>layer.kind==='face');
 assert.ok(face);assert.equal(face.x,188);assert.equal(face.y,720);assert.equal(face.ax,139);assert.equal(face.ay,220);
}
assert.equal(layout.plan({face:{slot:'face',alternatives:[{visible:false,asset:'portrait'}]}},portraitAssets).layers.length,0,'Keep explicit script visibility');
assert.equal(works.size,6);assert.ok(matchedReference&&fixedApril&&checkedAfterStory&&restoredPortrait&&checkedEntrance&&natives>5000&&layers>50000&&automaticPortraits>50000);
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
console.log(JSON.stringify({status:'passed',works:works.size,scenePayloads:scenes,nativeSpriteBounds:natives,layerPlacements:layers,automaticPortraits,referenceScreenshot:'street + Aeo + correct line',originalSharedTextures:textures.size,storedFrameImages:0}));
