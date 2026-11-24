import {
  addPartyMember,
  buildMatchRoster4v4,
  ClashSquadMatchRoster,
  createParty,
  LobbyPlayer,
  RankTier,
  removePartyMember,
} from "../ranked/party-ranked";
import { CsMapConfig, pickRandomCsMap } from "../game/cs-map";

export interface CsLobbyCallbacks {
  onStartRankedMatch: (roster: ClashSquadMatchRoster, selectedMap: CsMapConfig) => void;
  onOpenSkinMenu: (player: LobbyPlayer) => void;
  onOpenWeaponMenu: (player: LobbyPlayer) => void;
  onOpenCustomHud: () => void;
}

const RANK_ORDER: RankTier[] = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"];

export class ClashSquadLobby {
  private container: HTMLElement;
  private party: LobbyPlayer[];
  private callbacks: CsLobbyCallbacks;
  private searching = false;
  private searchTimer: number | null = null;
  private statusText = "Siap bermain Ranked 4vs4";

  constructor(container: HTMLElement, leader: LobbyPlayer, callbacks: CsLobbyCallbacks) {
    this.container = container;
    this.party = createParty(leader);
    this.callbacks = callbacks;
  }

  public mount(): void {
    this.injectStyles();
    this.render();
  }

  public destroy(): void {
    if (this.searchTimer !== null) {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.container.innerHTML = "";
  }

  public setLeaderLoadout(skinId: string, weaponId: string): void {
    if (!this.party[0]) return;
    this.party[0] = { ...this.party[0], skinId, weaponId };
    this.render();
  }

  public setLeaderRank(rank: RankTier, rp: number): void {
    if (!this.party[0]) return;
    this.party[0] = { ...this.party[0], rank, rp };
    this.render();
  }

  private addTeammate(): void {
    if (this.searching || this.party.length >= 4) return;
    const nextIdx = this.party.length + 1;
    const leaderRank = this.party[0]?.rank ?? "Gold";
    const teammate: LobbyPlayer = {
      id: `mate-${nextIdx}-${Date.now()}`,
      name: `Squad_${nextIdx}`,
      rank: leaderRank,
      rp: this.party[0]?.rp ?? 1200,
      skinId: this.party[0]?.skinId ?? "default-skin",
      weaponId: "default-rifle",
    };
    this.party = addPartyMember(this.party, teammate);
    this.statusText = `Anggota tim: ${this.party.length}/4 (slot sisa otomatis autofill 4v4)`;
    this.render();
  }

  private kickTeammate(id: string): void {
    if (this.searching || this.party.length <= 1) return;
    this.party = removePartyMember(this.party, id);
    this.statusText = `Anggota tim: ${this.party.length}/4 (slot sisa otomatis autofill 4v4)`;
    this.render();
  }

  private cycleRank(): void {
    if (this.searching || !this.party[0]) return;
    const idx = RANK_ORDER.indexOf(this.party[0].rank);
    const nextRank = RANK_ORDER[(idx + 1) % RANK_ORDER.length];
    this.party[0] = { ...this.party[0], rank: nextRank };
    this.render();
  }

  private toggleMatchmaking(): void {
    if (this.searching) {
      this.searching = false;
      if (this.searchTimer !== null) {
        window.clearTimeout(this.searchTimer);
        this.searchTimer = null;
      }
      this.statusText = "Pencarian Ranked dibatalkan";
      this.render();
      return;
    }

    const autofillNeeded = 4 - this.party.length;
    this.searching = true;
    this.statusText =
      autofillNeeded > 0
        ? `Mencari Ranked 4vs4... Autofill +${autofillNeeded} pemain tim & lawan`
        : "Mencari Ranked 4vs4... Tim penuh 4/4";
    this.render();

    this.searchTimer = window.setTimeout(() => {
      this.searching = false;
      const roster = buildMatchRoster4v4(this.party);
      this.statusText = `Match ditemukan! Tim Alpha 4 vs Tim Bravo 4 (${DEFAULT_CS_MAP.name})`;
      this.render();
      this.callbacks.onStartRankedMatch(roster);
    }, 1500);
  }

  private injectStyles(): void {
    if (document.getElementById("cs4v4-lobby-style")) return;
    const style = document.createElement("style");
    style.id = "cs4v4-lobby-style";
    style.textContent = `
      .cs-lobby {
        position: relative; width: 100%; height: 100%; min-height: 100vh;
        overflow: hidden; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;
        background:
          radial-gradient(circle at 50% 35%, rgba(245, 158, 11, 0.22), rgba(15, 23, 42, 0.94) 60%, #050811 100%);
        display: flex; flex-direction: column; justify-content: space-between; padding: 14px 20px;
      }
      .cs-top-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; z-index: 5; }
      .cs-profile-box {
        display: flex; align-items: center; gap: 10px;
        background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(251, 191, 36, 0.45);
        border-radius: 10px; padding: 8px 14px;
      }
      .cs-rank-pill {
        background: linear-gradient(135deg, #f59e0b, #d97706); color: #090d16;
        font-weight: 900; font-size: 12px; padding: 4px 10px; border-radius: 999px; cursor: pointer; border: none;
      }
      .cs-mode-badge {
        background: rgba(239, 68, 68, 0.2); border: 1px solid #f87171; color: #fecaca;
        padding: 6px 12px; border-radius: 8px; font-weight: 800; font-size: 12px; letter-spacing: .04em;
      }
      .cs-stage-center {
        position: relative; flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 14px;
      }
      .cs-squad-slots {
        display: grid; grid-template-columns: repeat(4, minmax(110px, 1fr));
        gap: 10px; width: min(860px, 100%); z-index: 4;
      }
      .cs-slot {
        background: rgba(15, 23, 42, 0.78); border: 1.5px solid rgba(148, 163, 184, 0.35);
        border-radius: 10px; padding: 10px; min-height: 82px;
        display: flex; flex-direction: column; justify-content: space-between;
      }
      .cs-slot.filled { border-color: rgba(251, 191, 36, 0.75); }
      .cs-slot.empty { border-style: dashed; align-items: center; justify-content: center; cursor: pointer; color: #94a3b8; }
      .cs-char-showcase {
        background: rgba(15, 23, 42, 0.68); border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 14px; padding: 14px 22px; text-align: center; max-width: 440px;
      }
      .cs-bottom-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; z-index: 5; }
      .cs-side-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .cs-btn {
        border: 1px solid rgba(148, 163, 184, 0.45); background: rgba(30, 41, 59, 0.92);
        color: #f8fafc; border-radius: 10px; padding: 10px 14px; font-weight: 800; font-size: 12px; cursor: pointer;
      }
      .cs-btn-start {
        background: linear-gradient(135deg, #f59e0b, #ef4444); color: #fff;
        border: none; padding: 13px 28px; font-size: 15px; letter-spacing: .05em;
        box-shadow: 0 8px 24px rgba(239, 68, 68, 0.45);
      }
      .cs-small-kick {
        background: rgba(239, 68, 68, 0.25); border: 1px solid #ef4444; color: #fca5a5;
        border-radius: 6px; padding: 2px 6px; font-size: 10px; font-weight: 700; cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  private render(): void {
    const leader = this.party[0];
    const slotsHtml = Array.from({ length: 4 }, (_, idx) => {
      const member = this.party[idx];
      if (!member) {
        return `
          <div class="cs-slot empty" data-action="add-mate">
            <div style="font-size:18px;font-weight:900;color:#fbbf24">+</div>
            <div style="font-size:11px;font-weight:700">Undang / Tambah</div>
            <div style="font-size:10px;color:#64748b">Autofill 4v4 jika kosong</div>
          </div>
        `;
      }
      return `
        <div class="cs-slot filled">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
            <span style="font-size:12px;font-weight:800;color:#fde047">${member.name}</span>
            ${
              member.isLeader
                ? `<span style="font-size:10px;background:#f59e0b;color:#090d16;padding:1px 6px;border-radius:6px;font-weight:900">LEADER</span>`
                : `<button type="button" class="cs-small-kick" data-kick="${member.id}">Keluarkan</button>`
            }
          </div>
          <div style="font-size:11px;color:#cbd5e1;margin-top:4px">Skin: <b>${member.skinId}</b></div>
          <div style="font-size:11px;color:#94a3b8">Senjata: <b>${member.weaponId}</b></div>
        </div>
      `;
    }).join("");

    this.container.innerHTML = `
      <div class="cs-lobby">
        <div class="cs-top-bar">
          <div class="cs-profile-box">
            <div>
              <div style="font-size:13px;font-weight:900">${leader?.name ?? "Player"}</div>
              <div style="font-size:11px;color:#fbbf24">RP: ${leader?.rp ?? 1200} · Tim ${this.party.length}/4</div>
            </div>
            <button type="button" class="cs-rank-pill" id="csRankBtn">RANK: ${leader?.rank ?? "Gold"}</button>
          </div>
          <div class="cs-mode-badge">CLASH SQUAD · 4v4 RANKED · RANDOM MAP (5 ARENA)</div>
        </div>

        <div class="cs-stage-center">
          <div class="cs-char-showcase">
            <div style="font-size:11px;color:#38bdf8;font-weight:800;letter-spacing:.06em">KARAKTER &amp; LOADOUT AKTIF</div>
            <div style="font-size:18px;font-weight:900;margin-top:4px">${leader?.name ?? "Player"}</div>
            <div style="font-size:12px;color:#cbd5e1;margin-top:4px">
              Skin: <span style="color:#fde047">${leader?.skinId ?? "default-skin"}</span> ·
              Senjata: <span style="color:#38bdf8">${leader?.weaponId ?? "default-rifle"}</span>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:6px">${this.statusText}</div>
          </div>

          <div class="cs-squad-slots">${slotsHtml}</div>
        </div>

        <div class="cs-bottom-bar">
          <div class="cs-side-actions">
            <button type="button" class="cs-btn" id="csSkinBtn">Skin</button>
            <button type="button" class="cs-btn" id="csWeaponBtn">Senjata</button>
            <button type="button" class="cs-btn" id="csHudBtn">Custom HUD (HP)</button>
          </div>
          <button type="button" class="cs-btn cs-btn-start" id="csStartBtn">
            ${this.searching ? "BATALKAN RANKED" : "MULAI RANKED 4v4"}
          </button>
        </div>
      </div>
    `;

    this.container.querySelector("#csRankBtn")?.addEventListener("click", () => this.cycleRank());
    this.container.querySelector("#csSkinBtn")?.addEventListener("click", () => {
      if (leader) this.callbacks.onOpenSkinMenu(leader);
    });
    this.container.querySelector("#csWeaponBtn")?.addEventListener("click", () => {
      if (leader) this.callbacks.onOpenWeaponMenu(leader);
    });
    this.container.querySelector("#csHudBtn")?.addEventListener("click", () => {
      this.callbacks.onOpenCustomHud();
    });
    this.container.querySelector("#csStartBtn")?.addEventListener("click", () => this.toggleMatchmaking());
    this.container.querySelectorAll('[data-action="add-mate"]').forEach((el) => {
      el.addEventListener("click", () => this.addTeammate());
    });
    this.container.querySelectorAll("[data-kick]").forEach((el) => {
      el.addEventListener("click", () => {
        const targetId = (el as HTMLElement).dataset.kick;
        if (targetId) this.kickTeammate(targetId);
      });
    });
  }
}
