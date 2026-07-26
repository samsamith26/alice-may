/** Chart scaling maths. Pure — no DOM, no React. */

export function linearScale(
  domain: [number, number],
  range: [number, number],
): (value: number) => number {
  // A flat domain would divide by zero; treat it as unit width so a
  // single-value series renders on a line rather than as NaN.
  const span = domain[1] - domain[0] || 1
  return (value) => range[0] + ((value - domain[0]) / span) * (range[1] - range[0])
}

/** Round tick values covering [min, max], stepped at 1, 2, or 5 × a power of ten. */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]

  if (min === max) {
    if (min === 0) {
      // A series that is genuinely all zeroes must keep its baseline at zero.
      // Padding to [-1, 1] would put y(0) at the middle of the plot and draw a
      // half-height bar for a value of nought.
      max = 1
    } else {
      const pad = Math.abs(min) * 0.1
      min -= pad
      max += pad
    }
  }

  const rawStep = (max - min) / Math.max(1, count)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalised = rawStep / magnitude
  const niceStep =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude

  const start = Math.floor(min / niceStep) * niceStep
  const end = Math.ceil(max / niceStep) * niceStep

  const ticks: number[] = []
  // Guard the loop: a degenerate step must not spin forever.
  for (let value = start; value <= end + niceStep / 2 && ticks.length < 100; value += niceStep) {
    ticks.push(Number(value.toFixed(10)))
  }

  return ticks.length >= 2 ? ticks : [start, end]
}

export function extent(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1]
  return [Math.min(...values), Math.max(...values)]
}
