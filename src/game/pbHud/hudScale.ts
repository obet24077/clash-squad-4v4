// Skala UI HUD berbasis window px. Desktop (H >= 720) = 1; HP landscape (H ~ 360-420) ~ 0.45-0.5.
export function hudScale(W: number, H: number): number {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const u = Math.min(1, H / 720) * (coarse ? 0.85 : 1); // 0.85 = tambahan "very small" di layar sentuh
  return Math.max(0.4, Math.round(u * 100) / 100); // lantai 0.4 supaya teks masih terbaca
}

/** layer berukuran virtual (W/u x H/u) lalu di-scale u dari pojok kiri-atas */
export function applyScale(el: HTMLElement, W: number, H: number, u: number): void {
  el.style.inset = "0 auto auto 0";
  el.style.width = `${W / u}px`;
  el.style.height = `${H / u}px`;
  el.style.transformOrigin = "0 0";
  el.style.transform = u === 1 ? "" : `scale(${u})`;
}