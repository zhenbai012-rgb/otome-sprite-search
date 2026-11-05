/* Keep corpus parsing and approximate matching off the page's rendering thread. */
'use strict';
importScripts('search-core.js?v=03097c70badd', 'data-loader.js?v=c467248d9563');
let manifest, normalize, literalNormalize, serial = 0, matches = [], activeSearch = 0;
const datasets = new Map(), pending = new Map();
const send = (type, payload) => postMessage({type, ...payload});
async function dataset(spec) {
  if (datasets.has(spec.id)) return datasets.get(spec.id);
  if (!pending.has(spec.id)) pending.set(spec.id, (async () => {
    const data = await DialogueData.load(spec, location.href);
    data.normalized = data.rows.map(row => normalize(row[3]));
    datasets.set(spec.id, data); return data;
  })().finally(() => pending.delete(spec.id)));
  return pending.get(spec.id);
}
function page(id, offset, limit = 50) {
  if (id !== activeSearch) return;
  send('page',{id, offset, total: matches.length, results: matches.slice(offset,offset + limit)});
}
async function search(message) {
  const ticket = ++serial, {id, query, work, route, speaker, language = 'preferred', kind = '', mode, breadth} = message;
  activeSearch = id; matches = [];
  const prepared = DialogueSearchCore.prepare(query, mode==='exact'?literalNormalize:normalize, mode, breadth);
  const literalQuery=literalNormalize(String(query).slice(0,160));
  if (prepared.characters.length < 2) { send('results',{id,total:0,results:[],message:'请输入至少两个字',complete:true}); return; }
  let selected = manifest.datasets.filter(d => (!work || d.work === work) && (language === 'all' || language === 'preferred' ? language === 'all' || d.preferred : d.language === language));
  const failures = [], loaded = [];
  let completed = 0;
  // Two transfers at a time avoid competing with the gallery's image downloads.
  async function consume() {
    while (selected.length && ticket === serial) {
      const spec = selected.shift();
      try { loaded.push({spec,data: await dataset(spec)}); }
      catch (error) { failures.push({work:spec.work,language:spec.language,message:error.message}); }
      send('loading',{id,loaded:++completed,total:expected,phase:'loading'});
    }
  }
  const expected = selected.length;
  send('loading',{id,loaded:0,total:expected,phase:'loading'});
  await Promise.all([consume(),consume()]);
  if (ticket !== serial) return;
  for (const {spec,data} of loaded) {
    if(mode==='exact'&&!data.literalNormalized)data.literalNormalized=data.rows.map(row=>literalNormalize(row[3]));
    for (let i = 0; i < data.rows.length; i++) {
      if (i % 2000 === 0) {
        await new Promise(resolve => setTimeout(resolve,0));
        if (ticket !== serial) return;
      }
      const row = data.rows[i], scene = data.scenes[row[0]], person = data.speakers[row[2]];
      if (language === 'preferred' && spec.language === 'ja' && !scene.fallbackOnly) continue;
      if (route && !scene.routes.includes(route)) continue;
      if (speaker && person.id !== speaker) continue;
      if (kind !== '' && row[4] !== Number(kind)) continue;
      const result = DialogueSearchCore.score(mode==='exact'?data.literalNormalized[i]:data.normalized[i], prepared);
      if (!result) continue;
      if(result.kind==='exact'&&!literalNormalize(row[3]).includes(literalQuery))result.kind='alias';
      matches.push({dataset:spec.id,work:spec.work,language:spec.language,scene:scene.id,sceneOrder:row[0],title:scene.title,period:scene.period,routes:scene.routes,detail:scene.detail,ordinal:row[1],speaker:row[4]===2?'选项':person.name,speakerId:person.id,text:row[3],textKind:row[4],line:row[5],...result});
    }
  }
  if (ticket !== serial) return;
  matches.sort((a,b) => b.score - a.score || a.work.localeCompare(b.work) || a.sceneOrder-b.sceneOrder || a.ordinal - b.ordinal || a.language.localeCompare(b.language));
  send('results',{id,total:matches.length,results:matches.slice(0,50),complete:!failures.length,failures,searched:loaded.length,expected});
}
onmessage = async event => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      manifest = message.manifest;
      const dictionary = await DialogueData.load(manifest.normalization,location.href);
      normalize = DialogueSearchCore.normalizer(dictionary.characters,manifest.aliases);
      literalNormalize = DialogueSearchCore.normalizer(dictionary.characters);
      send('ready',{});
    } else if (message.type === 'search') await search(message);
    else if (message.type === 'page') page(message.id,message.offset);
    else if (message.type === 'cancel') serial++;
  } catch (error) { send('error',{id:message.id,message:error.message || '搜索未能完成，请重试'}); }
};
