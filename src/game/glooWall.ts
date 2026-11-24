import * as THREE from "three";
import type RAPIER_NS from "@dimforge/rapier3d-compat";

interface WallInstance {
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  edgeMat: THREE.LineBasicMaterial;
  colliders: RAPIER_NS.Collider[];
  handles: number[];
  hp: number;
  maxHp: number;
  expiresAt: number;
}

const PANELS = [
  { lx: 0, lz: -0.18, ry: 0, w: 1.25, h: 2.15, d: 0.24 },
  { lx: -1.08, lz: 0.08, ry: 0.42, w: 1.05, h: 2.02, d: 0.24 },
  { lx: 1.08, lz: 0.08, ry: -0.42, w: 1.05, h: 2.02, d: 0.24 },
];

export class GlooWallSystem {
  readonly maxWalls = 10;
  readonly regenInterval = 30; // 1 glowal setiap 30 detik
  count = 2;
  regenTimer = 0;

  previewActive = false;
  previewDistance = 2.6;
  readonly minDistance = 1.5;
  readonly maxDistance = 12.0;

  private previewGroup: THREE.Group | null = null;
  private previewMat: THREE.MeshStandardMaterial | null = null;
  private previewEdgeMat: THREE.LineBasicMaterial | null = null;
  private previewPos = new THREE.Vector3();
  private previewYaw = 0;
  private previewValid = false;

