// The Three.js view. Strictly downstream of the simulation: it reads two
// snapshots + an interpolation alpha and draws the world. It never writes back
// into the sim. One mesh per car id is created lazily and reused. M2 draws cars
// as coloured boxes on a gridded ground with a simple follow camera; the shared
// leader camera (driven by Snapshot.camera) arrives in M4.

import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Snapshot } from "../shared/snapshot";
import { interpolateCar } from "./Interpolator";

const CAR_COLORS = [
  0x3b82f6, 0xef4444, 0x22c55e, 0xf59e0b, 0xa855f7, 0x14b8a6, 0xec4899,
  0x84cc16,
];

export class WorldRenderer {
  private readonly parent: HTMLElement;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly carMeshes = new Map<number, Mesh>();
  private readonly carGeometry = new BoxGeometry(1.2, 0.8, 2.0);
  private readonly groundGeometry: PlaneGeometry;
  private readonly groundMaterial: MeshStandardMaterial;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly focus = new Vector3();
  private readonly desiredCamPos = new Vector3();
  private readonly camOffset = new Vector3(0, 16, -15);
  private cameraInitialized = false;
  private readonly onResize = () => this.resize();

  constructor(parent: HTMLElement) {
    this.parent = parent;

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    parent.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(55, 1, 0.1, 400);
    this.camera.position.set(0, 16, -15);
    this.camera.lookAt(0, 0, 0);

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

    this.updateCamera(prev, cur, alpha);
    this.renderer.render(this.scene, this.camera);
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
