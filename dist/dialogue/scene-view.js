/* Compose existing assets directly in the page. No screenshots or frame files. */
(function(root){
  'use strict';
  const NS='http://www.w3.org/2000/svg',layout=root.DialogueSceneLayout;
  let instances=0;
  const svg=(tag,attributes={})=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attributes))e.setAttribute(k,String(v));return e;};
  class SceneView{
    constructor(element,options={}){
      this.element=element;this.resolve=options.resolve||((url)=>url);this.prefix='live-scene-'+(++instances)+'-';this.cache=new Map();this.variant=0;this.textVisible=true;this.key='';this.ticket=0;
      this.onPageChange=options.onPageChange||(()=>{});this.pages=[''];this.page=0;this.textKey='';this.measureContext=document.createElement('canvas').getContext('2d');
      element.classList.add('live-scene');element.setAttribute('role','img');
    }
    setUi(config){this.ui=config;this.key='';if(this.input)this.render(...this.input);}
    setVariant(index){this.variant=index;this.key='';if(this.input)this.render(...this.input);}
    toggleText(){this.textVisible=!this.textVisible;this.element.classList.toggle('hide-screen-text',!this.textVisible);this.notifyPages();return this.textVisible;}
    notifyPages(){this.onPageChange({page:this.page,total:this.pages.length,visible:this.textVisible});}
    setPage(index){this.page=Math.max(0,Math.min(this.pages.length-1,index));if(this.text)this.text.textContent=this.pages[this.page].replace(/\n$/,'');this.notifyPages();}
    paginateText(text,name){
      const style=getComputedStyle(this.text),fontSize=parseFloat(style.fontSize)||24,lineHeight=parseFloat(style.lineHeight)||fontSize*1.5;
      const heading=getComputedStyle(this.name),headingHeight=name?(parseFloat(heading.lineHeight)||30)+(parseFloat(heading.marginBottom)||0):0;
      const maxLines=Math.max(1,Math.floor((this.textGeometry.height-headingHeight-3)/lineHeight));
      const key=JSON.stringify([text,name,style.fontFamily,style.fontSize,maxLines,this.textGeometry.width]);
      if(key!==this.textKey){
        this.textKey=key;this.page=0;
        if(this.measureContext)this.measureContext.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const measure=value=>this.measureContext?this.measureContext.measureText(value).width:Array.from(value).length*fontSize;
        this.pages=layout.paginate(text,measure,this.textGeometry.width-4,maxLines);
      }
      this.setPage(this.page);
    }
    image(item,attributes,ticket){
      const image=svg('image',{...attributes,preserveAspectRatio:'none'}),file=this.resolve(item.file||item.thumb),thumb=this.resolve(item.thumb||item.file);
      image.dataset.asset=item.id||'';
      const cached=this.cache.get(file);image.setAttribute('href',cached?.ready?file:thumb);
      image.addEventListener('error',()=>{image.classList.add('layer-unavailable');});
      if(file&&file!==thumb&&!cached?.ready){
        let entry=cached;
        if(!entry){
          entry={ready:false,failed:false};entry.promise=new Promise(resolve=>{const full=new Image();full.decoding='async';full.onload=()=>{entry.ready=true;resolve(true);};full.onerror=()=>{entry.failed=true;resolve(false);};full.src=file;});this.cache.set(file,entry);
          if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);
        }
        entry.promise.then(ok=>{if(ticket===this.ticket&&image.isConnected&&ok){image.setAttribute('href',file);image.classList.remove('layer-unavailable');}});
      }
      return image;
    }
    tint(defs,item,index){
      if(item.tint==='#ffffff'&&item.add==='#000000'&&!/mono|gray/i.test(item.filter))return '';
      const id=this.prefix+'filter-'+index,filter=svg('filter',{id,'color-interpolation-filters':'sRGB'});
      if(/mono|gray/i.test(item.filter))filter.append(svg('feColorMatrix',{type:'saturate',values:0}));
      const transfer=svg('feComponentTransfer');
      for(const [offset,channel] of [[1,'R'],[3,'G'],[5,'B']])transfer.append(svg('feFunc'+channel,{type:'linear',slope:parseInt(item.tint.slice(offset,offset+2),16)/255,intercept:parseInt(item.add.slice(offset,offset+2),16)/255}));
      filter.append(transfer);defs.append(filter);return 'url(#'+id+')';
    }
    render(snapshot,assets,context){
      this.input=[snapshot,assets,context];this.lastPlan=layout.plan(snapshot,assets,{variant:this.variant,kind:context.kind,speaker:context.speaker.id,speakerNames:[context.speaker.name,...String(context.speaker.raw||'').split(/[＠@]/)]});
      const plan=this.lastPlan,baseUi=this.ui?.works?.[context.work],style=String(plan.message.file||'').toLowerCase();
      const variant=style.includes('full')?'full':style.includes('ion')?'ion':style.includes('april')?'april':style.includes('afaf')?'afaf':'';
      const ui=baseUi?.variants?.[variant]||baseUi,key=JSON.stringify([plan,context.work,ui]);
      const ticket=key===this.key?this.ticket:++this.ticket;
      if(key!==this.key){
        this.key=key;this.element.replaceChildren();
        const screen=svg('svg',{viewBox:'0 0 1280 720','aria-hidden':'true',focusable:'false',class:'live-scene-canvas'}),defs=svg('defs');screen.append(defs,svg('rect',{width:1280,height:720,fill:'#201e26'}));
        const drawLayer=(item,index)=>{
          const group=svg('g',{transform:item.transform,opacity:item.opacity,'data-slot':item.slot,'data-asset':item.asset||'',class:'rendered-layer'}),filter=this.tint(defs,item,index);
          if(filter)group.setAttribute('filter',filter);
          if(item.blend==='multiply'||item.blend==='screen')group.style.mixBlendMode=item.blend;
          if(item.blend==='add')group.style.mixBlendMode='screen';
          group.append(item.fill?svg('rect',{width:item.width,height:item.height,fill:item.fill}):this.image({...item.metadata,id:item.asset},{x:item.crop[0],y:item.crop[1],width:item.crop[2]-item.crop[0],height:item.crop[3]-item.crop[1]},ticket));
          if(item.priority>=plan.cameraMin&&item.priority<=plan.cameraMax){const camera=svg('g',{transform:plan.cameraTransform});camera.append(group);screen.append(camera);}else screen.append(group);
        };
        plan.layers.forEach((item,index)=>{if(item.priority<=1100)drawLayer(item,index);});
        const dialogue=svg('g',{class:'screen-dialogue'});
        if(ui?.layers?.length){for(const layer of ui.layers)dialogue.append(this.image({file:layer.file,thumb:layer.file},{x:layer.x,y:layer.y,width:layer.width,height:layer.height},ticket));}
        else{dialogue.append(svg('rect',{x:16,y:520,width:1248,height:184,rx:8,fill:'#ead6e7','fill-opacity':.78,stroke:'#b37eab','stroke-width':2}));}
        screen.append(dialogue);
        plan.layers.forEach((item,index)=>{if(item.priority>1100)drawLayer(item,index);});
        const foreign=svg('foreignObject',{x:ui?.text?.x||340,y:ui?.text?.y||559,width:ui?.text?.width||875,height:variant==='full'?560:150,class:'screen-dialogue'});
        this.textGeometry={width:Number(foreign.getAttribute('width')),height:Number(foreign.getAttribute('height'))};
        const body=document.createElement('div');body.className='screen-message';this.name=document.createElement('div');this.name.className='screen-speaker';this.text=document.createElement('div');this.text.className='screen-quote';body.append(this.name,this.text);foreign.append(body);screen.append(foreign);
        if(!plan.layers.length){const empty=document.createElement('p');empty.className='screen-empty';empty.textContent=plan.missing.length?'这段图片暂未能匹配':'这段暂无可确认的画面';this.element.append(empty);}
        this.element.append(screen);this.screen=screen;
      }
      const name=context.kind===0?context.speaker.name:'';this.name.textContent=name;this.name.hidden=!name;
      this.text.style.fontSize=Math.max(18,Math.min(40,layout.number(plan.message.fontsizew,24)))+'px';this.paginateText(context.text,name);
      this.element.setAttribute('aria-label',[context.title,name,context.text].filter(Boolean).join('，'));
      this.element.dataset.approximate=String(plan.approximate);this.element.dataset.layers=String(plan.layers.length);
      return plan;
    }
  }
  root.DialogueSceneView=SceneView;
})(typeof self==='undefined'?globalThis:self);
