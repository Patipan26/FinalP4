export default function BrandMark({ compact = false }) {
  return (
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
      <div className="brand-mark-icon flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-500/30">
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-7 w-7 fill-none stroke-current text-white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 29.5h30M12.5 29.5l2.8-8.2a3 3 0 0 1 2.8-2h11.8a3 3 0 0 1 2.8 2l2.8 8.2" />
          <path d="M8 29.5v5.2a2 2 0 0 0 2 2h2.5v-3h23v3H38a2 2 0 0 0 2-2v-5.2" />
          <circle cx="15.5" cy="32" r="2" />
          <circle cx="32.5" cy="32" r="2" />
          <path d="M18 24h12M7 27h-2M43 27h-2" />
        </svg>
      </div>
      {!compact && (
        <div>
          <h1 className="text-base font-bold leading-tight text-slate-800">ระบบจัดการคาร์แคร์</h1>
          <p className="text-[11px] text-slate-400">Car Care Management</p>
        </div>
      )}
    </div>
  )
}
