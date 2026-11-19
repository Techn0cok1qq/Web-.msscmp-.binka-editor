/*
 * binka-encoder.js
 * Float32Array のチャンネル配列から .binka (Bink Audio, バージョン2) を作る。
 *
 *   const buf = encodeBinka([left, right], 44100, { snrDb: 32 });
 *   // buf: ArrayBuffer (.binka の中身)
 *
 * オプション: snrDb (大きいほど高音質・大容量。24〜40くらい)、hfTilt (高音域を粗くする量)、floorDb
 * index.html にも同じコードが埋め込んである。変更したときは両方そろえること。
 */
// .binka エンコーダー: encodeBinka(channels:Float32Array[], sampleRate, {noiseDb, onProgress}) -> ArrayBuffer
function encodeBinka(chans, sr, opt = {}) {
  const ch = chans.length; if (ch < 1 || ch > 2) throw new Error('1〜2チャンネルのみ対応です');
  const total = chans[0].length;
  const frameBits = sr < 22050 ? 9 : sr < 44100 ? 10 : 11;
  const N = 1 << frameBits, ov = N >> 4, hop = N - ov;
  const crit = [100,200,300,400,510,630,770,920,1080,1270,1480,1720,2000,2320,2700,3150,3700,4400,5300,6400,7700,9500,12000,15500,24500];
  const half = (sr + 1) >> 1;
  let nb; for (nb = 1; nb < 25; nb++) if (half <= crit[nb - 1]) break;
  const bands = [2]; for (let i = 1; i < nb; i++) bands[i] = ((crit[i - 1] * N / half) | 0) & ~1; bands[nb] = N;
  const bandOf = new Uint8Array(N); for (let b = 0, i = 0; i < N; i++) { while (i >= bands[b + 1]) b++; bandOf[i] = b; }
  const root = 2 / (Math.sqrt(N) * 32768), STEP = 0.15289164787221953823;
  const rle = [2,3,4,5,6,8,9,10,11,12,13,14,15,16,32,64];
  // 目標ノイズ(時間領域rms)から係数の量子化幅を決める
  const snr = opt.snrDb ?? 32, floorN = Math.pow(10, (opt.floorDb ?? -90) / 20), hfTilt = opt.hfTilt ?? 0;
  // 逆方向の変換 (DCT-II) を FFT で
  const M = 2 * N, cosT = new Float64Array(M / 2), sinT = new Float64Array(M / 2);
  for (let i = 0; i < M / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / M); sinT[i] = Math.sin(2 * Math.PI * i / M); }
  const rev = new Uint16Array(M); for (let i = 0; i < M; i++) { let r = 0; for (let b = 0; b <= frameBits; b++) if (i >> b & 1) r |= 1 << (frameBits - b); rev[i] = r; }
  const re = new Float64Array(M), im = new Float64Array(M);
  const ck = new Float64Array(N), sk = new Float64Array(N);
  for (let k = 0; k < N; k++) { ck[k] = Math.cos(Math.PI * k / M); sk[k] = Math.sin(Math.PI * k / M); }
  function dct2(y, X) { // DCT-III(X)=y となる X
    re.fill(0); im.fill(0);
    for (let n = 0; n < N; n++) re[rev[n]] = y[n];
    for (let len = 2; len <= M; len <<= 1) { const h = len >> 1, st = M / len;
      for (let i = 0; i < M; i += len) for (let j = 0, t = 0; j < h; j++, t += st) {
        const wr = cosT[t], wi = sinT[t], a = i + j, b = a + h;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; } }
    for (let k = 0; k < N; k++) X[k] = (k ? 2 / N : 1 / N) * (re[k] * ck[k] - im[k] * sk[k]);
  }
  // ビット書き込み (下位ビットから)
  let buf = new Uint8Array(1 << 16), bp = 0;
  const put = (v, n) => { for (let i = 0; i < n; i++, bp++) { if ((bp >> 3) >= buf.length) { const nb2 = new Uint8Array(buf.length * 2); nb2.set(buf); buf = nb2; } if (Math.floor(v / 2 ** i) % 2) buf[bp >> 3] |= 1 << (bp & 7); } };
  const putF = (v) => { const a = Math.abs(v); let p = 0, m = 0;
    if (a > 0) { p = Math.min(31, Math.max(0, Math.floor(Math.log2(a)) + 1)); m = Math.round(a * 2 ** (23 - p)); if (m >= 8388608) { if (p < 31) { p++; m = Math.round(a * 2 ** (23 - p)); } else m = 8388607; } }
    put(p, 5); put(m, 23); put(v < 0 ? 1 : 0, 1); };
  const nBlocks = Math.ceil(total / hop), packets = [];
  const win = new Float64Array(N), X = Array.from({length: ch}, () => new Float64Array(N));
  const iv = new Int32Array(N);
  for (let f = 0; f < nBlocks; f++) {
    bp = 0; buf.fill(0, 0, 1024 + (buf.length >> 4)); buf.fill(0);
    put(0, 2);
    for (let c = 0; c < ch; c++) {
      const s = chans[c], base = f * hop;
      for (let n = 0; n < N; n++) { const i = base + n; win[n] = i < total ? s[i] : 0; }
      const x = X[c]; dct2(win, x);
      let e2 = 0; for (let n = 0; n < N; n++) e2 += win[n] * win[n];
      const noise = Math.max(floorN, Math.sqrt(e2 / N) * Math.pow(10, -snr / 20));
      const Qbase = Math.max(0, Math.min(95, Math.round(Math.log(noise * Math.sqrt(24 / N) / root) / STEP)));
      putF(x[0] / root); putF(x[1] / root);
      // 帯域ごとの量子化値
      const Q = new Int32Array(nb), mxb = new Float64Array(nb);
      for (let i = 2; i < N; i++) { const a = Math.abs(x[i]); if (a > mxb[bandOf[i]]) mxb[bandOf[i]] = a; }
      for (let b = 0; b < nb; b++) {
        let q = Qbase + (bands[b] * sr / 2 / N > 14000 ? hfTilt : 0);
        if (mxb[b] > 0) { const need = Math.ceil(Math.log(mxb[b] / (32766.4 * root)) / STEP); if (need > q) q = need; }
        Q[b] = Math.max(0, Math.min(95, q)); put(Q[b], 8);
      }
      for (let i = 2; i < N; i++) { const q = Math.exp(Q[bandOf[i]] * STEP) * root; iv[i] = Math.min(32767, Math.round(Math.abs(x[i]) / q)); }
      let i = 2;
      while (i < N) {
        let run = 0; while (i + run < N && iv[i + run] === 0) run++;
        let L = 8, flag = 0, idx = 0;
        if (run >= 16) { // ゼロの連続は長いグループでまとめる
          const rem = N - i; let best = -1;
          for (let t = 0; t < 16; t++) { const len = rle[t] * 8; if (len <= run || (i + len >= N && run >= rem)) best = t; }
          if (best >= 0) { flag = 1; idx = best; L = rle[best] * 8; }
        }
        const j = Math.min(i + L, N);
        let mx = 0; for (let t = i; t < j; t++) if (iv[t] > mx) mx = iv[t];
        let w = 0; while ((1 << w) <= mx) w++;
        put(flag, 1); if (flag) put(idx, 4); put(w, 4);
        if (w) for (let t = i; t < j; t++) { put(iv[t], w); if (iv[t]) put(x[t] < 0 ? 1 : 0, 1); }
        i = j;
      }
    }
    const size = (bp + 31 >> 5) << 2; packets.push(buf.slice(0, size));
    if (opt.onProgress && f % 200 === 0) opt.onProgress(f / nBlocks);
  }
  // コンテナ
  const nEnt = Math.ceil(packets.length / 2), hdrLen = 0x18 + nEnt * 2;
  let fileLen = hdrLen, maxp = 0; for (const p of packets) { fileLen += 4 + p.length; maxp = Math.max(maxp, p.length); }
  const out = new Uint8Array(fileLen), dv = new DataView(out.buffer);
  out.set([0x31, 0x46, 0x43, 0x42], 0); out[4] = 2; out[5] = ch; dv.setUint16(6, sr, true); dv.setUint32(8, total, true);
  dv.setUint32(12, maxp, true); dv.setUint32(16, fileLen, true); dv.setUint16(20, nEnt, true); dv.setUint16(22, 2, true);
  let pos = hdrLen;
  packets.forEach((p, k) => {
    dv.setUint16(0x18 + (k >> 1) * 2, dv.getUint16(0x18 + (k >> 1) * 2, true) + 4 + p.length, true);
    dv.setUint16(pos, 0x9999, true); dv.setUint16(pos + 2, p.length, true); out.set(p, pos + 4); pos += 4 + p.length;
  });
  return out.buffer;
}
if (typeof module !== 'undefined') module.exports = encodeBinka;
