// Cheat detector (GM only). Watches the OTHER human players through what this client already receives (replicated position, view
// angles, shots, hits, kills) and scores heuristic red flags. It can NOT be authoritative: lag, interpolation and legit GM tools
// (noclip, speed) cause false positives, so the panel only lists suspects and the GM decides.
//   game.ts   -> feeds sample() / track() / fire() / kill() / hit() / hitSent() / settle(), only while gmCheats.detector is on
//   gmPanel.ts -> reads list() / report() / reset()

export type DetFlag = "speed" | "fly" | "hover" | "teleport" | "snap" | "rapid" | "wall" | "hs" | "damage" | "god" | "wallkill";

export const DET_LABELS: Record<DetFlag, string> = {
  speed: "Speed hack",
  fly: "Fly / rise",
  hover: "Hover (no ground)",
  teleport: "Teleport",
  snap: "Aim snap + shot",
  rapid: "Rapid fire",
  wall: "Tracks through walls",
  hs: "Headshot ratio",
  damage: "Damage hack",
  god: "Ignores damage",
  wallkill: "Kill through wall",
};

/** points per occurrence (an occurrence counts up to CAP times) */
const WEIGHT: Record<DetFlag, number> = { speed: 10, fly: 12, hover: 10, teleport: 6, snap: 8, rapid: 10, wall: 5, hs: 10, damage: 14, god: 8, wallkill: 8 };
/** a flag only scores from this many occurrences (one-off events are too easy to explain) */
const MIN: Partial<Record<DetFlag, number>> = { wallkill: 2, snap: 2, rapid: 2 };
/** seconds after a spawn / first sight in which nothing is flagged */
const GRACE = 3;
/** an old flag fades: full for FADE_START s, then gone after FADE_LEN more */
const FADE_START = 60, FADE_LEN = 180;
const CAP = 4;
/** score (x sensitivity) that raises the alert once, and the level borders */
const ALERT = 20, MED = 15, HIGH = 30;

export interface DetSample { id: string; name: string; team: number; alive: boolean; x: number; y: number; z: number; dx: number; dy: number; dz: number }
export interface DetRow { id: string; name: string; team: number; score: number; level: 1 | 2 | 3; /** s since the last flag */ age: number; flags: { key: DetFlag; label: string; n: number }[] }

