# M'AKOMA — marketing website

An immersive, interactive single-page site for **M'AKOMA** ("The People You Carry") — a
jewelry-first *presence wearable*. The product thesis: reverse-engineer social media —
**keep the connection, remove the feed.** A few people you've chosen live as beads on your
wrist; their light, pulse and voice come to you.

Built as a dependency-free static site (HTML + CSS + vanilla JS). No build step. Works
opened directly from `file://` or served statically — the Adinkra glyph data is embedded as
a JS global so there are no `fetch`/CORS requirements.

## Run it

```bash
# from this folder
python3 -m http.server 8765
# then open http://localhost:8765
```

A launch config is also provided at `../.claude/launch.json` (name: `makoma-site`).

## What's on the page

| Section | What it does |
|---|---|
| **Hero** ⭐ | A scroll-driven **real-time 3D** sequence (Three.js): assembled bracelet ring spins → zooms into a bead → **explodes it** to reveal the gold symbol plate, PCB, LED + ERM motor → closes → spins to the **core hub** → explodes it to reveal the core PCB (BLE module), battery and speaker → closes → settles with the CTA. Real CAD shells (`akoma_parts.glb`, converted from the Fusion STLs) + proxy internals + a braided cord. Falls back to the `bracelet-makoma.jpg` render on mobile / no-WebGL / reduced-motion. |
| **Manifesto** | The anti-feed thesis; animated gold strike-through on "Remove the feed." |
| **The shift** | Reachable → Present. "A bead is not a slot — it's a commitment of attention." |
| **Interactive beads** ⭐ | The centerpiece: a gold core hub + 8 black pebble beads carrying the real Adinkra glyphs. Tap a bead → it glows in its presence colour, pulses, plays a soft Web-Audio "charm", buzzes (haptics where supported), and a panel reveals the symbol's meaning. Echo / Pulse / Glow controls mirror the companion app. |
| **How it works** | Echo (hold-to-record waveform), Pulse (tap ripple), Glow (cycle presence colours) — each interactive. |
| **Circle Mode** | App friend → Bracelet friend → Bead friend, beside the real app screenshot in a phone frame. |
| **Adinkra** | All 8 symbols with culturally-accurate meanings, glowing on hover. |
| **Technology** | Core hub + friend beads; animated stats and the proven H1–H6 hardware ladder. |
| **Positioning** | Interactive quadrant map; M'AKOMA glowing in the "chosen-few × lives-with-you" corner. |
| **Vision / Join** | "We're building the next physical layer of human connection." + email capture. |

## Structure

```
website/
├── index.html            # all content + structure
├── css/style.css         # gold-on-black design system
├── js/
│   ├── glyphs.js         # Adinkra path data (generated from the product SVGs)
│   ├── main.js           # interaction engine (beads, audio, reveals, parallax, map, counters)
│   └── hero3d.js         # scroll-driven Three.js hero (ES module; loads three from a CDN)
└── assets/
    ├── img/              # product renders, app shot, PCB, logo (optimised JPEGs)
    ├── models/akoma_parts.glb   # bead + hub CAD shells (from the Fusion STLs)
    └── glyphs/adinkra.json
```

### The 3D hero pipeline — all real CAD

- **Bead caps + hub shells** (`akoma_parts.glb`): the 8 real Adinkra `FB_CAP` symbol caps, their
  `PLATFORM` gold plates, the shared `FB_BASE`, and the basin `HUB_TOP`/`HUB_BASE`/`BASIN_SWITCH`
  STLs from `fab/`, merged into one named-node GLB with `trimesh`. **Not quantized** — the loader
  clones each geometry directly, so it must stay in real-mm coordinates (quantization normalises
  positions to ±1 and the loader would drop the dequant scale → tiny beads). The Adinkra symbols
  are **engraved gold**: the gold `PLATFORM` read through the cap's cut window (no emissive glow).
- **PCBs** (`friend_bead_pcb.glb`, `core_hub_pcb.glb`): the *actual* boards, exported from the
  KiCad projects in `hardware/kicad/` with `kicad-cli pcb export glb`, then `gltf-transform optimize`
  (dedup + quantize — safe here because the loader keeps each PCB's node transforms). KiCad GLB is
  in metres, so `hero3d.js` scales them ×1000 and recentres.
- **Proxy geometry only** for the parts with no CAD: the ERM motor, LiPo battery and speaker, plus
  the braided cord. Clearly approximations — drop in real CAD when it exists.

`hero3d.js` rotates Fusion's Z-up into Three's Y-up, applies premium PBR (charcoal `MeshPhysicalMaterial`
resin + real gold), studio lighting + soft env, and animates the explode on scroll. Three.js loads from
a CDN (import map in `index.html`) so the hero needs internet on first load; everything else is local.
`window.__hero.setProgress(p)` drives the timeline for testing.

## Asset provenance

Every visual is sourced from the repo, not stock:

- `hero-bracelet-color.jpg`, `bracelet-gold*.jpg` — Blender/keyshot product renders (`company/pitch/assets/`, `company/assets/`)
- `app-screen.jpg` — the companion-app mockup (`company/pitch/assets/Akoma app.jpg`)
- `core-hub-pcb.jpg` — the actual core-hub PCB render (`company/pitch/assets/`)
- `render-proof.jpg` — hub + friend-bead concept render (`engineering/mechanical/rendering/`)
- `logo.jpg` — the M'AKOMA cord-heart logo (`company/assets/logo.png`)
- Adinkra glyphs — extracted directly from `engineering/mechanical/Adinkra symbols/*.svg`

## Content provenance

Copy is drawn from `company/startup-thesis.md`, `company/pitch/*`, `product/*`, the firmware
plan (`engineering/firmware/notes/core-hub-xiao-firmware-plan.md`), and the BOM
(`docs/AKOMA_V1_FIRST_PASS_BOM.md`). Technology claims distinguish *proven* (the H1–H6 ladder
already runs on the bench) from *designed* (friend-bead PCBs in transit).

## Notes

- Honors `prefers-reduced-motion`.
- Web Audio + vibration start only on a user gesture (browser policy).
- Email capture is front-end only — wire it to a real list before launch.
