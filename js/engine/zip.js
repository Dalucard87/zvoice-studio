// Минимальный ZIP (метод STORE, без сжатия) — контейнер файлов проектов.
// Пишем свои файлы без компрессии, читаем только их.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const mk16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]);
const mk32 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);

export function makeZip(files) { // files: [{name, data:Uint8Array}]
  const parts = [];
  let total = 0;
  const push = (u8) => { parts.push(u8); total += u8.length; };
  const central = [];
  let centralLen = 0;
  let offset = 0;
  const now = new Date();
  const dosTime = mk16((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2));
  const dosDate = mk16(((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate());

  for (const f of files) {
    const name = new TextEncoder().encode(f.name);
    const crc = crc32(f.data);
    // local header
    push(mk32(0x04034b50)); push(mk16(20)); push(mk16(0x0800)); push(mk16(0));
    push(dosTime); push(dosDate); push(mk32(crc));
    push(mk32(f.data.length)); push(mk32(f.data.length));
    push(mk16(name.length)); push(mk16(0));
    push(name);
    push(f.data);
    // central directory entry
    const c = [];
    c.push(...mk32(0x02014b50)); c.push(...mk16(20)); c.push(...mk16(20)); c.push(...mk16(0x0800)); c.push(...mk16(0));
    c.push(...dosTime); c.push(...dosDate); c.push(...mk32(crc));
    c.push(...mk32(f.data.length)); c.push(...mk32(f.data.length));
    c.push(...mk16(name.length)); c.push(...mk16(0)); c.push(...mk16(0)); c.push(...mk16(0)); c.push(...mk16(0)); c.push(...mk32(0));
    c.push(...mk32(offset));
    c.push(...name);
    central.push(new Uint8Array(c));
    centralLen += c.length;
    offset += 30 + name.length + f.data.length;
  }

  const centralOffset = offset;
  for (const c of central) push(c);
  push(mk32(0x06054b50)); push(mk16(0)); push(mk16(0));
  push(mk16(files.length)); push(mk16(files.length));
  push(mk32(centralLen)); push(mk32(centralOffset)); push(mk16(0));

  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function readZip(u8) { // только STORE-записи
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const dv = (o) => u8[o] | (u8[o + 1] << 8);
  const dv32 = (o) => (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0;
  const count = dv(eocd + 10);
  let off = dv32(eocd + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    if (dv32(off) !== 0x02014b50) throw new Error('Bad central directory');
    const method = dv(off + 10);
    const compSize = dv32(off + 20);
    const nameLen = dv(off + 28);
    const extraLen = dv(off + 30);
    const commLen = dv(off + 32);
    const localOff = dv32(off + 42);
    const name = new TextDecoder().decode(u8.slice(off + 46, off + 46 + nameLen));
    if (method !== 0) throw new Error('Unsupported compression in ' + name);
    const ln = dv(localOff + 26), le = dv(localOff + 28);
    const start = localOff + 30 + ln + le;
    files.push({ name, data: u8.slice(start, start + compSize) });
    off += 46 + nameLen + extraLen + commLen;
  }
  return files;
}
