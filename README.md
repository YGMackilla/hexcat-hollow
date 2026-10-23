# Hexcat Hollow

A small 3D Halloween arena battler. Six kitty wizards fight in a glowing arena, and the last cat standing wins the round. Every round moves to a new arena (six in rotation). Bots fill every empty seat, and real players take over a bot's seat when they join, either on the same device or online.

Built for Scout House: a static folder with no build step. Upload the folder to any static host (Cloudflare Pages: drag and drop).

## How to play

| | Keyboard + mouse (player 1) | Second player, same keyboard | Controller | Phone / tablet |
|---|---|---|---|---|
| Move | WASD | Arrow keys | Left stick / d-pad | Left-thumb stick |
| Aim | Mouse | Auto-aim | Right stick (auto-aim otherwise) | Auto-aim |
| Cast | Click or Space | Enter | RT or A | CAST button |
| Shield | E (or right click) | Right Shift | LB or B | Shield button |
| Q spell (dash / slow-mo trap) | Q | / | RB or X | Spell button |
| Thundershock | R | Right Ctrl | Y | Lightning button |
| Camera view | Tab or C | | | Camera button |
| Sound | M or speaker button | | | Speaker button |

- **Basic spell bolt.** Every wizard has it.
- **Elements (pickups, 16 s):** fire burns over time, ice slows, storm chains lightning to nearby cats.
- **Healing potions:** +35 HP.
- **Q spells (pickups, charges):** *Air Dash* (3 charges) hops you forward fast. *Slow-mo Trap* (2 charges) fires a time-trap spell; anyone caught in its field moves, casts and even has their spells fly in slow motion.
- **Shield bubble (everyone, E):** blocks all damage for 1.6 s, then recharges for 7 s.
- **Thundershock ultimate:** earned every 2 knockouts and must be used within 5 seconds. Press R and the camera rises over the arena. Move the rune circle with the mouse (stick or thumb on other devices) and click to strike. While aiming you are frozen with your staff raised, and a moon sigil glows under you, so you are open to attack. The same circle then appears in the sky and on the ground, and half a second later lightning lands on everyone inside (45 damage).
- **Camera views (Tab):** overhead, over-the-shoulder, first person. In the close-up views WASD moves relative to the camera and the mouse looks around (click once to lock the mouse). With several players on one screen the game stays overhead.
- **Controls panel:** the controls are always shown on the left side of the screen during play (a compact version on phones), with a section added for each extra player on the device.
- **Score:** 100 per knockout plus survival time, with a placement bonus. The best score is saved in the browser.

## Multiplayer

- **Same device (no internet needed):** while a match is running, press Enter (arrow-key player) or A on a controller to take over a bot. Up to 4 people per device.
- **Online (browser to browser):** press the invite button in a match and send the copied link. Friends who open it join straight into your match and take over bots. The host's browser runs the match and friends connect directly to it over WebRTC. The only outside service is PeerJS's free public matchmaking server (0.peerjs.com), which introduces the browsers to each other. If it is ever down, only the invite button stops working; everything else, including same-device play, still runs.

## Arenas (one per round, in order)

| Arena | Floor shape | Edge | Cover |
|---|---|---|---|
| Moonlit Graveyard | Circle | Fence with lantern tips | Tombstones, dead trees, pumpkins |
| Pumpkin Patch | Rounded square field | Glowing paper lanterns | Giant jack-o'-lanterns, scarecrows |
| Witch's Swamp | Five-lobed island | Glowing bog water, lily pads | Cauldrons, giant mushrooms, trees |
| Haunted Courtyard | Castle cross with four halls | Stone walls with gold caps | Candle pillars |
| Frozen Crypt | Wide oval cavern | Ice shards | Ice crystals, tombstones |
| Candy Carnival | Eight-point star | Candy-cane posts, double neon outline | Lollipops, gumdrops |

Shapes, layouts, colours, lights and fog are in `src/systems/maps.js`; the outline drives walls, spawns, pickups, bots and cameras.

