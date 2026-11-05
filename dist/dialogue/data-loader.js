/* Gzip files stay small in transit; checksums catch incomplete cached downloads. */
(function (root) {
  'use strict';
  async function hash(bytes) {
    if (!root.crypto?.subtle) return '';
    return [...new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2,'0')).join('');
  }
  async function load(spec, base = location.href) {
    const paths = [spec.url, ...(spec.fallbacks || [])].filter(Boolean);
    if (['127.0.0.1','localhost','[::1]'].includes(location.hostname) && location.pathname.includes('/dist/dialogue/') && spec.repositoryPath) paths.unshift('../../' + spec.repositoryPath);
    let last;
    for (const path of paths) {
      try {
        const response = await fetch(new URL(path, base), {signal: AbortSignal.timeout(45000)});
        if (!response.ok) throw new Error(`资料暂时无法读取（${response.status}）`);
        const raw = new Uint8Array(await response.arrayBuffer());
        const compressed = raw[0] === 0x1f && raw[1] === 0x8b;
        const expected = compressed ? spec.sha256 : spec.jsonSha256;
        if (expected && root.crypto?.subtle && await hash(raw) !== expected) throw new Error('资料下载不完整，请重试');
        let decoded = raw;
        if (compressed) {
          if (typeof DecompressionStream !== 'function') throw new Error('此浏览器不支持压缩资料，请升级浏览器');
          decoded = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
        }
        const result = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));
        return result;
      } catch (error) { last = error; }
    }
    throw last || new Error('资料地址未配置');
  }
  root.DialogueData = {load};
})(typeof self === 'undefined' ? globalThis : self);
