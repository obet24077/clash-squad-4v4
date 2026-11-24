import type { Input } from "./input";
import { PB_KEYS } from "./keymap";
import { ICON, RADIO_ICONS, SLOT_ICONS } from "./virtual-icons";

/**
 * Touchscreen controls for the PB web client.
 *
 * Design goals
 * - Mobile gaming layout: floating joystick (left), look-by-drag (right), big FIRE/AIM/JUMP cluster.
 * - NEVER blocks the game UI under it: the root is pointer-events:none, there is no full-screen
 *   "look area" element. Look / joystick gestures are read from document-level pointer events and
 *   they are ignored whenever the finger lands on a real UI element (button, link, input,
 *   cursor:pointer, [data-vkm-ignore]) outside the controls.
 * - Mobile never gets Pointer Lock, so while playing we switch Input into touch-lock mode
 *   (input.setTouchLock) – the game gates look / fire / chat on `input.locked`.
 * - Menu button opens the game's ESC menu, "LANJUT" closes it.
 */

export interface VirtualKeyMappingOptions {
  sensitivityX?: number;
  sensitivityY?: number;
  invertY?: boolean;
  /** Joystick base diameter in px (before scale). */
  joystickSize?: number;
  /** 0..1: stick travel below this is ignored. */
  deadzone?: number;
  /** 0..1: per-axis threshold to press W/A/S/D. */
  directionThreshold?: number;
  /** @deprecated Diabaikan: menu radio (Z/X/C + nomor) selalu tampil. */
  showRadio?: boolean;
  showControls?: boolean;
  /** Button opacity 0.25..1 (default 0.8). */
  opacity?: number;
  /** UI scale 0.7..1.5 (default 1). */
  scale?: number;
  /** Vibrate on button press where supported (default true). */
  haptics?: boolean;
  /**
   * Hide game HUD widgets that sit under the on-screen buttons (default FALSE).
   * Off by default: it also hides the minimap / score when a button covers them.
   * When enabled, add `data-vkm-keep` to an HUD element to never hide it.
   */
  hideHudUnderControls?: boolean;
  /** CSS selector of the game HUD root (default "#pbhud"). */
  hudSelector?: string;
}

interface ButtonConfig {
  /** aria-label */
  label: string;
  /** Inner HTML (icon + tiny caption). */
  html: string;
  className?: string;
  key?: string;
  mouse?: number;
  /** Keep the key / button down while the finger is down. Default: short tap. */
  hold?: boolean;
  /** Dragging this button also moves the camera (FIRE). */
  look?: boolean;
  /** Works even while paused / collapsed (MENU). */
  always?: boolean;
  onTap?: () => void;
  /** Offset from bottom-right in px (before scale). */
  br?: { x: number; y: number; size: number };
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const TAP_MS = 70;

/**
 * Cara tombol radio mengirim key ke game:
 *  "event"   = keydown / keyup sungguhan di document (sama seperti menekan keyboard di desktop)
 *  "virtual" = Input.setVirtualKey (sama seperti tombol senjata 1-6)
 * Kalau menu radio tidak terbuka dengan satu mode, coba mode yang lain.
 */
const RADIO_KEY_MODE: "event" | "virtual" = "event";

/** Panel radio di layar menutup sendiri setelah sekian ms tanpa disentuh. */
const RADIO_UI_TIMEOUT_MS = 6000;

/** Nomor pilihan tiap menu radio, urutan sama dengan PB_KEYS.radio (Z, X, C). */
const RADIO_OPTIONS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "0"], // Z
  ["1", "2", "3", "4", "5", "6", "7", "8", "0"], // X
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"], // C
];

/** On-screen button sizes in px (before scale): FIRE large, Q medium, everything else normal. */
const BTN = { large: 96, medium: 60, normal: 52 } as const;

type PopoverElement = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

/** "KeyG" -> "G", "Digit5" -> "5", "NumpadAdd" -> "Add", "Equal" -> "=" */
const keyLabel = (code: string): string => {
  const special: Record<string, string> = { Equal: "=", Minus: "-", Space: "SPC", Backquote: "`", Backslash: "\\", Slash: "/", Period: ".", Comma: ",", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]" };
  return special[code] ?? code.replace(/^(Key|Digit|Numpad|Arrow)/, "");
};

/** Elements a finger must never "steal" from the page. */
const INTERACTIVE =
  'button, a, input, select, textarea, label, summary, [role="button"], [contenteditable="true"], [data-vkm-ignore]';

export class VirtualKeyMapping {
  private root: HTMLDivElement | null = null;
  private style: HTMLStyleElement | null = null;
  private hud: HTMLDivElement | null = null;
  private ghost: HTMLDivElement | null = null;
  private joy: HTMLDivElement | null = null;
  private stick: HTMLDivElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private radioRow: HTMLDivElement | null = null;
  private radioNums: HTMLDivElement | null = null;
  private radioTimer = 0;

  private abort: AbortController | null = null;
  private chatTimer = 0;

  // Gesture tracking (document level)
  private joyPointer: number | null = null;
  private joyCenter = { x: 0, y: 0 };
  private lookPointers = new Map<number, { x: number; y: number }>();

  // Anything that must be released on blur / pause / destroy
  private releasers = new Set<() => void>();

  private enabled = false;
  private destroyed = false;
  private playing = false;
  private paused = false;
  private collapsed = false;

  private sensitivityX: number;
  private sensitivityY: number;
  private invertY: boolean;
  private joystickSize: number;
  private deadzone: number;
  private directionThreshold: number;
  private showControls: boolean;
  private opacity: number;
  private uiScale: number;
  private haptics: boolean;
  private hideHudUnderControls: boolean;
  private hudSelector: string;

  /** Fallback menu state when window.__pb is not available. */
  private localMenu = false;

  private hudHidden = new Set<Element>();
  private hudTick = 0;
  private stateSig = "";
  private wasActive = false;
  private joyCaptured = false;
  private origRequestLock: ((...args: unknown[]) => unknown) | null = null;
  /** Until this time the game's menu state may lag behind our own open / close request. */
  private menuIntentUntil = 0;

  private readonly keys = {
    forward: PB_KEYS.forward[0],
    back: PB_KEYS.back[0],
    left: PB_KEYS.left[0],
    right: PB_KEYS.right[0],
    jump: PB_KEYS.jump[0],
    crouch: PB_KEYS.crouch[0],
    walk: PB_KEYS.walk[0],
    reload: PB_KEYS.reload[0],
    lastWeapon: PB_KEYS.lastWeapon[0],
    drop: PB_KEYS.drop[0],
    action: PB_KEYS.action[0],
    extension: PB_KEYS.extension[0],
    extension2: PB_KEYS.extension2[0],
    /** Ganti senjata (T): PB_KEYS.change dari keymap.ts, fallback keyboard T. */
    dualWeapon:
      (PB_KEYS as unknown as Record<string, string[] | undefined>).change?.[0] ??
      (PB_KEYS as unknown as Record<string, string[] | undefined>).dualWeapon?.[0] ??
      "KeyT",
    scoreboard: PB_KEYS.scoreboard[0],
  };

  constructor(
    private readonly input: Input,
    options: VirtualKeyMappingOptions = {},
  ) {
    this.sensitivityX = options.sensitivityX ?? 1.15;
    this.sensitivityY = options.sensitivityY ?? 0.95;
    this.invertY = options.invertY ?? false;

    this.joystickSize = options.joystickSize ?? 135;
    this.deadzone = clamp(options.deadzone ?? 0.16, 0, 0.9);
    this.directionThreshold = clamp(options.directionThreshold ?? 0.3, 0.05, 0.95);

    this.showControls = options.showControls ?? true;

    this.opacity = clamp(options.opacity ?? 0.8, 0.25, 1);
    this.uiScale = clamp(options.scale ?? 1, 0.7, 1.5);
    this.haptics = options.haptics ?? true;
    this.hideHudUnderControls = options.hideHudUnderControls ?? false;
    this.hudSelector = options.hudSelector ?? "#pbhud";
  }

  // ==========================================================
  // PUBLIC API
  // ==========================================================

  mount(): void {
    if (this.root || this.destroyed) return;

    this.abort = new AbortController();

    this.blockPointerLock();

    this.createStyle();
    this.createUI();
    this.applyVars();
    this.applySavedLayout();
    this.bindGlobalEvents();

    this.enabled = true;

    // Touch has no Pointer Lock: the "Click to Play" blocker is dismissed by our own tap.
    this.startPlay();

    this.chatTimer = window.setInterval(() => {
      this.syncState();
      this.syncWithGame();

      this.watchdog();

      // HUD can be rebuilt by the game: rescan about every 640 ms
      if (++this.hudTick % 8 === 0) this.scanHud();
    }, 80);
  }

  private customOverlay: HTMLElement | null = null;
  private selectedEl: HTMLElement | null = null;

  private handleOpenCustomizer = (): void => {
    this.openHudCustomizer();
  };

  private getSavedLayout(): Record<string, { left: number; top: number; scale: number; opacity: number }> {
    try {
      return JSON.parse(localStorage.getItem("pb_mobile_hud_layout_v1") || "{}");
    } catch {
      return {};
    }
  }