## Run it locally

```
cd hexcat-hollow
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` straight from disk does not work (browsers block ES modules on `file://`); use any local server.

## Folder layout

```
index.html            page shell
_headers              Cloudflare cache rules
src/main.js           app setup, scene switching, main loop
src/scenes/           Boot (loading bar), Title, Game, GameOver
src/systems/          constants (palette, font, tuning), sim (game rules), bots, input, net (online play),
                      stage (3D scene, camera views, effects), mayu (character loader), models (props),
                      maps, sfx (synth audio + music), ui (HUD), fx (particles, tweens), storage (best score)
assets/models/        mayu-wizard.json
assets/fx/            spell art
assets/maps/          arena concept art (round title cards)
assets/sprites/       SVG icons
assets/fonts/         Chewy
assets/audio/         empty: all sound is synthesized in code
vendor/               three.js r160 + addons, PeerJS 1.5.4
```

## Assets

| File | Size | Source | Notes |
|---|---|---|---|
| assets/models/mayu-wizard.json | 1.2 MB | Mayu base avatar (Mayu_3_6_0.blend), supplied by the owner | Body only, reduced for the web; hat, capelet and moon staff modelled for this game and rigged to Mayu's skeleton; Idle, Walk, Cast and TailWag animations. Recoloured per player in code. See licence note below. |
| assets/maps/map0-5.jpg | 40–55 KB each | Generated with Picsart (Flux 2 Pro) for this game | Concept paintings of the six arenas; shown on each round's title card and used as the brief for building the 3D arenas |
| assets/fx/spell-circle.jpg | 119 KB | Generated with Picsart (Flux 2 Pro) for this game | Thundershock aiming circle, sky/ground strike circle, slow-mo trap field |
| assets/fx/cast-sigil.jpg | 22 KB | Generated with Picsart (Flux 2 Pro) | Sigil flash on every cast, moon circle under a channelling caster |
| assets/fx/lightning.jpg | 14 KB | Generated with Picsart (Flux 2 Pro) | Thundershock bolts |
| Cape and hat fabric (inside the model) | 512 px | Generated with Picsart (Flux 2 Pro) | Stars and moons pattern, tinted per player |
| assets/fonts/chewy.woff2 | 20 KB | Chewy by Sideshow, via @fontsource/chewy | Apache 2.0 (licence file next to it) |
| assets/sprites/*.svg | 0.2–0.8 KB each | Hand-authored placeholders | HUD icons: basic, fire, ice, storm, heal, dash, trap, shield, thunder, camera, invite, leave, sound-on, sound-off, pumpkin, favicon |
| Props (pumpkins, tombstones, trees, scarecrows, cauldrons, mushrooms, pillars, crystals, lollipops, gumdrops) | n/a | Built from simple shapes in `src/systems/models.js` | Placeholders; swap for modelled props later |
| Sound effects and music | n/a | Synthesized in `src/systems/sfx.js` | Placeholders; drop OGG/MP3 into assets/audio to replace |
| vendor/three, vendor/three-addons | 0.7 MB | three.js r160 (MIT) | Pinned exact version (same file cdnjs serves as 0.160.0), bundled so the game needs no CDN |
| vendor/peerjs | 0.1 MB | PeerJS 1.5.4 (MIT) | Online rooms |

**Mayu licence:** the owner confirmed Mayu's terms allow its use in this web game. If the model is ever removed, the game falls back to its built-in code-made kitty wizards automatically.

## Tech notes

- Three.js with an EffectComposer chain: bloom, vignette, ACES tone mapping. Device pixel ratio is honoured, up to 2 on desktop and 1.5 on phones.
- Automatic quality: if a device can't hold about 45 fps, the game lowers resolution first and then turns bloom off.
- Fixed 60 Hz simulation. Projectiles, particles, fields, damage numbers and effects are pooled.
- The game sends nothing anywhere except the online room traffic, and only when you invite or join.
