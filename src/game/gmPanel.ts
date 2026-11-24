// GM panel (in-battle, opened from the ESC menu for a GM account): a form over the server's ":" commands (server gmCommands.ts), so
// the server stays the only authority (permission levels, "can't kick higher access"). Every button sends one chat line; the server's
// answer comes back as a "Server" chat line and is shown in the log of the panel too. [RECRIADO]: the client has no such window.
import type { ChatLine } from "../net/chatClient.ts";
import { CHAT_MAX } from "../net/chatClient.ts";
import type { Input } from "./input.ts";
import { Modal, el, rankIcon, type PlayerRef } from "./reportPopup.ts";
import { gmDetector } from "./gmDetector.ts";
import { GM_CHEAT_LABELS, GM_HOTKEYS, gmCheats, resetGmCheats, runGmAction, type GmActionKey, type GmCheatState, type GmToggleKey } from "./gmCheats.ts";

/** opens / closes the panel (lobby and battle); F8: no browser function, not used by the game (F1 help, F2 / F3 chat, F4 debug, F5 GM HUD, F9 GM ids, F10-F12 browser) */
export const GM_KEY = "F8";

export interface GmPanelDeps {
  host: HTMLElement;
  /** null in the lobby (no pointer lock / game keys to hand back) */
  input: Input | null;
  roster: () => PlayerRef[];
  /** one chat line (":mute nick 5"); false = not sent */
  send: (text: string) => boolean;
  /** lines the server answers with while the panel is open */
  onLine: (cb: (l: ChatLine) => void) => () => void;
  /** lobby only: "enter rooms hidden, as a GM observer" (the server puts the GM in an observer seat nobody else sees) */
  stealth?: { get(): boolean; set(v: boolean): void };
  /** Apakah akun saat ini memiliki hak akses GM */
  isGm?: () => boolean;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Teko:wght@500;700&family=Rajdhani:wght@500;600;700&display=swap');

/* Penyesuaian Modal Utama dengan Tema Modern Tactical FPS */
.modal-container, .pbm-win {
  font-family: 'Rajdhani', sans-serif !important;
  background: rgba(13, 17, 23, 0.95) !important;
  border: 1px solid rgba(255, 140, 0, 0.4) !important;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.9), inset 0 0 20px rgba(255, 140, 0, 0.05) !important;
  backdrop-filter: blur(12px);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
}

.pbg-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }

.pbg-row .pbm-btn {
  min-width: 0;
  flex: 1 1 30%;
  height: 34px;
  padding: 0 8px;
  font-family: 'Teko', sans-serif !important;
  font-size: 16px !important;
  font-weight: 600;
  letter-spacing: 1px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #2a3447;
  color: #c5d0e0;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pbg-row .pbm-btn:hover {
  background: rgba(255, 140, 0, 0.15);
  border-color: #ff8c00;
  color: #ffffff;
}

.pbg-row .pbm-btn.danger {
  background: linear-gradient(135deg, rgba(224, 78, 78, 0.2), rgba(156, 42, 28, 0.4));
  border-color: #e04e4e;
  color: #ff9d9d;
}

.pbg-row .pbm-btn.danger:hover {
  background: linear-gradient(135deg, rgba(240, 122, 100, 0.3), rgba(183, 54, 38, 0.6));
  border-color: #ff6b6b;
  color: #ffffff;
}

.pbg-two { display: flex; gap: 8px; align-items: center; }
.pbg-two > * { flex: 1; min-width: 0; }

.pbg-log {
  min-height: 70px;
  max-height: 120px;
  overflow: auto;
  background: rgba(5, 7, 10, 0.85);
  border: 1px solid #2a3447;
  border-radius: 2px;
  padding: 8px 10px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 13px;
  color: #f6c46a;
  white-space: pre-wrap;
  user-select: text;
}

/* Kustomisasi input, tombol segmen, dan list pemain ala HUD game */
.pbm-in {
  background: rgba(0, 0, 0, 0.5) !important;
  border: 1px solid #2a3447 !important;
  color: #fff !important;
  font-family: 'Rajdhani', sans-serif !important;
  font-weight: 600 !important;
  padding: 0 10px !important;
  height: 36px !important;
  transition: border-color 0.2s;
}

.pbm-in:focus {
  border-color: #ff8c00 !important;
  outline: none;
  box-shadow: 0 0 8px rgba(255, 140, 0, 0.25);
}

.pbm-seg {
  display: flex;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid #2a3447;
  padding: 2px;
  gap: 2px;
}

