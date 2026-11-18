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
 var n=dv.getUint32(0x4c,true),i2=Number(dv.getBigUint64(0x20,true))+4,recs={};
 for(var k=0;k<n;k++){var fi=dv.getUint32(i2+8*k,true);recs[dv.getUint32(fi+8,true)+'_'+dv.getUint32(fi+24,true)]=fi}
 var re=/\*(\d+)\*(\d+)\.binka\0/g,m;
 while((m=re.exec(txt))){
  var s=m.index,b=txt.lastIndexOf('\0',s-2)+1,off=+m[2],sz=+m[1];
  if(off+4<=u8.length&&u8[off]==49&&u8[off+1]==70&&u8[off+2]==67&&u8[off+3]==66&&recs[off+'_'+sz]!==undefined)
   res.push({name:txt.slice(b,s-1)||'(無名)',off:off,size:sz,rec:recs[off+'_'+sz],str:s});
 }
 return res}
function patchBank(buf,items,reps){
 var errs=[],sorted=items.map(function(x){return x.off}).sort(function(a,b){return a-b});
 var plan=[],maxEnd=buf.byteLength;
 reps.forEach(function(r){
  var it=items[r.idx],d=r.data,p=String(it.size).length,min=Math.pow(10,p-1),sz=Math.max(d.length,min);
  var nx=sorted[sorted.indexOf(it.off)+1],cap=nx===undefined?Infinity:nx-it.off;
  if(String(sz).length>p)errs.push(it.name+'：新しいサイズ('+d.length+'B)の桁数が元('+it.size+'B)より増えるため差し替えできません');
  else if(sz>cap)errs.push(it.name+'：サイズ超過（'+sz+'B > 上限'+cap+'B）');
  else{plan.push({it:it,d:d,sz:sz});if(it.off+sz>maxEnd)maxEnd=it.off+sz}
 });
 if(errs.length)return{errors:errs};
 var out=new Uint8Array(maxEnd);out.set(new Uint8Array(buf));var dv=new DataView(out.buffer);
 plan.forEach(function(p){
  var it=p.it,d=p.d;out.fill(0,it.off,it.off+Math.max(it.size,p.sz));out.set(d,it.off);
  var sr=d[6]|d[7]<<8,smp=(d[8]|d[9]<<8|d[10]<<16|d[11]<<24)>>>0;
  dv.setUint32(it.rec+24,p.sz,true);dv.setUint32(it.rec+12,d[5],true);dv.setUint32(it.rec+20,sr,true);
  dv.setUint32(it.rec+36,Math.floor(smp*1000/sr),true);
  var t='*'+p.sz+'*'+it.off+'.binka';for(var i=0;i<t.length;i++)out[it.str+i]=t.charCodeAt(i);
 });
 return{buf:out.buffer,errors:[]}}


if(typeof module!=="undefined"&&module.exports)module.exports={scanBank:scanBank,parseBank:parseBank,patchBank:patchBank};
