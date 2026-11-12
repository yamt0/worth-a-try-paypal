// JPY is a zero-decimal currency. The caller supplies the approved minimum.
export function calculateJpyPrice(adBudgetYen, minimumYen) {
  if (!Number.isSafeInteger(minimumYen) || minimumYen < 1) throw new Error('Set an approved minimum advertising budget.');
  if (!Number.isSafeInteger(adBudgetYen) || adBudgetYen < minimumYen || adBudgetYen > 1000) throw new Error('Invalid advertising budget.');
  const feeYen = Math.floor((adBudgetYen * 30 + 50) / 100);
  const adjustmentYen = Math.max(0, 200 - adBudgetYen - feeYen);
  const totalYen = adBudgetYen + feeYen + adjustmentYen;
  if (totalYen > 99999999) throw new Error('Total is outside supported checkout bounds.');
  return {adBudgetYen, feeYen, adjustmentYen, totalYen, currency:'jpy'};
}
