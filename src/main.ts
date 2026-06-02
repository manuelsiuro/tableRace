import { Game } from "./game/Game";

const mount = document.getElementById("app");
if (!mount) throw new Error("#app mount element not found");

new Game(mount).start().catch((err) => {
  console.error("Failed to start game:", err);
  mount.textContent = "Failed to start. See console.";
});
