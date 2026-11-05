/* Append text at either edge; adding earlier paragraphs preserves the viewport. */
(function(root){
  'use strict';
  const core=root.DialogueReaderCore;
  class ContinuousReader {
    constructor(options){
      Object.assign(this,options);this.blocks=[];this.version=0;this.busy=false;this.paused=true;this.frame=0;
      this.flow.addEventListener('scroll',()=>this.queue());
      this.flow.addEventListener('wheel',event=>this.queue(Math.sign(event.deltaY)),{passive:true});
      this.flow.addEventListener('keydown',event=>{if(['ArrowDown','PageDown','End'].includes(event.key))this.queue(1);if(['ArrowUp','PageUp','Home'].includes(event.key))this.queue(-1);});
    }
    close(){this.version++;this.paused=true;this.busy=false;this.blocks=[];this.context.replaceChildren();}
    reset(scene,result){
      this.close();this.paused=true;this.original={...result};
      const index=Math.max(0,scene.rows.findIndex(row=>row[0]===result.ordinal));
      this.add(scene,result,core.around(scene.rows.length,index),1);this.boundaries();
      this.locate(scene,result,result.ordinal,true);
    }
    add(scene,result,range,direction){
      const section=document.createElement('section'),heading=document.createElement('h4'),list=document.createElement('ol');
      section.className='reading-scene';section.dataset.scene=scene.id;
      heading.className='reading-scene-heading';heading.textContent=scene.title+(scene.period?' · '+scene.period:'');list.className='context';section.append(heading,list);
      const block={scene,result:{...result,scene:scene.id,title:scene.title},...range,section,list};
      this.insertRows(block,range.start,range.end,1);
      if(direction<0){this.blocks.unshift(block);this.context.prepend(section);}else{this.blocks.push(block);this.context.append(section);}
      return block;
    }
    insertRows(block,start,end,direction){
      const fragment=document.createDocumentFragment();
      for(const row of block.scene.rows.slice(start,end)){
        const item=this.makeRow(block.scene,row,block.result);item.dataset.ordinal=String(row[0]);
        if(block.scene.id===this.original.scene&&row[0]===this.original.ordinal)item.classList.add('search-hit');
        fragment.append(item);
      }
      if(direction<0)block.list.prepend(fragment);else block.list.append(fragment);
    }
    edge(direction){return direction<0?this.blocks[0]:this.blocks.at(-1);}
    neighbors(block,direction){
      return core.neighbors(this.navigation,block.scene.id,direction,this.route,new Set(this.blocks.map(b=>b.scene.id)));
    }
    boundaries(){
      for(const direction of [-1,1]){
        const boundary=direction<0?this.before:this.after,block=this.edge(direction);boundary.replaceChildren();
        if(!block)continue;
        const more=direction<0?block.start>0:block.end<block.scene.rows.length;
        const add=(label,action)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=this.busy;button.addEventListener('click',action);boundary.append(button);};
        if(more)add(direction<0?'↑ 继续往前':'继续往后 ↓',()=>this.load(direction));
        else if(!this.navigation){
          add('读取前后场景',()=>this.retryNavigation());
        }else{
          const neighbors=this.neighbors(block,direction);
          if(neighbors.length>1){const label=document.createElement('p');label.textContent=direction<0?'前面的分支':'接着阅读';boundary.append(label);}
          for(const id of neighbors){
            const scene=this.navigation.scenes[id],prefix=direction<0?'↑ ':'↓ ';
            add(prefix+scene.title,()=>this.load(direction,id));
          }
          if(!neighbors.length){const label=document.createElement('p');label.textContent=direction<0?'本段开头':'本段结束';boundary.append(label);}
        }
      }
    }
    preserve(direction,mutate){
      const top=this.flow.scrollTop,height=this.flow.scrollHeight;this.paused=true;mutate();
      if(direction<0)this.flow.scrollTop=top+this.flow.scrollHeight-height;
      this.lastTop=this.flow.scrollTop;
      requestAnimationFrame(()=>{this.paused=false;this.lastTop=this.flow.scrollTop;});
    }
    async load(direction,target){
      if(this.busy||!this.blocks.length)return null;
      const block=this.edge(direction),expanded=core.extend(block.scene.rows.length,block,direction);
      if(expanded.start!==block.start||expanded.end!==block.end){
        this.preserve(direction,()=>{this.insertRows(block,direction<0?expanded.start:block.end,direction<0?block.start:expanded.end,direction);Object.assign(block,expanded);this.boundaries();});
        return block;
      }
      const candidates=this.neighbors(block,direction);
      if(!target&&candidates.length!==1)return null;
      target=target||candidates[0];if(!candidates.includes(target))return null;
      const version=this.version;this.busy=true;this.boundaries();
      try{
        const result={...block.result,scene:target,ordinal:0,title:this.navigation.scenes[target].title};delete result.detail;
        const scene=await this.loadScene(result);
        if(version!==this.version)return null;
        result.ordinal=direction<0?scene.rows.at(-1)[0]:scene.rows[0][0];
        let added;
        this.preserve(direction,()=>{added=this.add(scene,result,core.around(scene.rows.length,direction<0?scene.rows.length-1:0),direction);});
        return added;
      }catch(error){if(version===this.version)this.onError(error);return null;}
      finally{if(version===this.version){this.busy=false;this.boundaries();}}
    }
    queue(direction){
      if(this.paused)return;
      this.direction=direction||Math.sign(this.flow.scrollTop-(this.lastTop||0));this.lastTop=this.flow.scrollTop;
      if(this.frame)return;
      this.frame=requestAnimationFrame(()=>{
        this.frame=0;if(this.paused||this.busy)return;
        if(this.direction<0&&this.flow.scrollTop<260)this.load(-1);
        if(this.direction>0&&this.flow.scrollHeight-this.flow.scrollTop-this.flow.clientHeight<360)this.load(1);
      });
    }
    locate(scene,result,ordinal,center=false){
      const block=this.blocks.find(b=>b.scene.id===scene.id);if(!block)return false;
      const index=scene.rows.findIndex(row=>row[0]===ordinal);if(index<0)return false;
      if(index<block.start)this.preserve(-1,()=>{this.insertRows(block,index,block.start,-1);block.start=index;this.boundaries();});
      if(index>=block.end)this.preserve(1,()=>{this.insertRows(block,block.end,index+1,1);block.end=index+1;this.boundaries();});
      for(const item of this.context.querySelectorAll('.current'))item.classList.remove('current');
      const item=block.list.querySelector(`[data-ordinal="${ordinal}"]`);item.classList.add('current');
      this.onSelect(scene,{...result,scene:scene.id,title:scene.title},ordinal);
      if(center){
        this.paused=true;
        requestAnimationFrame(()=>{
          if(!item.isConnected)return;
          this.flow.scrollTop+=item.getBoundingClientRect().top-this.flow.getBoundingClientRect().top-this.flow.clientHeight/2+item.offsetHeight/2;
          this.lastTop=this.flow.scrollTop;requestAnimationFrame(()=>{this.paused=false;});
        });
      }
      return true;
    }
    async step(scene,result,ordinal,direction){
      const index=scene.rows.findIndex(row=>row[0]===ordinal),row=scene.rows[index+direction];
      if(row)return this.locate(scene,result,row[0],true);
      const block=this.blocks.find(b=>b.scene.id===scene.id),position=this.blocks.indexOf(block),adjacent=this.blocks[position+direction];
      if(adjacent)return this.locate(adjacent.scene,adjacent.result,direction<0?adjacent.scene.rows.at(-1)[0]:adjacent.scene.rows[0][0],true);
      const added=await this.load(direction);
      if(added&&added!==block)return this.locate(added.scene,added.result,direction<0?added.scene.rows.at(-1)[0]:added.scene.rows[0][0],true);
      (direction<0?this.before:this.after).scrollIntoView({block:direction<0?'start':'end'});
    }
  }
  root.ContinuousReader=ContinuousReader;
})(typeof self==='undefined'?globalThis:self);
