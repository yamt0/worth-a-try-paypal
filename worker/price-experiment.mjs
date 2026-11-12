// Ten evenly spaced candidate prices, rounded to a human-friendly increment.
// Rounding collisions are removed; tiny ranges can yield fewer than ten prices.
export function automaticPrices(min, max) {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min || max > 100000000) throw new RangeError('Invalid price range');
  if (min === max) return [min];
  const rawStep = (max - min) / 9;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const increment = Math.max(1, (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude);
  const values = Array.from({length: 10}, (_, i) => {
    const target = min + (max - min) * i / 9;
    const rounded = Math.round(target / increment) * increment;
    return Math.min(max, Math.max(min, rounded));
  });
  return [...new Set(values)].sort((a,b) => a-b);
}

export function manualPrices(values) {
  if (!Array.isArray(values) || !values.length || values.length > 10 || values.some(x => !Number.isSafeInteger(x) || x < 1 || x > 100000000)) throw new RangeError('Specify one to ten valid integer prices');
  return [...new Set(values)].sort((a,b) => a-b);
}
