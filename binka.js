/*!
 * binka.js - Bink Audio (Unreal Engine "1FCB" .binka) decoder for browsers and Node.js
 * MIT License. See ../../LICENSE and ../../NOTICE.md
 *
 * decodeBinka(ArrayBuffer) -> { sampleRate, channels, length, data: Float32Array[] }
 */
function decodeBinka(buf){
const u8=new Uint8Array(buf),dv=new DataView(buf);
if(String.fromCharCode(u8[0],u8[1],u8[2],u8[3])!=='1FCB')throw new Error('1FCB形式ではありません（非対応の.binka）');
const ver=u8[4],chn=u8[5],sr=dv.getUint16(6,true),total=dv.getUint32(8,true),nTab=dv.getUint16(0x14,true);
if(chn<1||chn>2)throw new Error('チャンネル数 '+chn+' は未対応');
let pos=0x18+nTab*2;
const bits=sr<22050?9:sr<44100?10:11,N=1<<bits,ov=N>>4,half=(sr+1)>>1,root=N/(Math.sqrt(N)*32768);
const crit=[100,200,300,400,510,630,770,920,1080,1270,1480,1720,2000,2320,2700,3150,3700,4400,5300,6400,7700,9500,12000,15500,25000];
let nb=1;for(;nb<25;nb++)if(half<=crit[nb-1])break;
const bands=[2];for(let i=1;i<nb;i++)bands.push(Math.floor(crit[i-1]*N/half)&~1);bands.push(N);
const qt=[];for(let i=0;i<96;i++)qt.push(Math.exp(i*0.15289164787221953823)*root);
const rle=[2,3,4,5,6,8,9,10,11,12,13,14,15,16,32,64];
// FFT (+exp) size M=2N
const M=2*N,rev=new Uint32Array(M),cs=new Float64Array(M/2),sn=new Float64Array(M/2);
for(let i=0;i<M;i++){let r=0;for(let b=0;b<bits+1;b++)if(i>>b&1)r|=1<<(bits-b);rev[i]=r}
for(let i=0;i<M/2;i++){cs[i]=Math.cos(2*Math.PI*i/M);sn[i]=Math.sin(2*Math.PI*i/M)}
const tw_c=new Float64Array(N),tw_s=new Float64Array(N);
for(let k=0;k<N;k++){tw_c[k]=Math.cos(Math.PI*k/(2*N));tw_s[k]=Math.sin(Math.PI*k/(2*N))}
const re=new Float64Array(M),im=new Float64Array(M);
function dct3(c,out){
 re.fill(0);im.fill(0);
 for(let k=0;k<N;k++){const j=rev[k];re[j]=c[k]*tw_c[k];im[j]=c[k]*tw_s[k]}
 for(let len=2;len<=M;len<<=1){const h=len>>1,st=M/len;
  for(let i=0;i<M;i+=len)for(let j=0;j<h;j++){
   const wr=cs[j*st],wi=sn[j*st],a=i+j,b=a+h;
   const xr=re[b]*wr-im[b]*wi,xi=re[b]*wi+im[b]*wr;
   re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi}}
 for(let n=0;n<N;n++)out[n]=re[n];
}
const outLen=total,out=[];for(let c=0;c<chn;c++)out.push(new Float32Array(outLen));
const prev=[],cur=[],tmp=new Float64Array(N);
for(let c=0;c<chn;c++){prev.push(new Float64Array(ov));cur.push(new Float64Array(N))}
let first=true,w=0;
while(w<outLen&&pos+4<u8.length){
 let bp=pos*8+34; // 32-bit header + 2 bits
 const get=n=>{let v=0;for(let i=0;i<n;i++,bp++)v+=((u8[bp>>3]>>(bp&7))&1)*(2**i);return v};
 const getf=()=>{const p=get(5),m=get(23);let f=m*2**(p-23);return get(1)?-f:f};
 for(let ch=0;ch<chn;ch++){
  const co=cur[ch];co.fill(0);
  co[0]=getf()*root;co[1]=getf()*root;
  const q=[];for(let i=0;i<nb;i++)q.push(qt[Math.min(get(8),95)]);
  let k=0,qq=q[0],i=2;
  while(i<N){
   let j;
   if(get(1)){j=i+rle[get(4)]*8}else j=i+8;
   j=Math.min(j,N);
   const width=get(4);
   if(width===0){i=j;while(bands[k]<i)qq=q[k++]}
   else while(i<j){
    if(bands[k]===i)qq=q[k++];
    const c=get(width);
    if(c){co[i++]=get(1)?-c*qq:c*qq}else co[i++]=0}
  }
 }
 bp=pos*8+Math.ceil((bp-pos*8)/32)*32;
 for(let ch=0;ch<chn;ch++){
  const co=cur[ch];dct3(co,tmp);
  const o=out[ch],pv=prev[ch],n=N-ov;
  for(let i=0;i<n&&w+i<outLen;i++){
   let v=tmp[i]*(2/N);
   if(!first&&i<ov)v=(pv[i]*(ov-i)+v*i)/ov;
   o[w+i]=v}
  for(let i=0;i<ov;i++)pv[i]=tmp[n+i]*(2/N);
 }
 first=false;w+=N-ov;pos=bp>>3;
}
return{sampleRate:sr,channels:chn,length:outLen,data:out};
}

if(typeof module!=="undefined"&&module.exports)module.exports={decodeBinka:decodeBinka};
