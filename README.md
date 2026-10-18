# Happy Clouds VR ☁️🍡

A cheerful WebXR game set above the clouds at sunset. Collect floating marshmallows, drop them into the giant
cocoa mug to turn them into happiness, and open portals to four happy worlds.

| Portal | Opens at | What to do |
|---|---|---|
| 🧱 **Happy Land** | 20 😊 | Build with giant bricks (snap-to-stud, 12 colors). Climb your creations. Ask the 5 Master Builders to build cars, rockets, castles, ducks and hearts. |
| 🛹 **Outdoor Play Park** | 60 😊 | Ride a **bike**, **hoverboard**, **skateboard** or **roller skates** around the bike loop and skate park (ramps launch you into the air). Play soccer, basketball, field-goal football and baseball target toss. Boombox party. |
| 🏖️ **Sunny Beach** | 120 😊 | Build sandcastles (stack them!), bop giant beach balls, collect seashells, squeak rubber ducks, open the treasure chest. |
| ⛄ **Snow Day Wonderland** | 200 😊 | Sled down the big hill, ride the magic lift, build snowmen step by step, throw snowballs through rings, skate on the frozen pond, grab free marshmallows at the cocoa stand. |

Each world also earns happiness (goals, big air, snowmen, castles, bricks…) and has hidden golden marshmallows.
Progress is saved in your browser.

## Running it

It's a static site with no build step. Serve the folder over HTTP:

```sh
cd happy_game
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Choose **Play on screen** or **Enter VR**.

### On a VR headset (Meta Quest, etc.)

WebXR only works on `https://` or `localhost`. Either:

- **USB:** connect the headset, run `adb reverse tcp:8000 tcp:8000`, then open `http://localhost:8000` in the headset browser.
- **Hosting:** upload the folder to any HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages) and open that URL in the headset.

## Controls

| | VR | Keyboard & mouse |
|---|---|---|
| Move / turn | Left stick / right stick (snap turn) | WASD + mouse (Shift to run) |
| Collect, use, place, throw | Trigger | Left click |
| Grab / hold | Grip (release to throw) | E |
| Jump | A | Space |
| Remove brick / get off ride | B or Y | Right click or F |
| Change brick color | X | R |
| Music on/off | | M |

Tip: point at a far-away marshmallow and pull the trigger to magnet it to you. In the snow world, squeeze grip with an empty hand to scoop a snowball.

## Assets

All 3D models, sky HDRIs and ground textures are **CC0 / public domain** from [Poly Haven](https://polyhaven.com);
see [`assets/CREDITS.md`](assets/CREDITS.md). The water normal map is from the three.js examples (MIT).
Characters, clouds, bricks, rides and toys are built in code; all sound and music are synthesized with WebAudio.
[three.js](https://threejs.org) (MIT) is loaded from the jsDelivr CDN, so you need an internet connection the first time.

## Code map

- `js/main.js`: engine: renderer, WebXR + desktop input, movement and rides, pointing/grabbing/throwing, HUD, world loading
- `js/config.js`: portal costs, happiness per marshmallow, ride tuning
- `js/physics.js`: simple ball physics; `js/audio.js`: synthesized sound; `js/util.js`: clouds, marshmallows, labels, particles
- `js/worlds/`: `hub.js`, `bricks.js`, `park.js`, `beach.js`, `snow.js`, plus `common.js` (return portal, bonus marshmallows)
