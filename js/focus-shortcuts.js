export function normalizeFocusShortcuts(raw) {
  if (!Array.isArray(raw) || raw.length > 3) throw new TypeError('专注快捷项必须是最多三个槽位的数组。');
  for (const value of raw) {
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 180)) {
      throw new TypeError('专注快捷项必须为空或 1–180 的整数分钟。');
    }
  }
  return [...raw, ...Array(3 - raw.length).fill(null)];
}
