/** Editorial opt-in only. No network requests or ad provider integration. */
export default function AdSlot({ position, enabled = false }) {
  if (!enabled) return null;
  return <aside aria-label="Advertisement placeholder" data-ad-slot={position} className="my-10 flex min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100/50 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-400">Advertisement · Reserved space</aside>;
}
