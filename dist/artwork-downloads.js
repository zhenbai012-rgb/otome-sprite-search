/* Complete native PNGs and small scene packs, verified before saving. */
(() => {
  'use strict';
  let busy = false, timer;
  const status = (text, error = false) => { clearTimeout(timer); for (const el of [document.getElementById('download-status'),...document.querySelectorAll('.inline-download-status')]) { el.textContent = text; el.hidden = false; el.classList.toggle('error', error); } };
  function urlFor(relative) {
    const local = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) && location.pathname.includes('/dist/');
    return local ? new URL('../originals/cg/' + relative, location.href).href : new URL(relative, window.CATALOG_DATA.cg.originalBase).href;
  }
  async function bytes(file) {
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(urlFor(file.original), { signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error('原图暂时无法读取，请稍后重试');
        const data = new Uint8Array(await response.arrayBuffer());
        if (data.length !== file.bytes || ![137,80,78,71,13,10,26,10].every((b,i) => data[i] === b)) throw new Error('原图下载不完整，请重试');
        if (crypto.subtle) {
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2,'0')).join('');
          if (hash !== file.sha256) throw new Error('原图校验失败，请重试');
        }
        return data;
      } catch (error) { last = error; if (attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000)); }
    }
    throw last;
  }
  function save(data, type, name) {
    const url = URL.createObjectURL(new Blob([data],{type})), a = document.createElement('a');
    a.href = url; a.download = name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_'); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),30000);
  }
  async function job(action) {
    if (busy) { status('正在准备上一项下载，请稍候'); return; }
    busy = true; document.querySelectorAll('[data-artwork-download]').forEach(el => { el.disabled = true; });
    try { await action(); status('下载已准备好，请查看浏览器下载列表'); timer = setTimeout(() => { document.getElementById('download-status').hidden = true; document.querySelectorAll('.inline-download-status').forEach(el => {el.hidden=true;}); },8000); }
    catch (error) { status('下载失败：' + (error.name === 'TimeoutError' ? '网络响应超时，请重试' : error.message || '请检查网络后重试'),true); }
    finally { busy = false; document.querySelectorAll('[data-artwork-download]').forEach(el => { el.disabled = false; }); }
  }
  function png(image) {
    return job(async () => { status('正在下载完整原尺寸 PNG…'); const data = await bytes({original:image.original,bytes:image.originalBytes,sha256:image.originalSha256}); save(data,'image/png',image.name + '.png'); });
  }
  function pack(item) {
    return job(async () => {
      const manifest = {title:item.title,game:item.game,scene:item.scene,count:item.count,files:item.files.map(f => ({name:f.name,width:f.width,height:f.height,sha256:f.sha256}))};
      const entries = [{name:'manifest.json',data:new TextEncoder().encode(JSON.stringify(manifest,null,2)+'\n')}];
      for (let i = 0; i < item.files.length; i++) { status(`正在准备 ${item.title} · ${i + 1} / ${item.count} 张`); entries.push({name:item.files[i].name,data:await bytes(item.files[i])}); }
      status('正在生成完整原图 ZIP…'); save(window.BackgroundZip.make(entries),'application/zip',item.filename);
    });
  }
  window.ArtworkDownloads = {png,pack,urlFor,isBusy:() => busy};
})();