  private saveLayout(data: Record<string, { left: number; top: number; scale: number; opacity: number }>): void {
    try {
      localStorage.setItem("pb_mobile_hud_layout_v1", JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  private applySavedLayout(): void {
    if (!this.root) return;
    const saved = this.getSavedLayout();
    this.root.querySelectorAll<HTMLElement>("[data-vkm-id]").forEach((el) => {
      const id = el.dataset.vkmId!;
      const item = saved[id];
      if (!item) return;
      el.style.setProperty("left", item.left + "px", "important");
      el.style.setProperty("top", item.top + "px", "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("bottom", "auto", "important");
      el.style.setProperty("transform", `scale(${item.scale})`, "important");
      el.style.setProperty("transform-origin", "center center", "important");
      el.style.setProperty("opacity", String(item.opacity), "important");
    });
  }

  openHudCustomizer(onDone?: () => void): void {
    this.enabled = true;
    this.playing = true;
    this.attachRoot(true);
    try { (this.root as unknown as { showPopover?: () => void })?.showPopover?.(); } catch {}
    this.applySavedLayout();
    if (!this.root || this.customOverlay) return;
    this.root.id = "pb-hud-customizer-overlay";
    this.root.style.setProperty("display", "block", "important");
    this.root.style.setProperty("visibility", "visible", "important");
    this.root.style.setProperty("opacity", "1", "important");
    this.root.classList.add("vkm-custom-mode");
    this.root.style.setProperty("position", "fixed", "important");
    this.root.style.setProperty("inset", "0", "important");
    this.root.style.setProperty("z-index", "2147483646", "important");
    this.root.style.setProperty("pointer-events", "auto", "important");
    this.root.style.setProperty("background", "rgba(2, 6, 23, 0.78)", "important");
    if (this.root.parentElement !== document.body) document.body.appendChild(this.root);

    const layout = this.getSavedLayout();
    const panel = document.createElement("div");
    panel.className = "vkm-custom-panel";
    panel.innerHTML = `
      <div class="vkm-custom-row">
        <span style="color:#38bdf8;font-weight:800">CUSTOM HUD HP — <span class="vkm-sel-name">Pilih Tombol</span></span>
        <div style="display:flex;gap:6px">
          <button type="button" class="vkm-reset-all">Reset Semua</button>
          <button type="button" class="vkm-save">Simpan & Tutup</button>
        </div>
      </div>
      <div class="vkm-custom-row">
        <label style="display:flex;align-items:center;gap:6px;flex:1">Ukuran
          <input type="range" class="vkm-inp-scale" min="0.6" max="1.6" step="0.05" value="1" style="flex:1">
          <span class="vkm-val-scale" style="min-width:34px;text-align:right">100%</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;flex:1">Transparan
          <input type="range" class="vkm-inp-op" min="0.3" max="1" step="0.05" value="0.85" style="flex:1">
          <span class="vkm-val-op" style="min-width:34px;text-align:right">85%</span>
        </label>
      </div>
      <div style="font-size:10px;color:#94a3b8">Geser (drag) tombol atau analog di layar untuk mengatur tata letak HUD HP.</div>
    `;
    panel.style.setProperty("position", "fixed", "important");
    panel.style.setProperty("z-index", "2147483647", "important");
    panel.style.setProperty("pointer-events", "auto", "important");
    document.body.appendChild(panel);
    this.customOverlay = panel;

    const selName = panel.querySelector(".vkm-sel-name") as HTMLElement;
    const inpScale = panel.querySelector(".vkm-inp-scale") as HTMLInputElement;
    const valScale = panel.querySelector(".vkm-val-scale") as HTMLElement;
    const inpOp = panel.querySelector(".vkm-inp-op") as HTMLInputElement;
    const valOp = panel.querySelector(".vkm-val-op") as HTMLElement;

    const selectEl = (el: HTMLElement) => {
      if (this.selectedEl) this.selectedEl.classList.remove("vkm-selected");
      this.selectedEl = el;
      el.classList.add("vkm-selected");
      const id = el.dataset.vkmId!;
      selName.textContent = el.dataset.vkmLabel || id;
      const rect = el.getBoundingClientRect();
      const cur = layout[id] || {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        scale: 1,
        opacity: 0.85,
      };
      inpScale.value = String(cur.scale);
      valScale.textContent = Math.round(cur.scale * 100) + "%";
      inpOp.value = String(cur.opacity);
      valOp.textContent = Math.round(cur.opacity * 100) + "%";
    };

    const cleanupFns: (() => void)[] = [];
    this.root.querySelectorAll<HTMLElement>("[data-vkm-id]").forEach((el, idx) => {
      if (idx === 0) selectEl(el);
      let dragging = false;
      let startX = 0, startY = 0, origL = 0, origT = 0;

      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        selectEl(el);
        dragging = true;
        const rect = el.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        origL = rect.left;
        origT = rect.top;
        el.setPointerCapture(e.pointerId);
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        const nl = Math.max(0, Math.min(window.innerWidth - 28, Math.round(origL + (e.clientX - startX))));
        const nt = Math.max(0, Math.min(window.innerHeight - 28, Math.round(origT + (e.clientY - startY))));
        const id = el.dataset.vkmId!;
        const prev = layout[id] || { left: nl, top: nt, scale: 1, opacity: 0.85 };
        layout[id] = { ...prev, left: nl, top: nt };
        el.style.setProperty("left", nl + "px", "important");
        el.style.setProperty("top", nt + "px", "important");
        el.style.setProperty("right", "auto", "important");
        el.style.setProperty("bottom", "auto", "important");
      };
      const onUp = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        try { el.releasePointerCapture(e.pointerId); } catch {}
      };
      el.addEventListener("pointerdown", onDown, true);
      el.addEventListener("pointermove", onMove, true);
      el.addEventListener("pointerup", onUp, true);
      cleanupFns.push(() => {
        el.removeEventListener("pointerdown", onDown, true);
        el.removeEventListener("pointermove", onMove, true);
        el.removeEventListener("pointerup", onUp, true);
      });
    });

    inpScale.addEventListener("input", () => {
      if (!this.selectedEl) return;
      const sc = Number(inpScale.value);
      valScale.textContent = Math.round(sc * 100) + "%";
      const id = this.selectedEl.dataset.vkmId!;
      const rect = this.selectedEl.getBoundingClientRect();
      const prev = layout[id] || { left: Math.round(rect.left), top: Math.round(rect.top), scale: sc, opacity: 0.85 };
      layout[id] = { ...prev, scale: sc };
      this.selectedEl.style.setProperty("transform", `scale(${sc})`, "important");
      this.selectedEl.style.setProperty("transform-origin", "center center", "important");
    });

    inpOp.addEventListener("input", () => {
      if (!this.selectedEl) return;
      const op = Number(inpOp.value);
      valOp.textContent = Math.round(op * 100) + "%";
      const id = this.selectedEl.dataset.vkmId!;
      const rect = this.selectedEl.getBoundingClientRect();
      const prev = layout[id] || { left: Math.round(rect.left), top: Math.round(rect.top), scale: 1, opacity: op };
      layout[id] = { ...prev, opacity: op };
      this.selectedEl.style.setProperty("opacity", String(op), "important");
    });

    panel.querySelector(".vkm-reset-all")!.addEventListener("click", () => {
      localStorage.removeItem("pb_mobile_hud_layout_v1");
      for (const k of Object.keys(layout)) delete layout[k];
      this.root?.querySelectorAll<HTMLElement>("[data-vkm-id]").forEach((el) => {
        el.style.removeProperty("left");
        el.style.removeProperty("top");
        el.style.removeProperty("right");
        el.style.removeProperty("bottom");
        el.style.removeProperty("transform");
        el.style.removeProperty("opacity");
      });
    });

    panel.querySelector(".vkm-save")!.addEventListener("click", () => {
      this.saveLayout(layout);
      cleanupFns.forEach((fn) => fn());
      if (this.selectedEl) this.selectedEl.classList.remove("vkm-selected");
      this.selectedEl = null;
      this.root?.classList.remove("vkm-custom-mode");
      this.root?.removeAttribute("id");
      if (onDone) { this.playing = false; if (this.root) this.root.style.display = "none"; }
      panel.remove();
      this.customOverlay = null;
      onDone?.();
    });
  }

  destroy(): void {
    window.removeEventListener("pb:open-hud-customizer", this.handleOpenCustomizer);
    if (this.destroyed) return;

    this.destroyed = true;
    this.enabled = false;
    this.playing = false;

    window.clearInterval(this.chatTimer);
    this.abort?.abort();
    this.abort = null;

    this.releaseAll();
    this.input.setTouchLock(false);
    this.clearHud();
    this.restorePointerLock();

    document.documentElement.style.touchAction = "";
    document.documentElement.style.overscrollBehavior = "";

    this.root?.remove();
    this.style?.remove();

    this.root = null;
    this.style = null;
    this.hud = null;
    this.ghost = null;
    this.joy = null;
    this.stick = null;
    this.sendBtn = null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (!enabled) {
      this.releaseAll();
    }

    this.input.setTouchLock(enabled && this.playing && !this.paused);
    this.syncState();
  }

  setSensitivity(x: number, y = x): void {
    this.sensitivityX = clamp(x, 0.1, 4);
    this.sensitivityY = clamp(y, 0.1, 4);
  }

  setInvertY(value: boolean): void {
    this.invertY = value;
  }

  setOpacity(value: number): void {
    this.opacity = clamp(value, 0.25, 1);
    this.applyVars();
  }

  setScale(value: number): void {
    this.uiScale = clamp(value, 0.7, 1.5);
    this.applyVars();
  }

  /** Hide / show every on-screen button (joystick + look keep working). */
  setCollapsed(value: boolean): void {
    this.collapsed = value;
    this.syncState();
  }

  /**
   * MENU button = the Escape key. Closed -> opens the game's ESC menu,
   * open -> closes it. No separate "resume" button.
   */
  toggleMenu(): void {
    if (!this.playing || this.destroyed) return;

    this.hardReset();

    if (this.paused) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  /** Open the game's ESC menu (touch equivalent of leaving Pointer Lock). */
  pause(): void {
    if (this.playing && !this.paused) this.openMenu();
  }

  /** Close the game's ESC menu. */
  resume(): void {
    if (this.playing && this.paused) this.closeMenu();
  }

  private openMenu(): void {
    this.localMenu = true;
    this.menuIntentUntil = performance.now() + 500;
    this.setMenuOpen(true);

    // game.ts listens to pointerlockchange and opens the ESC menu when the pointer is free
    document.dispatchEvent(new Event("pointerlockchange"));
  }

  private closeMenu(): void {
    this.localMenu = false;
    this.menuIntentUntil = performance.now() + 500;

    // 1) the game's own "locked again while the ESC menu is up -> close it" path
    this.fakePointerLockChange();

    // 2) fallback: the game's Escape handler. Skipped when step 1 already closed the menu,
    //    otherwise a toggle-style Escape handler would re-open it right away.
    const g = this.game();
    if (!g?.escMenu || g.escMenu.isOpen) this.tapKeyEvent("Escape");

    this.setMenuOpen(false);

    // 3) last resort: still open after the events -> close it directly
    window.setTimeout(() => {
      const g = this.game();

      if (this.destroyed || !g?.escMenu?.isOpen) return;

      try {
        g.escMenu.close();
      } catch {
        // ignore
      }
    }, 150);
  }

  /** Controls follow the menu: hidden + touch-lock off while it is open. */
  private setMenuOpen(open: boolean): void {
    this.paused = open;

    this.releaseAll();
    this.input.setTouchLock(this.enabled && this.playing && !open);
    this.syncState();

    // The game's menu may live in the top layer too: be the LAST layer so MENU stays reachable
    if (open) {
      window.setTimeout(() => {
        if (!this.destroyed && this.paused) this.attachRoot(true);
      }, 80);
    }
  }

  /**
   * Touch mode never uses the real Pointer Lock. If the game (menu "LANJUT", chat, a click on
   * the canvas...) asks for it anyway, the browser freezes clientX / clientY and shows
   * "... has control of your pointer": the joystick and every button then stop matching the
   * finger. While the controls are enabled, requestPointerLock becomes a harmless no-op.
   */
  private blockPointerLock(): void {
    const proto = Element.prototype as unknown as {
      requestPointerLock?: (...args: unknown[]) => unknown;
    };

    if (typeof proto.requestPointerLock !== "function" || this.origRequestLock) return;

    const orig = proto.requestPointerLock;
    const self = this;

    this.origRequestLock = orig;

    proto.requestPointerLock = function (this: Element, ...args: unknown[]) {
      if (self.enabled && !self.destroyed) return Promise.resolve();
      return orig.apply(this, args);
    };

    // A lock that is already active (taken before mount) is released once, quietly.
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // ignore
      }
    }
  }

  private restorePointerLock(): void {
    if (!this.origRequestLock) return;

    (Element.prototype as unknown as {
      requestPointerLock?: (...args: unknown[]) => unknown;
    }).requestPointerLock = this.origRequestLock;

    this.origRequestLock = null;
  }

  /** Self-heal: a joystick whose finger is gone (lost pointerup) never stays stuck. */
  private watchdog(): void {
    if (this.joyPointer === null || !this.joyCaptured || !this.ghost) return;

    let held = false;

    try {
      held = this.ghost.hasPointerCapture(this.joyPointer);
    } catch {
      // ignore
    }

    if (!held) this.resetJoystick();
  }

  /** The Game instance exposed by main.ts (window.__pb), if any. */
  private game(): any {
    return (window as unknown as { __pb?: any }).__pb;
  }

  private fakePointerLockChange(): void {
    try {
      Object.defineProperty(document, "pointerLockElement", {
        configurable: true,
        get: () => document.body,
      });

      document.dispatchEvent(new Event("pointerlockchange"));
    } finally {
      // restore the real (prototype) getter
      delete (document as unknown as Record<string, unknown>).pointerLockElement;
    }
  }

  /**
   * Follow the game's REAL menu state, however it changed (MENU button, the menu's own
   * buttons, a keyboard Esc...), so the controls can never disagree with the game.
   */
  private syncWithGame(): void {
    if (!this.playing || !this.enabled) return;
    const gw = this.game()?.glooWalls?.getHudState?.();
    if (gw && this.root) {
      const btn = this.root.querySelector(".vkm-gloowall") as HTMLElement | null;
      const badge = this.root.querySelector(".vkm-gw-count") as HTMLElement | null;
      const ring = this.root.querySelector(".vkm-gw-ring") as HTMLElement | null;
      if (badge) {
        badge.textContent = gw.count >= gw.max ? `${gw.count}/${gw.max}` : `${gw.count} · ${gw.secsLeft}s`;
      }
      if (ring) {
        const deg = Math.round((gw.progress ?? 1) * 360);
        ring.style.background = `conic-gradient(#38bdf8 ${deg}deg, rgba(15, 23, 42, 0.55) ${deg}deg)`;
      }
      if (btn) {
        btn.classList.toggle("vkm-empty", gw.count <= 0);
        btn.classList.toggle("vkm-gw-preview", !!gw.previewing);
      }
    }

    const g = this.game();
    const open = g?.escMenu ? !!g.escMenu.isOpen : this.localMenu;

    if (open === this.paused) return;

    // Our own open / close request is still travelling through the game: do not let the
    // lagging game state flip us back (that flapping reset the analog over and over).
    if (performance.now() < this.menuIntentUntil) return;

    this.setMenuOpen(open);
  }

  /** Drop every held key / pointer and every visual "pressed" state. */
  private hardReset(): void {
    this.releaseAll();

    this.root
      ?.querySelectorAll(".vkm-on")
      .forEach((el) => el.classList.remove("vkm-on"));

    this.attachRoot();
    this.applyVars();
  }

  // ==========================================================
  // STATE
  // ==========================================================

  private get active(): boolean {
    return (
      this.enabled &&
      this.playing &&
      !this.paused &&
      !this.destroyed &&
      !this.input.chatOpen
    );
  }

  private startPlay(): void {
    if (this.playing) return;

    this.playing = true;
    this.paused = false;

    document.getElementById("blocker")?.classList.add("hidden");

    this.input.setTouchLock(true);
    this.syncState();
  }

  /**
   * Chat / menu opened or closed (by our buttons, the game, or the keyboard): every transition
   * starts from a clean slate, so no stale pointer, key or "pressed" look survives into the next
   * state and the analog never follows a dead finger. Also called right before a touch is
   * handled, so a transition the 150 ms timer has not seen yet can never wipe a fresh touch.
   */
  private syncTransition(): void {
    const nowActive = this.active;

    if (nowActive === this.wasActive) return;

    this.wasActive = nowActive;

    this.releaseAll();

    this.root
      ?.querySelectorAll(".vkm-on")
      .forEach((el) => el.classList.remove("vkm-on"));
  }

  private syncState(): void {
    if (this.customOverlay && this.root) {
      this.root.style.setProperty("display", "block", "important");
      this.root.dataset.active = "true";
      return;
    }
    const root = this.root;
    if (!root) return;

    root.classList.toggle("vkm-off", !this.enabled);
    root.classList.toggle("vkm-idle", !this.playing);
    root.classList.toggle("vkm-paused", this.playing && this.paused);
    root.classList.toggle("vkm-collapsed", this.collapsed);
    root.classList.toggle("vkm-chat", this.input.chatOpen);

    this.syncTransition();

    if (this.input.chatOpen) this.positionSend();

    // The game may bring "Click to Play" back after the menu closes: it would swallow every touch
    if (this.playing && !this.paused) {
      document.getElementById("blocker")?.classList.add("hidden");
    }

    // Controls shown / hidden -> HUD under them hides / comes back right away
    const sig = [
      this.enabled,
      this.playing,
      this.paused,
      this.collapsed,
      this.input.chatOpen,
    ].join();

    if (sig !== this.stateSig) {
      this.stateSig = sig;
      this.scanHud();
    }
  }

  // ==========================================================
  // HUD UNDER THE CONTROLS
  // ==========================================================

  private clearHud(): void {
    for (const el of this.hudHidden) el.classList.remove("vkm-under");
    this.hudHidden.clear();
  }

  /**
   * Hide HUD widgets that are (mostly) covered by an on-screen button, so the game HUD
   * does not show through / clutter behind the controls. Big containers are walked into,
   * small widgets are hidden whole when >= 25% of them is covered.
   */
  private scanHud(): void {
    const root = this.root;

    if (!root) return;

    if (!this.hideHudUnderControls) {
      this.clearHud();
      return;
    }

    const hudRoot = document.querySelector(this.hudSelector);
    const showing =
      this.enabled &&
      this.playing &&
      !this.paused &&
      !this.collapsed &&
      !this.input.chatOpen;

    if (!hudRoot || !showing) {
      this.clearHud();
      return;
    }

    const rects: DOMRect[] = [];

    root.querySelectorAll(".vkm-btn").forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push(r);
    });

