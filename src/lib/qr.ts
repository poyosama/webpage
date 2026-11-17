/**
 * Generador de QR mínimo (modo byte, corrección M, versiones 1–6 → hasta 106 bytes).
 * Alcanza para links cortos como el del vínculo de la tele. Basado en el algoritmo estándar
 * (ISO 18004): datos → Reed-Solomon → ubicación en zigzag → máscara con menor penalización.
 */
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16];
const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4];
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172];
const ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const res = new Array(degree).fill(0);
  res[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < res.length; j++) {
      res[j] = gfMul(res[j], root);
      if (j + 1 < res.length) res[j] ^= res[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return res;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const res = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (res.shift() as number);
    res.push(0);
    divisor.forEach((coef, i) => (res[i] ^= gfMul(coef, factor)));
  }
  return res;
}

/** Devuelve la matriz de módulos (true = negro) */
export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  for (; ver <= 6; ver++) {
    const dataCap = TOTAL_CODEWORDS[ver] - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
    if (4 + 8 + bytes.length * 8 <= dataCap * 8) break;
  }
  if (ver > 6) throw new Error("texto demasiado largo para el QR");
  const dataCap = TOTAL_CODEWORDS[ver] - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

  // --- bits de datos
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, 8);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataCap * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < dataCap * 8; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // --- bloques + corrección de errores, intercalados
  const nb = NUM_BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const rawCw = TOTAL_CODEWORDS[ver];
  const shortLen = Math.floor(rawCw / nb);
  const numShort = nb - (rawCw % nb);
  const div = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, div);
    if (i < numShort) dat.push(0); // hueco para igualar largos
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((blk, j) => {
      if (i !== shortLen - eccLen || j >= numShort) codewords.push(blk[i]);
    });
  }

  // --- patrones fijos
  const size = ver * 4 + 17;
  const mod: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    mod[y][x] = dark;
    fixed[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const al = ALIGN[ver];
  al.forEach((ay, i) =>
    al.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    })
  );
  const drawFormat = (mask: number) => {
    const fdata = (0 << 3) | mask; // corrección M = 00
    let rem = fdata;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fbits = ((fdata << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((fbits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0); // reserva las zonas de formato

  // --- datos en zigzag
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fixed[y][x] && bi < codewords.length * 8) {
          mod[y][x] = ((codewords[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0;
          bi++;
        }
      }
    }
  }

  // --- máscara: probar las 8 y quedarse con la de menor penalización
  const maskFn = (m: number, x: number, y: number) =>
    [
      (x + y) % 2 === 0,
      y % 2 === 0,
      x % 3 === 0,
      (x + y) % 3 === 0,
      (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      ((x * y) % 2) + ((x * y) % 3) === 0,
      (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ][m];
  const applyMask = (m: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && maskFn(m, x, y)) mod[y][x] = !mod[y][x];
  };
  const penalty = () => {
    let p = 0;
    const lines = (get: (a: number, b: number) => boolean) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b <= size; b++) {
          if (b < size && get(a, b) === get(a, b - 1)) run++;
          else {
            if (run >= 5) p += run - 2;
            run = 1;
          }
        }
        for (let b = 0; b + 10 < size; b++) {
          const s = Array.from({ length: 11 }, (_, k) => (get(a, b + k) ? 1 : 0)).join("");
          if (s === "10111010000" || s === "00001011101") p += 40;
        }
      }
    };
    lines((a, b) => mod[a][b]);
    lines((a, b) => mod[b][a]);
    let dark = 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
        if (x < size - 1 && y < size - 1 && mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3;
      }
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0;
  let bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const p = penalty();
    if (p < bestP) {
      bestP = p;
      best = m;
    }
    applyMask(m); // deshacer
  }
  applyMask(best);
  drawFormat(best);
  return mod;
}

/** QR como SVG (string) con margen de 4 módulos */
export function qrSvg(text: string, dark = "#000", light = "#fff"): string {
  const m = qrMatrix(text);
  const n = m.length + 8;
  let path = "";
  m.forEach((row, y) => row.forEach((v, x) => v && (path += `M${x + 4} ${y + 4}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
