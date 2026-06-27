export class SeededRandom {
  constructor(seed = 0x1234abcd) {
    this.seed = Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : 0x1234abcd;
    if (this.seed === 0) this.seed = 0x1234abcd;
  }

  nextUint32() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed;
  }

  next() {
    return this.nextUint32() / 0xffffffff;
  }

  bipolar() {
    return this.next() * 2 - 1;
  }
}
