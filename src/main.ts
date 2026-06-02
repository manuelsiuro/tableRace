import { Game } from "./game/Game";

const mount = document.getElementById("app");
if (!mount) throw new Error("#app mount element not found");

new Game(mount).start();
