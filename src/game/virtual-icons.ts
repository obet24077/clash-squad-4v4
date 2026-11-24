/**
 * Kumpulan icon on-screen controls (virtual-keymapping.ts).
 *
 * Tiap icon adalah SVG utuh. Cara ganti: timpa seluruh isi `<svg ...>...</svg>` milik icon
 * tersebut (mis. hasil copy dari Lucide / Heroicons / Figma).
 *
 * Catatan style: warna, ketebalan garis, dan ukuran diatur CSS di virtual-keymapping.ts
 * (`.vkm-btn svg`: fill none, stroke currentColor, ukuran 46% tombol). Jadi jangan isi atribut
 * width / height / fill / stroke di tag <svg> kalau ingin tampil seragam. Untuk icon berwarna
 * sendiri, atribut di elemen anak (mis. fill="currentColor" atau fill="#fff") tetap berlaku.
 *
 * Cara tambah icon: tambah entri baru di ICON_SVG lalu pakai `ICON.namaBaru`.
 * Cara ganti icon slot senjata 1-6: ubah SLOT_ICON_NAMES (null = tampilkan angka saja).
 */

export const ICON_SVG = {
  // movement / combat
  jump: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M6 13l6-6 6 6M6 19l6-6 6 6"/>
    </svg>`,
  crouch: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M6 5l6 6 6-6M6 11l6 6 6-6"/>
    </svg>`,
  reload: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/>
    </svg>`,
  fire: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="6.5"/>
      <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
    </svg>`,
  aim: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8"/>
      <path d="M12 7v10M7 12h10"/>
    </svg>`,
  walk: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M8.5 3.5c1.8 0 2.8 1.8 2.8 3.8S10.3 11 8.5 11 5.7 9.3 5.7 7.3 6.7 3.5 8.5 3.5zM7 13.5h3.5V15a1.75 1.75 0 0 1-3.5 0zM15.5 10c1.8 0 2.8 1.8 2.8 3.8s-1 3.7-2.8 3.7-2.8-1.7-2.8-3.7 1-3.8 2.8-3.8zM14 19.5h3.5V21H14z"/>
    </svg>`,
  action: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10M12 9.5a1.5 1.5 0 0 1 3 0V11M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a5.5 5.5 0 0 1-4.6-2.5L4.5 14.5a1.6 1.6 0 0 1 2.6-1.8L9 15"/>
    </svg>`,

  // utility keys
  swap: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M5 8h13l-3-3M19 16H6l3 3"/>
    </svg>`,
  drop: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M12 4v11M7.5 11l4.5 4.5L16.5 11M5 20h14"/>
    </svg>`,
  laser: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="2.2"/>
      <path d="M3 12h5M16 12h5M12 3v5M12 16v5"/>
    </svg>`,
  weaponMenu: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/>
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/>
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/>
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>
    </svg>`,
  dual: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <rect x="3.5" y="7" width="7" height="10" rx="1.5"/>
      <rect x="13.5" y="7" width="7" height="10" rx="1.5"/>
    </svg>`,

  // weapon slots 1-6
  rifle: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M2 12.5h13l2-2h5v3h-6l-1.5 2H10l-1 3.5H6l1-3.5H2z"/>
    </svg>`,
  pistol: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M4 8.5h14.5v4.5H12v6.5H8.5V13H4z"/>
    </svg>`,
  knife: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M4 20L17.5 6.5 20 4l-.5 4.5L13 15l-3 .5L8 18z"/>
    </svg>`,
  grenade: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="14.5" r="6"/>
      <path d="M10 8.5V5h4.5M14.5 5l2.5 1.5"/>
    </svg>`,
  special: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.7 5.7l2.8 2.8M15.5 15.5l2.8 2.8M18.3 5.7l-2.8 2.8M8.5 15.5l-2.8 2.8"/>
    </svg>`,

  // radio: tombol menu + satu icon per tombol Z / X / C
  radioMenu: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="2"/>
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>
    </svg>`,
  radio1: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M4 10v4h3l7 4V6l-7 4z"/>
      <path d="M17.5 9.5a3.5 3.5 0 0 1 0 5"/>
    </svg>`,
  radio2: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M4 5.5h16V16H9.5L5 19.5V16H4z"/>
      <path d="M8.5 10.5l2.5 2.5 4.5-4.5"/>
    </svg>`,
  radio3: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M4 5.5h16V16H9.5L5 19.5V16H4z"/>
      <path d="M12 8v3.2"/>
      <path d="M12 13.2v.6"/>
    </svg>`,

  // interface
  menu: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M5 7h14M5 12h14M5 17h14"/>
    </svg>`,
  score: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <rect x="4" y="5" width="16" height="14" rx="2"/>
      <path d="M4 10h16M9.5 10v9"/>
    </svg>`,
  chat: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M4 5.5h16V16H9.5L5 19.5V16H4z"/>
    </svg>`,
  send: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M21 3L10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/>
    </svg>`,
} as const;

export type IconName = keyof typeof ICON_SVG;

/** Siap pakai: ICON.fire, ICON.dual, ... (SVG yang sama, tanpa spasi / baris kosong di sekitarnya). */
export const ICON = Object.fromEntries(
  Object.entries(ICON_SVG).map(([name, svg]) => [name, svg.trim().replace(/>\s+</g, "><")]),
) as Record<IconName, string>;

/** Icon tombol senjata slot 1-6. null = tampilkan nomor slot saja. */
export const SLOT_ICON_NAMES: Array<IconName | null> = [
  "rifle",
  "pistol",
  "knife",
  "grenade",
  "special",
  null,
];

/** Icon tombol radio 1-3 (Z / X / C). */
export const RADIO_ICONS: string[] = [ICON.radio1, ICON.radio2, ICON.radio3];

export const SLOT_ICONS: string[] = SLOT_ICON_NAMES.map((name) => (name ? ICON[name] : ""));