/**
 * 年月输入：原生 type="month" 在手机上要滚很久才能选到年份，
 * 这里改成直接敲数字，边打边补成 1998-06，编辑体验更接近直觉。
 */

/** 把任意输入整理成打字时的显示值：只留数字，第 5 位开始补横线。 */
export function formatMonthText(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 6);
  return digits.length <= 4 ? digits : `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

/** 只有凑满 6 位数字才算填完，返回 YYYY-MM；否则返回空字符串。 */
export function monthValue(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 6);
  if (digits.length !== 6) return '';
  const month = Math.min(12, Math.max(1, Number(digits.slice(4)) || 1));
  return `${digits.slice(0, 4)}-${String(month).padStart(2, '0')}`;
}

/** 回填到输入框的文本：已存成 1998-06 的旧数据按原样显示。 */
export function monthText(value) {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : formatMonthText(raw);
}
