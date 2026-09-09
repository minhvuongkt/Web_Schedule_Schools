/**
 * Minimal dependency-free QR Code generator (byte mode, ECC level M,
 * versions 1–10 — enough for timetable URLs). Emits an SVG path.
 * Ported from the canonical qrcodegen algorithm outline (MIT, Kazuhiko Arase).
 */

type BitBuffer = { buffer: number[]; length: number };

function createBuffer(): BitBuffer {
  return { buffer: [], length: 0 };
}

function put(b: BitBuffer, num: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) {
    b.buffer.push((num >>> i) & 1);
  }
  b.length += length;
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenerator(degree: number): number[] {
  const poly: number[] = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly.splice(0, poly.length, ...next);
  }
  return poly;
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen);
  const res = new Array<number>(ecLen).fill(0);
  for (const b of data) {
    const factor = b ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < ecLen; i++) {
      res[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return res;
}

// Version tables (ECC M): total codewords, ec codewords per block, blocks
const VERSIONS: { total: number; ecPerBlock: number; group1: number; data1: number; group2: number; data2: number }[] = [
  { total: 26, ecPerBlock: 10, group1: 1, data1: 16, group2: 0, data2: 0 },
  { total: 44, ecPerBlock: 16, group1: 1, data1: 28, group2: 0, data2: 0 },
  { total: 70, ecPerBlock: 26, group1: 1, data1: 44, group2: 0, data2: 0 },
  { total: 100, ecPerBlock: 18, group1: 2, data1: 32, group2: 0, data2: 0 },
  { total: 134, ecPerBlock: 24, group1: 2, data1: 43, group2: 0, data2: 0 },
  { total: 172, ecPerBlock: 16, group1: 4, data1: 27, group2: 0, data2: 0 },
  { total: 196, ecPerBlock: 18, group1: 2, data1: 38, group2: 2, data2: 39 },
  { total: 242, ecPerBlock: 22, group1: 2, data1: 46, group2: 2, data2: 47 },
  { total: 292, ecPerBlock: 22, group1: 3, data1: 36, group2: 2, data2: 37 },
  { total: 346, ecPerBlock: 24, group1: 4, data1: 43, group2: 1, data2: 44 },
];

function alignAt(version: number): number[] {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const positions = [6, size - 7];
  if (version >= 7) positions.splice(1, 0, Math.floor(size / 2));
  const centers: number[] = [];
  for (const a of positions) for (const b of positions) centers.push(b * size + a);
  return centers.filter((c, i, arr) => arr.indexOf(c) === i);
}

export function generateQrSvg(text: string): string {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > 180) throw new Error("QR payload too large");

  // pick version
  let version = 1;
  const caps = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
  while (version <= 10 && caps[version - 1] < bytes.length + 2) version++;
  if (version > 10) throw new Error("QR payload too large for v1-10");
  const spec = VERSIONS[version - 1];
  const dataCodewords = spec.group1 * spec.data1 + spec.group2 * spec.data2;

  const bb = createBuffer();
  put(bb, 0b0100, 4); // byte mode
  put(bb, bytes.length, 8); // length (v1-9)
  for (const b of bytes) put(bb, b, 8);
  // terminator + bit padding
  const capacityBits = dataCodewords * 8;
  put(bb, 0, Math.min(4, capacityBits - bb.length));
  while (bb.length % 8 !== 0) {
    bb.buffer.push(0);
    bb.length += 1;
  }
  // codeword padding
  const data: number[] = [];
  for (let i = 0; i < bb.buffer.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.buffer[i + j];
    data.push(v);
  }
  let padToggle = true;
  while (data.length < dataCodewords) {
    data.push(padToggle ? 0xec : 0x11);
    padToggle = !padToggle;
  }

  // block structure
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let g = 0; g < 2; g++) {
    const count = g === 0 ? spec.group1 : spec.group2;
    const dataLen = g === 0 ? spec.data1 : spec.data2;
    for (let i = 0; i < count; i++) {
      const block = data.slice(offset, offset + dataLen);
      offset += dataLen;
      blocks.push(block);
      ecBlocks.push(rsEncode(block, spec.ecPerBlock));
    }
  }

  // interleave
  const maxData = Math.max(...blocks.map((b) => b.length));
  const final: number[] = [];
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.length) final.push(b[i]);
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const b of ecBlocks) final.push(b[i]);
  }
  // remainder bits (M versions ≤ 10: 0 bits extra needed for v2-6; standard adds 7 for v1) — handled by matrix padding below.

  // ---- matrix ----
  const size = version * 4 + 17;
  const modules: (0 | 1 | null)[][] = Array.from({ length: size }, () => new Array<0 | 1 | null>(size).fill(null));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFn = (y: number, x: number, v: boolean, r: boolean) => {
    modules[y][x] = v ? 1 : 0;
    if (r) reserved[y][x] = true;
  };

  // finder patterns
  for (const [fy, fx] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const y = fy + dy;
        const x = fx + dx;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        const inRing =
          (dy === -1 || dy === 7 || dx === -1 || dx === 7) ||
          (dy === 0 || dy === 6 || dx === 0 || dx === 6);
        setFn(y, x, inRing, true);
      }
    }
    // solid 3x3 core
    for (let dy = 2; dy <= 4; dy++) {
      for (let dx = 2; dx <= 4; dx++) setFn(fy + dy, fx + dx, true, false);
    }
  }

  // timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFn(6, i, i % 2 === 0, true);
    setFn(i, 6, i % 2 === 0, true);
  }

  // alignment patterns
  for (const c of alignAt(version)) {
    const cy = Math.floor(c / size);
    const cx = c % size;
    if (modules[cy][cx] !== null) continue;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ring = Math.max(Math.abs(dy), Math.abs(dx));
        setFn(cy + dy, cx + dx, ring !== 1, true);
      }
    }
  }

  // format info placeholders (dark module + reserved areas)
  setFn(size - 8, 8, true, true); // dark module
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      if (modules[8][i] === null) setFn(8, i, false, true);
      if (modules[i][8] === null) setFn(i, 8, false, true);
    }
  }
  for (let i = 0; i < 8; i++) {
    if (modules[8][size - 1 - i] === null) setFn(8, size - 1 - i, false, true);
    if (modules[size - 1 - i][8] === null) setFn(size - 1 - i, 8, false, true);
  }

  // data placement (snake)
  let bitIndex = 0;
  const totalBits = final.length * 8;
  const getBit = (i: number): boolean => {
    if (i >= totalBits) return false; // remainder padding bits
    return ((final[i >> 3] >>> (7 - (i & 7))) & 1) === 1;
  };
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip timing column
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (const x of [col, col - 1]) {
        if (reserved[y][x]) continue;
        modules[y][x] = getBit(bitIndex) ? 1 : 0;
        bitIndex++;
      }
    }
    upward = !upward;
  }

  // masking (mask 0: (y+x) % 2 == 0) + format bits
  const mask = (y: number, x: number) => (y + x) % 2 === 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!reserved[y][x] && modules[y][x] === 1 && mask(y, x)) {
        modules[y][x] = 0;
      } else if (!reserved[y][x] && modules[y][x] === 0 && mask(y, x)) {
        modules[y][x] = 1;
      }
    }
  }

  // format information: ECC M (0b00) + mask 0 (0b000)
  const formatBits = 0b00000; // M=00, mask=000
  const bch = (data: number): number => {
    let d = data << 10;
    const poly = 0x537;
    while (bitLength(d) - 10 >= 11 - 1) {
      d ^= poly << (bitLength(d) - 10 - 10);
    }
    return ((data << 10) | d) ^ 0x5412;
  };
  const bitLength = (n: number) => {
    let l = 0;
    while (n > 0) {
      n >>= 1;
      l++;
    }
    return l;
  };
  const f = bch(formatBits);
  const formatAt = (i: number): boolean => ((f >>> i) & 1) === 1;
  // place 15 format bits
  const bits: boolean[] = [];
  for (let i = 0; i < 15; i++) bits.push(formatAt(14 - i));
  const place = (y: number, x: number, b: boolean) => setFn(y, x, b, true);
  for (let i = 0; i <= 5; i++) place(8, i, bits[i]);
  place(8, 7, bits[6]);
  place(8, 8, bits[7]);
  place(7, 8, bits[8]);
  for (let i = 9; i < 15; i++) place(14 - i, 8, bits[i]);
  for (let i = 0; i < 8; i++) place(size - 1 - i, 8, bits[14 - i]);
  for (let i = 8; i < 15; i++) place(8, size - 15 + i, bits[i]);
  place(size - 8, 8, true); // dark module stays

  // serialize to SVG
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x] === 1) path += `M${x},${y}h1v1h-1z`;
    }
  }
  const margin = 4;
  const dim = size + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path transform="translate(${margin},${margin})" d="${path}" fill="#000000"/></svg>`;
}
