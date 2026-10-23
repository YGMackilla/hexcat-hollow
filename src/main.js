import { World } from './systems/sim.js';
import { applyPalette, buildUI } from './systems/ui.js';
import { Input } from './systems/input.js';
import { sfx } from './systems/sfx.js';
import { net } from './systems/net.js';
import { Boot } from './scenes/Boot.js';
import { Title } from './scenes/Title.js';
import { Game } from './scenes/Game.js';
import { GameOver } from './scenes/GameOver.js';

applyPalette();
const ui = buildUI(document.getElementById('app'));
const input = new Input(ui.touch);

const app = {
  world: new World(), ui, input, sfx, net, stage: null, scene: null, scenes: {},
  go(name, data) {
    if (app.scene && app.scene.exit) app.scene.exit();
    app.scene = app.scenes[name];
    app.scene.enter(data);
  },
  netClosed(msg) {
    const n = app.scene;
    if (n === app.scenes.Game || n === app.scenes.GameOver) { app.net.close(); app.go('Title', { msg: msg || 'Disconnected.' }); }
  },
};
app.scenes.Boot = new Boot(app);
app.scenes.Title = new Title(app);
app.scenes.Game = new Game(app);
app.scenes.GameOver = new GameOver(app);
app.game = app.scenes.Game;

// Route keyboard to the active scene; M toggles sound anywhere.
input.onAnyKey = (e) => {
  sfx.unlock();
  if (e.code === 'KeyM' && !e.repeat) { ui.setMuteIcon(sfx.toggle()); sfx.play('click'); return; }
  if (app.scene && app.scene.key) app.scene.key(e);
};
// Browsers only allow audio after a gesture.
const unlock = () => { sfx.unlock(); };
addEventListener('pointerdown', unlock, { passive: true });
addEventListener('touchend', unlock, { passive: true });
ui.setMuteIcon(sfx.muted);

addEventListener('resize', () => { if (app.stage) app.stage.resize(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (app.stage) app.stage.resize(); });
addEventListener('orientationchange', () => setTimeout(() => { if (app.stage) app.stage.resize(); }, 250));

// Network messages from the host go to whichever scene is showing.
net.onMsg = (m) => { if (app.scene && app.scene.onNet) app.scene.onNet(m); };

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (app.scene && app.stage) {
    app.scene.update(dt);
    app.stage.render(dt);
  }
}
requestAnimationFrame(loop);

window.hexcat = app; // handy for debugging in the console
app.go('Boot');
