/*!
 * msscmp.js - Miles Sound System bank (.msscmp, little-endian "KNAB") reader / entry replacer
 * MIT License. See ../../LICENSE
 *
 * scanBank(Uint8Array)             lenient: lists .binka entries by scanning for "*size*offset.binka"
 * parseBank(ArrayBuffer)           strict:  entries + their info-record positions (needed for patching)
 * patchBank(ArrayBuffer,items,reps) replace entries in place; returns {buf,errors}
 */
function scanBank(u8){
 var txt='',CH=32768,res=[];
 for(var i=0;i<u8.length;i+=CH)txt+=String.fromCharCode.apply(null,u8.subarray(i,Math.min(i+CH,u8.length)));
 var re=/\*(\d+)\*(\d+)\.binka\0/g,m;
 while((m=re.exec(txt))){
  var s=m.index,b=txt.lastIndexOf('\0',s-2)+1,off=+m[2],sz=+m[1];
  if(off+4<=u8.length&&u8[off]==49&&u8[off+1]==70&&u8[off+2]==67&&u8[off+3]==66)
   res.push({name:txt.slice(b,s-1)||'(無名)',off:off,size:sz})}
 return res}
function parseBank(buf){
 var u8=new Uint8Array(buf),dv=new DataView(buf),txt='',CH=32768,res=[];
 if(String.fromCharCode(u8[0],u8[1],u8[2],u8[3])!=='KNAB'||dv.getUint32(4,true)!==8)throw new Error('未対応のバンク形式です（リトルエンディアン/新世代形式のみ対応）');
 for(var i=0;i<u8.length;i+=CH)txt+=String.fromCharCode.apply(null,u8.subarray(i,Math.min(i+CH,u8.length)));
 var n=dv.getUint32(0x4c,true),i2=Number(dv.getBigUint64(0x20,true))+4,recs={},slots={};
 for(var k=0;k<n;k++){var fi=dv.getUint32(i2+8*k,true),key=dv.getUint32(fi+8,true)+'_'+dv.getUint32(fi+24,true);recs[key]=fi;slots[key]=i2+8*k}
 var re=/\*(\d+)\*(\d+)\.binka\0/g,m;
 while((m=re.exec(txt))){
  var s=m.index,b=txt.lastIndexOf('\0',s-2)+1,off=+m[2],sz=+m[1],key2=off+'_'+sz;
  if(off+4<=u8.length&&u8[off]==49&&u8[off+1]==70&&u8[off+2]==67&&u8[off+3]==66&&recs[key2]!==undefined)
   res.push({name:txt.slice(b,s-1)||'(無名)',off:off,size:sz,rec:recs[key2],slot:slots[key2],nameStart:b,str:s});
 }
 return res}
/* 差し替え。収まる場合は元の位置に上書き。収まらない場合は
   opts.overflow!==false（既定）: 元の位置に置いてはみ出す（後続の音を上書き。warningsに名前を返す）。
   opts.overflow===false: バンク末尾(4096境界)に追記し、情報レコードと文字列の参照先を付け替える。 */
function patchBank(buf,items,reps,opts){
 var ovf=!(opts&&opts.overflow===false),warn=[],errs=[],u8=new Uint8Array(buf),sorted=items.map(function(x){return x.off}).sort(function(a,b){return a-b});
 var plan=[],pos=buf.byteLength;
 reps.forEach(function(r){
  var it=items[r.idx],d=r.data,p=String(it.size).length,min=Math.pow(10,p-1),sz=Math.max(d.length,min);
  var nx=sorted[sorted.indexOf(it.off)+1],cap=nx===undefined?Infinity:nx-it.off;
  if(String(sz).length===p&&sz<=cap)plan.push({it:it,d:d,sz:sz,mode:'in'});
  else if(ovf)plan.push({it:it,d:d,sz:d.length,mode:'over',newOff:it.off,idx:r.idx});
  else plan.push({it:it,d:d,sz:d.length,mode:'app'})
 });
 plan.forEach(function(p){if(p.mode==='in'||p.mode==='over'){if(p.it.off+p.sz>pos)pos=p.it.off+p.sz}});
 plan.forEach(function(p){if(p.mode==='app'){pos=Math.ceil(pos/4096)*4096;p.newOff=pos;pos+=p.sz}});
 plan.forEach(function(p){
  if(p.mode==='in')return;
  var it=p.it,t='*'+p.sz+'*'+p.newOff+'.binka',oldLen=('*'+it.size+'*'+it.off+'.binka').length;
  if(t.length===oldLen){p.inStr=true;return}
  var tail=(u8[it.str+oldLen+1]===110&&u8[it.str+oldLen+2]===107&&u8[it.str+oldLen+3]===97&&u8[it.str+oldLen+4]===0)?[110,107,97,0]:[];
  var nb=u8.subarray(it.nameStart,it.str-1),arr=[];
  pos=Math.ceil((pos+1)/4)*4;p.strPos=pos;p.oldLen=oldLen;
  p.strBytes=Array.prototype.slice.call(nb).concat([0]);
  for(var i=0;i<t.length;i++)p.strBytes.push(t.charCodeAt(i));
  p.strBytes.push(0);p.strBytes=p.strBytes.concat(tail);pos+=p.strBytes.length
 });
 var out=new Uint8Array(pos);out.set(u8);var dv=new DataView(out.buffer);
 var repIdx={};reps.forEach(function(r){repIdx[r.idx]=1});
 plan.filter(function(p){return p.mode==='over'}).forEach(function(p){
  items.forEach(function(o,j){if(o!==p.it&&!repIdx[j]&&o.off<p.it.off+p.sz&&o.off+o.size>p.it.off&&warn.indexOf(o.name)<0)warn.push(o.name)})});
 plan.sort(function(a,b){return a.it.off-b.it.off});
 plan.forEach(function(p){
  var it=p.it,d=p.d,sr=d[6]|d[7]<<8,smp=(d[8]|d[9]<<8|d[10]<<16|d[11]<<24)>>>0;
  var off=p.mode==='in'?it.off:p.newOff;
  if(p.mode==='in'||p.mode==='over')out.fill(0,it.off,it.off+Math.max(it.size,p.sz));
  out.set(d,off);
  dv.setUint32(it.rec+24,p.sz,true);dv.setUint32(it.rec+12,d[5],true);dv.setUint32(it.rec+20,sr,true);
  dv.setUint32(it.rec+36,Math.floor(smp*1000/sr),true);
  if(p.mode==='app')dv.setUint32(it.rec+8,off,true);
  var t='*'+p.sz+'*'+off+'.binka';
  if(p.mode==='in'||p.inStr){for(var i=0;i<t.length;i++)out[it.str+i]=t.charCodeAt(i)}
  else{
   out.set(p.strBytes,p.strPos);
   var hi=it.str+p.oldLen,nameNew=p.strPos;
   [it.rec,it.slot+4].forEach(function(at){
    var v=dv.getUint32(at,true);
    if(v>=it.nameStart&&v<=hi)dv.setUint32(at,v-it.nameStart+nameNew,true)})
  }
 });
 return{buf:out.buffer,errors:[],warnings:warn}}


if(typeof module!=="undefined"&&module.exports)module.exports={scanBank:scanBank,parseBank:parseBank,patchBank:patchBank};
