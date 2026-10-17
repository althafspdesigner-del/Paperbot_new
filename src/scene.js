/*
  Paperbot — 3D paper-craft scenes (Three.js).

  One fixed, transparent WebGL canvas sits behind the page. Each
  `[data-scene]` element in the DOM is a "slot": the matching scene is
  rendered into that element's screen rectangle with a scissor/viewport
  pair (the three.js "multiple elements" technique). Only slots that are
  on screen are rendered, and nothing renders while the tab is hidden.

  Scenes
    hero    — the Paperbot origami robot, drifting paper planes, folded cards
    launch  — a paper rocket that lifts off as the section scrolls through
    core    — a slowly turning folded-paper polyhedron (CTA / demo section)

  Everything is procedural: no model files, no image downloads. The paper
  look comes from flat-shaded low-poly geometry, a generated paper-fibre
  texture, and darker "fold" edge lines.
*/
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isCoarse = window.matchMedia("(pointer: coarse)").matches;

/* ------------------------------------------------------------------ */
/*  Paper material                                                     */
/* ------------------------------------------------------------------ */

function makePaperTexture(size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // Fibres: thousands of faint, short, randomly oriented strokes.
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 2 + Math.random() * 9;
    const a = Math.random() * Math.PI;
    const g = 215 + Math.floor(Math.random() * 40);
    ctx.strokeStyle = `rgba(${g},${g},${g + 3},${0.07 + Math.random() * 0.12})`; // neutral white stock
    ctx.lineWidth = 0.6 + Math.random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // Speckles (recycled-paper flecks).
  for (let i = 0; i < 350; i++) {
    const g = 150 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgba(${g},${g},${g + 6},${0.08 + Math.random() * 0.14})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 0.4 + Math.random() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

let paperTex = null; // created in init() once WebGL is available

// PAPERBOT brand palette (brandbook v1.1): cobalt, graphite, signal orange + neutrals.
const PAPER = {
  white: 0xfdfdfb, // paper stock
  pearl: 0xf1f1ec,
  line: 0xd9dde5,
  slate: 0x667080,
  blueTint: 0xe9eeff,
  cobalt: 0x204bff,
  deepCobalt: 0x1236cc,
  graphite: 0x202630,
  orange: 0xf66b24,
};

function paperMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    map: paperTex,
    bumpMap: paperTex,
    bumpScale: opts.bump ?? 0.012,
    roughness: opts.roughness ?? 0.92,
    metalness: 0,
    flatShading: true,
    side: opts.side ?? THREE.FrontSide,
  });
  return m;
}

const foldLineMat = new THREE.LineBasicMaterial({
  color: 0x202630,
  transparent: true,
  opacity: 0.16,
});

/** Add darker crease lines along sharp edges so every facet reads as a fold. */
function withFolds(mesh, angle = 24) {
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, angle), foldLineMat);
  edges.renderOrder = 1;
  mesh.add(edges);
  return mesh;
}

/** A box with chamfered (folded-over) edges, built as a bevelled extrusion. */
function paperBoxGeo(w, h, d, bevel = 0.06) {
  const s = new THREE.Shape();
  const hw = w / 2 - bevel;
  const hh = h / 2 - bevel;
  s.moveTo(-hw, -hh);
  s.lineTo(hw, -hh);
  s.lineTo(hw, hh);
  s.lineTo(-hw, hh);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: d - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
  });
  g.center();
  return g;
}

function paperBox(w, h, d, color, bevel) {
  return withFolds(new THREE.Mesh(paperBoxGeo(w, h, d, bevel), paperMat(color)));
}

