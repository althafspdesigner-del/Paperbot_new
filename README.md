# PAPERBOT — 3D paper-robot website

An animated marketing site for PAPERBOT Technologies FZCO (Forex CRM and
trading technology), branded from the PAPERBOT brandbook v1.1 (cobalt
#204BFF, graphite #202630, signal orange #F66B24; Manrope + IBM Plex Mono;
logo SVGs in `assets/` are converted directly from the brandbook's flat
vector master). It was originally built for [paperbotsolutions.com](https://paperbotsolutions.com/),
structured like the Sonora Framer template (nav → hero with 3D character →
capability strip → platform breakdown → how it works → spec sheet → reserve
flow → FAQ → CTA → footer) and re-themed around **paper**: the hero robot,
the launch rocket and the "core" object are all procedurally built origami
style paper models rendered with Three.js.

## Run it

No build is needed to preview — the Three.js bundle is committed.

```bash
cd paperbot-site
npm run serve        # http://localhost:4173
```

Or open `index.html` from any static host (Netlify, Vercel, GitHub Pages, S3…).
Deploy the folder as-is; `node_modules/` is not required at runtime.

## Deploy to Cloudflare Workers

`wrangler.jsonc` serves this folder as static assets (no build step). Connect
the GitHub repository in the Cloudflare dashboard: **Workers & Pages → Create →
Import a repository**, pick this repo, leave the build command empty and keep
the deploy command `npx wrangler deploy`. Every push to `main` redeploys. Or
from a machine with Cloudflare access: `npm install && npm run deploy`.
`.assetsignore` keeps sources and config out of the upload; `_headers` sets
cache and security headers.

## Edit the 3D scenes

```bash
npm install          # once
npm run watch        # rebuilds js/scene.bundle.js on every change to src/scene.js
npm run build        # minified production bundle
```

`src/scene.js` holds everything 3D:

| Scene    | Where it renders                     | What it is                                                     |
| -------- | ------------------------------------ | -------------------------------------------------------------- |
| `hero`   | `[data-scene="hero"]` in the hero    | Paper version of the Sonora-style robot: rounded folded-card body, graphite screen face with pill eyes and smile, speaker grille that "talks", dome ears, side rails, the logo's orange square on top. Turns to the cursor, blinks, floats, lifts away on scroll; paper planes orbit behind it |
| `launch` | `[data-scene="launch"]` in How it works | Paper rocket that lifts off as the section scrolls through, with paper-fleck exhaust and paper clouds |
| `core`   | `[data-scene="core"]` in Reserve a demo | Folded-paper dodecahedron with orbiting paper planes            |

One transparent full-screen canvas sits behind the page; each scene is drawn
into its slot's rectangle with scissor/viewport (three.js "multiple elements"
technique). Only on-screen slots render, rendering pauses in hidden tabs, and
`prefers-reduced-motion` switches every scene to a static pose.

The paper look is procedural: flat-shaded low-poly geometry, a generated
paper-fibre texture (`makePaperTexture`), darker crease lines on every sharp
edge (`withFolds`) and chamfered "folded" boxes (`paperBoxGeo`). Colours live
in the `PAPER` palette object.

## Edit the page

- `index.html` — all copy and sections. Brand/CSS colours are the custom
  properties at the top of `css/styles.css`.
- `assets/logo.svg` / `assets/favicon.svg` — paper-fold "P" logomark, also
  inlined as `#logo-mark` in `index.html`.
- `js/main.js` — nav, FAQ, pointer-tilt on cards, demo form.
- `js/reveal.js` — scroll-reveal helper (from the repo's
  `premium-static-animation` skill).

### Demo form

The form is front-end only. Add `data-endpoint="https://…"` to
`<form id="demo-form">` to POST a JSON body
`{ name, email, company, interest, message }` to your own API or a form
service; non-2xx responses show an inline error. **Set this before launch.**
Without an endpoint the form runs in preview mode and tells the visitor
plainly that nothing was sent.

## Content notes

The live paperbotsolutions.com site could not be fetched from the build
environment (the host is outside the session's network allow-list), so:

- The company name, positioning ("advanced CRM and trading technology for
  Forex brokerages") and tagline wording come from the site's public search
  listing.
- Module names, spec rows, step copy and FAQ answers were written to match
  that positioning and standard Forex-brokerage platform scope. **Review them
  against the real product before launch** — in particular platform
  integrations, security claims and onboarding timelines.
- Logos: `assets/paperbot-signature*.svg` (with TECHNOLOGIES FZCO) and
  `assets/paperbot-wordmark*.svg` were extracted as vectors from the
  brandbook's flat master (page 6). Swap in the supplied master SVGs if they
  differ.
- No contact email, address or legal pages are shown because none could be
  verified. Add a contact column and Privacy/Terms links to the footer once
  the client supplies them.
