/* Load a CG's existing text locations on demand; the reader reuses dialogue/. */
import './dialogue/data-loader.js?v=c467248d9563';

const indexUrl=new URL('data/cg-story-index.json?v=871de612c8fc',import.meta.url);
let indexPromise;
const sceneCache=new Map();
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;};
const button=(text,action)=>{const el=node('button',text);el.type='button';el.addEventListener('click',action);return el;};
const notes={conditional:'此处随选项切换画面，预览将定位到本图所在分支。',script:'脚本引用位置；以下为相邻公开文本，未确认逐句画面。',preload:'此图由该场景预载；以下为关联文本，未确认实际显示帧。',difference:'以下为同场景差分的文本与画面。',ending:'结尾演出用图；以下为进入演出前的剧情。'};

async function index(){
  if(!indexPromise)indexPromise=fetch(indexUrl).then(r=>{if(!r.ok)throw new Error('剧情索引暂时无法读取');return r.json();}).catch(error=>{indexPromise=null;throw error;});
  return indexPromise;
}
function loadScene(scene){
  const key=scene.dataset+'/'+scene.id;
  if(!sceneCache.has(key)){
    const pending=window.DialogueData.load(scene.spec,new URL('dialogue/',import.meta.url)).catch(error=>{sceneCache.delete(key);throw error;});
    sceneCache.set(key,pending);
    if(sceneCache.size>8)sceneCache.delete(sceneCache.keys().next().value);
  }
  return sceneCache.get(key);
}
function readerUrl(scene,entry,embed=false){
  const url=new URL('dialogue/',import.meta.url);url.search='';
  url.searchParams.set('dataset',scene.dataset);url.searchParams.set('scene',scene.id);url.searchParams.set('line',String(entry.from));
  if(entry.target)url.searchParams.set('cg',entry.target);
  if(embed)url.searchParams.set('embed','cg');
  return url;
}
function optionText(value){return typeof value==='string'?value:value?.text||'条件选择';}
function choices(scene,row,routes){
  const root=node('details',null,'cg-choices');root.append(node('summary','选项与分支'));
  const paths=scene.entryPaths||[];
  for(const path of paths){
    const group=node('div',null,'cg-choice-path');group.append(node('h5',routes.get(path.route)||path.route));
    const list=node('ol');for(const step of path.steps)list.append(node('li',optionText(step.options[step.selected])));group.append(list);root.append(group);
  }
  const entries=paths.length?[]:scene.entryChoices||[];
  const local=(scene.choices||[]).filter(choice=>choice.source!==scene.script||choice.line<=row[4]);
  for(const choice of [...entries,...local]){
    const group=node('div',null,'cg-choice-path'),list=node('ul');group.append(node('h5',choice.label||'到达此处的选项'));
    (choice.options||[]).forEach((option,i)=>list.append(node('li',optionText(option),choice.selected===i||(row[6]||[]).includes(`${choice.id}:${i}`)?'selected':'')));
    group.append(list);if(choice.note)group.append(node('p',choice.note,'cg-story-note'));if(choice.conditions?.length)group.append(node('p',choice.conditions.join('；'),'cg-story-note'));root.append(group);
  }
  if(!paths.length&&!entries.length&&!local.length)root.append(node('p',scene.choiceNote||'这段剧情没有单独选项。','cg-story-note'));
  root.open=paths.length<=1;return root;
}

export async function mount(host,record,{work=''}={}){
  host.append(node('h4','剧情出处'),node('p','正在读取…','cg-story-status'));
  try{
    const data=await index();if(!host.isConnected)return;
    const story=data.assets[record.id],routes=new Map(data.routes.map(r=>[r.id,r.name])),works=new Map(data.works.map(w=>[w.id,w.short]));
    host.replaceChildren(node('h4','剧情出处'));
    if(!story?.locations.length){
      const labels=(story?.routes||[]).map(r=>routes.get(r)||r);if(labels.length)host.append(node('p',labels.join(' / '),'cg-route-label'));
      host.append(node('p','尚未找到可确认的文本位置。','cg-story-note'));return;
    }
    const select=node('select');select.setAttribute('aria-label','CG 出现位置');
    const locations=story.locations;
    locations.forEach((entry,i)=>{const scene=data.scenes[entry.scene];const option=new Option(`${works.get(scene.work)} · ${scene.title} · ${scene.language==='zh'?'中文':'日文'} · 第 ${entry.from+1} 段`,String(i));select.add(option);});
    const preferred=locations.findIndex(e=>data.scenes[e.scene].work===(work||'').slice(0,2)&&data.scenes[e.scene].language==='zh');if(preferred>=0)select.value=String(preferred);
    const label=node('label','出现位置','cg-location-label');label.append(select);host.append(label);
    const content=node('div',null,'cg-story-content');host.append(content);let ticket=0;
    const dialog=host.closest('dialog');let readerPanel=null;
    function removeReader(){readerPanel?.remove();readerPanel=null;dialog.classList.remove('cg-reading-open');}
    function showReader(entry,scene){
      removeReader();
      readerPanel=node('section',null,'cg-reading-panel');
      const bar=node('div',null,'cg-reading-bar'),back=button('← 返回原图',()=>{removeReader();dialog.scrollTop=0;});
      const chooser=select.cloneNode(true);chooser.value=select.value;chooser.setAttribute('aria-label','阅读的 CG 出现位置');
      chooser.addEventListener('change',()=>{select.value=chooser.value;update(true);});
      bar.append(back,chooser);readerPanel.append(bar);
      const iframe=node('iframe');iframe.title=record.displayName+' · 文本与画面';iframe.src=readerUrl(scene,entry,true).href;
      readerPanel.append(iframe);dialog.querySelector('.dialog-body').append(readerPanel);dialog.classList.add('cg-reading-open');dialog.scrollTop=0;
    }
    async function update(openReader=false){
      const version=++ticket,entry=locations[Number(select.value)],scene=data.scenes[entry.scene];removeReader();
      content.replaceChildren(node('p',scene.routes.map(r=>routes.get(r)||r).join(' / '),'cg-route-label'));
      if(notes[entry.kind])content.append(node('p',notes[entry.kind],'cg-story-note'));
      const actions=node('div',null,'cg-story-actions'),read=button('展开文本与画面 →',()=>showReader(entry,scene)),standalone=node('a','单独阅读 ↗');
      standalone.href=readerUrl(scene,entry).href;standalone.target='_blank';standalone.rel='noopener';actions.append(read,standalone);content.append(actions);
      const details=node('div',null,'cg-story-details');details.append(node('p','正在读取文本…','cg-story-status'));content.append(details);
      if(openReader)showReader(entry,scene);
      try{
        const full=await loadScene(scene);if(version!==ticket||!host.isConnected)return;
        const i=full.rows.findIndex(r=>r[0]===entry.from),row=full.rows[i];if(!row)throw new Error('原文位置未能读取');
        const quote=node('blockquote',null,'cg-story-quote'),person=full.speakers[row[2]];
        quote.append(node('span',typeof person==='string'?person:person?.name||'旁白'),node('p',row[1]));
        details.replaceChildren(quote,choices(full,row,routes));
      }catch(error){if(version!==ticket||!host.isConnected)return;details.replaceChildren(node('p',error.message,'cg-story-note'),button('重新读取',()=>update()));}
    }
    select.addEventListener('change',()=>update());update();
  }catch(error){if(host.isConnected){host.replaceChildren(node('h4','剧情出处'),node('p',error.message,'cg-story-note'),button('重试',()=>{host.replaceChildren();mount(host,record,{work});}));}}
}
