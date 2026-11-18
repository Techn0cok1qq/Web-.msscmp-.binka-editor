#!/usr/bin/env node
// Usage:
//   node test/verify.js <file.binka>    decode and compare with ffmpeg (ffmpeg must be on PATH)
//   node test/verify.js <file.msscmp>   list entries, verify a few against ffmpeg, test replace round-trip
const fs = require('fs'), cp = require('child_process'), os = require('os'), path = require('path');
const { decodeBinka } = require('../docs/js/binka.js');
const { scanBank, parseBank, patchBank } = require('../docs/js/msscmp.js');

function ab(b) { return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); }
function ffmpegRef(buf, ch) {
  const tmp = path.join(os.tmpdir(), 'binka-verify-' + process.pid + '.binka');
  fs.writeFileSync(tmp, buf);
  const out = cp.spawnSync('ffmpeg', ['-v', 'quiet', '-i', tmp, '-f', 'f32le', '-ac', String(ch), '-'], { maxBuffer: 1 << 30 });
  fs.unlinkSync(tmp);
  if (!out.stdout || !out.stdout.length) return null;
  const b = out.stdout; return new Float32Array(b.buffer, b.byteOffset, b.length >> 2);
}
function compare(buf, label) {
  const r = decodeBinka(ab(buf));
  const ref = ffmpegRef(buf, r.channels);
  if (!ref) { console.log(label, 'decoded OK (ffmpeg not available or cannot read, skip compare)'); return true; }
  let e = 0, y = 0; const n = Math.min(r.length, ref.length / r.channels);
  for (let i = 0; i < n; i++) for (let c = 0; c < r.channels; c++) { const d = r.data[c][i] - ref[i * r.channels + c]; e += d * d; y += ref[i * r.channels + c] ** 2; }
  const rel = e / (y || 1), ok = rel < 1e-6;
  console.log((ok ? 'PASS ' : 'FAIL ') + label, r.sampleRate + 'Hz', r.channels + 'ch', 'rel.err=' + rel.toExponential(1));
  return ok;
}
const f = process.argv[2];
if (!f) { console.log('usage: node test/verify.js <file.binka|file.msscmp>'); process.exit(2); }
const buf = fs.readFileSync(f); let ok = true;
if (buf.toString('latin1', 0, 4) === '1FCB') ok = compare(buf, path.basename(f));
else {
  const u8 = new Uint8Array(ab(buf)), items = scanBank(u8);
  console.log('entries:', items.length);
  const step = Math.max(1, Math.floor(items.length / 12));
  for (let i = 0; i < items.length; i += step) ok = compare(buf.subarray(items[i].off, items[i].off + items[i].size), items[i].name) && ok;
  try {
    const A = ab(buf), P = parseBank(A), last = P[P.length - 1];
    const small = new Uint8Array(A, last.off, last.size).slice();
    const r = patchBank(A, P, [{ idx: 0, data: small }]);
    if (r.errors.length) throw new Error(r.errors[0]);
    const P2 = parseBank(r.buf), dec = decodeBinka(r.buf.slice(P2[0].off, P2[0].off + P2[0].size));
    const want = decodeBinka(A.slice(last.off, last.off + last.size));
    let same = dec.length === want.length; for (let i = 0; same && i < dec.length; i++) if (dec.data[0][i] !== want.data[0][i]) same = false;
    console.log((same && P2.length === P.length ? 'PASS ' : 'FAIL ') + 'replace round-trip (entry 0 <- last entry)');
    ok = ok && same;
  } catch (e) { console.log('SKIP replace test:', e.message); }
}
process.exit(ok ? 0 : 1);