/** Folded paper dart (classic paper plane). */
function paperPlaneGeo() {
  const nose = [0, 0, 1.0];
  const tail = [0, 0.04, -0.55];
  const lTip = [-0.72, 0.1, -0.6];
  const rTip = [0.72, 0.1, -0.6];
  const keel = [0, -0.22, -0.45];
  const verts = new Float32Array([
    ...nose, ...lTip, ...tail, // left wing
    ...nose, ...tail, ...rTip, // right wing
    ...nose, ...keel, ...tail, // keel (double-sided)
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

function paperPlane(color = PAPER.white) {
  const mesh = new THREE.Mesh(paperPlaneGeo(), paperMat(color, { side: THREE.DoubleSide }));
  return withFolds(mesh, 10);
}

/* ------------------------------------------------------------------ */
/*  Lighting + helpers                                                 */
/* ------------------------------------------------------------------ */

function addStudioLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9dde5, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(-3, 4.5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe9eeff, 0.9);
  fill.position.set(4, 1.5, 2.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(0, 3, -5);
  scene.add(rim);
}

function contactShadow(radius = 1.4) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, "rgba(32,38,48,0.30)");
  g.addColorStop(0.55, "rgba(32,38,48,0.10)");
  g.addColorStop(1, "rgba(32,38,48,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

const _prev = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ahead = new THREE.Vector3();

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ */
/*  The PAPERBOT robot                                                 */
/*  Same character as the Sonora device robot — one rounded block with  */
/*  a dark screen face, pill eyes, a small smile, a speaker grille and  */
/*  two dome "ears" — rebuilt as folded paper: every rounded corner is  */
/*  a couple of flat folds, edges carry creases, and a glued seam flap  */
/*  runs down the back. The raised orange square from the PAPERBOT      */
/*  logo sits on its top corner.                                        */
/* ------------------------------------------------------------------ */

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A flat rounded panel (paper card) of thickness `depth`, centred on its back face. */
function panelGeo(w, h, r, depth, segs = 3, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
    depth,
    curveSegments: segs,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
  return g;
}

function buildRobot() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const W = 1.7;
  const H = 1.78;
  const D = 1.2;

  // Shell: a rounded block whose corners are only two folds deep, so it reads as folded card.
  const shellGeo = new RoundedBoxGeometry(W, H, D, 2, 0.34);
  const shell = withFolds(new THREE.Mesh(shellGeo, paperMat(PAPER.white, { bump: 0.01 })), 20);
  body.add(shell);

  // Glued seam flap down the back-right edge (a real paper-craft detail).
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.012, H * 0.72, 0.16), paperMat(PAPER.pearl));
  flap.position.set(W / 2 - 0.05, 0, -D / 2 + 0.02);
  flap.rotation.y = -0.6;
  body.add(withFolds(flap, 10));

  // Screen: a graphite paper card set into the face.
  const face = new THREE.Group();
  face.position.set(0, 0.22, D / 2 - 0.035);
  body.add(face);
  const bezel = new THREE.Mesh(panelGeo(1.3, 0.92, 0.2, 0.02, 3), paperMat(PAPER.line));
  bezel.position.z = 0;
  face.add(withFolds(bezel, 20));
  const screen = new THREE.Mesh(panelGeo(1.22, 0.84, 0.17, 0.05, 3), paperMat(PAPER.graphite, { roughness: 0.78 }));
  screen.position.z = 0.012;
  face.add(withFolds(screen, 20));

  // Eyes: two pill cut-outs that glow softly, plus a small smile.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf2f5ff });
  const eyes = new THREE.Group();
  eyes.position.z = 0.066;
  face.add(eyes);
  const eyeGeo = panelGeo(0.12, 0.27, 0.06, 0.01, 4);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.24, 0.06, 0);
  eyeR.position.set(0.24, 0.06, 0);
  eyes.add(eyeL, eyeR);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 4, 12, Math.PI), eyeMat);
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.15, 0);
  eyes.add(smile);
  // A faint cobalt glow card behind the eyes, so the screen feels "on".
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.62),
    new THREE.MeshBasicMaterial({ color: PAPER.cobalt, transparent: true, opacity: 0.1, depthWrite: false })
  );
  glow.position.z = 0.063;
  face.add(glow);

  // Speaker grille: five graphite pills that "talk" now and then.
  const grille = new THREE.Group();
  grille.position.set(0, -0.5, D / 2 + 0.005);
  body.add(grille);
  const bars = [];
  const barHeights = [0.08, 0.13, 0.17, 0.13, 0.08];
  barHeights.forEach((h, i) => {
    const bar = new THREE.Mesh(panelGeo(0.055, 0.17, 0.0275, 0.02, 3), paperMat(PAPER.graphite));
    bar.position.x = (i - 2) * 0.1;
    bar.userData.base = h / 0.17;
    bar.scale.y = bar.userData.base;
    grille.add(bar);
    bars.push(bar);
  });

  // Dome ears on top: faceted paper half-spheres.
  const earGeo = new THREE.SphereGeometry(0.17, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = withFolds(new THREE.Mesh(earGeo, paperMat(PAPER.white)), 18);
    ear.position.set(side * 0.5, H / 2 - 0.02, 0);
    body.add(ear);
    ears.push(ear);
  }

  // Side handles: thin folded rails, like the Sonora device's side bars.
  for (const side of [-1, 1]) {
    const rail = withFolds(new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.5, 0.32, 1, 0.03), paperMat(PAPER.pearl)), 18);
    rail.position.set(side * (W / 2 + 0.04), 0.24, 0);
    body.add(rail);
    const tab = withFolds(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.12), paperMat(PAPER.line)), 10);
    tab.position.set(side * (W / 2 + 0.1), 0.5, 0);
    body.add(tab);
  }

  // The logo's raised orange square, perched on the top-right corner.
  const accent = withFolds(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.2, 1, 0.02), paperMat(PAPER.orange)), 18);
  accent.position.set(W / 2 + 0.12, H / 2 + 0.2, 0.18);
  root.add(accent);

  const shadow = contactShadow(1.35);
  shadow.position.y = -H / 2 - 0.2;
  root.add(shadow);

  return { root, body, face, eyes, eyeL, eyeR, bars, ears, accent, shadow, H };
}