.pbm-p {
  flex: 1;
  text-align: center;
  padding: 6px;
  font-family: 'Teko', sans-serif;
  font-size: 15px;
  letter-spacing: 1px;
  color: #8b9bb4;
  cursor: pointer;
  transition: all 0.2s;
}

.pbm-p:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.pbm-p.on {
  background: #ff8c00;
  color: #0c0f16;
  font-weight: bold;
}

.pbm-chk {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #c5d0e0;
  font-size: 13px;
}

.pbm-chk b {
  width: 16px;
  height: 16px;
  border: 1px solid #2a3447;
  background: rgba(0, 0, 0, 0.4);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: transparent;
}

.pbm-chk.on b {
  background: #ff8c00;
  border-color: #ff8c00;
  color: #0c0f16;
}

/* Floating GM Toggle Button (Ultra-Small & Fully Responsive) di sebelah kiri tengah */
.pb-gm-floating-trigger {
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 9999;
  background: linear-gradient(135deg, rgba(255, 140, 0, 0.85), rgba(170, 75, 0, 0.85));
  color: #0c0f16;
  border: 1px solid #ffb040;
  border-left: none;
  border-radius: 0 3px 3px 0;
  padding: 4px 6px 4px 5px;
  font-family: 'Teko', sans-serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.5px;
  cursor: pointer;
  box-shadow: 1px 2px 8px rgba(255, 140, 0, 0.3);
  display: flex;
  align-items: center;
  gap: 3px;
  transition: all 0.2s ease;
  clip-path: polygon(0 0, 100% 0, calc(100% - 3px) 100%, 0 100%);
  max-width: 100vw;
}

.pb-gm-floating-trigger:hover {
  background: linear-gradient(135deg, rgba(255, 170, 40, 1), rgba(200, 90, 0, 1));
  padding-right: 9px;
  box-shadow: 1px 3px 12px rgba(255, 140, 0, 0.5);
}

.pb-gm-floating-trigger svg {
  width: 11px;
  height: 11px;
  fill: currentColor;
  flex-shrink: 0;
}

.pb-gm-floating-trigger.hidden {
  display: none !important;
}

