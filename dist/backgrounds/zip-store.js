/* ZIP32, UTF-8 names, stored entries. Binary layout follows PKWARE APPNOTE 6.3.10. */
(function(root){
  'use strict';
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
  function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
  function make(entries){
    if(entries.length>65535)throw new Error('Too many ZIP entries');
    const encoder=new TextEncoder(),locals=[],central=[];let offset=0,centralSize=0;
    const dosDate=((2026-1980)<<9)|(10<<5)|27;
    const u16=(v,o,x)=>v.setUint16(o,x,true),u32=(v,o,x)=>v.setUint32(o,x,true);
    for(const entry of entries){
      if(!entry.name||entry.name.startsWith('/')||entry.name.split(/[\\/]/).includes('..'))throw new Error('Unsafe ZIP filename');
      const name=encoder.encode(entry.name),data=entry.data instanceof Uint8Array?entry.data:new Uint8Array(entry.data);
      if(name.length>65535||data.length>0xffffffff)throw new Error('ZIP entry too large');
      const crc=crc32(data),header=new Uint8Array(30+name.length),v=new DataView(header.buffer);
      u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x0800);u16(v,8,0);u16(v,10,0);u16(v,12,dosDate);u32(v,14,crc);u32(v,18,data.length);u32(v,22,data.length);u16(v,26,name.length);u16(v,28,0);header.set(name,30);
      const directory=new Uint8Array(46+name.length),d=new DataView(directory.buffer);
      u32(d,0,0x02014b50);u16(d,4,20);u16(d,6,20);u16(d,8,0x0800);u16(d,10,0);u16(d,12,0);u16(d,14,dosDate);u32(d,16,crc);u32(d,20,data.length);u32(d,24,data.length);u16(d,28,name.length);u16(d,30,0);u16(d,32,0);u16(d,34,0);u16(d,36,0);u32(d,38,0);u32(d,42,offset);directory.set(name,46);
      locals.push(header,data);central.push(directory);offset+=header.length+data.length;centralSize+=directory.length;
    }
    if(offset+centralSize+22>0xffffffff)throw new Error('ZIP archive too large');
    const end=new Uint8Array(22),e=new DataView(end.buffer);u32(e,0,0x06054b50);u16(e,4,0);u16(e,6,0);u16(e,8,entries.length);u16(e,10,entries.length);u32(e,12,centralSize);u32(e,16,offset);u16(e,20,0);
    const result=new Uint8Array(offset+centralSize+22);let cursor=0;for(const chunk of [...locals,...central,end]){result.set(chunk,cursor);cursor+=chunk.length;}return result;
  }
  if(typeof module==='object'&&module.exports)module.exports={make,crc32};else root.BackgroundZip={make,crc32};
})(typeof window==='undefined'?{}:window);
