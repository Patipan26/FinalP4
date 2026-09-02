export function formatLeaveDays(value) {
  const days = Number(value)
  if (!Number.isFinite(days)) return '-'
  if (days === 0.5) return 'ครึ่งวัน'
  if (Number.isInteger(days)) return `${days} วัน`

  const wholeDays = Math.floor(days)
  if (Math.abs(days - (wholeDays + 0.5)) < 0.001) {
    return wholeDays > 0 ? `${wholeDays} วันครึ่ง` : 'ครึ่งวัน'
  }

  return `${days} วัน`
}

export function formatLeaveQuota(remaining, quota) {
  return `${formatLeaveDays(remaining)} / ${formatLeaveDays(quota)}`
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatMonth(value) {
  if (!value) return '-'
  const [year, month] = String(value).slice(0, 7).split('-').map(Number)
  if (!year || !month) return String(value)
  return new Date(year, month - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
}
