(() => {
  'use strict';
  const $ = id => document.getElementById(id), params = new URLSearchParams(location.search);
  const node = (tag,text,className) => { const element=document.createElement(tag);if(text!=null)element.textContent=text;if(className)element.className=className;return element; };
  const state = {query:params.get('q')||'',work:params.get('work')||'',route:params.get('route')||'',speaker:params.get('speaker')||'',language:params.get('lang')||'preferred',kind:params.get('kind')||'',mode:params.get('mode')==='exact'?'exact':'similar',breadth:params.get('breadth')==='wide'?'wide':'normal'};
  let manifest, worker, ready=false, request=0, displayed=[], total=0, currentScene=null, currentResult=null, currentOrdinal=0, detailRequest=0, assetCache=null, toastTimer, attempted=false, readingCache=null, readingPromise=null, matchedResult=null;
  const sceneCache=new Map(), workMap=new Map(), routeMap=new Map();
  const types=['台词','旁白','选项'];
  const languageName = language => language==='zh'?'中文':'日文';
  function link(label,url) { const a=node('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a; }
  function status(text,busy=false) { $('status').textContent=text;$('status').dataset.busy=String(busy); }
  function toast(text) { clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3000); }
  function routeLabels(ids) { return (ids||[]).map(id=>routeMap.get(id)?.name||id); }
  function updateUrl() {
    const query=new URLSearchParams();
    for(const [key,value] of [['q',state.query.trim()],['work',state.work],['route',state.route],['speaker',state.speaker],['lang',state.language==='preferred'?'':state.language],['kind',state.kind],['mode',state.mode==='exact'?'exact':''],['breadth',state.breadth==='wide'?'wide':'']])if(value)query.set(key,value);
    if($('scene-dialog').open&&currentResult){query.set('dataset',currentResult.dataset);query.set('scene',currentResult.scene);query.set('line',String(currentOrdinal));}
    history.replaceState(null,'',location.pathname+(query.size?'?'+query:'')+location.hash);
  }
  function routeOptions() {
    const selected=state.route;$('route').replaceChildren(new Option('全部路线',''));
    for(const route of manifest.routes)if(!state.work||route.work===state.work)$('route').add(new Option(route.name+(!state.work?' · '+workMap.get(route.work).short:''),route.id));
    state.route=[...$('route').options].some(option=>option.value===selected)?selected:'';$('route').value=state.route;
  }
  function syncInputs() {
    routeOptions();
    for(const id of ['work','speaker','language','kind','breadth'])$(id).value=state[id];
    $('search').value=state.query;document.querySelectorAll('[name=mode]').forEach(input=>input.checked=input.value===state.mode);
  }
  function highlight(text) {
    const fragment=document.createDocumentFragment(), terms=state.query.trim().split(/\s+/u).filter(term=>term.length>=2);
    if(!terms.length){fragment.append(document.createTextNode(text));return fragment;}
    const escaped=terms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    const pattern=new RegExp(escaped.join('|'),'giu');let offset=0;
    for(const match of text.matchAll(pattern)){fragment.append(document.createTextNode(text.slice(offset,match.index)),node('mark',match[0]));offset=match.index+match[0].length;}
    fragment.append(document.createTextNode(text.slice(offset)));return fragment;
  }
  function resultCard(result) {
    const card=node('button',null,'quote-card');card.type='button';
    const meta=node('div',null,'quote-meta');
    meta.append(node('span',result.speaker||'旁白','quote-speaker'),node('span',result.kind==='exact'?'包含原句':result.kind==='alias'?'名称匹配':result.kind==='keywords'?'关键词匹配':`相近 ${Math.round(result.score*100)}%`,'match-label'));
    const quote=node('p',null,'quote-text');quote.append(highlight(result.text));
    const source=node('div',null,'quote-source');source.append(node('span',workMap.get(result.work).label),node('span',result.title));
    const labels=routeLabels(result.routes);source.append(node('span',labels.length>2?labels.slice(0,2).join(' / ')+` 等 ${labels.length} 条路径`:labels.join(' / ')||'路线待核对','route-chip'));
    source.append(node('span',languageName(result.language)));card.append(meta,quote,source);card.addEventListener('click',()=>openScene(result));return card;
  }
  function addResults(results) {
    const fragment=document.createDocumentFragment();results.forEach(result=>fragment.append(resultCard(result)));$('results').append(fragment);displayed.push(...results);
    $('more').hidden=displayed.length>=total;$('more').disabled=false;
  }
  function search() {
    state.query=$('search').value;attempted=true;updateUrl();if(!ready)return;
    $('status').classList.remove('loading-error');
    if([...state.query.trim()].length<2){status('请输入至少两个字');return;}
    $('empty').hidden=true;$('partial').hidden=true;$('submit').disabled=true;$('more').hidden=true;
    status('正在搜索',true);worker.postMessage({type:'search',id:++request,...state});
  }
  function onWorker(event) {
    const message=event.data;
    if(message.type==='ready'){ready=true;$('submit').disabled=false;if(state.query)search();else status('');return;}
    if(message.type==='error'&&message.id==null){status(message.message);return;}
    if(message.id!==request)return;
    if(message.type==='loading')status(`正在载入文本 ${message.loaded} / ${message.total}`,true);
    else if(message.type==='results'){
      $('submit').disabled=false;$('results').replaceChildren();displayed=[];total=message.total;addResults(message.results);
      status(message.message||`找到 ${total.toLocaleString()} 处 · 已显示 ${displayed.length}`);
      $('empty').hidden=total>0;$('empty').querySelector('h2').textContent='暂时没有匹配的台词';$('empty').querySelector('p').textContent='缩短片段，或把匹配范围改为“更宽”。';
      if(!message.complete){$('partial-text').textContent=`有 ${message.failures.length} 份文本未能载入，当前结果尚不完整。`;$('partial').hidden=false;}
    }else if(message.type==='page'){addResults(message.results);status(`找到 ${total.toLocaleString()} 处 · 已显示 ${displayed.length}`);}
    else if(message.type==='error'){$('submit').disabled=false;status(message.message);$('status').classList.add('loading-error');}
  }
  function person(scene,index){const value=scene.speakers[index];return typeof value==='string'?{name:value}:value||{name:'旁白'};}
  function assetId(value){return typeof value==='string'?value:value?.asset||value?.id||'';}
  function asset(value){return assetCache?.assets?.[assetId(value)]||null;}
  function imageUrl(value){if(['localhost','127.0.0.1'].includes(location.hostname)&&location.pathname.includes('/dist/dialogue/')){if(value?.includes('/main/dialogue-assets/'))return '../../dialogue-assets/'+value.split('/main/dialogue-assets/')[1];if(value?.includes('/otome-sprite-search/dialogue/faces/'))return 'faces/'+value.split('/otome-sprite-search/dialogue/faces/')[1];}return value;}
  function assetImage(item,className){const img=new Image();img.alt=item.label||item.name;img.loading='lazy';img.decoding='async';img.src=imageUrl(item.thumb);img.className=className||'';img.onerror=()=>{img.onerror=null;if(item.file&&imageUrl(item.file)!==img.src)img.src=imageUrl(item.file);};return img;}
  const sceneView=new DialogueSceneView($('game-screen'),{resolve:imageUrl});let visualStateKey='';
  function renderVisual(row){
    if($('scene-content').classList.contains('visual-hidden')&&!$('screen-dialog').open)return;
    const snapshot=currentScene.states[row[5]]||{},key=currentScene.id+':'+row[5];
    if(key!==visualStateKey){sceneView.variant=0;visualStateKey=key;}
    const plan=sceneView.render(snapshot,assetCache?.assets||{},{work:currentResult.work,title:currentScene.title,kind:row[3],speaker:person(currentScene,row[2]),text:row[1]});
    const select=$('screen-variant');select.replaceChildren(...Array.from({length:plan.variants},(_,i)=>new Option('画面 '+(i+1),String(i))));select.value=String(sceneView.variant);
    $('screen-variant-label').hidden=plan.variants<2;
    const notes=[];if(snapshot.conditional)notes.push('含分支画面');if(plan.missing.length)notes.push('部分素材未收录');else if(plan.approximate)notes.push('部分演出为静态近似');
    $('screen-note').textContent=notes.join(' · ');$('screen-note').hidden=!notes.length;
    $('screen-title').textContent=workMap.get(currentResult.work).short+' · '+currentScene.title;
    if(document.querySelector('.material-details').open)renderMaterials(row);
  }
  function renderMaterials(row) {
    const snapshot=currentScene.states[row[5]]||{}, primary=asset(snapshot.background), picture=$('scene-picture'), caption=$('visual-caption');picture.replaceChildren();caption.replaceChildren();
    if(primary){const a=link('',primary.link);const img=assetImage(primary);img.loading='eager';a.append(img);picture.append(a);caption.append(node('span',primary.label||primary.name),link('查看素材 ↗',primary.link));if(primary.file&&primary.file!==primary.thumb){const full=new Image();full.decoding='async';full.onload=()=>{if(img.isConnected)img.src=full.src;};full.src=imageUrl(primary.file);}}
    else if(snapshot.background?.candidates?.length){
      picture.classList.add('conditional-picture');
      for(const id of snapshot.background.candidates){const item=asset(id);if(item){const a=link('',item.link);a.append(assetImage(item),node('span',item.name));picture.append(a);}}
      caption.append(node('span','随分支变化的画面'));
    }
    else picture.append(node('div',snapshot.background?.raw?'此处的画面素材尚未收录':'此处没有可确认的背景','no-picture'));
    if(!snapshot.background?.candidates?.length)picture.classList.remove('conditional-picture');
    const characters=$('scene-characters');characters.replaceChildren();
    const shown=new Set();
    for(const visible of [...(snapshot.characters||[]),...(snapshot.face?[snapshot.face]:[])])for(const id of [assetId(visible),...(visible.candidates||[])]){
      const item=asset(id);if(!item||shown.has(id))continue;shown.add(id);
      const card=node('article',null,'character-card'),a=link('',item.link);a.append(assetImage(item),node('span',item.label||item.name));card.append(a);characters.append(card);
    }
    if(!characters.children.length)characters.append(node('p',(snapshot.characters||[]).length?'此处的角色素材尚未收录':'此处未显示角色立绘','visual-note'));
    const note=[];
    if(snapshot.conditional)note.push('画面含条件分支，列出可确认的素材。');
    if(snapshot.incomplete)note.push('部分画面受动态演出影响。');
    if(!currentScene.inheritedStateKnown&&row[0]===0)note.push('开场可能承接上一场景的画面。');
    if(snapshot.unresolved?.length)note.push(`${snapshot.unresolved.length} 项素材尚待对应。`);
    $('visual-note').textContent=note.join(' ');$('visual-note').hidden=!note.length;
  }
  function renderChoices(row) {
    const root=$('scene-choices');root.replaceChildren();
    const paths=currentScene.entryPaths||[];
    let pathRoot=root;
    if(paths.length>1){pathRoot=node('details',null,'route-paths');pathRoot.append(node('summary',`${paths.length} 种入口组合`));root.append(pathRoot);}
    for(const path of paths){
      const card=node('div',null,'choice-set route-path');card.append(node('p',routeLabels([path.route])[0]+' · 入口选择'));
      const list=node('ol');for(const step of path.steps){const option=step.options[step.selected];list.append(node('li',typeof option==='string'?option:option?.text||'条件选择'));}card.append(list);if(path.note)card.append(node('p',path.note,'choice-condition'));pathRoot.append(card);
    }
    const entry=paths.length?[]:currentScene.entryChoices||[], local=(currentScene.choices||[]).filter(choice=>choice.source!==currentScene.script||choice.line<=row[4]);
    const choices=[...entry,...local];
    if(paths.length&&!choices.length)return;
    if(!choices.length){root.append(node('p',currentScene.choiceNote||'这段剧情没有单独的台词选项。','no-choices'));return;}
    for(const choice of choices){
      const card=node('div',null,'choice-set');card.append(node('p',choice.label||choice.title||'到达此处的选项'));
      const list=node('ul');
      (choice.options||[]).forEach((option,index)=>{const text=typeof option==='string'?option:option.text;const selected=choice.selected===index||(row[6]||[]).includes(`${choice.id}:${index}`);list.append(node('li',text,selected?'selected':''));});
      card.append(list);if(choice.conditions?.length)card.append(node('p',choice.conditions.join('；'),'choice-condition'));if(choice.note)card.append(node('p',choice.note,'choice-condition'));root.append(card);
    }
  }
  function readerRow(scene,row,result){
    const p=row[3]===2?{name:'选项'}:person(scene,row[2]),item=node('li',null,row[3]===1?'narration':'');
    const button=node('button');button.type='button';button.setAttribute('aria-label',`定位到第 ${row[0]+1} 段`);button.append(node('span',String(row[0]+1).padStart(2,'0'),'ordinal'),node('span',p.name||'旁白','speaker'));
    const quote=node('p');quote.append(highlight(row[1]));button.append(quote);button.addEventListener('click',()=>reader.locate(scene,result,row[0]));item.append(button);return item;
  }
  function selectLine(scene,result,ordinal){
    currentScene=scene;currentResult=result;currentOrdinal=ordinal;
    const rows=scene.rows,index=rows.findIndex(row=>row[0]===ordinal);if(index<0)return;
    $('scene-heading').textContent=scene.title;
    $('scene-tags').replaceChildren(...routeLabels(scene.routes).map(label=>node('span',label)),...(scene.period?[node('span',scene.period)]:[]),node('span',languageName(result.language)));
    $('line-position').textContent=`${index+1} / ${rows.length}`;
    $('line-prev').disabled=false;$('line-next').disabled=false;
    const current=rows[index];renderVisual(current);renderChoices(current);
    const info=$('source-info');info.replaceChildren();
    for(const [key,value] of [['作品',workMap.get(currentResult.work).label],['路线',routeLabels(currentScene.routes).join(' / ')||'待核对'],['场景',currentScene.title],['脚本',current[8]||currentScene.script],['行号',String(current[4])],['文本',languageName(currentResult.language)],['语音编号',current[7]||'无']])info.append(node('dt',key),node('dd',value));
    updateUrl();
  }
  async function loadScene(result){
    const key=result.dataset+'/'+result.scene,spec=manifest.sceneFiles[key];
    if(!spec)throw new Error('这处场景不在当前索引中');
    if(!sceneCache.has(key))sceneCache.set(key,DialogueData.load(spec).catch(error=>{sceneCache.delete(key);throw error;}));
    return sceneCache.get(key);
  }
  async function loadReading(){
    if(readingCache)return readingCache;
    if(!readingPromise)readingPromise=fetch('reading.json?v=97bfca2e1080').then(response=>{if(!response.ok)throw new Error('前后场景未能载入，请重试');return response.json();}).then(data=>readingCache=data).catch(error=>{readingPromise=null;throw error;});
    return readingPromise;
  }
  async function connectReading(){
    const ticket=detailRequest,dataset=currentResult?.dataset;if(!dataset)return;
    try{const data=await loadReading();if(ticket===detailRequest&&$('scene-dialog').open){reader.navigation=data.datasets[dataset];reader.boundaries();}}
    catch(error){if(ticket===detailRequest)toast(error.message);}
  }
  const reader=new ContinuousReader({flow:$('text-flow'),context:$('context'),before:$('reading-before'),after:$('reading-after'),makeRow:readerRow,onSelect:selectLine,loadScene,onError:error=>toast(error.message||'文本未能载入，请重试'),retryNavigation:connectReading});
  async function openScene(result,returning=false) {
    currentResult={...result};currentOrdinal=result.ordinal;if(!returning)matchedResult={...result};const ticket=++detailRequest;
    reader.close();reader.navigation=readingCache?.datasets[result.dataset]||null;
    reader.route=state.route||((result.routes||[]).length===1&&!result.routes[0].endsWith('-common')?result.routes[0]:'');
    $('scene-content').hidden=true;$('detail-loading').hidden=false;$('detail-loading').textContent='正在读取场景';$('scene-heading').textContent=result.title||'场景';$('detail-work').textContent=workMap.get(result.work).label;
    if(!$('scene-dialog').open)$('scene-dialog').showModal();$('scene-dialog').scrollTop=0;updateUrl();
    try {
      const [scene,assets]=await Promise.all([loadScene(result),assetCache?Promise.resolve(assetCache):DialogueData.load(manifest.assets)]);
      if(ticket!==detailRequest||!$('scene-dialog').open)return;
      assetCache=assets;
      if(!reader.route&&scene.routes.length===1&&!scene.routes[0].endsWith('-common'))reader.route=scene.routes[0];
      currentResult.ordinal=scene.rows.some(row=>row[0]===result.ordinal)?result.ordinal:scene.rows[0][0];
      const mobile=matchMedia('(max-width:700px)').matches;$('scene-content').classList.toggle('visual-hidden',mobile);$('show-visual').setAttribute('aria-expanded',String(!mobile));
      $('detail-loading').hidden=true;$('scene-content').hidden=false;reader.reset(scene,currentResult);connectReading();
    }catch(error){sceneCache.delete(result.dataset+'/'+result.scene);$('detail-loading').textContent=error.message||'场景未能载入，请重试';}
  }
  $('filters').addEventListener('submit',event=>{event.preventDefault();search();});
  for(const id of ['work','route','speaker','language','kind','breadth'])$(id).addEventListener('change',()=>{state[id]=$(id).value;if(id==='work')routeOptions();if(attempted||state.query)search();else updateUrl();});
  document.querySelectorAll('[name=mode]').forEach(input=>input.addEventListener('change',()=>{if(input.checked){state.mode=input.value;if(attempted||state.query)search();}}));
  $('reset').addEventListener('click',()=>{worker?.postMessage({type:'cancel'});Object.assign(state,{query:'',work:'',route:'',speaker:'',language:'preferred',kind:'',mode:'similar',breadth:'normal'});request++;attempted=false;syncInputs();$('results').replaceChildren();displayed=[];total=0;$('more').hidden=true;$('partial').hidden=true;$('empty').hidden=false;$('empty').querySelector('h2').textContent='从一句话开始';$('empty').querySelector('p').textContent='可以只输入记得的片段，也可以用空格隔开几个关键词。';$('submit').disabled=!ready;status('');updateUrl();});
  $('retry').addEventListener('click',search);
  $('more').addEventListener('click',()=>{$('more').disabled=true;worker.postMessage({type:'page',id:request,offset:displayed.length});});
  $('close').addEventListener('click',()=>$('scene-dialog').close());
  $('scene-dialog').addEventListener('close',()=>{if($('screen-dialog').open)$('screen-dialog').close();detailRequest++;reader.close();currentResult=null;currentScene=null;matchedResult=null;updateUrl();});
  $('scene-dialog').addEventListener('click',event=>{if(event.target===$('scene-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
  $('line-prev').addEventListener('click',()=>{if(currentScene)reader.step(currentScene,currentResult,currentOrdinal,-1);});
  $('line-next').addEventListener('click',()=>{if(currentScene)reader.step(currentScene,currentResult,currentOrdinal,1);});
  $('reading-start').addEventListener('click',()=>{if(currentScene)reader.locate(currentScene,currentResult,currentScene.rows[0][0],true);});
  $('reading-match').addEventListener('click',()=>{if(!matchedResult)return;const block=reader.blocks.find(b=>b.scene.id===matchedResult.scene);if(block)reader.locate(block.scene,matchedResult,matchedResult.ordinal,true);else openScene(matchedResult,true);});
  $('show-visual').addEventListener('click',()=>{const hidden=$('scene-content').classList.toggle('visual-hidden');$('show-visual').setAttribute('aria-expanded',String(!hidden));if(!hidden&&currentScene)renderVisual(currentScene.rows.find(row=>row[0]===currentOrdinal));});
  $('screen-variant').addEventListener('change',()=>{sceneView.setVariant(Number($('screen-variant').value));});
  $('screen-text').addEventListener('click',()=>$('screen-text').setAttribute('aria-pressed',String(sceneView.toggleText())));
  document.querySelector('.material-details').addEventListener('toggle',()=>{if(document.querySelector('.material-details').open&&currentScene)renderMaterials(currentScene.rows.find(row=>row[0]===currentOrdinal));});
  $('screen-expand').addEventListener('click',()=>{$('screen-large').append($('game-screen'));$('screen-dialog').showModal();});
  $('screen-close').addEventListener('click',()=>$('screen-dialog').close());
  $('screen-dialog').addEventListener('close',()=>$('screen-home').append($('game-screen')));
  $('screen-dialog').addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();if(currentScene)reader.step(currentScene,currentResult,currentOrdinal,event.key==='ArrowLeft'?-1:1);}});
  $('screen-prev').addEventListener('click',()=>{if(currentScene)reader.step(currentScene,currentResult,currentOrdinal,-1);});
  $('screen-next').addEventListener('click',()=>{if(currentScene)reader.step(currentScene,currentResult,currentOrdinal,1);});
  $('share').addEventListener('click',async()=>{updateUrl();try{await navigator.clipboard.writeText(location.href);toast('链接已复制');}catch{toast('可复制浏览器地址栏中的链接');}});
  async function init(){
    $('submit').disabled=true;
    fetch('ui.json?v=c01251f0667b').then(response=>{if(!response.ok)throw new Error('ui');return response.json();}).then(data=>sceneView.setUi(data)).catch(()=>{});
    try{
      const response=await fetch('catalog.json?v=c5cc4385337f');if(!response.ok)throw new Error('目录未能载入，请刷新重试');manifest=await response.json();
      manifest.works.forEach(work=>{workMap.set(work.id,work);$('work').add(new Option(work.label,work.id));});manifest.routes.forEach(route=>routeMap.set(route.id,route));
      manifest.speakers.forEach(person=>$('speaker').add(new Option(person.name,person.id)));
      if(!manifest.speakers.some(person=>person.id===state.speaker))state.speaker='';
      if(!workMap.has(state.work))state.work='';if(!routeMap.has(state.route))state.route='';if(!['preferred','zh','ja','all'].includes(state.language))state.language='preferred';if(!['','0','1','2'].includes(state.kind))state.kind='';
      $('corpus-total').textContent=`${manifest.works.length} 部作品 · ${manifest.total.toLocaleString()} 段文本`;syncInputs();
      worker=new Worker('search-worker.js?v=a48c9792401a');worker.onmessage=onWorker;worker.onerror=()=>{status('搜索未能启动，请刷新重试');$('submit').disabled=false;};worker.postMessage({type:'init',manifest});
      const scene=params.get('scene'),dataset=params.get('dataset');
      if(scene&&dataset&&manifest.sceneFiles[dataset+'/'+scene]){
        const spec=manifest.datasets.find(item=>item.id===dataset);const ordinal=Math.max(0,Number(params.get('line'))||0);
        if(spec)openScene({scene,dataset,work:spec.work,language:spec.language,ordinal,title:'场景'});
      }
    }catch(error){status(error.message||'目录未能载入，请刷新重试');$('status').classList.add('loading-error');}
  }
  init();
})();
