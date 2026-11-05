/* Reading bounds are independent of source-line numbers and search pagination. */
(function(root){
  'use strict';
  const SIZE=60;
  function around(length,index){
    const start=Math.max(0,Math.min(index-Math.floor(SIZE/2),length-SIZE));
    return {start,end:Math.min(length,start+SIZE)};
  }
  function extend(length,range,direction){
    return direction<0?{start:Math.max(0,range.start-SIZE),end:range.end}:{start:range.start,end:Math.min(length,range.end+SIZE)};
  }
  function neighbors(data,scene,direction,route,visited){
    const current=data?.scenes[scene];
    return (current?.[direction<0?'previous':'next']||[]).filter(id=>{
      if(visited.has(id))return false;
      const routes=data.scenes[id].routes;
      return !route||routes.includes(route)||routes.includes(route.slice(0,2)+'-common')||
        (route.includes('-after-')&&routes.includes(route.slice(0,2)+'-after-common'));
    });
  }
  const api={around,extend,neighbors};root.DialogueReaderCore=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self==='undefined'?globalThis:self);