/* ------------------------------------------------------------------ */
/*  Paper rocket                                                       */
/* ------------------------------------------------------------------ */

function buildRocket() {
  const g = new THREE.Group();
  const bodyMesh = withFolds(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.35, 10), paperMat(PAPER.white)));
  g.add(bodyMesh);
  const nose = withFolds(new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.62, 10), paperMat(PAPER.orange)));
  nose.position.y = 0.98;
  g.add(nose);
  const band = withFolds(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.14, 10), paperMat(PAPER.cobalt)));
  band.position.y = -0.42;
  g.add(band);
  const port = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 10), paperMat(PAPER.graphite));
  port.rotation.x = Math.PI / 2;
  port.position.set(0, 0.25, 0.32);
  g.add(port);
  const portGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), new THREE.MeshBasicMaterial({ color: 0xdfe6ff }));
  portGlass.rotation.x = Math.PI / 2;
  portGlass.position.set(0, 0.25, 0.33);
  g.add(portGlass);

  // Three folded fins.
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.42, -0.34);
  finShape.lineTo(0.42, -0.62);
  finShape.lineTo(0, -0.5);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.04, bevelEnabled: false });
  for (let i = 0; i < 3; i++) {
    const fin = withFolds(new THREE.Mesh(finGeo, paperMat(PAPER.cobalt)));
    fin.position.y = -0.1;
    const holder = new THREE.Group();
    holder.rotation.y = (i / 3) * Math.PI * 2;
    fin.position.x = 0.3;
    holder.add(fin);
    g.add(holder);
  }

  // Exhaust: a cluster of small paper triangles/flecks that only shows while launching.
  const exhaust = new THREE.Group();
  exhaust.position.y = -0.72;
  const flecks = [];
  const triGeo = new THREE.ConeGeometry(0.07, 0.16, 3);
  const colors = [PAPER.orange, PAPER.white, PAPER.blueTint, PAPER.orange];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(triGeo, paperMat(colors[i % colors.length], { side: THREE.DoubleSide }));
    m.userData = {
      seed: Math.random() * 100,
      speed: 0.6 + Math.random() * 0.8,
      spread: 0.06 + Math.random() * 0.22,
    };
    exhaust.add(m);
    flecks.push(m);
  }
  g.add(exhaust);
  return { root: g, exhaust, flecks };
}

/* ------------------------------------------------------------------ */
/*  Scene factories                                                    */
/* ------------------------------------------------------------------ */

