import { store } from '../systems/storage.js';
import { roomFromUrl } from '../systems/net.js';
import { STAFFS, STAFF_INDEX } from '../systems/staff-list.js';

// Title screen with a bots-only match playing behind it.
export class Title {
  constructor(app) {
    this.app = app;
    this.room = roomFromUrl();
    this.endT = 0;
    this.go = (pad) => {
      this.app.sfx.unlock(); this.app.sfx.play('go');
      const p1devs = ['kb1', 'touch']; if (pad) p1devs.push(pad);
      this.app.game.locals = [];
      this.app.go('Game', { mode: 'solo', p1devs });
    };
    this.joinGo = () => { this.app.sfx.unlock(); this.app.sfx.play('go'); this.app.go('Game', { mode: 'client', room: this.room }); };
    const { ui } = app;
    ui.btnPlay.addEventListener('click', () => { if (this.active) this.go(null); });
    ui.btnJoin.addEventListener('click', () => { if (this.active) this.joinGo(); });
    this.pick = Math.max(0, STAFF_INDEX[store.staff] || 0);
    const step = (d) => { this.pick = (this.pick + d + STAFFS.length) % STAFFS.length; this.showStaff(); app.sfx.unlock(); app.sfx.play('click'); };
    ui.staffPrev.addEventListener('click', () => { if (this.active) step(-1); });
    ui.staffNext.addEventListener('click', () => { if (this.active) step(1); });
    this.step = step;
    for (const b of ui.muteBtns) b.addEventListener('click', () => { app.sfx.unlock(); ui.setMuteIcon(app.sfx.toggle()); app.sfx.play('click'); });
    this.key = (e) => {
      if (!this.active || e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.step(-1); return; }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.step(1); return; }
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        if (this.room) this.joinGo(); else this.go(null);
      }
    };
  }

  enter(data) {
    const { app } = this, { ui, world, stage, sfx } = app;
    this.active = true;
    app.net.close();
    if (!this.ev) this.ev = (t, a, b, x, z, k, x2, z2) => stage.event(t, a, b, x, z, k, x2, z2);
    world.onEvent = this.ev;
    world.frozen = false;
    world.reset([]);
    stage.setLocal(-1);
    stage.resetViews();
    ui.hide(ui.hud); ui.hide(ui.over); app.input.showTouch(false);
    ui.show(ui.title);
    ui.titleMsg.textContent = (data && data.msg) || '';
    ui.btnJoin.style.display = this.room ? '' : 'none';
    ui.btnJoin.textContent = this.room ? 'Join room ' + this.room : '';
    ui.helpDesktop.style.display = app.input.touch ? 'none' : '';
    ui.helpTouch.style.display = app.input.touch ? '' : 'none';
    ui.titleBest.textContent = store.best > 0 ? 'Best score: ' + store.best : '';
    ui.setMuteIcon(sfx.muted);
    this.endT = 0;
    this.showStaff();
  }

  // Show the browsed staff; only unlocked staffs are equipped. The nearest background wizard holds it as a preview.
  showStaff() {
    const { ui, world } = this.app, s = STAFFS[this.pick], ok = s.need(store.stats);
    ui.staffName.textContent = s.name;
    ui.staffHow.textContent = !ok ? 'Locked: ' + s.how.toLowerCase() + ' (' + s.prog(store.stats) + ')'
      : s.how === 'Starting staff' ? 'Equipped' : 'Equipped (unlocked: ' + s.how.toLowerCase() + ')';
    ui.staffPick.classList.toggle('locked', !ok);
    if (ok) store.setStaff(s.id);
    world.wizards[0].staff = s.id;
  }

  update(dt) {
    const { world, stage, input } = this.app;
    input.update();
    const pad = this.active ? input.confirmPressed() : null;
    if (pad) { if (this.room) this.joinGo(); else this.go(pad); return; }
    world.update(dt);
    stage.sync(world, dt, 1);
    stage.orbit(dt);
    if (world.over) {
      this.endT += dt;
      if (this.endT > 3) { this.endT = 0; world.setMap(world.map + 1); world.reset([]); }
    }
  }

  exit() { this.active = false; this.app.ui.hide(this.app.ui.title); }
}
