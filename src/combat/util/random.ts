/** Deterministic pseudo-random value in [0, 1) from a tick + id pair.
 *  FNV-1a hash — same input always produces same output, enabling replay determinism. */
export function deterministicRoll(tick: number, id: string): number {
  let hash = 2166136261;
  const str = `${tick}:${id}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}