function heroScene(slot) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  const baseZ = 6.6;
  camera.position.set(0, 0.25, baseZ);
  addStudioLights(scene);

  const robot = buildRobot();
  scene.add(robot.root);

  // A few paper planes looping around the robot (kept inside the frame).
  const planes = [];
  const planeColors = [PAPER.white, PAPER.cobalt, PAPER.white, PAPER.blueTint];
  const planeCount = isCoarse ? 3 : 4;
  for (let i = 0; i < planeCount; i++) {
    const p = paperPlane(planeColors[i % planeColors.length]);
    p.scale.setScalar(0.34 + (i % 2) * 0.1);
    p.userData = {
      a: (i / planeCount) * Math.PI * 2,
      rx: 0.7 + (i % 2) * 0.12, // fraction of the visible half-width
      rz: 0.9 + (i % 3) * 0.2,
      y: -0.7 + i * 0.55,
      speed: (0.16 + i * 0.03) * (i % 2 ? -1 : 1),
      bob: i * 1.7,
    };
    scene.add(p);
    planes.push(p);
  }

  // Pointer tracking relative to the hero slot: the robot turns to face the cursor.
  const target = new THREE.Vector2(0, 0);
  const look = new THREE.Vector2(0, 0);
  window.addEventListener(
    "pointermove",
    (e) => {
      const r = slot.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      target.set(
        clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.4, 1.4),
        clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1.4, 1.4)
      );
    },
    { passive: true }
  );

  let blinkT = 2.2;
  let blinkPhase = 0;
  let talkT = 3.5;
  let talking = 0;

  function placePlanes(t, halfW, scrollP, dt) {
    planes.forEach((p) => {
      const u = p.userData;
      if (!reduceMotion) u.a += u.speed * dt;
      const x = Math.cos(u.a) * u.rx * halfW;
      const z = Math.sin(u.a) * u.rz - 1.7; // orbit behind the robot so planes never cross its face
      const y = u.y + (reduceMotion ? 0 : Math.sin(t * 0.9 + u.bob) * 0.15) - scrollP * 2.2;
      _prev.copy(p.position);
      p.position.set(x, y, z);
      _dir.subVectors(p.position, _prev);
      if (_dir.lengthSq() > 1e-8) {
        p.lookAt(_ahead.addVectors(p.position, _dir));
        p.rotation.z += Math.sign(u.speed) * -0.45;
      } else {
        p.lookAt(Math.cos(u.a + 0.2) * u.rx * halfW, y, Math.sin(u.a + 0.2) * u.rz - 1.7);
      }
    });
  }

  function update(t, dt, info) {
    const aspect = info.rect.width / Math.max(1, info.rect.height);
    // Keep the robot comfortably inside narrow (mobile) slots too.
    const minHalfW = 1.55;
    const halfHAtBase = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * baseZ;
    const neededZ = aspect * halfHAtBase < minHalfW ? minHalfW / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect) : baseZ;
    camera.position.z = neededZ;
    const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * neededZ * aspect;

    const scrollP = info.progress;
    if (reduceMotion) {
      robot.root.rotation.set(0, -0.22, 0);
      placePlanes(t, halfW, 0, 0);
      return;
    }

    look.lerp(target, 1 - Math.pow(0.002, dt));

    // Gentle float; scroll lifts it away and turns it, like the reference hero.
    robot.root.position.y = Math.sin(t * 1.2) * 0.06 + scrollP * 1.2;
    robot.root.rotation.y = look.x * 0.42 + Math.sin(t * 0.35) * 0.05 + scrollP * 0.8;
    robot.root.rotation.x = -look.y * 0.16 + scrollP * 0.25;
    robot.root.rotation.z = Math.sin(t * 0.6) * 0.015;
    const s = 1 - scrollP * 0.25;
    robot.root.scale.setScalar(s);
    robot.shadow.material.opacity = 1 - scrollP;

    // Eyes follow the cursor inside the screen.
    robot.eyes.position.x = look.x * 0.07;
    robot.eyes.position.y = look.y * 0.04;

    // Blink.
    blinkT -= dt;
    if (blinkT <= 0) {
      blinkPhase += dt * 13;
      const sy = Math.max(0.08, Math.abs(Math.cos(blinkPhase)));
      robot.eyeL.scale.y = sy;
      robot.eyeR.scale.y = sy;
      if (blinkPhase > Math.PI) {
        blinkPhase = 0;
        blinkT = 2.6 + ((t * 7.3) % 3.5);
        robot.eyeL.scale.y = robot.eyeR.scale.y = 1;
      }
    }

    // Occasional "talk": the speaker bars ripple for a moment, then settle.
    talkT -= dt;
    if (talkT <= 0 && talking <= 0) {
      talking = 1.6;
      talkT = 6 + ((t * 3.1) % 4);
    }
    talking = Math.max(0, talking - dt);
    robot.bars.forEach((b, i) => {
      const k = talking > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 14 + i * 1.3)) : 1;
      const targetY = Math.min(1, b.userData.base * (talking > 0 ? 1.6 * k : 1));
      b.scale.y += (targetY - b.scale.y) * Math.min(1, dt * 14);
    });

    // Ears wobble a touch; the orange square floats like the logo accent.
    robot.ears[0].rotation.z = Math.sin(t * 2.1) * 0.06;
    robot.ears[1].rotation.z = -Math.sin(t * 2.1 + 0.5) * 0.06;
    robot.accent.position.y = robot.H / 2 + 0.2 + Math.sin(t * 1.6 + 1) * 0.05;
    robot.accent.rotation.y = Math.sin(t * 0.8) * 0.35;

    placePlanes(t, halfW, scrollP, dt);
  }

  return { scene, camera, update, slot };
}

