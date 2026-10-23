// The unlockable staffs and what unlocks them (no 3D code here, so the game rules can use it).
export const STAFFS = [
  { id: 'moon', name: 'Moon Staff', how: 'Starting staff', need: () => true, prog: () => '' },
  { id: 'pumpkin', name: "Jack-o'-Lantern", how: 'Win a round', need: (s) => s.wins >= 1, prog: (s) => `${Math.min(s.wins, 1)}/1 wins` },
  { id: 'candy', name: 'Candy Crusher', how: 'Play all 6 arenas in one match', need: (s) => s.bestRound >= 6, prog: (s) => `best: round ${s.bestRound}/6` },
  { id: 'bat', name: 'Bat Scepter', how: '10 knockouts', need: (s) => s.kos >= 10, prog: (s) => `${Math.min(s.kos, 10)}/10 knockouts` },
  { id: 'crystal', name: 'Storm Crystal', how: '5 Thundershocks', need: (s) => s.ults >= 5, prog: (s) => `${Math.min(s.ults, 5)}/5 Thundershocks` },
  { id: 'skull', name: 'Bone Lord', how: '25 knockouts', need: (s) => s.kos >= 25, prog: (s) => `${Math.min(s.kos, 25)}/25 knockouts` },
  { id: 'eye', name: 'Eye of Doom', how: 'Win 3 rounds', need: (s) => s.wins >= 3, prog: (s) => `${Math.min(s.wins, 3)}/3 wins` },
  { id: 'ghost', name: 'Ghost Lantern', how: 'Win 10 rounds', need: (s) => s.wins >= 10, prog: (s) => `${Math.min(s.wins, 10)}/10 wins` },
];
export const STAFF_INDEX = {};
STAFFS.forEach((s, i) => { STAFF_INDEX[s.id] = i; });

