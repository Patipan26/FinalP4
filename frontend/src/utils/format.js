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

function parseDateValue(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value, options = {}) {
  const date = parseDateValue(value)
  if (!date) return '-'
  return date.toLocaleDateString('th-TH-u-ca-buddhist', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  })
}

export function getDateInputValue(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]))
  return `${values.year}-${values.month}-${values.day}`
}

export function formatMonth(value) {
  if (!value) return '-'
  const [year, month] = String(value).slice(0, 7).split('-').map(Number)
  if (!year || !month) return String(value)
  return new Date(year, month - 1, 1).toLocaleDateString('th-TH-u-ca-buddhist', { month: 'long', year: 'numeric' })
}