function launchScene(slot) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0.2, 0.4, 7.4);
  addStudioLights(scene);

  const rocket = buildRocket();
  rocket.root.rotation.z = -0.18;
  scene.add(rocket.root);

  // Launch pad: a folded kraft platform + contact shadow.
  const pad = paperBox(2.2, 0.16, 1.4, PAPER.line, 0.04);
  pad.position.set(0, -2.1, 0);
  scene.add(pad);
  const shadow = contactShadow(1.2);
  shadow.position.set(0, -2.01, 0);
  scene.add(shadow);

  // Paper clouds: clusters of flat-shaded spheres.
  const clouds = [];
  for (let i = 0; i < 4; i++) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = withFolds(new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + Math.random() * 0.2, 0), paperMat(PAPER.white)));
      puff.position.set((k - 1.5) * 0.3, Math.random() * 0.15, (Math.random() - 0.5) * 0.3);
      cloud.add(puff);
    }
    const baseX = i % 2 ? 1.2 : -1.25;
    cloud.position.set(baseX, -1.4 + i * 1.3, -1.5 - i * 0.4);
    cloud.userData = { phase: i, baseX };
    scene.add(cloud);
    clouds.push(cloud);
  }

  function update(t, dt, info) {
    // Section progress 0 → 1 while the slot travels up the viewport.
    const p = reduceMotion ? 0.55 : info.progress;
    const lift = THREE.MathUtils.smoothstep(p, 0.12, 0.85);
    rocket.root.position.y = lerp(-1.25, 2.6, lift) + (reduceMotion ? 0 : Math.sin(t * 2.5) * 0.03 * lift);
    rocket.root.position.x = lerp(0, 0.5, lift);
    rocket.root.rotation.z = lerp(-0.04, -0.3, lift) + (reduceMotion ? 0 : Math.sin(t * 1.8) * 0.02);
    rocket.root.rotation.y = reduceMotion ? 0.4 : t * 0.35;
    pad.position.y = -2.1 - lift * 0.6;
    shadow.position.y = -2.01 - lift * 0.6;
    shadow.scale.setScalar(Math.max(0.25, 1 - lift));
    shadow.material.opacity = 1 - lift * 0.8;

    const burn = THREE.MathUtils.smoothstep(p, 0.1, 0.4) * (1 - THREE.MathUtils.smoothstep(p, 0.9, 1));
    rocket.exhaust.visible = burn > 0.02;
    rocket.flecks.forEach((f, i) => {
      const u = f.userData;
      const life = (((reduceMotion ? 0 : t) * u.speed * 1.6 + u.seed) % 1);
      const ang = u.seed * 7 + i;
      f.position.set(Math.cos(ang) * u.spread * (0.4 + life), -life * (0.9 + burn * 0.9), Math.sin(ang) * u.spread * (0.4 + life));
      f.rotation.set(life * 6 + u.seed, u.seed, life * 4);
      const s = (1 - life) * (0.6 + burn);
      f.scale.setScalar(Math.max(0.001, s));
    });

    clouds.forEach((c) => {
      c.position.y = -1.4 + c.userData.phase * 1.3 - lift * 2.2 + (reduceMotion ? 0 : Math.sin(t * 0.6 + c.userData.phase) * 0.1);
      c.position.x = c.userData.baseX + (reduceMotion ? 0 : Math.sin(t * 0.3 + c.userData.phase) * 0.15);
    });
  }

  return { scene, camera, update, slot };
}

