// The Three.js view. Strictly downstream of the simulation: it reads two
// snapshots + an interpolation alpha and draws the world. It never writes back
// into the sim. One mesh per car id is created lazily and reused. M2 draws cars
// as coloured boxes on a gridded ground with a simple follow camera; the shared
// leader camera (driven by Snapshot.camera) arrives in M4.

import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { lerp } from "../shared/math";
import type { Snapshot } from "../shared/snapshot";
import type { SurfaceId, TrackDef } from "../sim/track/TrackDef";
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
  private readonly focus = new Vector3();
  private readonly desiredCamPos = new Vector3();
  private readonly camOffset = new Vector3(0, 16, -15);
  // Shared-camera ortho rig: high and slightly behind, looking at the focus.
  private readonly sharedOffset = new Vector3(0, 60, -28);
  private readonly sharedFocus = new Vector3();
  private cameraInitialized = false;
  private readonly onResize = () => this.resize();

  constructor(parent: HTMLElement, opts: { cameraMode?: CameraMode } = {}) {
    this.parent = parent;
    this.cameraMode = opts.cameraMode ?? "follow";

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    }

    if (this.cameraMode === "shared") {
      this.updateSharedCamera(prev, cur, alpha);
      this.renderer.render(this.scene, this.orthoCamera);
    } else {
      this.updateCamera(prev, cur, alpha);
      this.renderer.render(this.scene, this.camera);
    }
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
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
