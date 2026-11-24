// GM-only client tools (wallhack, ESP, god mode, one-hit, infinite ammo, no reload / recoil / spread, rapid fire, noclip,
// speed / jump / damage / time multipliers). Client-side only, like the rest of the GM surface: EVERY effect must be read
// through gmActive(), which returns null unless Game's gate says "this account really is a GM"
// (server GM role online; ?gm=1 only counts offline). Flipping the flags without the gate does nothing.
//   panel (gmPanel.ts, F8)  -> writes gmCheats / calls runGmAction()
//   game.ts / player.ts / weapons/WeaponSystem.ts / nameTags.ts -> read gmActive()
import type { Vector3 } from "three";

export type GmToggleKey =
  | "wallhack" | "esp" | "god" 
  | "infAmmo" | "noReload" | "noRecoil" | "noSpread" | "rapidFire"
  | "noclip"
  | "wallbang" | "burstAmmo" | "infGrenade" | "instantBomb" | "detector" | "autoHead" | "silentAim" | "trigger" | "radar" | "noFall";
export type GmCheatKey = GmToggleKey; // kept for older imports

export interface GmCheatState extends Record<GmToggleKey, boolean> {
  /** ESP overlay parts */
  espBox: boolean; espSnap: boolean; espName: boolean; espHp: boolean;
  /** multipliers (1 = off) */
  speedMult: number; jumpMult: number; damageMult: number; timeScale: number; rapidFireMult: number;
  /** noclip flight speed, m/s */
  flySpeed: number;
  /** silent-aim cone, degrees; aimVisible = only targets with a clear line of sight */
  aimFov: number; aimVisible: boolean;
  /** silent-aim target choice: closest to the crosshair / nearest / lowest hp, and the body part aimed at */
  aimPriority: "crosshair" | "distance" | "hp"; aimBone: "head" | "chest" | "legs";
  /** cheat detector: popup alert and score multiplier */
  detectAlert: boolean; detectSens: number;
}

const DEFAULTS: GmCheatState = {
  wallhack: false, esp: false, god: false,
  infAmmo: false, noReload: false, noRecoil: false, noSpread: false, rapidFire: false, noclip: false,
  espBox: true, espSnap: true, espName: true, espHp: true,
  speedMult: 1, jumpMult: 1, damageMult: 1, timeScale: 1, rapidFireMult: 3,
  flySpeed: 12,
  aimFov: 15, aimVisible: true,
  aimPriority: "crosshair", aimBone: "chest",
  detectAlert: false, detectSens: 1,
  infGrenade: false, instantBomb: false, detector: true,
  wallbang: false, burstAmmo: false, autoHead: false, silentAim: false, trigger: false, radar: false, noFall: false,
};

/** live state; everything off at load (the passive cheat detector is on) and after resetGmCheats() */
export const gmCheats: GmCheatState = { ...DEFAULTS };

export const GM_CHEAT_LABELS: Record<GmToggleKey, string> = {
  wallhack: "Wallhack/Chams",
  esp: "ESP (Box, Name, HP)",
  god: "God mode",
  infAmmo: "Infinite ammo",
  noReload: "No reload",
  noRecoil: "No recoil",
  noSpread: "No spread",
  rapidFire: "Rapid fire",
  noclip: "Noclip/Fly",
  wallbang: "Wallbang",
  burstAmmo: "Burst ammo (Sniper/Shotgun)",
  infGrenade: "Infinite grenade",
  instantBomb: "Instant plant/defuse",
  detector: "Cheat detector",
  autoHead: "Auto headshot",
  silentAim: "Silent aim",
  trigger: "Triggerbot",
  radar: "Radar hack",
  noFall: "No fall damage",
};

/** hotkeys handled in game.ts (F8 = panel is in gmPanel.ts); pointer must be locked, local player alive */
export const GM_HOTKEYS = { teleport: "Delete", noclip: "End" } as const;

/** hooks installed by Game, read by WeaponSystem: aimDir returns the shot direction of the silent-aim target (a SHARED vector: clone it) or null */
export const gmHooks: { aimDir: ((origin: Vector3, fwd: Vector3) => Vector3 | null) | null } = { aimDir: null };

// ---- gate ------------------------------------------------------------------------------------------------------------
let gate: () => boolean = () => false;
/** Game installs the real check (server GM role); anything not installed = no cheats */
export function setGmGate(fn: () => boolean): void { gate = fn; }
/** the ONLY way other modules should read the cheats: null = not a GM (or not in a match) */
export function gmActive(): GmCheatState | null { return gate() ? gmCheats : null; }

// ---- one-shot actions (teleport, give ...) ----------------------------------------------------------------------------
export type GmActionKey = "teleport" | "heal" | "helmet" | "refillAmmo" | "killBots" | "tpEnemy" | "respawn";
const actions: Partial<Record<GmActionKey, () => void>> = {};
export function registerGmActions(a: Partial<Record<GmActionKey, () => void>>): void { Object.assign(actions, a); }
export function runGmAction(k: GmActionKey): void { if (gate()) actions[k]?.(); }

/** every cheat off (match end / panel dispose) */
export function resetGmCheats(): void { Object.assign(gmCheats, DEFAULTS); }