    const W = window.innerWidth;
    const H = window.innerHeight;
    const pad = 4;
    const next = new Set<Element>();

    const visit = (el: Element, depth: number): void => {
      if (depth > 6 || el.hasAttribute("data-vkm-keep")) return;

      const r = el.getBoundingClientRect();
      const kids = () => {
        for (const c of Array.from(el.children)) visit(c, depth + 1);
      };

      // zero-size wrapper (position:fixed children) or a big layout container: look inside
      if (r.width < 1 || r.height < 1 || r.width >= W * 0.6 || r.height >= H * 0.6) {
        kids();
        return;
      }

      let covered = 0;

      for (const b of rects) {
        const w = Math.min(r.right, b.right + pad) - Math.max(r.left, b.left - pad);
        const h = Math.min(r.bottom, b.bottom + pad) - Math.max(r.top, b.top - pad);
        if (w > 0 && h > 0) covered += w * h;
      }

      if (covered / (r.width * r.height) >= 0.25) {
        next.add(el);
      } else if (covered > 0) {
        kids(); // partly covered container: only hide the child widgets that are covered
      }
    };

    for (const c of Array.from(hudRoot.children)) visit(c, 0);

    for (const el of this.hudHidden) {
      if (!next.has(el)) el.classList.remove("vkm-under");
    }

