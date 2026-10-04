/** Smooth 2D value noise in 0..1 (bilinear-smoothstep over a hashed lattice). */
export function smoothNoise(seed: number) {
  const hash = (x: number, z: number) => {
    let hh = (x * 374761393 + z * 668265263 + seed * 2246822519) | 0;
    hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
    return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, z: number) => {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = sm(x - x0), fz = sm(z - z0);
    const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}
