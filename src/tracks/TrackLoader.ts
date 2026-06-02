// Loads a Blender-authored .glb into a TrackDef by the naming convention (see
// TrackDef.classifyNode). Render-side: it uses three to read geometry, then
// extracts PLAIN vertex/index arrays so the sim never imports three. Wired in
// M9 when real track art exists; the parsing brain (classifyNode) is already
// unit-tested in sim/track/TrackDef.test.ts.

import { Box3, Mesh, Quaternion, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  classifyNode,
  type Checkpoint,
  type StaticCollider,
  type SurfaceZone,
  type Spawn,
  type TrackDef,
} from "../sim/track/TrackDef";
import type { Vec3 } from "../shared/math";

const _q = new Quaternion();
function yawOf(obj: Object3D): number {
  const q = obj.getWorldQuaternion(_q);
  return Math.atan2(
    2 * (q.w * q.y + q.x * q.z),
    1 - 2 * (q.y * q.y + q.z * q.z),
  );
}

function worldPos(obj: Object3D): Vec3 {
  const p = obj.getWorldPosition(new Vector3());
  return { x: p.x, y: p.y, z: p.z };
}

/** World-space trimesh collider extracted from a mesh's geometry. */
function meshToTrimesh(mesh: Mesh): StaticCollider {
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position");
  const v = new Vector3();
  const vertices: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    vertices.push(v.x, v.y, v.z);
  }
  const indexAttr = geo.getIndex();
  const indices: number[] = indexAttr
    ? Array.from(indexAttr.array)
    : Array.from({ length: pos.count }, (_, i) => i);
  return { kind: "trimesh", vertices, indices };
}

export async function loadTrack(url: string, id: string): Promise<TrackDef> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);

  const colliders: StaticCollider[] = [];
  const spawnEntries: { index: number; spawn: Spawn }[] = [];
  const surfaceZones: SurfaceZone[] = [];
  const checkpoints: Checkpoint[] = [];
  const waypointEntries: { index: number; pos: Vec3 }[] = [];
  const powerupSpawns: Vec3[] = [];

  gltf.scene.traverse((obj) => {
    const c = classifyNode(obj.name);
    switch (c.role) {
      case "collision":
        if (obj instanceof Mesh) colliders.push(meshToTrimesh(obj));
        break;
      case "spawn": {
        const p = worldPos(obj);
        spawnEntries.push({
          index: c.index ?? spawnEntries.length,
          spawn: { x: p.x, z: p.z, yaw: yawOf(obj) },
        });
        break;
      }
      case "surface": {
        const box = new Box3().setFromObject(obj);
        surfaceZones.push({
          area: {
            minX: box.min.x,
            maxX: box.max.x,
            minZ: box.min.z,
            maxZ: box.max.z,
          },
          surface: c.surface ?? "tarmac",
        });
        break;
      }
      case "checkpoint": {
        const p = worldPos(obj);
        checkpoints.push({
          index: c.index ?? checkpoints.length,
          x: p.x,
          z: p.z,
          radius: 6,
        });
        break;
      }
      case "waypoint":
        waypointEntries.push({
          index: c.index ?? waypointEntries.length,
          pos: worldPos(obj),
        });
        break;
      case "powerup":
        powerupSpawns.push(worldPos(obj));
        break;
      default:
        break;
    }
  });

  const bounds = new Box3().setFromObject(gltf.scene);
  return {
    id,
    spawns: spawnEntries.sort((a, b) => a.index - b.index).map((e) => e.spawn),
    colliders,
    surfaceZones,
    checkpoints: checkpoints.sort((a, b) => a.index - b.index),
    waypoints: waypointEntries
      .sort((a, b) => a.index - b.index)
      .map((e) => e.pos),
    powerupSpawns,
    bounds: {
      minX: bounds.min.x,
      maxX: bounds.max.x,
      minZ: bounds.min.z,
      maxZ: bounds.max.z,
    },
  };
}
