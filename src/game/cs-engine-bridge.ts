import { pickRandomCsMap, CsMapConfig, SpawnPoint } from "./cs-map";
import { ClashSquadMatchRoster, calculateRankedRpDelta, LobbyPlayer } from "../ranked/party-ranked";

export interface CsMatchState {
  map: CsMapConfig;
  roster: ClashSquadMatchRoster;
  round: number;
  maxRounds: number;
  alphaScore: number;
  bravoScore: number;
  activeSpawns: {
    alpha: SpawnPoint[];
    bravo: SpawnPoint[];
  };
}

export interface CsEngineBridgeOptions {
  container: HTMLElement;
  roster: ClashSquadMatchRoster;
  mapConfig?: CsMapConfig;
  customHudUrl?: string;
  onMatchFinished: (result: { won: boolean; newRp: number; leader: LobbyPlayer | undefined }) => void;
}

export class ClashSquadEngineBridge {
  private container: HTMLElement;
  private state: CsMatchState;
  private customHudUrl: string;
  private onMatchFinished: CsEngineBridgeOptions["onMatchFinished"];
  private vkmInstance: { mount?: () => void; setPlaying?: (v: boolean) => void; destroy?: () => void } | null = null;

  constructor(options: CsEngineBridgeOptions) {
    this.container = options.container;
    this.customHudUrl = options.customHudUrl ?? "/custom-hud.html";
    this.onMatchFinished = options.onMatchFinished;

    const map = options.mapConfig ?? pickRandomCsMap();
    this.state = {
      map,
      roster: options.roster,
      round: 1,
      maxRounds: 7, // Best of 7 (first to 4 wins) ala Clash Squad
      alphaScore: 0,
      bravoScore: 0,
      activeSpawns: {
        alpha: map.spawns.alpha.slice(0, 4),
        bravo: map.spawns.bravo.slice(0, 4),
      },
    };
  }

  public async start(): Promise<void> {
    this.renderMatchOverlay();
    await this.attachVirtualKeymappingIfMobile();
  }

  public recordRoundWin(winner: "alpha" | "bravo"): void {
    if (winner === "alpha") {
      this.state.alphaScore += 1;
    } else {
      this.state.bravoScore += 1;
    }

    const winsNeeded = Math.ceil(this.state.maxRounds / 2);
    if (this.state.alphaScore >= winsNeeded || this.state.bravoScore >= winsNeeded) {
      const won = this.state.alphaScore >= winsNeeded;
      const leader = this.state.roster.alpha[0];
      const nextRp = calculateRankedRpDelta(won, leader?.rp ?? 1200);
      this.cleanup();
      this.onMatchFinished({ won, newRp: nextRp, leader });
      return;
    }

    this.state.round += 1;
    this.renderMatchOverlay();
  }

  public cleanup(): void {
    if (this.vkmInstance && typeof this.vkmInstance.destroy === "function") {
      this.vkmInstance.destroy();
      this.vkmInstance = null;
    }
    this.container.innerHTML = "";
  }

  private async attachVirtualKeymappingIfMobile(): Promise<void> {
    const isTouchOrMobile =
      window.matchMedia("(pointer: coarse)").matches ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (!isTouchOrMobile) return;

    try {
      const mod = await import("./virtual-keymapping");
      const VkmClass = (mod as Record<string, unknown>).VirtualKeymapping as
        | (new (...args: unknown[]) => { mount?: () => void; setPlaying?: (v: boolean) => void; destroy?: () => void })
        | undefined;

      if (typeof VkmClass === "function") {
        this.vkmInstance = new VkmClass();
        this.vkmInstance.mount?.();
        this.vkmInstance.setPlaying?.(true);
      }
    } catch {
      // Aman jika modul virtual-keymapping belum di-wiring pada konteks tertentu
    }
  }

  private renderMatchOverlay(): void {
    const alphaList = this.state.roster.alpha
      .map(
        (p, idx) =>
          `<li>${idx + 1}. <b>${p.name}</b> ${p.isAutofill ? "<em>(Autofill)</em>" : ""} · <small>${p.weaponId}</small></li>`
      )
      .join("");

    const bravoList = this.state.roster.bravo
      .map(
        (p, idx) =>
          `<li>${idx + 1}. <b>${p.name}</b> ${p.isAutofill ? "<em>(Autofill)</em>" : ""} · <small>${p.weaponId}</small></li>`
      )
      .join("");

    this.container.innerHTML = `
      <div style="position:fixed;inset:0;background:radial-gradient(circle at 50% 40%,rgba(15,23,42,.88),#03060c);color:#f8fafc;font-family:system-ui,sans-serif;padding:14px 20px;display:flex;flex-direction:column;justify-content:space-between;z-index:50">
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(15,23,42,.88);border:1px solid rgba(56,189,248,.4);border-radius:10px;padding:8px 16px">
          <div><b>ALPHA</b> · Skor: <span style="color:#38bdf8;font-size:18px">${this.state.alphaScore}</span></div>
          <div style="text-align:center">
            <div style="font-size:11px;color:#94a3b8">${this.state.map.name}</div>
            <div style="font-size:13px;font-weight:800;color:#fbbf24">RONDE ${this.state.round} / ${this.state.maxRounds}</div>
          </div>
          <div style="text-align:right"><b>BRAVO</b> · Skor: <span style="color:#f87171;font-size:18px">${this.state.bravoScore}</span></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:760px;width:100%;margin:auto;background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.25);border-radius:12px;padding:14px">
          <div>
            <div style="font-size:12px;font-weight:800;color:#38bdf8;margin-bottom:6px">TIM ALPHA (4 PEMAIN)</div>
            <ul style="list-style:none;padding:0;margin:0;font-size:12px;line-height:1.7">${alphaList}</ul>
          </div>
          <div>
            <div style="font-size:12px;font-weight:800;color:#f87171;margin-bottom:6px">TIM BRAVO (4 PEMAIN)</div>
            <ul style="list-style:none;padding:0;margin:0;font-size:12px;line-height:1.7">${bravoList}</ul>
          </div>
        </div>

        <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap">
          <button id="csWinAlphaBtn" type="button" style="padding:9px 14px;border-radius:8px;border:1px solid #38bdf8;background:#0369a1;color:#fff;font-weight:700;cursor:pointer">Simulasi Menang Ronde (Alpha)</button>
          <button id="csWinBravoBtn" type="button" style="padding:9px 14px;border-radius:8px;border:1px solid #f87171;background:#991b1b;color:#fff;font-weight:700;cursor:pointer">Simulasi Kalah Ronde (Bravo)</button>
          <a href="${this.customHudUrl}" style="padding:9px 14px;border-radius:8px;border:1px solid #fbbf24;background:#1e293b;color:#fde047;font-weight:700;text-decoration:none">Custom HUD HP</a>
        </div>
      </div>
    `;

    this.container.querySelector("#csWinAlphaBtn")?.addEventListener("click", () => this.recordRoundWin("alpha"));
    this.container.querySelector("#csWinBravoBtn")?.addEventListener("click", () => this.recordRoundWin("bravo"));
  }
}