interface Track {
  id: string; name: string; team: number;
  flags: Partial<Record<DetFlag, { n: number; last: number }>>;
  alerted: boolean; grace: number;
  has: boolean; px: number; py: number; pz: number; pt: number; yaw: number; pitch: number;
  speedAcc: number; riseAcc: number; hoverAcc: number; trackAcc: number;
  gap: number; gapT: number;
  snapT: number; snapAng: number;
  lastFire: number; rapidAcc: number;
  kills: number; hs: number; hsAt: number;
  godStrikes: number;
}

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class GmDetector {
  enabled = false;
  /** score multiplier (panel slider) */
  sens = 1;
  onAlert: ((name: string, reason: string) => void) | null = null;
  private tracks = new Map<string, Track>();
  private now = 0;
  private ignored = new Set<string>();
  private pending: { id: string; t: number; hp: number }[] = [];

  private ensure(id: string, name: string, team: number): Track {
    let t = this.tracks.get(id);
    if (!t) {
      t = { id, name, team, flags: {}, alerted: false, grace: 0, has: false, px: 0, py: 0, pz: 0, pt: 0, yaw: 0, pitch: 0,
        speedAcc: 0, riseAcc: 0, hoverAcc: 0, trackAcc: 0, gap: 0, gapT: -1, snapT: -99, snapAng: 0,
        lastFire: -99, rapidAcc: 0, kills: 0, hs: 0, hsAt: 0, godStrikes: 0 };
      this.tracks.set(id, t);
    }
    t.name = name; t.team = team;
    return t;
  }

  /** how many occurrences of flag k still count (min count, cap, fade with age) */
  private eff(t: Track, k: DetFlag): number {
    const r = t.flags[k];
    if (!r || r.n < (MIN[k] ?? 1)) return 0;
    return Math.min(r.n, CAP) * Math.max(0, 1 - Math.max(0, this.now - r.last - FADE_START) / FADE_LEN);
  }

  private score(t: Track): number {
    let s = 0;
    for (const k in t.flags) s += WEIGHT[k as DetFlag] * this.eff(t, k as DetFlag);
    return Math.round(s * this.sens);
  }

  private flag(t: Track, k: DetFlag, now: number): void {
    if (now < t.grace || this.ignored.has(t.name.toLowerCase())) return;
    const r = (t.flags[k] ??= { n: 0, last: -99 });
    r.n++; r.last = now;
    if (!t.alerted && this.score(t) >= ALERT) { t.alerted = true; this.onAlert?.(t.name, DET_LABELS[k]); }
  }

  /** every frame, per remote player. `gap` = height of the ground under the feet (m), asked at most every 0.1 s */
  sample(now: number, s: DetSample, gap: () => number): void {
    if (!this.enabled) return;
    this.now = now;
    const t = this.ensure(s.id, s.name, s.team);
    const yaw = Math.atan2(-s.dx, -s.dz), pitch = Math.asin(Math.max(-1, Math.min(1, s.dy)));
    if (!s.alive) { t.has = false; t.speedAcc = t.riseAcc = t.hoverAcc = 0; return; }
    if (!t.has) { t.px = s.x; t.py = s.y; t.pz = s.z; t.pt = now; t.yaw = yaw; t.pitch = pitch; t.has = true; t.grace = now + GRACE; return; }
    const dt = now - t.pt;
    if (dt < 0.05) return; // smooth over ~3 frames
    if (dt > 0.5) { t.px = s.x; t.py = s.y; t.pz = s.z; t.pt = now; t.yaw = yaw; t.pitch = pitch; t.speedAcc = t.riseAcc = t.hoverAcc = 0; return; }
    const hx = s.x - t.px, hz = s.z - t.pz, vy = (s.y - t.py) / dt;
    const v = Math.hypot(hx, hz) / dt, dist = Math.hypot(hx, s.y - t.py, hz);
    if (dist > 6 && dist / dt > 40) {
      this.flag(t, "teleport", now); // respawns reset `has` first (alive edge), so a jump of this size is not a spawn
      t.speedAcc = t.riseAcc = t.hoverAcc = 0;
    } else {
      // legit run is ~6.5 m/s
      t.speedAcc = v > 9 ? t.speedAcc + dt : Math.max(0, t.speedAcc - dt * 2);
      if (t.speedAcc > 1.5) { this.flag(t, "speed", now); t.speedAcc = 0; }
      // a jump rises ~0.5 s; rising for >1.3 s is not a jump
      t.riseAcc = vy > 3.2 ? t.riseAcc + dt : Math.max(0, t.riseAcc - dt * 3);
      if (t.riseAcc > 1.3) { this.flag(t, "fly", now); t.riseAcc = 0; }
      if (now - t.gapT > 0.1) { t.gapT = now; t.gap = gap(); }
      t.hoverAcc = t.gap > 1.8 && Math.abs(vy) < 0.5 ? t.hoverAcc + dt : Math.max(0, t.hoverAcc - dt * 2);
      if (t.hoverAcc > 1.2) { this.flag(t, "hover", now); t.hoverAcc = 0; }
    }
    const ang = Math.hypot(wrap(yaw - t.yaw), pitch - t.pitch);
    if (ang > 1.57) { t.snapT = now; t.snapAng = ang; } // > 90 degrees between two samples
    t.px = s.x; t.py = s.y; t.pz = s.z; t.pt = now; t.yaw = yaw; t.pitch = pitch;
  }

  /** every 0.1 s: did this player keep a TIGHT crosshair lock, while turning, on a MOVING enemy that is fully behind a wall? (shooting at a wall / covering a corner never counts) */
  track(id: string, dt: number, onWallTarget: boolean): void {
    const t = this.tracks.get(id);
    if (!this.enabled || !t) return;
    t.trackAcc = onWallTarget ? t.trackAcc + dt : Math.max(0, t.trackAcc - dt * 3);
    if (t.trackAcc > 4) { this.flag(t, "wall", t.pt); t.trackAcc = 0; }
  }

  /** a shot of this player (replicated "fire" edge); fireDelay = the weapon's own delay, s */
  fire(id: string, now: number, fireDelay: number): void {
    const t = this.tracks.get(id);
    if (!this.enabled || !t) return;
    if (now - t.snapT < 0.25 && t.snapAng > 1.57) { this.flag(t, "snap", now); t.snapT = -99; }
    if (fireDelay >= 0.12 && t.lastFire > 0) { // quicker weapons are below the replication resolution
      const iv = now - t.lastFire;
      if (iv > 0.005 && iv < fireDelay * 0.5) t.rapidAcc++;
      else if (iv > fireDelay * 0.9) t.rapidAcc = Math.max(0, t.rapidAcc - 1);
      if (t.rapidAcc >= 4) { this.flag(t, "rapid", now); t.rapidAcc = 0; }
    }
    t.lastFire = now;
  }

  kill(id: string, name: string, team: number, headshot: boolean): void {
    if (!this.enabled) return;
    const t = this.ensure(id, name, team);
    t.kills++;
    if (headshot) t.hs++;
    if (t.kills >= 6 && t.hs / t.kills >= 0.85 && t.kills - t.hsAt >= 3) { t.hsAt = t.kills; this.flag(t, "hs", t.pt); }
  }

  /** this player killed someone he had no line to (Game checked the world between his eye and the victim) */
  wallKill(id: string, name: string, team: number, now: number): void {
    if (!this.enabled) return;
    this.flag(this.ensure(id, name, team), "wallkill", now);
  }

  /** never flag / list this nick (another GM flying around, a known tester...) */
  ignoreName(nick: string): void { if (nick) this.ignored.add(nick.toLowerCase()); }

  /** a hit of this player as it arrived (HitEvent.baseDamage) against the weapon's own damage `ref` */
  hit(id: string, name: string, team: number, base: number, ref: number, now: number): void {
    if (!this.enabled || ref <= 0) return;
    const t = this.ensure(id, name, team);
    if (base > ref * 1.5 + 2 && now - (t.flags.damage?.last ?? -99) > 2) this.flag(t, "damage", now);
  }

  /** we hit `id` for `dealt` (hp before the hit = `hpBefore`): settle() checks later that his hp really dropped */
  hitSent(id: string, name: string, team: number, hpBefore: number, dealt: number, now: number): void {
    if (!this.enabled || dealt < 10) return;
    this.ensure(id, name, team);
    if (this.pending.length < 64) this.pending.push({ id, t: now, hp: hpBefore });
  }

  settle(now: number, hpOf: (id: string) => { hp: number; alive: boolean } | null): void {
    if (!this.pending.length) return;
    const rest: typeof this.pending = [];
    for (const p of this.pending) {
      if (now - p.t < 0.8) { rest.push(p); continue; }
      const t = this.tracks.get(p.id), a = hpOf(p.id);
      if (!t || !a || !a.alive) continue;
      t.godStrikes = a.hp >= p.hp - 0.5 ? t.godStrikes + 1 : Math.max(0, t.godStrikes - 1);
      if (t.godStrikes >= 4) { this.flag(t, "god", now); t.godStrikes = 0; }
    }
    this.pending = rest;
  }

  list(): DetRow[] {
    const rows: DetRow[] = [];
    for (const t of this.tracks.values()) {
      if (this.ignored.has(t.name.toLowerCase())) continue;
      const score = this.score(t);
      if (score <= 0) continue;
      const keys = (Object.keys(t.flags) as DetFlag[]).filter((k) => this.eff(t, k) > 0);
      if (!keys.length) continue;
      const age = this.now - Math.max(...keys.map((k) => t.flags[k]!.last));
      // red only when SEVERAL kinds of flags agree (a single heuristic firing is never "confirmed")
      const level = score >= HIGH && (keys.length >= 2 || score >= HIGH * 1.5) ? 3 : score >= MED ? 2 : 1;
      rows.push({ id: t.id, name: t.name, team: t.team, score, level, age, flags: keys.map((key) => ({ key, label: DET_LABELS[key], n: t.flags[key]!.n })) });
    }
    return rows.sort((a, b) => b.score - a.score);
  }

  report(): string {
    const rows = this.list();
    if (!rows.length) return "Cheat detector: nothing suspicious.";
    return "Cheat detector (heuristic):\n" + rows.map((r) => `${r.name} [${r.score}] ${r.flags.map((f) => `${f.label} x${f.n}`).join(", ")}`).join("\n");
  }

  remove(id: string): void { this.tracks.delete(id); this.pending = this.pending.filter((p) => p.id !== id); }
  reset(): void { this.tracks.clear(); this.pending = []; this.ignored.clear(); }
}

export const gmDetector = new GmDetector();