    for (const el of next) el.classList.add("vkm-under");

    this.hudHidden = next;
  }

  private applyVars(): void {
    if (!this.root) return;

    const size = this.joystickSize * this.uiScale;

    this.root.style.setProperty("--vkm-s", String(this.uiScale));
    this.root.style.setProperty("--vkm-o", String(this.opacity));
    this.root.style.setProperty("--vkm-size", `${size}px`);
  }

  private buzz(): void {
    if (!this.haptics) return;

    try {
      navigator.vibrate?.(8);
    } catch {
      // not supported
    }
  }

  /** KeyboardEvent that also carries keyCode / which (many handlers still read them). */
  private makeKeyEvent(type: string, code: string): KeyboardEvent {
    const letter = /^Key([A-Z])$/.exec(code)?.[1];
    const digit = /^Digit([0-9])$/.exec(code)?.[1];
    const keyCode =
      code === "Escape" ? 27 : code === "Enter" ? 13 : letter ? letter.charCodeAt(0) : digit ? 48 + Number(digit) : 0;

    const ev = new KeyboardEvent(type, {
      code,
      key: letter ? letter.toLowerCase() : digit ?? code,
      bubbles: true,
      cancelable: true,
    });

    for (const prop of ["keyCode", "which", "charCode"] as const) {
      try {
        Object.defineProperty(ev, prop, {
          get: () => (prop === "charCode" && type !== "keypress" ? 0 : keyCode),
        });
      } catch {
        // ignore
      }
    }

    return ev;
  }

  /** Synthetic key for the game's own keydown listeners (Esc, Enter). */
  private tapKeyEvent(code: string, target: EventTarget = document.body, holdMs = 30): void {
    target.dispatchEvent(this.makeKeyEvent("keydown", code));

    if (code === "Enter") {
      target.dispatchEvent(this.makeKeyEvent("keypress", code));
    }

    window.setTimeout(
      () => target.dispatchEvent(this.makeKeyEvent("keyup", code)),
      holdMs,
    );
  }

  // ==========================================================
  // STYLE
  // ==========================================================

  private createStyle(): void {
    this.style = document.createElement("style");

    this.style.textContent = `
      .vkm-fire {
        position: fixed !important;
        border: 2.5px solid rgba(255, 215, 70, 0.72) !important;
        background: rgba(255, 255, 255, 0.06) !important;
        box-shadow: inset 0 0 14px rgba(255, 200, 50, 0.22) !important;
        overflow: visible !important;
      }
      .vkm-fire .vkm-fire-knob {
        position: absolute;
        inset: 14%;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, rgba(255, 230, 120, 0.45), rgba(255, 175, 30, 0.25));
        border: 1.5px solid rgba(255, 235, 150, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        transition: transform 0.08s ease-out;
        will-change: transform;
      }
      .vkm-fire.vkm-on .vkm-fire-knob {
        transition: none;
        background: radial-gradient(circle at 35% 35%, rgba(255, 220, 90, 0.75), rgba(255, 140, 20, 0.5));
      }
      .vkm-fire-left {
        position: fixed !important;
        left: calc(var(--vkm-l) + 118px * var(--vkm-s)) !important;
        bottom: calc(var(--vkm-b) + 132px * var(--vkm-s)) !important;
        width: calc(54px * var(--vkm-s)) !important;
        height: calc(54px * var(--vkm-s)) !important;
        border-radius: 50% !important;
      }
      .vkm-gloowall {
        position: fixed !important;
        left: calc(var(--vkm-l) + 18px * var(--vkm-s)) !important;
        bottom: calc(var(--vkm-b) + 166px * var(--vkm-s)) !important;
        width: calc(56px * var(--vkm-s)) !important;
        height: calc(56px * var(--vkm-s)) !important;
        border-radius: 50% !important;
        border: 2px solid rgba(88, 199, 255, 0.78) !important;
        background: radial-gradient(circle at 35% 35%, rgba(88, 199, 255, 0.34), rgba(22, 104, 184, 0.28)) !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 1px !important;
      }
      .vkm-gloowall.vkm-empty {
        opacity: 0.5 !important;
        border-color: rgba(180, 210, 230, 0.4) !important;
      }
      .vkm-gloowall.vkm-gw-preview {
        border-color: #fde047 !important;
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.95), inset 0 0 10px rgba(253, 224, 71, 0.45) !important;
        transform: scale(1.06);
      }
      .vkm-gw-ring {
        position: absolute;
        inset: -3px;
        border-radius: 50%;
        padding: 3px;
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
      }
      .vkm-root.vkm-custom-mode {
  display: block !important; position: fixed !important; inset: 0 !important; z-index: 99990 !important; pointer-events: auto !important;
  background: radial-gradient(circle at 50% 45%, rgba(14, 42, 71, 0.78), rgba(5, 9, 16, 0.95)), repeating-linear-gradient(0deg, rgba(56, 189, 248, 0.06) 0 1px, transparent 1px 36px), repeating-linear-gradient(90deg, rgba(56, 189, 248, 0.06) 0 1px, transparent 1px 36px) !important;
}
.vkm-custom-mode .vkm-hud, .vkm-custom-mode .vkm-joy, .vkm-custom-mode .vkm-top, .vkm-custom-mode .vkm-row, .vkm-custom-mode .vkm-btn {
    display: flex !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;
  }
  .vkm-custom-mode .vkm-hud, .vkm-custom-mode .vkm-joy { display: block !important; }
.vkm-custom-mode [data-vkm-id] { pointer-events: auto !important; outline: 1.5px dashed rgba(125, 211, 252, 0.95) !important; touch-action: none !important; cursor: grab !important; }
.vkm-custom-mode [data-vkm-id].vkm-selected { outline: 2.5px solid #fde047 !important; box-shadow: 0 0 18px rgba(253, 224, 71, 0.85) !important; z-index: 99995 !important; }
.vkm-custom-panel { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 99999; width: min(95vw, 470px); background: rgba(9, 16, 28, 0.97); border: 1.5px solid #38bdf8; border-radius: 12px; padding: 10px 12px; color: #e2e8f0; font: 600 12px/1.3 system-ui, sans-serif; box-shadow: 0 12px 34px rgba(0, 0, 0, 0.78); display: flex; flex-direction: column; gap: 8px; pointer-events: auto; }
.vkm-custom-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.vkm-custom-panel button { border: 1px solid rgba(148, 163, 184, 0.45); background: #1e293b; color: #f8fafc; border-radius: 7px; padding: 6px 10px; font: 700 11px/1 system-ui, sans-serif; cursor: pointer; }
.vkm-custom-panel button.vkm-save { background: #0284c7; border-color: #38bdf8; }
.vkm-root {
        --vkm-s: 1;
        --vkm-o: .8;
        --vkm-size: 135px;
        --vkm-l: max(18px, env(safe-area-inset-left));
        --vkm-r: max(18px, env(safe-area-inset-right));
        --vkm-t: max(10px, env(safe-area-inset-top));
        --vkm-b: max(14px, env(safe-area-inset-bottom));
        --vkm-accent: #22d3ee;
        --vkm-fire: #fb4a3a;

        position: fixed;
        inset: 0;
        z-index: 9999;
        overflow: hidden;
        /* Transparent to touches: everything under the controls keeps working. */
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #fff;
      }

      /* Popover (top layer) resets: the UA centres / pads / borders popovers */
      .vkm-root[popover] {
        position: fixed;
        inset: 0;
        margin: 0;
        padding: 0;
        border: 0;
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        background: transparent;
        overflow: hidden;
        color: #fff;
      }

      .vkm-root * {
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
      }

      .vkm-root.vkm-off { display: none; }

      /* Chat open: every control goes away (nothing can steal the keyboard's touches),
         only the Send button stays. The root itself never takes touches. */
      .vkm-root.vkm-chat .vkm-hud,
      .vkm-root.vkm-chat .vkm-ghost,
      .vkm-root.vkm-chat .vkm-joy,
      .vkm-root.vkm-chat .vkm-rotate { display: none; }

      /* Before "Click to Play": nothing but the page itself */
      .vkm-root.vkm-idle .vkm-hud,
      .vkm-root.vkm-idle .vkm-ghost { display: none; }

      /* Game HUD widgets covered by the controls (class added to elements outside the root) */
      .vkm-under {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      /* ---------- Buttons ---------- */
      .vkm-btn {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        padding: 0;
        margin: 0;
        color: #e8f7ff;
        font: 800 calc(11px * var(--vkm-s)) / 1 system-ui, sans-serif;
        letter-spacing: .04em;
        background:
          linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,0) 45%),
          rgba(10, 16, 28, .62);
        border: 1.5px solid rgba(255,255,255,.22);
        border-radius: 16px;
        box-shadow:
          0 6px 18px rgba(0,0,0,.35),
          inset 0 0 0 1px rgba(34,211,238,.10);
        opacity: var(--vkm-o);
        pointer-events: auto;
        touch-action: none;
        cursor: pointer;
        transition: transform .08s ease, background .08s ease,
                    border-color .08s ease, box-shadow .08s ease, opacity .08s ease;
      }

      .vkm-btn:focus { outline: none; }

      .vkm-btn svg {
        width: 56%;
        height: 56%;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events: none;
      }

      /* icon-only small buttons: bigger glyph + slot number badge */
      .vkm-num svg { width: 58%; height: 58%; stroke-width: 2; }
      .vkm-badge {
        position: absolute;
        left: 4px;
        top: 2px;
        font-size: calc(8px * var(--vkm-s));
        font-weight: 800;
        line-height: 1;
        opacity: .85;
        pointer-events: none;
      }
      .vkm-slotnum { font-size: calc(14px * var(--vkm-s)); }

      .vkm-btn.vkm-on {
        opacity: 1;
        transform: scale(.9);
        border-color: var(--vkm-accent);
        background:
          linear-gradient(160deg, rgba(34,211,238,.55), rgba(34,211,238,.18)),
          rgba(8, 40, 56, .85);
        box-shadow: 0 0 18px rgba(34,211,238,.65), inset 0 0 12px rgba(34,211,238,.35);
      }

      .vkm-round { border-radius: 50%; }

      .vkm-fire {
        color: #fff;
        border-color: rgba(255,255,255,.55);
        background:
          radial-gradient(circle at 35% 30%, rgba(255,160,140,.55), rgba(255,255,255,0) 55%),
          linear-gradient(160deg, #ff6a55, #c4281b);
        box-shadow: 0 8px 26px rgba(251,74,58,.45), inset 0 0 14px rgba(255,255,255,.18);
      }
      .vkm-fire.vkm-on {
        border-color: #fff;
        background: linear-gradient(160deg, #ff8a78, #e0301f);
        box-shadow: 0 0 30px rgba(251,74,58,.9), inset 0 0 16px rgba(255,255,255,.35);
      }

      .vkm-num {
        font-size: calc(13px * var(--vkm-s));
        border-radius: 10px;
      }

      /* ---------- Chat send button ---------- */
      .vkm-send {
        position: absolute;
        left: 0;
        top: 0;
        display: none;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        margin: 0;
        color: #fff;
        border: 1.5px solid rgba(255,255,255,.55);
        border-radius: 50%;
        background: linear-gradient(160deg, #35d9f2, #0b8fb0);
        box-shadow: 0 6px 18px rgba(0,0,0,.4), 0 0 14px rgba(34,211,238,.45);
        pointer-events: auto;
        touch-action: none;
        cursor: pointer;
        z-index: 8;
      }
      .vkm-send:focus { outline: none; }
      .vkm-send svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events: none;
      }
      .vkm-send.vkm-on { transform: scale(.92); filter: brightness(1.15); }
      .vkm-root.vkm-chat .vkm-send { display: flex; }
      .vkm-root.vkm-idle .vkm-send { display: none; }

      /* ---------- Top bars ---------- */
      .vkm-top {
        position: absolute;
        top: var(--vkm-t);
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: calc(6px * var(--vkm-s));
        pointer-events: none;
        z-index: 4;
      }
      .vkm-top .vkm-btn {
        position: relative;
        width: calc(36px * var(--vkm-s));
        height: calc(32px * var(--vkm-s));
        border-radius: 10px;
      }

      .vkm-row {
        position: absolute;
        display: flex;
        gap: calc(6px * var(--vkm-s));
        pointer-events: none;
      }
      .vkm-row .vkm-btn {
        position: relative;
        width: calc(36px * var(--vkm-s));
        height: calc(36px * var(--vkm-s));
        border-radius: 10px;
      }
      .vkm-util  { left: var(--vkm-l); top: calc(var(--vkm-t) + 4px); }
      .vkm-weap  { right: var(--vkm-r); top: var(--vkm-t); }
      /* Menu radio: [RADIO] -> Z X C -> nomor pilihan */
      .vkm-radio .vkm-radio-grp { display: none; }
      .vkm-radio.vkm-open .vkm-radio-grp { display: flex; }
      .vkm-radio-menu[aria-pressed="true"] { border-color: var(--vkm-accent); }
      .vkm-radio-nums {
        position: absolute;
        left: var(--vkm-l);
        top: calc(var(--vkm-t) + 4px + 44px * var(--vkm-s));
        display: none;
        grid-template-columns: repeat(5, calc(36px * var(--vkm-s)));
        gap: calc(6px * var(--vkm-s));
        pointer-events: none;
      }
      .vkm-radio-nums.vkm-open { display: grid; }
      .vkm-radio-nums .vkm-btn {
        position: relative;
        width: calc(36px * var(--vkm-s));
        height: calc(36px * var(--vkm-s));
        border-radius: 10px;
      }
      .vkm-above-joy {
        left: calc(var(--vkm-l) + var(--vkm-size) / 2);
        bottom: calc(var(--vkm-b) + var(--vkm-size) + 10px * var(--vkm-s));
        transform: translateX(-50%);
        gap: calc(10px * var(--vkm-s));
      }
      .vkm-above-joy .vkm-btn {
        width: calc(44px * var(--vkm-s));
        height: calc(44px * var(--vkm-s));
        border-radius: 50%;
      }
      .vkm-weap .vkm-btn {
        width: calc(34px * var(--vkm-s));
        height: calc(34px * var(--vkm-s));
      }

      .vkm-k { font-size: calc(13px * var(--vkm-s)); font-weight: 800; pointer-events: none; }

      /* ---------- Joystick ---------- */
      .vkm-ghost,
      .vkm-joy {
        position: absolute;
        width: var(--vkm-size);
        height: var(--vkm-size);
        border-radius: 50%;
        pointer-events: none;
        border: 2px solid rgba(255,255,255,.22);
        background: radial-gradient(circle, rgba(34,211,238,.10), rgba(10,16,28,.40) 72%);
        box-shadow: 0 8px 28px rgba(0,0,0,.35), inset 0 0 22px rgba(34,211,238,.12);
      }
      .vkm-ghost {
        left: var(--vkm-l);
        bottom: var(--vkm-b);
        opacity: var(--vkm-o);
        /* the fixed base owns its touch (like a button): no document-level guessing */
        pointer-events: auto;
        touch-action: none;
      }
      /* larger invisible grab area around the base */
      .vkm-ghost::before {
        content: "";
        position: absolute;
        inset: -20%;
        border-radius: 50%;
      }
      .vkm-ghost.vkm-show {
        border-color: var(--vkm-accent);
        box-shadow: 0 8px 28px rgba(0,0,0,.35), 0 0 18px rgba(34,211,238,.45),
                    inset 0 0 22px rgba(34,211,238,.25);
      }
      .vkm-ghost::after,
      .vkm-joy::after {
        content: "";
        position: absolute;
        inset: 22%;
        border-radius: 50%;
        border: 1px dashed rgba(255,255,255,.20);
      }
      .vkm-joy {
        display: none;
        left: 0;
        top: 0;
        opacity: var(--vkm-o);
        will-change: transform;
      }
      .vkm-joy.vkm-show { display: block; }

      .vkm-stick {
        position: absolute;
        left: 29%;
        top: 29%;
        width: 42%;
        height: 42%;
        border-radius: 50%;
        background:
          radial-gradient(circle at 35% 30%, #fff, rgba(190,235,255,.75) 55%, rgba(34,211,238,.6));
        border: 2px solid rgba(255,255,255,.9);
        box-shadow: 0 0 16px rgba(34,211,238,.55), 0 4px 10px rgba(0,0,0,.4);
        will-change: transform;
      }

      /* ---------- ESC menu open: only the MENU button stays ---------- */
      .vkm-root.vkm-paused .vkm-hud > :not(.vkm-top),
      .vkm-root.vkm-paused .vkm-ghost,
      .vkm-root.vkm-paused .vkm-top .vkm-btn:not(.vkm-menu-btn) { display: none; }
      .vkm-root.vkm-paused .vkm-menu-btn {
        opacity: 1;
        border-color: var(--vkm-accent);
        box-shadow: 0 0 16px rgba(34,211,238,.6);
      }

      /* ---------- Collapsed (setCollapsed API) ---------- */
      .vkm-root.vkm-collapsed .vkm-hud > :not(.vkm-top) { display: none; }
      .vkm-root.vkm-collapsed .vkm-top .vkm-btn:not(.vkm-keep) { display: none; }

      /* ---------- Portrait hint (never blocks touches) ---------- */
      .vkm-rotate { display: none; }
      @media (orientation: portrait) {
        .vkm-rotate {
          display: block;
          position: absolute;
          left: 50%;
          top: calc(var(--vkm-t) + 48px);
          transform: translateX(-50%);
          padding: 8px 14px;
          font: 700 12px system-ui, sans-serif;
          text-align: center;
          color: #fff;
          background: rgba(10,16,28,.85);
          border: 1px solid rgba(34,211,238,.5);
          border-radius: 999px;
          pointer-events: none;
          white-space: nowrap;
        }
        .vkm-root.vkm-idle .vkm-rotate { display: none; }
      }
    `;

    document.head.appendChild(this.style);
  }

  // ==========================================================
  // UI
  // ==========================================================

  private createUI(): void {
    const root = document.createElement("div");
    // `pb-virtual-controls`: main.ts ignores clicks coming from this class (no pointer lock request)
    root.className = "vkm-root pb-virtual-controls vkm-idle";
    this.root = root;

    // Joystick ghost (hint) + dynamic base
    this.ghost = document.createElement("div");
    this.ghost.className = "vkm-ghost";
    this.ghost.dataset.vkmId = "analog-joystick";
    this.ghost.dataset.vkmLabel = "Analog";
    root.appendChild(this.ghost);

    // Fixed joystick: the base never moves, the stick lives inside it.
    this.joy = this.ghost;
    this.stick = document.createElement("div");
    this.stick.className = "vkm-stick";
    this.ghost.appendChild(this.stick);
    this.bindJoystick(this.ghost);

    // Everything else lives in the HUD group
    this.hud = document.createElement("div");
    this.hud.className = "vkm-hud";
    root.appendChild(this.hud);

    this.createTopBar();

    if (this.showControls) {
      this.createUtilityButtons();
      this.createWeaponButtons();
      this.createActionButtons();
    }

    this.createSendButton();

    const rotate = document.createElement("div");
    rotate.className = "vkm-rotate";
    rotate.textContent = "Putar ke landscape untuk bermain";
    root.appendChild(rotate);

    this.attachRoot();
  }

  /**
   * Keep the controls on top of the page, also in fullscreen.
   *
   * The root always lives in <body> and is shown as a manual popover: that puts it in the
   * browser TOP LAYER, positioned against the viewport, above ANY fullscreen element
   * (<html>, <body>, #app, a canvas...) and unaffected by transforms / overflow / contain of
   * the page. Re-parenting into the fullscreen element (what this used to do) broke the
   * positions and the touch mapping whenever that element was transformed, sized differently
   * from the viewport, or could not hold children (canvas).
   *
   * Browsers without the Popover API fall back to re-parenting, only into containers that
   * can hold children.
   */
  private attachRoot(force = false): void {
    const root = this.root as PopoverElement | null;
    if (!root) return;

    if (root.parentElement !== document.body) {
      document.body.appendChild(root);
    }

    if (typeof root.showPopover === "function") {
      root.setAttribute("popover", "manual");

      // Already on top: leave it alone (hide + show would cancel the touch in progress)
      if (!force && root.matches(":popover-open")) return;

      try {
        // show again so the root is the LAST element of the top layer (above a new fullscreen)
        if (root.matches(":popover-open")) root.hidePopover?.();
        root.showPopover();
        return;
      } catch {
        // fall through to the re-parent fallback
      }
    }

    const fs = document.fullscreenElement;

    if (
      fs instanceof HTMLElement &&
      fs !== document.documentElement &&
      fs !== document.body &&
      !fs.matches("canvas, video, img, iframe, embed, object") &&
      root.parentElement !== fs
    ) {
      fs.appendChild(root);
    }
  }

  private createTopBar(): void {
    const bar = document.createElement("div");
    bar.className = "vkm-top";

    this.makeButton(bar, {
      label: "Menu",
      html: ICON.menu,
      className: "vkm-keep vkm-menu-btn",
      always: true,
      onTap: () => this.toggleMenu(),
    });

    this.makeButton(bar, {
      label: "Scoreboard",
      html: ICON.score,
      key: this.keys.scoreboard,
      hold: true,
    });

    this.makeButton(bar, {
      label: "Chat",
      html: ICON.chat,
      onTap: () => this.tapKeyEvent("Enter"),
    });
    this.makeButton(bar, {
      label: "Kamera 3PV/1PV",
      html: "<span style=\"font:700 11px/1 sans-serif;letter-spacing:.5px\">CAM</span>",
      onTap: () => this.tapKeyEvent("KeyV"),
    });

    this.hud!.appendChild(bar);
  }

  private createUtilityButtons(): void {
    const row = document.createElement("div");
    row.className = "vkm-row vkm-util";

    const items: Array<[html: string, key: string, label: string]> = [
      [ICON.drop, this.keys.drop, "Buang senjata"],
    ];

    for (const [html, key, label] of items) {
      this.makeButton(row, { label, html, key, className: "vkm-num" });
    }

    // T: ganti senjata. Game membacanya dari event keyboard (sama seperti di desktop),
    // jadi dikirim sebagai keydown + keyup sungguhan, bukan virtual key.
    this.makeButton(row, {
      label: "Ganti senjata",
      html: ICON.weaponMenu,
      className: "vkm-num",
      onTap: () => this.tapKeyEvent(this.keys.dualWeapon, document.body, TAP_MS),
    });

    // Menu radio ada di baris yang sama: G · T · RADIO · (Z X C)
    this.createRadioButtons(row);

    this.hud!.appendChild(row);
  }

  private createWeaponButtons(): void {
    const row = document.createElement("div");
    row.className = "vkm-row vkm-weap";

    PB_KEYS.slots.forEach((code, index) => {
      this.makeButton(row, {
        label: `Senjata ${index + 1}`,
        html: SLOT_ICONS[index]
          ? `${SLOT_ICONS[index]}<span class="vkm-badge">${index + 1}</span>`
          : String(index + 1),
        key: code,
        className: SLOT_ICONS[index] ? "vkm-num" : "vkm-num vkm-slotnum",
      });
    });

    this.hud!.appendChild(row);
  }

  /** Menekan satu key sekali (tap), lewat mode RADIO_KEY_MODE. */
  private pressKey(code: string): void {
    if (RADIO_KEY_MODE === "event") {
      this.tapKeyEvent(code, document.body, TAP_MS);
      return;
    }

    this.input.setVirtualKey(code, true);

    const release = () => {
      window.clearTimeout(timer);
      this.releasers.delete(release);
      this.input.setVirtualKey(code, false);
    };
    const timer = window.setTimeout(release, TAP_MS);
    this.releasers.add(release);
  }

  /**
   * Menu radio: [RADIO] -> tampil Z / X / C -> menu radio game terbuka -> tampil nomor pilihan
   * grup itu (Z: 1-8,0 · X: 1-8,0 · C: 1-9,0) -> pilih nomor -> tutup.
   */
  private createRadioButtons(row: HTMLDivElement): void {
    row.classList.add("vkm-radio");
    this.radioRow = row;

    this.makeButton(row, {
      label: "Menu radio",
      html: ICON.radioMenu,
      className: "vkm-num vkm-radio-menu",
      onTap: () => this.toggleRadioUi(),
    });

    PB_KEYS.radio.forEach((code, index) => {
      this.makeButton(row, {
        label: `Radio ${keyLabel(code)}`,
        html: RADIO_ICONS[index] ?? ICON.radioMenu,
        className: "vkm-num vkm-radio-grp",
        onTap: () => this.openRadioGroup(index, code),
      });
    });

    const nums = document.createElement("div");
    nums.className = "vkm-radio-nums";
    this.radioNums = nums;

    this.hud!.appendChild(nums);
  }

  private toggleRadioUi(): void {
    if (this.radioRow?.classList.contains("vkm-open") || this.radioNums?.classList.contains("vkm-open")) {
      this.closeRadioUi();
      return;
    }

    this.radioRow?.classList.add("vkm-open");
    this.radioRow?.querySelector(".vkm-radio-menu")?.setAttribute("aria-pressed", "true");
    this.armRadioTimer();
  }

  private openRadioGroup(index: number, code: string): void {
    const nums = this.radioNums;

    if (!nums) return;

    this.pressKey(code);

    nums.textContent = "";

    for (const n of RADIO_OPTIONS[index] ?? RADIO_OPTIONS[0]) {
      this.makeButton(nums, {
        label: `Radio ${keyLabel(code)} ${n}`,
        html: `<span class="vkm-k">${n}</span>`,
        className: "vkm-num",
        onTap: () => {
          this.pressKey(`Digit${n}`);
          this.closeRadioUi();
        },
      });
    }

    this.radioRow?.classList.remove("vkm-open");
    nums.classList.add("vkm-open");
    this.armRadioTimer();
  }

  private armRadioTimer(): void {
    window.clearTimeout(this.radioTimer);
    this.radioTimer = window.setTimeout(() => this.closeRadioUi(), RADIO_UI_TIMEOUT_MS);
  }

  private closeRadioUi(): void {
    window.clearTimeout(this.radioTimer);

    this.radioRow?.classList.remove("vkm-open");
    this.radioRow?.querySelector(".vkm-radio-menu")?.setAttribute("aria-pressed", "false");
    this.radioNums?.classList.remove("vkm-open");
  }

  private createActionButtons(): void {
    const hud = this.hud!;

    this.makeButton(hud, {
      label: "Tembak",
      html: `<span class="vkm-fire-knob">${ICON.fire}</span>`,
      className: "vkm-round vkm-fire",
      mouse: 0,
      hold: true,
      look: true,
      br: { x: 0, y: 0, size: BTN.large },
    });

    this.makeButton(hud, {
      label: "Tembak Kiri",
      html: ICON.fire,
      className: "vkm-round vkm-fire-left",
      mouse: 0,
      hold: true,
      look: false,
    });

    this.makeButton(hud, {
      label: "Glowal",
      html: `<span class="vkm-gw-ring"></span><svg viewBox="0 0 32 24" width="24" height="18" fill="none" stroke="#aee8ff" stroke-width="1.8" stroke-linejoin="round"><path d="M2 7.5 L8.5 5.2 L8.5 18.8 L2 20.5 Z" fill="rgba(88,199,255,0.38)"/><path d="M9.8 4.6 L22.2 4.6 L22.2 18.4 L9.8 18.4 Z" fill="rgba(88,199,255,0.52)"/><path d="M23.5 5.2 L30 7.5 L30 20.5 L23.5 18.8 Z" fill="rgba(88,199,255,0.38)"/></svg><span class="vkm-gw-count" style="font:700 9px/1 sans-serif;color:#e4f7ff;text-shadow:0 1px 2px #000">2 · 30s</span>`,
      className: "vkm-round vkm-gloowall",
      onTap: () => this.tapKeyEvent("CapsLock"),
    });

    this.makeButton(hud, {
      label: "Bidik",
      html: ICON.aim,
      className: "vkm-round",
      mouse: 2,
      hold: true,
      look: true,
      br: { x: 108, y: 8, size: BTN.normal },
    });

    this.makeButton(hud, {
      label: "Lompat",
      html: ICON.jump,
      className: "vkm-round",
      key: this.keys.jump,
      br: { x: 14, y: 242, size: BTN.normal },
    });

    this.makeButton(hud, {
      label: "Jongkok",
      html: ICON.crouch,
      className: "vkm-round",
      key: this.keys.crouch,
      hold: true,
      br: { x: 14, y: 182, size: BTN.normal },
    });

    // Q (last weapon): bottom of the left column, below CROUCH
    this.makeButton(hud, {
      label: "Senjata terakhir",
      html: ICON.swap,
      className: "vkm-round",
      key: this.keys.lastWeapon,
      br: { x: 10, y: 108, size: BTN.medium },
    });

    this.makeButton(hud, {
      label: "Reload",
      html: ICON.reload,
      className: "vkm-round",
      key: this.keys.reload,
      br: { x: 112, y: 76, size: BTN.normal },
    });

    this.makeButton(hud, {
      label: "Aksi",
      html: ICON.action,
      className: "vkm-round",
      key: this.keys.action,
      hold: true,
      br: { x: 84, y: 146, size: BTN.normal },
    });

    // F (extension2 / Dual) dan B (extension / Laser): satu baris sejajar, tepat di atas analog
    const joyKeys = document.createElement("div");
    joyKeys.className = "vkm-row vkm-above-joy";

    this.makeButton(joyKeys, {
      label: "Dual",
      html: ICON.dual,
      className: "vkm-round",
      key: this.keys.extension2,
    });

    this.makeButton(joyKeys, {
      label: "Laser",
      html: ICON.laser,
      className: "vkm-round",
      key: this.keys.extension,
    });

    hud.appendChild(joyKeys);

    this.makeButton(hud, {
      label: "Jalan pelan",
      html: ICON.walk,
      className: "vkm-round",
      key: this.keys.walk,
      hold: true,
      br: { x: 172, y: 22, size: BTN.normal },
    });
  }

  // ==========================================================
  // BUTTON FACTORY
  // ==========================================================

  private makeButton(
    parent: HTMLElement,
    cfg: ButtonConfig,
  ): HTMLButtonElement {
    const hudId = cfg.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const button = document.createElement("button");
    button.dataset.vkmId = hudId;
    button.dataset.vkmLabel = cfg.label;

    button.type = "button";
    button.className = `vkm-btn ${cfg.className ?? ""}`;
    button.innerHTML = cfg.html;
    button.setAttribute("aria-label", cfg.label);

    if (cfg.br) {
      const { x, y, size } = cfg.br;
      const s = "var(--vkm-s)";

      button.style.right = `calc(var(--vkm-r) + ${x}px * ${s})`;
      button.style.bottom = `calc(var(--vkm-b) + ${y}px * ${s})`;
      button.style.width = `calc(${size}px * ${s})`;
      button.style.height = `calc(${size}px * ${s})`;
    }

    let pid: number | null = null;
    let startPos = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    let timer = 0;
    let downAt = 0;
    const isFireRing = (cfg.className ?? "").includes("vkm-fire") && !(cfg.className ?? "").includes("vkm-fire-left");
    const getKnob = () => button.querySelector(".vkm-fire-knob") as HTMLElement | null;

    const setDown = (down: boolean) => {
      if (cfg.key) this.input.setVirtualKey(cfg.key, down);
      if (cfg.mouse !== undefined) this.input.setVirtualButton(cfg.mouse, down);
    };

    const finish = () => {
      window.clearTimeout(timer);
      this.releasers.delete(finish);

      pid = null;
      setDown(false);
      button.classList.remove("vkm-on");
      const knob = getKnob();
      if (knob) knob.style.transform = "translate3d(0px, 0px, 0px)";
    };

    button.addEventListener("pointerdown", (e) => {
      if (pid !== null) return;

      this.syncTransition();

      const allowed = cfg.always
        ? this.enabled && this.playing && !this.input.chatOpen
        : this.active;

      if (!allowed) return;

      e.preventDefault();
      e.stopPropagation();

      pid = e.pointerId;
      downAt = performance.now();
      startPos = { x: e.clientX, y: e.clientY };
      last = { x: e.clientX, y: e.clientY };

      try {
        button.setPointerCapture(e.pointerId);
      } catch {
        // optional
      }

      button.classList.add("vkm-on");
      this.buzz();

      cfg.onTap?.();
      setDown(true);

      if (cfg.hold) {
        this.releasers.add(finish);
      } else {
        // Short tap: key stays down a few ms so both held() and pressed() style reads see it.
        this.releasers.add(finish);
        timer = window.setTimeout(finish, TAP_MS);
      }
    });

    button.addEventListener("pointermove", (e) => {
      if (!cfg.look || e.pointerId !== pid || !this.active) return;
      e.preventDefault();
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      if (isFireRing) {
        const knob = getKnob();
        if (knob) {
          const maxR = Math.max(20, button.clientWidth * 0.34);
          let ox = e.clientX - startPos.x;
          let oy = e.clientY - startPos.y;
          const dist = Math.hypot(ox, oy);
          if (dist > maxR) {
            ox = (ox / dist) * maxR;
            oy = (oy / dist) * maxR;
          }
          knob.style.transform = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0px)`;
        }
        // Boost vertikal drag-shot saat menggeser tombol tembak ke atas
        const dragBoostY = dy < 0 ? 1.65 : 1.15;
        this.addLook(dx * 1.15, dy * dragBoostY);
      } else {
        this.addLook(dx, dy);
      }
      last = { x: e.clientX, y: e.clientY };
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid || !cfg.hold) return;

      e.preventDefault();

      // a very short tap on a hold button still keeps the key down for TAP_MS
      const rest = TAP_MS - (performance.now() - downAt);
      if (rest > 0) timer = window.setTimeout(finish, rest);
      else finish();
    };

    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("lostpointercapture", end);

    parent.appendChild(button);

    return button;
  }

  // ==========================================================
  // GLOBAL (document-level) GESTURES: joystick + look
  // They never cover the page, so nothing underneath is blocked.
  // ==========================================================

  private bindGlobalEvents(): void {
    const signal = this.abort!.signal;

    document.documentElement.style.touchAction = "none";
    document.documentElement.style.overscrollBehavior = "none";

    // Capture: we only observe, never stop the event, so the page still gets its click.
    document.addEventListener("pointerdown", this.onPointerDown, {
      capture: true,
      signal,
    });
    document.addEventListener("pointermove", this.onPointerMove, { signal });
    document.addEventListener("pointerup", this.onPointerEnd, { signal });
    document.addEventListener("pointercancel", this.onPointerEnd, { signal });

    // "Click to Play" on touch: dismiss the blocker, start touch play.
    document.addEventListener(
      "click",
      (e) => {
        if (this.playing) return;

        const target = e.target as Element | null;

        if (target?.closest("#blocker .ov-play, #blocker")) {
          if (target.closest("#pbleave")) return; // Leave Match keeps its own handler
          this.startPlay();
        }
      },
      { signal },
    );

    window.addEventListener("blur", this.handleBlur, { signal });
    document.addEventListener("visibilitychange", this.handleVisibility, {
      signal,
    });
    window.addEventListener("orientationchange", () => this.onFullscreenChange(), {
      signal,
    });

    window.addEventListener(
      "resize",
      () => {
        // The on-screen keyboard / browser bars also fire resize: never cut a held joystick.
        if (this.joyPointer === null) this.resetJoystick();
        window.setTimeout(() => this.scanHud(), 200);
        this.positionSend();
      },
      { signal },
    );

    // Keep the Send button next to the chat field while the keyboard moves the viewport.
    window.visualViewport?.addEventListener("resize", () => this.positionSend(), {
      signal,
    });
    window.visualViewport?.addEventListener("scroll", () => this.positionSend(), {
      signal,
    });
    document.addEventListener("focusin", () => this.positionSend(), { signal });

    // Fullscreen: keep the controls in the top layer, above the fullscreen element.
    document.addEventListener(
      "fullscreenchange",
      () => this.onFullscreenChange(),
      { signal },
    );
  }

  /**
   * Entering / leaving fullscreen (and the rotation that usually comes with it) cancels the
   * touches in progress and resizes the viewport a moment later. Drop everything held, put the
   * controls back on top of the new top layer, then re-check once the new size has settled.
   */
  private onFullscreenChange(): void {
    this.hardReset();
    this.attachRoot(true);

    for (const delay of [120, 400]) {
      window.setTimeout(() => {
        if (this.destroyed) return;

        this.resetJoystick();
        this.attachRoot(true);
        this.applyVars();
        this.applySavedLayout();
        this.scanHud();
      }, delay);
    }
  }

  private isInteractive(start: Element | null): boolean {
    let el: Element | null = start;

    for (let depth = 0; el && depth < 8; depth++, el = el.parentElement) {
      if (el === document.body || el === document.documentElement) break;
      if (el.matches(INTERACTIVE)) return true;

      try {
        if (getComputedStyle(el).cursor === "pointer") return true;
      } catch {
        // ignore
      }
    }

    return false;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") return;

    this.syncTransition();

    // A primary touch means no other finger is down. Anything still tracked is stale
    // (a pointerup / pointercancel was lost while chat / menu / fullscreen swapped the UI),
    // so drop it now instead of leaving the analog or a button dead.
    if (e.isPrimary) {
      this.resetJoystick();
      this.lookPointers.clear();

      for (const release of [...this.releasers]) release();
    }

    if (!this.active) return;

    const target = e.target as Element | null;

    // Our own buttons handle themselves; real page UI (HUD buttons, menus…) keeps its touch.
    if (!target || this.root?.contains(target)) return;
    if (this.isInteractive(target)) return;

    const leftZone = e.clientX < window.innerWidth * 0.42;

    // Left side belongs to the fixed joystick base (it handles its own touch).
    if (!leftZone) {
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.lookPointers.get(e.pointerId);
    if (!prev || !this.active) return;

    this.addLook(e.clientX - prev.x, e.clientY - prev.y);

    prev.x = e.clientX;
    prev.y = e.clientY;
  };

  private onPointerEnd = (e: PointerEvent): void => {
    this.lookPointers.delete(e.pointerId);
  };

  private addLook(dx: number, dy: number): void {
    const scale = clamp(window.innerWidth / 900, 0.82, 1.25);

    this.input.addVirtualLook(
      dx * this.sensitivityX * scale,
      dy * this.sensitivityY * scale * (this.invertY ? -1 : 1),
    );
  }

  // ==========================================================
  // CHAT SEND BUTTON
  // ==========================================================

  private createSendButton(): void {
    const btn = document.createElement("button");

    btn.type = "button";
    btn.tabIndex = -1;
    btn.className = "vkm-send";
    btn.innerHTML = ICON.send;
    btn.setAttribute("aria-label", "Kirim chat");

    // Never let the tap steal focus from the chat field (that would close the keyboard / chat).
    const keepFocus = (e: Event) => e.preventDefault();

    btn.addEventListener("mousedown", keepFocus);
    btn.addEventListener("touchstart", keepFocus, { passive: false });

    let pid: number | null = null;

    btn.addEventListener("pointerdown", (e) => {
      if (pid !== null || !this.input.chatOpen) return;

      e.preventDefault();
      e.stopPropagation();

      pid = e.pointerId;
      btn.classList.add("vkm-on");
    });

    btn.addEventListener("pointerup", (e) => {
      if (e.pointerId !== pid) return;

      e.preventDefault();

      pid = null;
      btn.classList.remove("vkm-on");

      this.sendChat();
    });

    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;

      pid = null;
      btn.classList.remove("vkm-on");
    };

    btn.addEventListener("pointercancel", cancel);
    btn.addEventListener("pointerleave", cancel);

    this.sendBtn = btn;
    this.root!.appendChild(btn);
  }

  /** The chat text field: the focused field, else the first chat-looking one on the page. */
  private chatField(): HTMLInputElement | HTMLTextAreaElement | null {
    const a = document.activeElement;

    if (
      (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) &&
      !this.root?.contains(a)
    ) {
      return a;
    }

    return document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      '[id*="chat" i] input, [id*="chat" i] textarea, [class*="chat" i] input, [class*="chat" i] textarea',
    );
  }

  /** Same as pressing Enter in the chat field. */
  private sendChat(): void {
    if (!this.input.chatOpen || this.destroyed) return;

    this.buzz();

    const field = this.chatField();
    const before = field?.value ?? "";

    this.tapKeyEvent("Enter", field ?? document.body);

    // Fallback for a field the game submits through a <form> instead of a key handler:
    // only when the chat is still open and the text is untouched (so it cannot send twice).
    window.setTimeout(() => {
      if (this.destroyed || !this.input.chatOpen || !field) return;
      if (!before.trim() || field.value !== before) return;

      try {
        field.form?.requestSubmit();
      } catch {
        // ignore
      }
    }, 90);
  }

  /** Tombol Send di pojok kanan bawah viewport yang terlihat (di atas keyboard), sama dengan tombol global. */
  private positionSend(): void {
    const btn = this.sendBtn;

    if (!btn || !this.input.chatOpen || this.destroyed) return;

    const size = 36;
    const m = 12;
    const vv = window.visualViewport;
    const right = (vv ? vv.offsetLeft + vv.width : window.innerWidth) - m;
    const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - m;

    btn.style.left = `${right - size}px`;
    btn.style.top = `${bottom - size}px`;
  }

  // ==========================================================
  // JOYSTICK (floating)
  // ==========================================================

  private get joySize(): number {
    return this.joystickSize * this.uiScale;
  }

  /** Centre of the fixed base as it is drawn right now (always matches what the finger sees). */
  private readJoyCenter(): { x: number; y: number; r: number } | null {
    if (!this.ghost) return null;

    const r = this.ghost.getBoundingClientRect();

    if (r.width < 1 || r.height < 1) return null;

    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  }

  private startJoystick(x: number, y: number): void {
    const c = this.readJoyCenter();

    if (!c || !this.joy) return;

    this.joyCenter = { x: c.x, y: c.y };
    this.joy.classList.add("vkm-show");
    this.moveJoystick(x, y);
  }

  /** The fixed base takes its own touches with pointer capture, exactly like the buttons. */
  private bindJoystick(base: HTMLElement): void {
    base.addEventListener("pointerdown", (e) => {
      this.syncTransition();

      if (!this.active || this.joyPointer !== null) return;

      e.preventDefault();
      e.stopPropagation();

      this.joyPointer = e.pointerId;
      this.joyCaptured = false;

      try {
        base.setPointerCapture(e.pointerId);
        this.joyCaptured = true;
      } catch {
        // optional
      }

      this.startJoystick(e.clientX, e.clientY);
    });

    base.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.joyPointer) return;

      e.preventDefault();
      this.moveJoystick(e.clientX, e.clientY);
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyPointer) return;

      this.resetJoystick();
    };

    base.addEventListener("pointerup", end);
    base.addEventListener("pointercancel", end);
    base.addEventListener("lostpointercapture", end);
  }

  private moveJoystick(x: number, y: number): void {
    if (!this.stick) return;

    // re-read every move: keyboard / bars / rotation can shift the base under a held finger
    const c = this.readJoyCenter();
    if (c) this.joyCenter = { x: c.x, y: c.y };

    const travel = this.joySize * 0.32;

    let dx = x - this.joyCenter.x;
    let dy = y - this.joyCenter.y;

    const dist = Math.hypot(dx, dy);

    if (dist > travel) {
      const k = travel / dist;
      dx *= k;
      dy *= k;
    }

    this.stick.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    this.applyDirection(dx / travel, dy / travel);
  }

  private applyDirection(x: number, y: number): void {
    const inside = Math.hypot(x, y) >= this.deadzone;
    const t = this.directionThreshold;

    this.input.setVirtualKey(this.keys.left, inside && x <= -t);
    this.input.setVirtualKey(this.keys.right, inside && x >= t);
    this.input.setVirtualKey(this.keys.forward, inside && y <= -t);
    this.input.setVirtualKey(this.keys.back, inside && y >= t);
  }

  private resetJoystick(): void {
    this.joyPointer = null;
    this.joyCaptured = false;

    this.input.setVirtualKey(this.keys.forward, false);
    this.input.setVirtualKey(this.keys.back, false);
    this.input.setVirtualKey(this.keys.left, false);
    this.input.setVirtualKey(this.keys.right, false);

    if (this.stick) this.stick.style.transform = "translate3d(0,0,0)";
    this.joy?.classList.remove("vkm-show");
  }

  // ==========================================================
  // RELEASE
  // ==========================================================

  private handleBlur = (): void => {
    this.releaseAll();
  };

  private handleVisibility = (): void => {
    if (document.hidden) this.releaseAll();
  };

  private releaseAll(): void {
    this.resetJoystick();
    this.closeRadioUi();

    for (const release of [...this.releasers]) {
      release();
    }

    this.releasers.clear();
    this.lookPointers.clear();

    this.input.releaseVirtual();
  }
}