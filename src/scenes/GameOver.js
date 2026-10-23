import { store } from '../systems/storage.js';
import { countUp } from '../systems/fx.js';

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

export class GameOver {
  constructor(app) {
    this.app = app;
    this.active = false;
    const { ui } = app;
    ui.btnAgain.addEventListener('click', () => { if (this.active) this.again(); });
    ui.btnMenu.addEventListener('click', () => { if (this.active) { app.sfx.play('click'); app.net.close(); app.go('Title'); } });
  }

  enter(d) {
    const { app } = this, { ui, stage, world, sfx } = app;
    this.active = true; this.data = d; this.waiting = false; this.t = 0;
    app.input.showTouch(false);
    ui.overH.textContent = d.won ? 'VICTORY!' : 'KNOCKED OUT';
    ui.overH.className = d.won ? 'win' : 'lose';
    ui.overPlace.textContent = d.won ? 'Last cat standing' : 'You finished ' + (ORD[d.place] || d.place + 'th') + ' of ' + world.wizards.length;
    ui.overDetail.textContent = (d.players > 1 ? 'P1: ' : '') + d.kills + (d.kills === 1 ? ' knockout' : ' knockouts') + '  ·  survived ' + d.secs + 's';
    if (d.winnerLabel && d.players > 1) { ui.overH.textContent = d.winnerLabel.toUpperCase(); ui.overH.className = 'win'; }
    if (d.winnerLabel && !d.won) ui.overPlace.textContent += ' · ' + d.winnerLabel;
    ui.overScore.textContent = '0';
    const isBest = store.submitScore(d.score);
    ui.overBest.textContent = isBest ? 'NEW BEST!' : 'Best: ' + store.best;
    ui.overBest.style.animation = isBest ? '' : 'none';
    ui.overMsg.textContent = d.mode !== 'client' ? 'Next arena: ' + d.nextMap : '';
    ui.overUnlock.textContent = d.unlocked && d.unlocked.length ? 'NEW STAFF UNLOCKED: ' + d.unlocked.join(', ') + '!' : '';
    if (d.unlocked && d.unlocked.length) { sfx.play('ultready'); }
    ui.btnAgain.textContent = d.mode === 'client' ? 'Ready for next round' : 'Play again';
    ui.btnAgain.disabled = false;
    ui.show(ui.over);
    countUp(ui.overScore, d.score, 1100, (n) => String(n));
    stage.setLocal(-1);
    ui.btnAgain.focus({ preventScroll: true });
  }

  again() {
    const { app } = this, { ui, sfx } = app;
    sfx.unlock(); sfx.play('go');
    if (this.data.mode === 'client') {
      this.waiting = true;
      ui.overMsg.textContent = 'Waiting for the host to start the next round...';
      ui.btnAgain.disabled = true;
    } else app.go('Game', { mode: 'solo', keepLocals: true });
  }

  key(e) {
    if (!this.active || e.repeat) return;
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!this.waiting) this.again(); }
    else if (e.code === 'Escape') { this.app.net.close(); this.app.go('Title'); }
  }

  onNet(m) {
    if (m && m.t === 'welcome') this.app.go('Game', { mode: 'client', resume: true, welcome: m });
  }

  update(dt) {
    const { world, stage, input } = this.app;
    input.update();
    this.t = (this.t || 0) + dt;
    if (this.active && !this.waiting && this.t > 0.8 && input.confirmPressed()) this.again();
    if (this.data.mode === 'client') {
      this.pingT = (this.pingT || 0) + dt;
      if (this.pingT > 1) { this.pingT = 0; this.app.net.sendHost({ t: 'p' }); }
    }
    // keep the arena alive behind the panel
    if (this.data.mode !== 'client') world.update(dt);
    stage.sync(world, dt, this.data.mode === 'client' ? 0.3 : 1);
    stage.orbit(dt);
  }

  exit() { this.active = false; this.app.ui.hide(this.app.ui.over); }
}
