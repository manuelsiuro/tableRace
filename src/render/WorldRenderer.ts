// The Three.js view. Strictly downstream of the simulation: it reads two
// snapshots + an interpolation alpha and draws the world. It never writes back
// into the sim. One mesh per car id is created lazily and reused. M2 draws cars
// as coloured boxes on a gridded ground with a simple follow camera; the shared
// leader camera (driven by Snapshot.camera) arrives in M4.

import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { lerp } from "../shared/math";
import type { PowerupId, Snapshot } from "../shared/snapshot";
import type { SurfaceId, TrackDef } from "../sim/track/TrackDef";
import { POWERUP_DEFS } from "../sim/powerups/PowerupDefs";
import { interpolateCar } from "./Interpolator";

const CAR_COLORS = [
  0x3b82f6, 0xef4444, 0x22c55e, 0xf59e0b, 0xa855f7, 0x14b8a6, 0xec4899,
  0x84cc16,
];

const SURFACE_COLORS: Record<SurfaceId, number> = {
  tarmac: 0x444444,
  grass: 0x3f7d3a,
  ice: 0x9fd8ef,
  sand: 0xd9c089,
  oil: 0x141414,
};

export type CameraMode = "follow" | "shared";

export class WorldRenderer {
  private readonly parent: HTMLElement;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly orthoCamera: OrthographicCamera;
  private readonly cameraMode: CameraMode;
  private readonly renderer: WebGLRenderer;
  private readonly carMeshes = new Map<number, Mesh>();
  private readonly carGeometry = new BoxGeometry(1.2, 0.8, 2.0);
  private readonly groundGeometry: PlaneGeometry;
  private readonly groundMaterial: MeshStandardMaterial;
  private readonly disposables: { dispose(): void }[] = [];
  // Dynamic entity pools, reconciled by id each frame.
  private readonly pickupMeshes = new Map<number, Mesh>();
  private readonly projMeshes = new Map<number, Mesh>();
  private readonly pickupGeometry = new BoxGeometry(1, 1, 1);
  private readonly pickupMaterial = new MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0x665500,
  });
  private readonly missileGeometry = new SphereGeometry(0.35, 12, 12);
  private readonly mineGeometry = new CylinderGeometry(0.5, 0.5, 0.2, 12);
  private readonly oilGeometry = new CircleGeometry(2.6, 20);
  private spinPhase = 0;
  private readonly focus = new Vector3();
  private readonly desiredCamPos = new Vector3();
  private readonly camOffset = new Vector3(0, 16, -15);
  // Shared-camera ortho rig: high and slightly behind, looking at the focus.
  private readonly sharedOffset = new Vector3(0, 60, -28);
  private readonly sharedFocus = new Vector3();
  private cameraInitialized = false;
  // Camera shake (impulse decays each frame); added to the camera position.
  private shake = 0;
  private prevAlive = -1;
  // Skid marks left by drifting cars — a bounded ring of dark quads.
  private readonly skidGeometry = new PlaneGeometry(0.7, 0.7);
  private readonly skidMaterial = new MeshStandardMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.5,
  });
  private readonly skids: Mesh[] = [];
  private skidNext = 0;
  private static readonly MAX_SKIDS = 240;
  private readonly onResize = () => this.resize();

  constructor(parent: HTMLElement, opts: { cameraMode?: CameraMode } = {}) {
    this.parent = parent;
    this.cameraMode = opts.cameraMode ?? "follow";

    // Mobile/low-power devices: skip MSAA and cap the pixel ratio at 1.
    const mobile =
      typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    this.renderer = new WebGLRenderer({ antialias: !mobile });
    this.renderer.setPixelRatio(
      mobile ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    parent.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(55, 1, 0.1, 400);
    this.camera.position.set(0, 16, -15);
    this.camera.lookAt(0, 0, 0);

    this.orthoCamera = new OrthographicCamera(-20, 20, 20, -20, 0.1, 300);
    this.orthoCamera.position.set(0, 60, -28);
    this.orthoCamera.lookAt(0, 0, 0);

    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xffffff, 2);
    sun.position.set(8, 16, 6);
    this.scene.add(sun);

    this.groundGeometry = new PlaneGeometry(200, 200);
    this.groundMaterial = new MeshStandardMaterial({
      color: 0x2c5d34,
      roughness: 1,
    });
    const ground = new Mesh(this.groundGeometry, this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const grid = new GridHelper(200, 100, 0x4b7a52, 0x3a5f40);
    grid.position.y = 0.01;
    this.scene.add(grid);
    this.disposables.push(grid.material as { dispose(): void }, grid.geometry);

    window.addEventListener("resize", this.onResize);
    this.resize();
  }

  render(prev: Snapshot, cur: Snapshot, alpha: number): void {
    for (const car of cur.cars) {
      const mesh = this.meshFor(car.id);
      const prevCar = prev.cars.find((c) => c.id === car.id);
      const t = interpolateCar(prevCar, car, alpha);
      mesh.position.set(t.position.x, t.position.y, t.position.z);
      mesh.quaternion.set(
        t.rotation.x,
        t.rotation.y,
        t.rotation.z,
        t.rotation.w,
      );
      mesh.visible = car.alive;
      const mat = mesh.material as MeshStandardMaterial;
      mat.emissive.setHex(
        car.boosting ? 0x884400 : car.stunned ? 0x444444 : 0x000000,
      );
      if (car.alive && car.drifting)
        this.laySkidMark(t.position.x, t.position.z);
    }

    // Camera shake when a car is eliminated (alive count drops).
    const alive = cur.cars.filter((c) => c.alive).length;
    if (this.prevAlive >= 0 && alive < this.prevAlive) this.shake = 0.6;
    this.prevAlive = alive;
    this.shake *= 0.9;

    this.spinPhase += 0.05;
    this.updatePickups(cur);
    this.updateProjectiles(cur);

    if (this.cameraMode === "shared") {
      this.updateSharedCamera(prev, cur, alpha);
      this.renderer.render(this.scene, this.orthoCamera);
    } else {
      this.updateCamera(prev, cur, alpha);
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Drop a fading skid quad under a drifting car (bounded ring buffer). */
  private laySkidMark(x: number, z: number): void {
    let mark = this.skids[this.skidNext];
    if (!mark) {
      mark = new Mesh(this.skidGeometry, this.skidMaterial);
      mark.rotation.x = -Math.PI / 2;
      this.scene.add(mark);
      this.skids[this.skidNext] = mark;
    }
    mark.position.set(x, 0.03, z);
    this.skidNext = (this.skidNext + 1) % WorldRenderer.MAX_SKIDS;
  }

  /** Reconcile floating pickup boxes against the snapshot (stable ids). */
  private updatePickups(cur: Snapshot): void {
    const seen = new Set<number>();
    for (const p of cur.pickups) {
      seen.add(p.id);
      let mesh = this.pickupMeshes.get(p.id);
      if (!mesh) {
        mesh = new Mesh(this.pickupGeometry, this.pickupMaterial);
        this.scene.add(mesh);
        this.pickupMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, 1, p.z);
      mesh.rotation.y = this.spinPhase;
    }
    for (const [id, mesh] of this.pickupMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.pickupMeshes.delete(id);
      }
    }
  }

  /** Reconcile missiles / mines / oil patches (unique ids) from the snapshot. */
  private updateProjectiles(cur: Snapshot): void {
    const seen = new Set<number>();
    for (const p of cur.projectiles) {
      seen.add(p.id);
      let mesh = this.projMeshes.get(p.id);
      if (!mesh) {
        mesh = this.makeProjectileMesh(p.kind);
        this.scene.add(mesh);
        this.projMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
      if (p.kind === "oil") mesh.rotation.x = -Math.PI / 2;
    }
    for (const [id, mesh] of this.projMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        (mesh.material as MeshStandardMaterial).dispose();
        this.projMeshes.delete(id);
      }
    }
  }

  private makeProjectileMesh(kind: PowerupId): Mesh {
    const geo =
      kind === "missile"
        ? this.missileGeometry
        : kind === "mine"
          ? this.mineGeometry
          : this.oilGeometry;
    const mat = new MeshStandardMaterial({ color: POWERUP_DEFS[kind].color });
    return new Mesh(geo, mat);
  }

  /** Build static visuals (walls, ramp, surface patches) from a TrackDef. */
  setTrack(track: TrackDef): void {
    for (const c of track.colliders) {
      if (c.kind === "box") {
        const geo = new BoxGeometry(
          c.halfExtents.x * 2,
          c.halfExtents.y * 2,
          c.halfExtents.z * 2,
        );
        const mat = new MeshStandardMaterial({
          color: 0x8a8f98,
          roughness: 0.9,
        });
        const mesh = new Mesh(geo, mat);
        mesh.position.set(c.position.x, c.position.y, c.position.z);
        if (c.rotation)
          mesh.quaternion.set(
            c.rotation.x,
            c.rotation.y,
            c.rotation.z,
            c.rotation.w,
          );
        this.scene.add(mesh);
        this.disposables.push(geo, mat);
      } else {
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(c.vertices, 3));
        geo.setIndex(c.indices);
        geo.computeVertexNormals();
        const mat = new MeshStandardMaterial({
          color: 0xb45309,
          roughness: 0.8,
        });
        this.scene.add(new Mesh(geo, mat));
        this.disposables.push(geo, mat);
      }
    }

    for (const zone of track.surfaceZones) {
      const w = zone.area.maxX - zone.area.minX;
      const d = zone.area.maxZ - zone.area.minZ;
      const geo = new PlaneGeometry(w, d);
      const mat = new MeshStandardMaterial({
        color: SURFACE_COLORS[zone.surface],
        roughness: 1,
        transparent: true,
        opacity: 0.85,
      });
      const mesh = new Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(
        (zone.area.minX + zone.area.maxX) / 2,
        0.02,
        (zone.area.minZ + zone.area.maxZ) / 2,
      );
      this.scene.add(mesh);
      this.disposables.push(geo, mat);
    }
  }

  /** Simple follow of car 0 (placeholder until the M4 shared leader camera). */
  private updateCamera(prev: Snapshot, cur: Snapshot, alpha: number): void {
    const lead = cur.cars[0];
    if (!lead) return;
    const t = interpolateCar(
      prev.cars.find((c) => c.id === lead.id),
      lead,
      alpha,
    );
    this.focus.set(t.position.x, t.position.y, t.position.z);
    this.desiredCamPos.copy(this.focus).add(this.camOffset);
    if (!this.cameraInitialized) {
      this.camera.position.copy(this.desiredCamPos);
      this.cameraInitialized = true;
    } else {
      this.camera.position.lerp(this.desiredCamPos, 0.08);
    }
    this.camera.lookAt(this.focus);
  }

  /** Shared leader camera driven by the authoritative Snapshot.camera (M4). */
  private updateSharedCamera(
    prev: Snapshot,
    cur: Snapshot,
    alpha: number,
  ): void {
    const x = lerp(prev.camera.x, cur.camera.x, alpha);
    const z = lerp(prev.camera.z, cur.camera.z, alpha);
    const zoom =
      lerp(prev.camera.zoom, cur.camera.zoom, alpha) || cur.camera.zoom;

    this.sharedFocus.set(x, 0, z);
    this.orthoCamera.position.copy(this.sharedFocus).add(this.sharedOffset);
    // Camera shake: deterministic jitter scaled by the decaying impulse.
    if (this.shake > 0.01) {
      const s = this.shake;
      this.orthoCamera.position.x += Math.sin(this.spinPhase * 37) * s;
      this.orthoCamera.position.z += Math.cos(this.spinPhase * 31) * s;
    }
    this.orthoCamera.lookAt(this.sharedFocus);

    const aspect =
      (this.parent.clientWidth || 1) / (this.parent.clientHeight || 1);
    this.orthoCamera.top = zoom;
    this.orthoCamera.bottom = -zoom;
    this.orthoCamera.left = -zoom * aspect;
    this.orthoCamera.right = zoom * aspect;
    this.orthoCamera.updateProjectionMatrix();
  }

  private meshFor(id: number): Mesh {
    let mesh = this.carMeshes.get(id);
    if (!mesh) {
      const material = new MeshStandardMaterial({
        color: CAR_COLORS[id % CAR_COLORS.length],
        roughness: 0.5,
      });
      this.disposables.push(material);
      mesh = new Mesh(this.carGeometry, material);
      this.scene.add(mesh);
      this.carMeshes.set(id, mesh);
    }
    return mesh;
  }

  private resize(): void {
    const w = this.parent.clientWidth || window.innerWidth;
    const h = this.parent.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.carGeometry.dispose();
    this.groundGeometry.dispose();
    this.groundMaterial.dispose();
    this.pickupGeometry.dispose();
    this.pickupMaterial.dispose();
    this.missileGeometry.dispose();
    this.mineGeometry.dispose();
    this.oilGeometry.dispose();
    this.skidGeometry.dispose();
    this.skidMaterial.dispose();
    for (const mesh of this.projMeshes.values())
      (mesh.material as MeshStandardMaterial).dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
