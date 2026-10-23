// Peer-to-peer rooms over WebRTC (PeerJS). No game server of our own: the host browser runs the match
// and friends connect straight to it. PeerJS is only loaded when someone invites or joins.
const PEER_URL = './vendor/peerjs/peerjs.min.js';
const PREFIX = 'hexcat-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

let loading = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = PEER_URL; s.async = true;
    s.onload = () => res();
    s.onerror = () => { loading = null; rej(new Error('Could not load the networking library')); };
    document.head.appendChild(s);
  });
  return loading;
}

function code() {
  let c = '';
  for (let i = 0; i < 5; i++) c += ALPHABET[(Math.random() * ALPHABET.length) | 0];
  return c;
}

export function roomFromUrl() {
  try {
    const c = new URLSearchParams(location.search).get('room');
    return c && /^[A-Za-z0-9]{3,12}$/.test(c) ? c.toUpperCase() : null;
  } catch (e) { return null; }
}

export function roomLink(c) {
  return location.origin + location.pathname + '?room=' + c;
}

export const net = {
  mode: 'off', // 'off' | 'host' | 'client'
  peer: null, conns: [], hostConn: null, code: null,

  async host(h) {
    await loadPeer();
    this.close();
    this.mode = 'host';
    const opts = window.HEXCAT_PEER_OPTS || {};
    const tryOpen = (attempt) => new Promise((resolve, reject) => {
      const c = code();
      const peer = new window.Peer(PREFIX + c, opts);
      peer.on('open', () => { this.peer = peer; this.code = c; resolve(c); });
      peer.on('error', (e) => {
        if (e && e.type === 'unavailable-id' && attempt < 3) { peer.destroy(); resolve(tryOpen(attempt + 1)); } else reject(e);
      });
      peer.on('connection', (conn) => {
        conn.on('open', () => { this.conns.push(conn); if (h.onJoin) h.onJoin(conn); });
        conn.on('data', (m) => { if (h.onData) h.onData(conn, m); });
        const gone = () => { const i = this.conns.indexOf(conn); if (i >= 0) { this.conns.splice(i, 1); if (h.onLeave) h.onLeave(conn); } };
        conn.on('close', gone); conn.on('error', gone);
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    });
    return tryOpen(0);
  },

  async join(c, h) {
    await loadPeer();
    this.close();
    this.mode = 'client';
    const opts = window.HEXCAT_PEER_OPTS || {};
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(opts);
      let done = false;
      const fail = (m) => { if (!done) { done = true; reject(new Error(m)); } else if (h.onClose) h.onClose(m); };
      const timer = setTimeout(() => fail('Could not reach that room. Is the host still playing?'), 20000);
      peer.on('error', (e) => fail(e && e.type === 'peer-unavailable' ? 'That room is closed or the code is wrong.' : 'Connection problem. Try again.'));
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + c, { reliable: true, serialization: 'json' });
        conn.on('open', () => { clearTimeout(timer); done = true; this.hostConn = conn; resolve(conn); if (h.onOpen) h.onOpen(conn); });
        conn.on('data', (m) => { if (h.onData) h.onData(m); });
        conn.on('close', () => { this.hostConn = null; if (h.onClose) h.onClose('The host left the match.'); });
        conn.on('error', () => fail('Connection lost.'));
      });
      this.peer = peer;
    });
  },

  broadcast(msg) {
    for (let i = 0; i < this.conns.length; i++) { try { this.conns[i].send(msg); } catch (e) { /* ignore */ } }
  },
  send(conn, msg) { try { conn.send(msg); } catch (e) { /* ignore */ } },
  sendHost(msg) { if (this.hostConn) { try { this.hostConn.send(msg); } catch (e) { /* ignore */ } } },

  close() {
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
    this.peer = null; this.conns = []; this.hostConn = null; this.mode = 'off'; this.code = null;
  },
};
