// DOM layers: loading, title, HUD, touch controls, game over. Built once, shown/hidden by the scenes.
import { PAL, POWER_ICONS, POWER_NAMES, POWER_COLORS } from './constants.js';

export function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

export function applyPalette() {
  const r = document.documentElement.style;
  for (const k in PAL) r.setProperty('--' + k, hex(PAL[k]));
}

const ICON = (n) => `./assets/sprites/${n}.svg`;

export function buildUI(root) {
  root.insertAdjacentHTML('beforeend', `
    <div id="gl"></div>

    <section id="boot" class="screen on">
      <img class="boot-pumpkin" src="${ICON('pumpkin')}" alt="">
      <h1 class="logo small">HEXCAT HOLLOW</h1>
      <div class="bar"><i id="boot-fill"></i></div>
      <p class="hint" id="boot-msg">Summoning the graveyard...</p>
    </section>

    <section id="title" class="screen">
      <div class="corner"><button class="iconbtn" id="mute-title" aria-label="Toggle sound"><img alt="" src="${ICON('sound-on')}"></button></div>
      <h1 class="logo"><span class="l1">HEXCAT</span><span class="l2">HOLLOW</span></h1>
      <p class="tag">Kitty wizards. One graveyard. Last cat standing.</p>
      <div class="row">
        <button class="btn pulse" id="btn-play">Play</button>
        <button class="btn alt" id="btn-join" style="display:none">Join friend</button>
      </div>
      <div class="staffpick" id="staffpick">
        <button class="iconbtn arrow" id="staff-prev" aria-label="Previous staff">&#9664;</button>
        <div class="staffinfo"><small>YOUR STAFF</small><b id="staff-name">Moon Staff</b><span id="staff-how"></span></div>
        <button class="iconbtn arrow" id="staff-next" aria-label="Next staff">&#9654;</button>
      </div>
      <p class="msg" id="title-msg"></p>
      <p class="help" id="help-desktop"><b>WASD</b> move · <b>Mouse</b> aim · <b>Click</b> cast · <b>E</b> shield · <b>Q</b> spell · <b>R</b> Thundershock · <b>Tab</b> camera<br>Friends on this computer: <b>arrow keys + Enter</b>, or press <b>A</b> on a controller to jump in.</p>
      <p class="help" id="help-touch" style="display:none"><b>Left thumb</b> to move, <b>CAST</b> fires at the nearest cat.<br><b>Shield</b> blocks everything for a moment. Grab <b>dash</b> and <b>slow-mo</b> spells for your spell button.</p>
      <p class="best" id="title-best"></p>
    </section>

    <div id="hud" class="layer">
      <div id="hurt"></div>
      <div class="tl">
        <div class="hpbar" id="hp"><i></i><b id="hp-txt">100</b></div>
        <div class="power" id="power"><img id="power-img" alt="" src="${ICON('basic')}"><span id="power-name">Spell Bolt</span><div class="pbar"><i id="power-fill"></i></div></div>
        <div class="abil">
          <div class="slot" id="slot-shield"><img alt="" src="${ICON('shield')}"><i id="shield-cd"></i><b class="key" id="key-shield">E</b></div>
          <div class="slot empty" id="slot-q"><img alt="" id="q-img" src="${ICON('dash')}"><i id="q-cd"></i><b class="key" id="key-q">Q</b><b class="n" id="q-n"></b></div>
        </div>
      </div>
      <div id="others"></div>
      <div id="controls" aria-label="Controls"></div>
      <div id="xhair"><i></i><i></i><i></i><i></i></div>
      <div id="ultbar"><img alt="" src="${ICON('thunder')}"><div><b>THUNDERSHOCK READY</b><span id="ult-hint">press R</span></div><div class="ulttime"><i id="ult-time"></i></div></div>
      <div id="aimhint"></div>
      <div id="mapcard"><img id="map-art" alt="" src="./assets/maps/map0.jpg"><small id="map-round">ROUND 1</small><b id="map-name">Moonlit Graveyard</b></div>
      <div id="flash"></div>
      <div id="joinhint"></div>
      <div class="tc"><div class="alive"><span id="alive-n">6</span> alive<small id="alive-sub">last cat wins</small></div></div>
      <div class="tr">
        <div class="score" id="score">0</div>
        <button class="iconbtn" id="btn-cam" aria-label="Change camera (Tab)"><img alt="" src="${ICON('camera')}"></button>
        <button class="iconbtn" id="btn-invite" aria-label="Invite friends"><img alt="" src="${ICON('invite')}"></button>
        <button class="iconbtn" id="mute-hud" aria-label="Toggle sound"><img alt="" src="${ICON('sound-on')}"></button>
        <button class="iconbtn" id="btn-leave" aria-label="Leave match"><img alt="" src="${ICON('leave')}"></button>
      </div>
      <div id="room"></div>
      <div id="feed"></div>
      <div id="toast"></div>
      <div id="dmg"></div>
    </div>

    <div id="touch" class="layer">
      <div id="stick-zone"><div id="stick"><i></i></div></div>
      <div id="stick-hint">drag to move</div>
      <button id="fire" aria-label="Cast spell">CAST</button>
      <button id="tshield" class="tbtn" aria-label="Shield"><img alt="" src="${ICON('shield')}"></button>
      <button id="tult" class="tbtn" aria-label="Thundershock"><img alt="" src="${ICON('thunder')}"></button>
      <button id="tq" class="tbtn" aria-label="Spell"><img alt="" id="tq-img" src="${ICON('dash')}"><b id="tq-n"></b></button>
    </div>

    <section id="over" class="screen">
      <div class="panel">
        <h2 id="over-h">KNOCKED OUT</h2>
        <p class="stat" id="over-place"></p>
        <div class="big" id="over-score">0</div>
        <p class="stat" id="over-detail"></p>
        <p class="newbest" id="over-best"></p>
        <p class="unlock" id="over-unlock"></p>
        <div class="row">
          <button class="btn pulse" id="btn-again">Play again</button>
          <button class="btn ghost" id="btn-menu">Menu</button>
        </div>
        <p class="msg" id="over-msg"></p>
      </div>
    </section>
  `);

  const $ = (id) => document.getElementById(id);
  const ui = {
    gl: $('gl'), boot: $('boot'), bootFill: $('boot-fill'), bootMsg: $('boot-msg'),
    title: $('title'), staffName: $('staff-name'), staffHow: $('staff-how'), staffPrev: $('staff-prev'), staffNext: $('staff-next'), staffPick: $('staffpick'), btnPlay: $('btn-play'), btnJoin: $('btn-join'), titleMsg: $('title-msg'), titleBest: $('title-best'),
    helpDesktop: $('help-desktop'), helpTouch: $('help-touch'),
    hud: $('hud'), hurt: $('hurt'), controls: $('controls'), others: $('others'), joinhint: $('joinhint'),
    slotShield: $('slot-shield'), shieldCd: $('shield-cd'), slotQ: $('slot-q'), qImg: $('q-img'), qCd: $('q-cd'), qN: $('q-n'),
    tq: $('tq'), tqImg: $('tq-img'), tqN: $('tq-n'), tshield: $('tshield'), tult: $('tult'),
    btnCam: $('btn-cam'), xhair: $('xhair'), ultbar: $('ultbar'), ultTime: $('ult-time'), ultHint: $('ult-hint'), aimhint: $('aimhint'),
    mapcard: $('mapcard'), mapRound: $('map-round'), mapName: $('map-name'), mapArt: $('map-art'), flash: $('flash'), hp: $('hp'), hpFill: $('hp').firstElementChild, hpTxt: $('hp-txt'),
    power: $('power'), powerImg: $('power-img'), powerName: $('power-name'), powerFill: $('power-fill'),
    aliveN: $('alive-n'), aliveSub: $('alive-sub'), score: $('score'), room: $('room'), feedEl: $('feed'), toastEl: $('toast'), dmgEl: $('dmg'),
    btnInvite: $('btn-invite'), btnLeave: $('btn-leave'), muteBtns: [$('mute-title'), $('mute-hud')],
    touch: $('touch'),
    over: $('over'), overH: $('over-h'), overPlace: $('over-place'), overScore: $('over-score'), overDetail: $('over-detail'),
    overBest: $('over-best'), overUnlock: $('over-unlock'), btnAgain: $('btn-again'), btnMenu: $('btn-menu'), overMsg: $('over-msg'),
  };

  ui.show = (el) => el.classList.add('on');
  ui.hide = (el) => el.classList.remove('on');
  ui.setMuteIcon = (muted) => { for (const b of ui.muteBtns) b.firstElementChild.src = ICON(muted ? 'sound-off' : 'sound-on'); };

  // power display
  let lastPower = -1;
  ui.setPower = (p, frac) => {
    if (p !== lastPower) {
      lastPower = p;
      ui.powerImg.src = ICON(POWER_ICONS[p]);
      ui.powerName.textContent = POWER_NAMES[p];
      ui.powerFill.style.background = hex(POWER_COLORS[p]);
    }
    ui.powerFill.style.width = (frac * 100).toFixed(0) + '%';
  };

  // shield / Q spell slots
  let lastQ = -1, lastQn = -1;
  ui.setAbilities = (shieldFrac, shieldOn, q, qn) => {
    ui.shieldCd.style.height = ((1 - shieldFrac) * 100).toFixed(0) + '%';
    ui.slotShield.classList.toggle('ready', shieldFrac >= 1 && !shieldOn);
    ui.slotShield.classList.toggle('on', shieldOn);
    ui.tshield.classList.toggle('cool', shieldFrac < 1 && !shieldOn);
    if (q !== lastQ || qn !== lastQn) {
      lastQ = q; lastQn = qn;
      ui.slotQ.classList.toggle('empty', q === 0);
      ui.tq.classList.toggle('empty', q === 0);
      if (q) { ui.qImg.src = ICON(POWER_ICONS[q]); ui.tqImg.src = ICON(POWER_ICONS[q]); }
      ui.qN.textContent = q ? 'x' + qn : ''; ui.tqN.textContent = q ? qn : '';
      if (q) { ui.slotQ.classList.remove('pop'); void ui.slotQ.offsetWidth; ui.slotQ.classList.add('pop'); }
    }
  };
  ui.setKeys = (shieldKey, qKey) => { $('key-shield').textContent = shieldKey; $('key-q').textContent = qKey; };

  const cards = [];
  ui.setOthers = (list) => {
    // list: [{slot, name, color, hp, alive, label}]
    while (cards.length < list.length) {
      const d = document.createElement('div'); d.className = 'card';
      d.innerHTML = '<span></span><div class="mini"><i></i></div>';
      ui.others.appendChild(d); cards.push({ el: d, name: d.firstChild, fill: d.lastChild.firstChild, key: '' });
    }
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i], o = list[i];
      c.el.style.display = o ? '' : 'none';
      if (!o) continue;
      const key = o.label + o.color;
      if (key !== c.key) { c.key = key; c.name.textContent = o.label; c.el.style.borderColor = hex(o.color); c.name.style.color = hex(o.color); }
      c.fill.style.width = Math.max(0, o.hp) + '%';
      c.el.classList.toggle('ko', !o.alive);
    }
  };

  // Controls panel, always visible during play. groups: [{ title, rows: [[keys, action], ...] }]
  ui.setControls = (groups, touch) => {
    ui.controls.classList.toggle('touch', !!touch);
    ui.controls.innerHTML = groups.map((g) =>
      (g.title ? '<h4>' + g.title + '</h4>' : '') +
      g.rows.map((r) => '<div class="crow"><span class="keys">' + r[0].split(' / ').map((k) => '<kbd>' + k + '</kbd>').join('') + '</span><span>' + r[1] + '</span></div>').join('')
    ).join('');
  };

  ui.showMap = (round, name, idx) => {
    ui.mapRound.textContent = 'ROUND ' + round; ui.mapName.textContent = name;
    if (idx !== undefined) ui.mapArt.src = './assets/maps/map' + idx + '.jpg';
    ui.mapcard.classList.remove('show'); void ui.mapcard.offsetWidth; ui.mapcard.classList.add('show');
  };

  // toast
  let toastT = 0;
  ui.toast = (text, color, sticky) => {
    const t = ui.toastEl;
    t.textContent = text; t.style.color = color ? hex(color) : '';
    t.classList.remove('show', 'sticky'); void t.offsetWidth;
    if (sticky) t.classList.add('sticky');
    t.classList.add('show');
    clearTimeout(toastT);
  };
  ui.clearToast = () => { ui.toastEl.classList.remove('show', 'sticky'); };

  // kill feed (4 reusable rows)
  const feedRows = [];
  for (let i = 0; i < 4; i++) { const d = document.createElement('div'); d.style.display = 'none'; ui.feedEl.appendChild(d); feedRows.push({ el: d, t: 0 }); }
  let feedHead = 0;
  ui.feed = (text, color) => {
    const r = feedRows[feedHead]; feedHead = (feedHead + 1) % feedRows.length;
    r.el.textContent = text; r.el.style.color = color ? hex(color) : '';
    r.el.style.display = ''; r.el.style.opacity = 1; r.t = 5;
    r.el.style.animation = 'none'; void r.el.offsetWidth; r.el.style.animation = '';
    ui.feedEl.appendChild(r.el);
  };
  ui.clearFeed = () => { for (const r of feedRows) { r.el.style.display = 'none'; r.t = 0; } };

  // floating damage numbers
  const dmg = [];
  for (let i = 0; i < 14; i++) { const d = document.createElement('div'); d.className = 'dmg'; ui.dmgEl.appendChild(d); dmg.push({ el: d, t: 0, x: 0, y: 0, z: 0 }); }
  let dmgHead = 0;
  ui.dmg = (x, z, text, color) => {
    const r = dmg[dmgHead]; dmgHead = (dmgHead + 1) % dmg.length;
    r.el.textContent = text; r.el.style.color = hex(color); r.t = 0.9; r.x = x; r.z = z; r.y = 2.6;
    r.el.style.opacity = 1;
  };
  const pt = { x: 0, y: 0, on: true };
  ui.update = (dt, stage) => {
    for (let i = 0; i < dmg.length; i++) {
      const r = dmg[i];
      if (r.t <= 0) continue;
      r.t -= dt; r.y += dt * 2.2;
      if (r.t <= 0) { r.el.style.opacity = 0; continue; }
      stage.project(r.x, r.y, r.z, pt);
      const s = 0.8 + Math.min(1, (0.9 - r.t) * 6) * 0.4;
      r.el.style.transform = `translate(${pt.x.toFixed(0)}px,${pt.y.toFixed(0)}px) translate(-50%,-50%) scale(${s.toFixed(2)})`;
      r.el.style.opacity = Math.min(1, r.t * 3);
    }
    for (let i = 0; i < feedRows.length; i++) {
      const r = feedRows[i];
      if (r.t > 0) { r.t -= dt; if (r.t <= 0) r.el.style.display = 'none'; else if (r.t < 0.6) r.el.style.opacity = r.t / 0.6; }
    }
  };

  return ui;
}