  private walls: WallInstance[] = [];
  private handleMap = new Map<number, WallInstance>();
  private hudEl: HTMLElement | null = null;
  private hudRingEl: HTMLElement | null = null;
  private hudCountEl: HTMLElement | null = null;
  private hudTimerEl: HTMLElement | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER_NS.World,
    private readonly R: typeof RAPIER_NS,
  ) {}

  reset(): void {
    this.cancelPreview();
    this.clearAll();
    this.count = 2;
    this.regenTimer = 0;
  }

  togglePreview(): boolean {
    if (this.previewActive) {
      this.cancelPreview();
      return false;
    }
    if (this.count <= 0) return false;
    this.previewActive = true;
    this.previewDistance = 2.6;
    this.ensurePreviewMesh();
    return true;
  }

  cancelPreview(): void {
    this.previewActive = false;
    if (this.previewGroup) {
      this.previewGroup.visible = false;
    }
  }

  adjustPreviewDistance(delta: number): void {
    if (!this.previewActive) return;
    this.previewDistance = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.previewDistance + delta),
    );
  }

  private ensurePreviewMesh(): void {
    if (this.previewGroup) {
      this.previewGroup.visible = true;
      return;
    }
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.9,
    });
    for (const p of PANELS) {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.lx, p.h * 0.5, p.lz);
      mesh.rotation.y = p.ry;
      group.add(mesh);
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
    }
    this.scene.add(group);
    this.previewGroup = group;
    this.previewMat = mat;
    this.previewEdgeMat = edgeMat;
  }

  updatePreview(feetPos: THREE.Vector3, yaw: number, pitch: number): void {
    if (!this.previewActive || this.count <= 0) {
      if (this.previewGroup) this.previewGroup.visible = false;
      this.previewActive = false;
      return;
    }
    this.ensurePreviewMesh();

    // Atur jarak secara natural lewat sudut pandangan vertikal (pitch) + scroll wheel
    // pitch negatif (menunduk) = dekat (1.5m), pitch mendatar/atas = jauh hingga 12m
    const pitchNorm = Math.max(0, Math.min(1, (pitch + 0.65) / 0.95));
    const pitchDist = this.minDistance + pitchNorm * (this.maxDistance - this.minDistance);
    const dist = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, pitchDist * 0.72 + this.previewDistance * 0.28),
    );

    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const tx = feetPos.x - sinY * dist;
    const tz = feetPos.z - cosY * dist;

    // Raycast ke bawah agar bayangan menempel akurat ke lantai/tanah
    let ty = feetPos.y;
    const groundRay = new this.R.Ray({ x: tx, y: feetPos.y + 2.5, z: tz }, { x: 0, y: -1, z: 0 });
    const groundHit = this.world.castRay(groundRay, 6.0, true);
    if (groundHit && Number.isFinite(groundHit.timeOfImpact)) {
      ty = feetPos.y + 2.5 - groundHit.timeOfImpact;
    }

    this.previewPos.set(tx, ty, tz);
    this.previewYaw = yaw;
    this.previewValid = Math.abs(ty - feetPos.y) <= 3.2;

    if (this.previewGroup && this.previewMat && this.previewEdgeMat) {
      this.previewGroup.visible = true;
      this.previewGroup.position.copy(this.previewPos);
      this.previewGroup.rotation.y = yaw;
      if (this.previewValid) {
        this.previewMat.color.setHex(0x38bdf8);
        this.previewMat.emissive.setHex(0x0ea5e9);
        this.previewEdgeMat.color.setHex(0xe0f2fe);
      } else {
        this.previewMat.color.setHex(0xf87171);
        this.previewMat.emissive.setHex(0xdc2626);
        this.previewEdgeMat.color.setHex(0xfee2e2);
      }
    }
  }

  confirmDeploy(now: number): boolean {
    if (!this.previewActive || !this.previewValid || this.count <= 0) return false;
    const ok = this.deployAt(this.previewPos, this.previewYaw, now);
    this.cancelPreview();
    return ok;
  }

  private ensureHud(): void {
    if (typeof document === "undefined") return;
    if (this.hudEl && document.body.contains(this.hudEl)) return;
    const existing = document.getElementById("pb-gloowall-hud");
    if (existing) existing.remove();

    const wrap = document.createElement("div");
    wrap.id = "pb-gloowall-hud";
    wrap.style.cssText = [
      "position:fixed",
      "right:236px",
      "bottom:14px",
      "z-index:24",
      "display:flex",
      "align-items:center",
      "gap:8px",
      "padding:6px 10px",
      "border-radius:10px",
      "background:rgba(10,18,28,0.78)",
      "border:1.5px solid rgba(88,199,255,0.55)",
      "box-shadow:0 4px 14px rgba(0,0,0,0.45)",
      "color:#e4f7ff",
      "font:600 11px/1.2 system-ui,sans-serif",
      "pointer-events:none",
      "user-select:none",
      "transition:border-color .15s,box-shadow .15s,transform .15s",
    ].join(";");

    wrap.innerHTML = `
      <div style="position:relative;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 35%,rgba(88,199,255,0.28),rgba(15,23,42,0.85))">
        <span class="pb-gw-hud-ring" style="position:absolute;inset:-2px;border-radius:50%;padding:2.5px;-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;background:conic-gradient(#38bdf8 360deg,rgba(30,41,59,0.65) 360deg)"></span>
        <svg viewBox="0 0 32 24" width="24" height="18" fill="none" stroke="#aee8ff" stroke-width="1.8" stroke-linejoin="round">
          <path d="M2 7.5 L8.5 5.2 L8.5 18.8 L2 20.5 Z" fill="rgba(88,199,255,0.42)"/>
          <path d="M9.8 4.6 L22.2 4.6 L22.2 18.4 L9.8 18.4 Z" fill="rgba(88,199,255,0.58)"/>
          <path d="M23.5 5.2 L30 7.5 L30 20.5 L23.5 18.8 Z" fill="rgba(88,199,255,0.42)"/>
        </svg>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;min-width:58px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <span style="font-size:10px;letter-spacing:.4px;color:#7dd3fc;text-transform:uppercase">Glowal</span>
          <span style="font-size:9px;padding:1px 4px;border-radius:4px;background:rgba(56,189,248,0.2);border:1px solid rgba(125,211,252,0.45);color:#e0f2fe">CAPS</span>
        </div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:6px">
          <span class="pb-gw-hud-count" style="font-size:13px;font-weight:800;color:#ffffff">2/10</span>
          <span class="pb-gw-hud-timer" style="font-size:10px;font-weight:700;color:#38bdf8">30s</span>
        </div>
      </div>
    `;

    // Sembunyikan widget PC ini pada perangkat layar sentuh yang sudah memakai tombol bulat virtual-keymapping
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
      wrap.style.display = "none";
    }

    document.body.appendChild(wrap);
    this.hudEl = wrap;
    this.hudRingEl = wrap.querySelector(".pb-gw-hud-ring");
    this.hudCountEl = wrap.querySelector(".pb-gw-hud-count");
    this.hudTimerEl = wrap.querySelector(".pb-gw-hud-timer");
  }

  private syncHud(): void {
    this.ensureHud();
    if (!this.hudEl) return;
    const st = this.getHudState();
    if (this.hudCountEl) {
      this.hudCountEl.textContent = `${st.count}/${st.max}`;
      this.hudCountEl.style.color = st.count > 0 ? "#ffffff" : "#94a3b8";
    }
    if (this.hudTimerEl) {
      this.hudTimerEl.textContent = st.count >= st.max ? "MAX" : `+${st.secsLeft}s`;
      this.hudTimerEl.style.color = st.count >= st.max ? "#4ade80" : "#38bdf8";
    }
    if (this.hudRingEl) {
      const deg = Math.round(st.progress * 360);
      this.hudRingEl.style.background = `conic-gradient(#38bdf8 ${deg}deg, rgba(30, 41, 59, 0.7) ${deg}deg)`;
    }
    if (st.previewing) {
      this.hudEl.style.borderColor = "#fde047";
      this.hudEl.style.boxShadow = "0 0 16px rgba(56,189,248,0.85), inset 0 0 8px rgba(253,224,71,0.35)";
      this.hudEl.style.transform = "translateY(-2px)";
    } else {
      this.hudEl.style.borderColor = st.count > 0 ? "rgba(88,199,255,0.55)" : "rgba(148,163,184,0.35)";
      this.hudEl.style.boxShadow = "0 4px 14px rgba(0,0,0,0.45)";
      this.hudEl.style.transform = "none";
    }
  }

  clearAll(): void {
    this.cancelPreview();
    for (const w of this.walls) {
      this.scene.remove(w.group);
      w.mat.dispose();
      w.edgeMat.dispose();
      for (const c of w.colliders) {
        try {
          this.world.removeCollider(c, true);
        } catch {
          // ignore
        }
      }
    }
    this.walls.length = 0;
    this.handleMap.clear();
  }

  hasCollider(handle: number): boolean {
    return this.handleMap.has(handle);
  }

  damageByHandle(handle: number, dmg: number): boolean {
    const w = this.handleMap.get(handle);
    if (!w) return false;
    w.hp -= Math.max(1, dmg);
    const ratio = Math.max(0.18, w.hp / w.maxHp);
    w.mat.opacity = 0.35 + ratio * 0.48;
    w.mat.emissiveIntensity = 0.15 + (1 - ratio) * 0.45;
    if (w.hp <= 0) {
      this.removeWall(w);
      return true;
    }
    return false;
  }

  deploy(feetPos: THREE.Vector3, yaw: number, now: number): boolean {
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const pos = new THREE.Vector3(feetPos.x - sinY * 2.3, feetPos.y, feetPos.z - cosY * 2.3);
    return this.deployAt(pos, yaw, now);
  }

  deployAt(basePos: THREE.Vector3, yaw: number, now: number): boolean {
    if (this.count <= 0) return false;
    this.count--;

    const cx = basePos.x;
    const cy = basePos.y;
    const cz = basePos.z;

    const group = new THREE.Group();
    group.position.set(cx, cy, cz);
    group.rotation.y = yaw;

    const mat = new THREE.MeshStandardMaterial({
      color: 0x58c7ff,
      emissive: 0x1668b8,
      emissiveIntensity: 0.25,
      roughness: 0.22,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85,
    });
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xd8f3ff,
      transparent: true,
      opacity: 0.8,
    });

    const colliders: RAPIER_NS.Collider[] = [];
    const handles: number[] = [];

    for (const p of PANELS) {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.lx, p.h * 0.5, p.lz);
      mesh.rotation.y = p.ry;
      group.add(mesh);

      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      mesh.add(wire);

      const worldYaw = yaw + p.ry;
      const wx = cx + Math.cos(yaw) * p.lx + Math.sin(yaw) * p.lz;
      const wy = cy + p.h * 0.5;
      const wz = cz - Math.sin(yaw) * p.lx + Math.cos(yaw) * p.lz;
      const halfYaw = worldYaw * 0.5;

      const desc = this.R.ColliderDesc.cuboid(p.w * 0.5, p.h * 0.5, p.d * 0.5)
        .setTranslation(wx, wy, wz)
        .setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) });
      const col = this.world.createCollider(desc);
      colliders.push(col);
      handles.push(col.handle);
    }

    this.scene.add(group);
    const inst: WallInstance = {
      group,
      mat,
      edgeMat,
      colliders,
      handles,
      hp: 450,
      maxHp: 450,
      expiresAt: now + 25,
    };
    this.walls.push(inst);
    for (const h of handles) this.handleMap.set(h, inst);
    return true;
  }

  private removeWall(w: WallInstance): void {
    const idx = this.walls.indexOf(w);
    if (idx >= 0) this.walls.splice(idx, 1);
    for (const h of w.handles) this.handleMap.delete(h);
    this.scene.remove(w.group);
    w.mat.dispose();
    w.edgeMat.dispose();
    for (const c of w.colliders) {
      try {
        this.world.removeCollider(c, true);
      } catch {
        // ignore
      }
    }
  }

  update(dt: number, now: number): void {
    // Regenerasi 1 Gloo Wall setiap 30 detik hingga maksimal 10
    if (this.count < this.maxWalls) {
      this.regenTimer += dt;
      if (this.regenTimer >= this.regenInterval) {
        this.regenTimer -= this.regenInterval;
        this.count = Math.min(this.maxWalls, this.count + 1);
      }
    } else {
      this.regenTimer = 0;
    }

    for (let i = this.walls.length - 1; i >= 0; i--) {
      if (now >= this.walls[i].expiresAt) {
        this.removeWall(this.walls[i]);
      }
    }
    this.syncHud();
  }

  getHudState(): { count: number; max: number; secsLeft: number; progress: number; previewing: boolean } {
    const full = this.count >= this.maxWalls;
    const secsLeft = full ? 0 : Math.ceil(this.regenInterval - this.regenTimer);
    const progress = full ? 1 : Math.max(0, Math.min(1, this.regenTimer / this.regenInterval));
    return { count: this.count, max: this.maxWalls, secsLeft, progress, previewing: this.previewActive };
  }
}
