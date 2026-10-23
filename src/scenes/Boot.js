import { Stage } from '../systems/stage.js';
import { loadMayu } from '../systems/mayu.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Loads the font, builds the 3D stage, warms up shaders. Shows a designed loading bar while it works.
export class Boot {
  constructor(app) { this.app = app; }

  async enter() {
    const { ui } = this.app;
    const set = (p, msg) => { ui.bootFill.style.width = p + '%'; if (msg) ui.bootMsg.textContent = msg; };
    ui.show(ui.boot);
    const t0 = performance.now();
    set(8);
    await frame();
    try { await Promise.race([document.fonts.load("40px 'Chewy'"), wait(3000)]); } catch (e) { /* font optional at this point */ }
    set(15, 'Waking the kitty wizards...');
    await loadMayu((f) => set(15 + Math.round(f * 40)));
    for (let i = 0; i < 6; i++) { const im = new Image(); im.src = './assets/maps/map' + i + '.jpg'; }
    set(58, 'Lighting the pumpkins...');
    await frame();
    try {
      this.app.stage = new Stage(ui.gl);
    } catch (e) {
      ui.bootMsg.textContent = 'This browser cannot run WebGL. Try Chrome, Safari or Firefox.';
      console.error(e);
      return;
    }
    set(75, 'Stitching capes...');
    await frame();
    const s = this.app.stage;
    s.renderer.compile(s.scene, s.camera);
    this.app.world.reset([]);
    s.sync(this.app.world, 0.016, 1);
    s.render(0.016);
    set(92, 'Brewing potions...');
    await frame();
    const rest = 900 - (performance.now() - t0);
    if (rest > 0) await wait(rest);
    set(100, 'Ready!');
    await wait(220);
    ui.hide(ui.boot);
    this.app.go('Title');
  }

  update() {}
  exit() {}
}
