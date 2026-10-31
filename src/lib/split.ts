import type { SplitKey } from '../db/types'

/**
 * Rescales a per-skill split so it sums to `total` minutes, keeping the
 * proportions. Rounding leftovers go to the skills with the largest remainders.
 * Skills set to 0 stay at 0. An all-zero split is spread evenly.
 */
export function scaleSplit(split: Record<SplitKey, number>, total: number): Record<SplitKey, number> {
  const keys = Object.keys(split) as SplitKey[]
  const sum = keys.reduce((a, k) => a + split[k], 0)
  const weights = sum > 0 ? keys.map((k) => split[k] / sum) : keys.map(() => 1 / keys.length)
  const raw = weights.map((w) => w * total)
  const out = raw.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    if (weights[i] === 0) continue
    out[i] = out[i]! + 1
    left--
  }
  return Object.fromEntries(keys.map((k, i) => [k, out[i]])) as Record<SplitKey, number>
}

export function splitTotal(split: Record<SplitKey, number>): number {
  return Object.values(split).reduce((a, b) => a + b, 0)
}