function coreScene(slot) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.2, 6);
  addStudioLights(scene);

  const group = new THREE.Group();
  scene.add(group);
  const outer = withFolds(new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 0), paperMat(PAPER.white)));
  group.add(outer);
  const inner = withFolds(new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), paperMat(PAPER.orange)));
  inner.position.set(1.75, 0.3, 0);
  group.add(inner);
  const ring = withFolds(new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.07, 4, 10), paperMat(PAPER.cobalt)));
  ring.rotation.x = Math.PI / 2.4;
  group.add(ring);
  const ring2 = withFolds(new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.05, 4, 12), paperMat(PAPER.graphite)));
  ring2.rotation.x = Math.PI / 1.6;
  ring2.rotation.y = 0.5;
  group.add(ring2);

  const satellites = [];
  for (let i = 0; i < 3; i++) {
    const p = paperPlane(i === 1 ? PAPER.cobalt : PAPER.white);
    p.scale.setScalar(0.5);
    p.userData = { a: (i / 3) * Math.PI * 2 };
    group.add(p);
    satellites.push(p);
  }

  const shadow = contactShadow(1.5);
  shadow.position.y = -2.2;
  scene.add(shadow);

  function update(t, dt) {
    if (reduceMotion) {
      group.rotation.set(0.3, 0.6, 0);
      satellites.forEach((p, i) => p.position.set(Math.cos(i * 2.1) * 1.75, 0, Math.sin(i * 2.1) * 1.75));
      return;
    }
    group.rotation.y = t * 0.25;
    group.rotation.x = Math.sin(t * 0.3) * 0.15;
    inner.rotation.y = -t * 0.6;
    inner.rotation.x = t * 0.4;
    inner.position.set(Math.cos(t * 0.5) * 1.75, Math.sin(t * 0.5) * 0.6 + 0.2, Math.sin(t * 0.5) * 1.75);
    group.position.y = Math.sin(t * 1.1) * 0.08;
    satellites.forEach((p, i) => {
      const a = p.userData.a + t * 0.6;
      p.position.set(Math.cos(a) * 1.75, Math.sin(a * 2) * 0.2, Math.sin(a) * 1.75);
      group.updateMatrixWorld();
      p.lookAt(group.localToWorld(_ahead.set(Math.cos(a + 0.1) * 1.75, Math.sin((a + 0.1) * 2) * 0.2, Math.sin(a + 0.1) * 1.75)));
    });
  }

  return { scene, camera, update, slot };
}

/* ------------------------------------------------------------------ */
/*  Renderer loop (one canvas, many slots)                             */
/* ------------------------------------------------------------------ */

function init() {
  const canvas = document.getElementById("gl");
  if (!canvas) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    document.documentElement.classList.add("no-webgl");
    return;
  }
  renderer.setClearColor(0x000000, 0);
  paperTex = makePaperTexture();
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps brand colours true
  renderer.toneMappingExposure = 1.12;
  renderer.setScissorTest(true);

  const factories = { hero: heroScene, launch: launchScene, core: coreScene };
  const views = [];
  document.querySelectorAll("[data-scene]").forEach((slot) => {
    const f = factories[slot.dataset.scene];
    if (f) views.push(f(slot));
  });
  if (!views.length) return;

  let lastW = 0;
  let lastH = 0;
  let lastDpr = 0;
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Cap the backbuffer at ~3.5 MP so a full-viewport canvas stays cheap on big/high-DPI screens.
    const dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2, Math.sqrt(3.5e6 / Math.max(1, w * h)));
    if (w === lastW && h === lastH && dpr === lastDpr) return;
    lastW = w;
    lastH = h;
    lastDpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }
  resize();
  window.addEventListener("resize", resize);

  // One render loop. Browsers pause requestAnimationFrame in hidden tabs, and dt
  // is clamped, so returning to the tab simply resumes where it left off.
  const clock = new THREE.Clock();
  let time = 0;
  let idleCleared = false;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    const t = time;
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    const visible = [];
    for (const v of views) {
      const r = v.slot.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw || r.width < 2 || r.height < 2) continue;
      visible.push([v, r]);
    }

    // Nothing on screen: clear once, then skip GPU work until a slot is visible again.
    if (!visible.length) {
      if (!idleCleared) {
        renderer.setScissorTest(false);
        renderer.clear();
        renderer.setScissorTest(true);
        idleCleared = true;
      }
      return;
    }
    idleCleared = false;

    // Clear the entire canvas first; scissored renders only clear their own
    // rectangle, so a slot that scrolled off-screen would leave stale pixels.
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);

    for (const [v, r] of visible) {
      const progress = clamp((vh - r.top) / (vh + r.height), 0, 1);
      const heroProgress = clamp(-r.top / Math.max(1, r.height), 0, 1);
      v.update(t, dt, { progress: v.slot.dataset.scene === "hero" ? heroProgress : progress, rect: r });

      const left = Math.floor(r.left);
      const bottom = Math.floor(vh - r.bottom);
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      renderer.setViewport(left, bottom, w, h);
      renderer.setScissor(left, bottom, w, h);
      v.camera.aspect = w / h;
      v.camera.updateProjectionMatrix();
      renderer.render(v.scene, v.camera);
    }
  }
  requestAnimationFrame(frame);
  document.documentElement.classList.add("gl-ready");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
