/* Pure layout math shared by the live SVG view and source-data checks. */
(function(root){
  'use strict';
  function number(value,fallback=0){
    if(typeof value==='number')return Number.isFinite(value)?value:fallback;
    const text=String(value??'').trim();
    if(/^\$[\da-f]+$/i.test(text))return parseInt(text.slice(1),16);
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))return fallback;
    const parsed=Number(text);return Number.isFinite(parsed)?parsed:fallback;
  }
  function color(value,fallback='#ffffff'){
    const text=String(value??'').replace(/^\$/,'#');
    return /^#[\da-f]{6}$/i.test(text)?text.toLowerCase():fallback;
  }
  function anchor(value,axis){
    const key=String(value??'').toLowerCase();
    if(['center','middle'].includes(key))return .5;
    if(key==='right'||key==='bottom')return 1;
    if(key==='left'||key==='top')return 0;
    return Math.max(0,Math.min(1,number(value,axis==='x'?0:0)/100));
  }
  function solid(raw){
    const name=String(raw||'').replace(/\\/g,'/').toLowerCase().replace(/\.(?:png|bmp|b)$/,'');
    return /(?:^|\/)bg_(?:bl|black)$/.test(name)?'#000000':/(?:^|\/)bg_(?:wh|white)$/.test(name)?'#ffffff':null;
  }
  function alternatives(record){
    const seen=new Set();return (record?.alternatives||[]).filter(item=>{const key=JSON.stringify(item);if(seen.has(key))return false;seen.add(key);return true;});
  }
  function choose(record,index){
    const choices=alternatives(record);if(!choices.length)return record;
    const variant=choices[Math.min(index,choices.length-1)];
    return variant.visible===false?null:{...record,...variant};
  }
  function layer(record,assets,index,kind){
    const picked=choose(record,index);if(!picked)return null;
    const asset=assets[picked.asset],fill=solid(picked.raw);
    if(!asset&&!fill)return null;
    const p=picked.layout||{},width=number(asset?.width,1280),height=number(asset?.height,720);
    const x=number(p.x,kind==='character'?640:0),y=number(p.y,kind==='character'?740:0);
    const sx=number(p.scalex,100)/100,sy=number(p.scaley,100)/100,rotation=number(p.rotz);
    const ax=anchor(p.alignx??(kind==='character'?'center':'left'),'x')*width;
    const ay=anchor(p.aligny??(kind==='character'?'bottom':'top'),'y')*height;
    const opacity=Math.max(0,Math.min(1,number(p.alpha,255)/255));
    const crop=asset?.crop||[0,0,width,height];
    return {asset:picked.asset||null,metadata:asset,fill,slot:record.slot,kind,width,height,crop,x,y,sx,sy,ax,ay,rotation,opacity,
      priority:number(p.pri,kind==='character'?500:kind==='face'?1200:0)+number(p.addpri),
      transform:`translate(${x} ${y}) rotate(${rotation}) scale(${sx} ${sy}) translate(${-ax} ${-ay})`,
      tint:color(p.mulcolor),add:color(p.addcolor,'#000000'),filter:p.imgfilter||'none',blend:p.blend||'normal',
      approximate:!picked.layout||(asset?.kind==='game'&&!asset.crop)||['z','ax','ay','az','rotx','roty'].some(k=>number(p[k])!==0)||['x','y','scalex','scaley','rotz'].some(k=>p[k]!=null&&!Number.isFinite(number(p[k],NaN))),mode:p.mode||'auto'};
  }
  function plan(snapshot,assets,options={}){
    const index=options.variant||0,records=[...(snapshot.backgrounds||[]),...(snapshot.characters||[]),...(snapshot.face?[snapshot.face]:[])];
    if(!snapshot.backgrounds?.length&&snapshot.background)records.unshift(snapshot.background);
    const layers=[],missing=[];let variants=1;
    for(const record of records){
      variants=Math.max(variants,alternatives(record).length||1);
      const kind=record.slot?.startsWith('chara')?'character':record.slot==='face'?'face':'background';
      const item=layer(record,assets,index,kind);
      if(item){
        // Automatic portraits follow the current speaker, never stale narration.
        if(kind==='face'&&item.mode==='auto'){
          if(options.kind!==0)continue;
          const cast=item.metadata?.characters||[];
          if(cast.length&&options.speaker&&!cast.includes(options.speaker))continue;
        }
        layers.push(item);
      }else if(choose(record,index)&&!solid(choose(record,index).raw))missing.push(record.slot);
    }
    layers.sort((a,b)=>a.priority-b.priority||a.slot.localeCompare(b.slot));
    const camera=snapshot.camera||{},zx=number(camera.zoomx,100)/100,zy=number(camera.zoomy,100)/100,angle=number(camera.rotz);
    const cameraTransform=`translate(640 360) rotate(${-angle}) scale(${zx} ${zy}) translate(-640 -360)`;
    return {width:1280,height:720,layers,missing,variants,cameraTransform,cameraMin:number(camera.pri1,-100),cameraMax:number(camera.pri2,999),
      approximate:Boolean(snapshot.incomplete||snapshot.conditional||missing.length||layers.some(l=>l.approximate)||number(camera.ax)||number(camera.ay)),
      message:snapshot.message||{}};
  }
  const api={number,color,anchor,solid,choose,layer,plan};root.DialogueSceneLayout=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self==='undefined'?globalThis:self);
