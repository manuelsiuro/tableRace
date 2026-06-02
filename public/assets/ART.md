# Art pipeline (TableRace)

The game runs today on **gray-box visuals** (colored boxes for cars, a procedural
track, Pixi text HUD). Swapping in real art is wired but the asset *files* still
need to be generated with external tooling:

## Cars (`cars/<id>.glb`)
Author low-poly cars in Blender, export Draco-compressed GLB. Load with the
existing `GLTFLoader` wrapper and render in place of the box mesh in
`src/render/WorldRenderer.ts` (`meshFor`). Use the `blender-mcp` skill /
`asset-pipeline` agent. Match the car ids in `src/sim/car/CarStats.ts`
(`balanced`, `speedster`, `gripper`, `heavy`).

## Tracks (`tracks/<id>.glb`)
Author in Blender using the naming convention parsed by
`src/tracks/TrackLoader.ts` (already implemented + unit-tested):
`COL_*` colliders, `VIS_*` visuals, `SPAWN_##`, `SURF_<type>_*`, `CP_##`,
`WP_##`, `PU_##`. `loadTrack(url, id)` returns the same `TrackDef` the
procedural arena produces, so the sim/renderer need no changes.

## HUD icons (`hud/*.png`)
Generate a cohesive icon set (boost / shield / missile / mine / oil + lap /
position glyphs) with the `local-image` (FLUX) skill via `game-icon-prompt`,
then draw them in `src/ui/Hud.ts` next to the text.

Until these exist, everything is fully playable with the placeholder visuals.
