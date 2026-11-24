// Wallhack / chams, two layers so it works whatever the character models are made of:
//  1. BOX chams (always): a translucent box + edges around every enemy, drawn with depthTest off on top of the scene.
//     Built only from Actor.feet() / Actor.eye(), so it does not depend on how the model is built.
//  2. MODEL chams (best effort): clones the model's materials with depthTest off, when the actor exposes an Object3D.
import * as THREE from "three";

type Tracked = { color: number; meshes: Map<THREE.Mesh, { mat: THREE.Material | THREE.Material[]; ro: number }> };
export interface ChamActor { feet(out: THREE.Vector3): THREE.Vector3; eye(out: THREE.Vector3): THREE.Vector3 }

/** best-effort lookup of an actor's Object3D (RemoteActor / Bot / CharVisual) */
export function actorRoot(a: unknown): THREE.Object3D | null {
  const x = a as { root?: THREE.Object3D; visual?: { root?: THREE.Object3D }; vis?: { root?: THREE.Object3D }; model?: { root?: THREE.Object3D } };
  return x.root ?? x.visual?.root ?? x.vis?.root ?? x.model?.root ?? null;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const EDGES = new THREE.EdgesGeometry(BOX);

export class GmChams {
  private tracked = new Map<THREE.Object3D, Tracked>();
  private boxes = new Map<unknown, THREE.Group>();
  private t = 0;
  private v = new THREE.Vector3(); private h = new THREE.Vector3();

  update(scene: THREE.Scene, dt: number, entries: { actor: ChamActor; color: number }[], on: boolean): void {
    if (!on) { this.clear(); return; }
    this.t -= dt;
    const rescan = this.t <= 0;
    if (rescan) this.t = 0.4;
    const seenRoots = new Set<THREE.Object3D>(), seenBoxes = new Set<unknown>();
    for (const e of entries) {
      // 1. box
      let g = this.boxes.get(e.actor);
      if (!g) {
        g = new THREE.Group();
        const fill = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: e.color, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false }));
        const edge = new THREE.LineSegments(EDGES, new THREE.LineBasicMaterial({ color: e.color, depthTest: false, depthWrite: false }));
        for (const o of [fill, edge]) { o.renderOrder = 1000; o.frustumCulled = false; g.add(o); }
        g.frustumCulled = false;
        scene.add(g); this.boxes.set(e.actor, g);
      }
      const feet = e.actor.feet(this.v), head = e.actor.eye(this.h);
      const hgt = Math.max(0.5, head.y - feet.y + 0.25);
      g.position.set(feet.x, feet.y + hgt / 2, feet.z);
      g.scale.set(0.7, hgt, 0.7);
      seenBoxes.add(e.actor);
      // 2. model
      const root = actorRoot(e.actor);
      if (!root) continue;
      seenRoots.add(root);
      let tr = this.tracked.get(root);
      if (!tr) { tr = { color: e.color, meshes: new Map() }; this.tracked.set(root, tr); this.apply(root, tr); }
      else if (rescan) this.apply(root, tr);
    }
    for (const [k, g] of this.boxes) if (!seenBoxes.has(k)) { this.dropBox(g); this.boxes.delete(k); }
    for (const [root, tr] of this.tracked) if (!seenRoots.has(root)) { this.restore(tr); this.tracked.delete(root); }
  }

  private apply(root: THREE.Object3D, tr: Tracked): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || tr.meshes.has(m)) return;
      tr.meshes.set(m, { mat: m.material, ro: m.renderOrder });
      const tint = (src: THREE.Material): THREE.Material => {
        const c = src.clone() as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };
        c.depthTest = false; c.depthWrite = false; c.transparent = true;
        c.color?.setHex(tr.color); c.emissive?.setHex(tr.color);
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(tint) : tint(m.material);
      m.renderOrder = 999;
    });
  }

  private restore(tr: Tracked): void {
    for (const [m, o] of tr.meshes) {
      const cur = m.material;
      m.material = o.mat; m.renderOrder = o.ro;
      for (const c of Array.isArray(cur) ? cur : [cur]) c.dispose();
    }
    tr.meshes.clear();
  }

  private dropBox(g: THREE.Group): void {
    g.removeFromParent();
    g.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); });
  }

  clear(): void {
    for (const tr of this.tracked.values()) this.restore(tr);
    this.tracked.clear();
    for (const g of this.boxes.values()) this.dropBox(g);
    this.boxes.clear();
  }
  dispose(): void { this.clear(); }
}