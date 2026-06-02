// The Three.js view. Strictly downstream of the simulation: it reads two
// snapshots + an interpolation alpha and draws the world. It never writes back
// into the sim. One mesh per car id is created lazily and reused. M1 draws cars
// as simple boxes and a static ground; real car/track meshes arrive in M2/M3.

import {
  AmbientLight,
  BoxGeometry,
  Clock,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from "three";
import type { Snapshot } from "../shared/snapshot";
import { interpolateCar } from "./Interpolator";

export class WorldRenderer {
  private readonly parent: HTMLElement;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly carMeshes = new Map<number, Mesh>();
  private readonly carGeometry = new BoxGeometry(1.2, 1.2, 2.0);
  private readonly groundGeometry: PlaneGeometry;
  private readonly groundMaterial: MeshStandardMaterial;
  private readonly carMaterial: MeshStandardMaterial;
  private readonly clock = new Clock();
  private readonly onResize = () => this.resize();

  constructor(parent: HTMLElement) {
    this.parent = parent;

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    parent.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(55, 1, 0.1, 200);
    this.camera.position.set(9, 9, 12);
    this.camera.lookAt(0, 2, 0);

    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xffffff, 2);
    sun.position.set(6, 12, 8);
    this.scene.add(sun);

    this.groundGeometry = new PlaneGeometry(100, 100);
    this.groundMaterial = new MeshStandardMaterial({
      color: 0x2c5d34,
      roughness: 1,
    });
    const ground = new Mesh(this.groundGeometry, this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    this.carMaterial = new MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.5,
    });

    window.addEventListener("resize", this.onResize);
    this.resize();
  }

  render(prev: Snapshot, cur: Snapshot, alpha: number): void {
    // Touch the clock so future per-frame effects can read a delta.
    this.clock.getDelta();

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

    this.renderer.render(this.scene, this.camera);
  }

  private meshFor(id: number): Mesh {
    let mesh = this.carMeshes.get(id);
    if (!mesh) {
      mesh = new Mesh(this.carGeometry, this.carMaterial);
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
    this.carMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
