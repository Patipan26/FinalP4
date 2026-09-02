const styles = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-600',
  working: 'bg-emerald-50 text-emerald-700',
  finished: 'bg-slate-100 text-slate-600',
  draft: 'bg-slate-100 text-slate-600',
  paid: 'bg-blue-50 text-blue-700',
}

const labels = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  cancelled: 'ยกเลิกแล้ว',
  working: 'กำลังทำงานอยู่',
  finished: 'ออกงานแล้ว',
  draft: 'คำนวณแล้ว',
  paid: 'จ่ายแล้ว',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  )
}