/* Responsivitas untuk layar sangat kecil / mobile landscape */
@media (max-width: 600px) {
  .pb-gm-floating-trigger {
    padding: 3px 5px;
    font-size: 10px;
  }
  .pb-gm-floating-trigger svg {
    width: 9px;
    height: 9px;
  }
}
`;

const CSS_CHEATS = `
.pbg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; margin-top: 6px; }
.pbg-sl { display: grid; grid-template-columns: 110px 1fr 46px; gap: 8px; align-items: center; margin-top: 6px; color: #c5d0e0; font-size: 13px; }
.pbg-sl input[type=range] { width: 100%; accent-color: #ff8c00; }
.pbg-sl output { text-align: right; color: #ff8c00; font-weight: 700; }
.pbg-det { margin-top: 6px; max-height: 180px; overflow: auto; background: rgba(5,7,10,.85); border: 1px solid #2a3447; }
.pbg-detrow { display: grid; grid-template-columns: 1fr 38px; gap: 2px 8px; padding: 6px 10px; border-left: 3px solid #4a5568; cursor: pointer; font-size: 13px; color: #c5d0e0; }
.pbg-detrow:hover { background: rgba(255,140,0,.1); }
.pbg-detrow.lv1 { border-left-color: #e6c84a; }
.pbg-detrow.lv2 { border-left-color: #ff8c00; }
.pbg-detrow.lv3 { border-left-color: #e04e4e; }
.pbg-detnick { font-weight: 700; color: #fff; }
.pbg-detscore { text-align: right; font-weight: 700; color: #ff8c00; }
.pbg-detflags { grid-column: 1 / 3; font-size: 12px; color: #8b9bb4; }
.pbg-detnone { padding: 10px; font-size: 13px; color: #8b9bb4; }
.pbg-cat { margin-top: 8px; font-family: 'Teko', sans-serif; font-size: 15px; letter-spacing: 1px; color: #ff8c00; border-bottom: 1px solid #2a3447; }
@media (max-width: 600px) { .pbg-grid { grid-template-columns: 1fr; } }
`;
let cssDone = false;

/** nick with spaces goes in quotes (":mute" / ":reports" tokenize them) */
const q = (nick: string) => (/\s/.test(nick) ? `"${nick}"` : nick);
/** :player targets always in quotes: the server reads a bare number as a UID, so a player called "1001" would hit UID 1001 */
const qn = (nick: string) => `"${nick}"`;

export class GmPanel extends Modal {
  private nick: HTMLInputElement;
  private amount: HTMLInputElement;
  private gift: HTMLInputElement;
  private text: HTMLInputElement;
  private log = el("div", "pbg-log");
  private list = el("div", "pbm-list");
  private giftKind: "gold" | "cash" | "tags" = "gold";
  private giftBtns: HTMLElement[] = [];
  private armed: HTMLElement | null = null;
  private paintStealth: (() => void) | null = null;
  private offLine: (() => void) | null = null;
  private floatingBtn: HTMLButtonElement;
  private paintCheats: (() => void)[] = [];
  private dragMove: ((e: PointerEvent) => void) | null = null;

  constructor(private d: GmPanelDeps) {
    super(d.host, d.input, "GM Dashboard");
    if (!cssDone) { cssDone = true; const s = document.createElement("style"); s.textContent = CSS + CSS_CHEATS; document.head.appendChild(s); }
    
    // Tombol pintasan melayang versi mikro & responsif di sebelah kiri tengah khusus GM
    this.floatingBtn = document.createElement("button");
    this.floatingBtn.className = "pb-gm-floating-trigger hidden";
    this.floatingBtn.type = "button";
    this.floatingBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      <span>GM</span>
    `;
    this.floatingBtn.addEventListener("click", () => this.open());
    d.host.appendChild(this.floatingBtn);

    this.updateGmVisibility();

    const field = (ph: string, type = "text", max = 40) => {
      const i = el("input", "pbm-in");
      i.type = type; i.placeholder = ph; i.maxLength = max; i.autocomplete = "off"; i.spellcheck = false;
      return i;
    };
    if (d.stealth) {
      const st = d.stealth;
      const chk = el("div", "pbm-chk");
      chk.append(el("b", "", "✓"), el("span", "", "Enter rooms while invisible (GM observer)"));
      const paint = () => chk.classList.toggle("on", st.get());
      chk.addEventListener("click", () => { st.set(!st.get()); paint(); });
      paint();
      this.section("Prohibited", chk);
      this.body.appendChild(el("div", "pbm-n", "No other player can see you in the lobby or during a match, and you do not take up a slot. This applies to any subsequent lobbies you join."));
      this.paintStealth = paint;
    }
    this.nick = field("Player's nickname", "text", 32);
    this.section("Player", this.nick, this.list);
    this.amount = field("Minutes / days", "number", 6);
    this.amount.value = "30";
    const acts = el("div", "pbg-row");
    const act = (label: string, run: () => string | null, danger = false) => {
      const b = el("div", `pbm-btn${danger ? " danger" : ""}`, label);
      b.addEventListener("click", () => {
        if (danger && this.armed !== b) { this.arm(b, label); return; } // second click confirms
        this.disarm();
        const cmd = run();
        if (cmd) this.run(cmd);
      });
      acts.appendChild(b);
    };
    act("Expel", () => (this.needNick() ? `:player kick ${qn(this.nick.value.trim())}` : null), true);
    act("Mute", () => this.needNick() && this.num() !== null ? `:mute ${q(this.nick.value.trim())} ${this.num()}` : null);
    act("Enable chat", () => this.needNick() ? `:mute ${q(this.nick.value.trim())} 0` : null);
    act("Ban (days)", () => this.needNick() && this.num() !== null ? `:player ban normal ${this.num()} ${qn(this.nick.value.trim())}` : null, true);
    act("Reports", () => this.nick.value.trim() ? `:reports ${q(this.nick.value.trim())}` : ":reports");
    this.section("Action (value = minutes of silence or days of a ban)", this.amount, acts);

    const seg = el("div", "pbm-seg");
    for (const k of ["gold", "cash", "tags"] as const) {
      const b = el("div", "pbm-p", k === "gold" ? "Gold" : k === "cash" ? "Cash" : "Tags");
      b.addEventListener("click", () => { this.giftKind = k; this.paintGift(); });
      this.giftBtns.push(b);
      seg.appendChild(b);
    }
    this.gift = field("Amount", "number", 9);
    const giftGo = el("div", "pbm-btn", "To send");
    giftGo.addEventListener("click", () => {
      const n = Math.trunc(Number(this.gift.value));
      if (!this.needNick() || !Number.isFinite(n) || n === 0) { this.say("Specify the player and an amount."); return; }
      this.run(`:player gift ${this.giftKind} ${n} ${qn(this.nick.value.trim())}`);
    });
    const giftRow = el("div", "pbg-two");
    giftRow.append(this.gift, giftGo);
    giftGo.style.minWidth = "0";
    this.section("To give a gift", seg, giftRow);
    this.paintGift();

    this.text = field("Text (up to 44 characters)", "text", CHAT_MAX - ":sendmsg player ".length);
    const msg = el("div", "pbg-row");
    for (const [label, where] of [["For living room", "room"], ["For channel", "channel"], ["For everyone", "player"]] as const) {
      const b = el("div", "pbm-btn", label);
      b.addEventListener("click", () => { const t = this.text.value.trim(); if (!t) { this.say("Escreva a mensagem."); return; } this.run(`:sendmsg ${where} ${t}`); });
      msg.appendChild(b);
    }
    this.section("Server message", this.text, msg);

    const srv = el("div", "pbg-row");
    const quick = (label: string, cmd: string, danger = false) => {
      const b = el("div", `pbm-btn${danger ? " danger" : ""}`, label);
      b.addEventListener("click", () => {
        if (danger && this.armed !== b) { this.arm(b, label); return; }
        this.disarm();
        this.run(cmd);
      });
      srv.appendChild(b);
    };
    quick("End match", ":endbattle", true);
    quick("Latest reports", ":reports");
    quick("Bugs", ":bugs");
    quick("Help", ":help");
    this.section("Server", srv);

    this.buildCheats();

    this.section("Response", this.log);
    this.body.appendChild(this.status);
    this.button("Close", true, () => this.close());
    for (const inp of [this.nick, this.amount, this.gift, this.text]) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  }


  /** GM cheats: checkboxes, sliders and one-shot actions (state lives in gmCheats.ts; Game only honours it for a real GM) */
  private buildCheats(): void {
    const cat = (t: string) => this.body.appendChild(el("div", "pbg-cat", t));
    const group = (title: string, keys: GmToggleKey[]) => {
      const grid = el("div", "pbg-grid");
      for (const k of keys) {
        const chk = el("div", "pbm-chk");
        chk.append(el("b", "", "✓"), el("span", "", GM_CHEAT_LABELS[k]));
        const paint = () => chk.classList.toggle("on", gmCheats[k]);
        chk.addEventListener("click", () => { gmCheats[k] = !gmCheats[k]; paint(); });
        this.paintCheats.push(paint); paint();
        grid.appendChild(chk);
      }
      this.section(title, grid);
    };
    const slider = (label: string, key: keyof GmCheatState, min: number, max: number, step: number, unit = "x") => {
      const row = el("div", "pbg-sl");
      const r = el("input") as HTMLInputElement; r.type = "range"; r.min = String(min); r.max = String(max); r.step = String(step);
      const out = el("output") as HTMLOutputElement;
      const paint = () => { r.value = String(gmCheats[key]); out.textContent = `${gmCheats[key]}${unit}`; };
      r.addEventListener("input", () => { (gmCheats[key] as number) = Number(r.value); paint(); });
      row.append(el("span", "", label), r, out);
      this.paintCheats.push(paint); paint();
      return row;
    };
    const btn = (label: string, run: () => void, danger = false) => {
      const b = el("div", `pbm-btn${danger ? " danger" : ""}`, label);
      b.addEventListener("click", run);
      return b;
    };
    const act = (label: string, k: GmActionKey) => btn(label, () => { runGmAction(k); this.say(`${label}: ok`); });
    /** one-of-N selector bound to a string field of gmCheats */
    const choice = (title: string, key: "aimPriority" | "aimBone", opts: [string, string][]) => {
      const seg = el("div", "pbm-seg");
      const btns = opts.map(([v, t]) => {
        const b = el("div", "pbm-p", t);
        b.addEventListener("click", () => { (gmCheats as unknown as Record<string, string>)[key] = v; paint(); });
        seg.appendChild(b);
        return [v, b] as const;
      });
      const paint = () => btns.forEach(([v, b]) => b.classList.toggle("on", gmCheats[key] === v));
      this.paintCheats.push(paint); paint();
      this.section(title, seg);
    };

    cat("CHEATS (client only, GM)");
    group("Visual / ESP", ["wallhack", "esp", "radar"]);
    const espParts = el("div", "pbg-grid");
    for (const [k, label] of [["espBox", "Box"], ["espSnap", "Snaplines"], ["espName", "Nick + distance"], ["espHp", "HP bar"]] as const) {
      const chk = el("div", "pbm-chk");
      chk.append(el("b", "", "✓"), el("span", "", label));
      const paint = () => chk.classList.toggle("on", gmCheats[k]);
      chk.addEventListener("click", () => { gmCheats[k] = !gmCheats[k]; paint(); });
      this.paintCheats.push(paint); paint();
      espParts.appendChild(chk);
    }
    this.body.appendChild(espParts);
    group("Aim", ["autoHead", "silentAim", "trigger"]);
    choice("Target priority", "aimPriority", [["crosshair", "Crosshair"], ["distance", "Nearest"], ["hp", "Lowest HP"]]);
    choice("Aim bone", "aimBone", [["head", "Head"], ["chest", "Chest"], ["legs", "Legs"]]);
    this.body.appendChild(slider("Aim cone", "aimFov", 1, 90, 1, "°"));
    const vis = el("div", "pbg-grid");
    { const chk = el("div", "pbm-chk"); chk.append(el("b", "", "✓"), el("span", "", "Aim only at visible enemies (no wall)"));
      const paint = () => chk.classList.toggle("on", gmCheats.aimVisible);
      chk.addEventListener("click", () => { gmCheats.aimVisible = !gmCheats.aimVisible; paint(); });
      this.paintCheats.push(paint); paint(); vis.appendChild(chk); }
    this.body.appendChild(vis);
    group("Combat", ["wallbang", "burstAmmo", "infGrenade", "infAmmo", "noReload", "noRecoil", "noSpread", "rapidFire"]);
    this.body.appendChild(slider("Damage x", "damageMult", 1, 20, 1));
    this.body.appendChild(slider("Fire rate x", "rapidFireMult", 1, 10, 0.5));
    group("Player / movement", ["god", "noclip", "noFall"]);
    this.body.appendChild(slider("Speed x", "speedMult", 1, 5, 0.25));
    this.body.appendChild(slider("Jump x", "jumpMult", 1, 5, 0.25));
    this.body.appendChild(slider("Fly speed", "flySpeed", 4, 40, 1, " m/s"));
    const world = el("div", "pbg-row");
    world.append(act("Teleport to crosshair", "teleport"), act("Teleport to enemy", "tpEnemy"), act("Respawn now", "respawn"), act("Kill all bots", "killBots"));
    this.section(`World (hotkeys: ${GM_HOTKEYS.teleport} = teleport, ${GM_HOTKEYS.noclip} = noclip)`, slider("Time scale", "timeScale", 0.1, 4, 0.1), world);
    const give = el("div", "pbg-row");
    give.append(act("Full HP", "heal"), act("Restore helmet", "helmet"), act("Refill ammo", "refillAmmo"),
      btn("Reset cheats", () => { resetGmCheats(); this.paintCheats.forEach((p) => p()); }, true));
    this.section("Give / reset (cash, gold and tags: use \"To give a gift\" above with your own nick)", give);
    group("Bomb mission", ["instantBomb"]);
    this.buildDetector(group, slider);
    this.makeDraggable();
  }

  /** cheat detector options; the suspects themselves are drawn above the players' heads (gmEsp.ts drawDetector) */
  private buildDetector(group: (title: string, keys: GmToggleKey[]) => void, slider: (label: string, key: keyof GmCheatState, min: number, max: number, step: number, unit?: string) => HTMLElement): void {
    this.body.appendChild(el("div", "pbg-cat", "CHEAT DETECTOR (shown above the players' heads; heuristic)"));
    group("Detector", ["detector"]);
    const alert = el("div", "pbm-chk");
    alert.append(el("b", "", "✓"), el("span", "", "Popup alert when a player becomes suspicious"));
    const paint = () => alert.classList.toggle("on", gmCheats.detectAlert);
    alert.addEventListener("click", () => { gmCheats.detectAlert = !gmCheats.detectAlert; paint(); });
    this.paintCheats.push(paint); paint();
    const bar = el("div", "pbg-row");
    const mk = (label: string, fn: () => void, danger = false) => {
      const b = el("div", `pbm-btn${danger ? " danger" : ""}`, label);
      b.addEventListener("click", fn);
      return b;
    };
    bar.append(
      mk("Copy report", () => {
        const r = gmDetector.report();
        navigator.clipboard?.writeText(r).then(() => this.say("Report copied."), () => this.say(r));
      }),
      mk("Ignore nick above", () => { const n = this.nick.value.trim(); if (!n) { this.say("Choose the player first."); return; } gmDetector.ignoreName(n); this.say(`Detector ignores ${n}.`); }),
      mk("Clear data + ignores", () => { gmDetector.reset(); this.say("Detector data cleared."); }, true),
    );
    this.section("Options", alert, slider("Sensitivity", "detectSens", 0.5, 2, 0.1), bar);
  }

  /** drag the window by its title bar (first child of the window element); the window is assumed to be the .pbm-win ancestor of the body */
  private makeDraggable(): void {
    const win = (this.body.closest(".pbm-win") ?? this.body.parentElement) as HTMLElement | null;
    const handle = win?.firstElementChild as HTMLElement | null;
    if (!win || !handle) return;
    handle.style.cursor = "move"; handle.style.touchAction = "none";
    handle.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button, input, .pbm-btn")) return;
      const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      win.style.position = "fixed"; win.style.margin = "0"; win.style.transform = "none";
      win.style.left = `${r.left}px`; win.style.top = `${r.top}px`;
      handle.setPointerCapture(e.pointerId);
      this.dragMove = (m) => {
        win.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, m.clientX - dx))}px`;
        win.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, m.clientY - dy))}px`;
      };
      handle.addEventListener("pointermove", this.dragMove);
      const up = () => { if (this.dragMove) handle.removeEventListener("pointermove", this.dragMove); this.dragMove = null; handle.removeEventListener("pointerup", up); };
      handle.addEventListener("pointerup", up);
    });
  }

  public updateGmVisibility(): void {
    const isGmUser = this.d.isGm ? this.d.isGm() : true;
    this.floatingBtn.classList.toggle("hidden", !isGmUser);
  }

  private num(): number | null {
    const n = Math.trunc(Number(this.amount.value));
    if (!Number.isFinite(n) || n < 0) { this.say("Invalid value."); return null; }
    return n;
  }

  private needNick(): boolean {
    if (this.nick.value.trim()) return true;
    this.say("Choose the player (list or nickname).");
    return false;
  }

  private arm(b: HTMLElement, label: string): void {
    this.disarm();
    this.armed = b;
    b.dataset.label = label;
    b.textContent = "Confirm?";
  }

  private disarm(): void {
    if (this.armed) { this.armed.textContent = this.armed.dataset.label ?? ""; this.armed = null; }
  }

  private paintGift(): void {
    const kinds = ["gold", "cash", "tags"];
    this.giftBtns.forEach((b, i) => b.classList.toggle("on", kinds[i] === this.giftKind));
  }

  private run(cmd: string): void {
    if (cmd.length > CHAT_MAX) { this.say(`Comando maior que ${CHAT_MAX} letras (apelido ou texto longo demais).`); return; }
    if (!this.d.send(cmd)) { this.say("Not sent: no connection."); return; }
    this.say(`Sent: ${cmd}`, true);
  }

  private paintRoster(): void {
    this.list.replaceChildren();
    const me = this.nick.value.trim().toLowerCase();
    for (const p of this.d.roster()) {
      const b = el("div", `pbm-p${p.nick.toLowerCase() === me ? " on" : ""}`);
      const bar = el("i");
      bar.style.setProperty("--tc", p.slot % 2 === 0 ? "rgb(255,120,100)" : "rgb(110,180,255)");
      b.append(bar);
      if (p.rank !== undefined && p.rank >= 0) b.appendChild(rankIcon(p.rank));
      b.append(el("span", "", p.nick));
      b.addEventListener("click", () => { this.nick.value = p.nick; this.paintRoster(); });
      this.list.appendChild(b);
    }
  }

  open(): void {
    this.paintStealth?.();
    this.paintCheats.forEach((p) => p()); // hotkeys may have flipped a cheat
    this.say("");
    this.disarm();
    this.paintRoster();
    this.log.textContent = "";
    this.offLine?.();
    this.offLine = this.d.onLine((l) => {
      if (l.kind !== "system" && l.nick !== "Server") return;
      this.log.textContent += `${this.log.textContent ? "\n" : ""}${l.text}`;
      this.log.scrollTop = this.log.scrollHeight;
    });
    this.show();
  }

  close(): void {
    this.offLine?.();
    this.offLine = null;
    super.close();
  }

  dispose(): void {
    this.offLine?.();
    this.offLine = null;
    this.floatingBtn.remove();
    resetGmCheats(); // match end / panel dispose: everything off
    super.dispose();
  }
}