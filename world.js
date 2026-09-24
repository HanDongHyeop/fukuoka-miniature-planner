// 브릭 미니어처 3D 월드 — OpenStreetMap 데이터로 건물·도로·철도·수면·공원을 실제 3D로 세우고
// 사람·차량·열차를 그 안에서 움직인다. (three.js ESM)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PAL = {
  ground: 0xdcd6c8, plaza: 0xcfc8b8, sidewalk: 0xd9d3c5, road: 0x6b6b72, roadMinor: 0x7d7c82, roadService: 0x8f8e93,
  water: 0x5aa9c9, green: 0x86b16f, treeA: 0x5f9a4a, treeB: 0x6faa55, trunk: 0x7a5233, ballast: 0x8d8983, rail: 0x4c4a48, mono: 0xcdc8bd, pier: 0xbdb7ab,
  walls: [0xd9d3c6, 0xcfc8ba, 0xe4dfd4, 0xb9b4a9, 0xcac4b7, 0xb5bcc2, 0xd8d0c0, 0xc4beb0, 0xa9b0b6, 0xe0d8c6],
  landmark: { food: 0xe36b4f, shop: 0x3c9a8f, gacha: 0x9b6bd6, camera: 0x3f5a9c, hotel: 0xe0524a, transit: 0x4a78d0, cafe: 0xa86b3c, sight: 0xe0a83a, unknown: 0x8f8a80 },
};
const SKIN = 0xf1c9a5, HAIRS = [0x4a2f1f, 0x1f1a17, 0x7a4b2b, 0xb28a4c, 0x3a3a3a];
const TORSOS = [0x2f7f86, 0xc9452b, 0x2e3d5c, 0xd9b14a, 0x8f8f95, 0xe8e4dc, 0x6a8f5a, 0x9b6bd6, 0x3b3b3b];
const LEGSC = [0x2e3d5c, 0x5a5a60, 0xc9bda4, 0x3a3a3a, 0x8c6a4a];

export class World {
  constructor(container) {
    this.el = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0xe4dfd5);
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
    this.az = Math.PI / 4; this.elev = THREE.MathUtils.degToRad(38); this.target = new THREE.Vector3(); this.viewW = 520; // visible width (m)
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb8b0a0, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(-300, 500, 200); this.scene.add(sun);
    this.areas = {}; this.cur = null; this.dyn = new THREE.Group(); this.scene.add(this.dyn);
    this.npcs = []; this.cars = []; this.trains = []; this.hero = null; this.heroPath = null; this.rings = []; this.routeMeshes = [];
    this.clock = new THREE.Clock(); this.lowperf = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ambient = !this.reduced;
    this._makeTemplates();
    this._gestures();
    addEventListener('resize', () => this.resize()); this.resize();
    this.onFrame = null;
    const loop = () => { this._tick(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  }
  resize() { const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1; this.renderer.setSize(w, h, false); this.aspect = w / h; this._cam(); }
  _cam() {
    const hw = this.viewW / 2, hh = hw / this.aspect; const c = this.camera; c.left = -hw; c.right = hw; c.top = hh; c.bottom = -hh; c.updateProjectionMatrix();
    const d = 2200; c.position.set(this.target.x + Math.sin(this.az) * Math.cos(this.elev) * d, this.target.y + Math.sin(this.elev) * d, this.target.z + Math.cos(this.az) * Math.cos(this.elev) * d);
    c.lookAt(this.target); c.updateMatrixWorld();
  }
  zoomBy(f, sx, sy) { const before = this.groundAt(sx, sy); this.viewW = THREE.MathUtils.clamp(this.viewW / f, 110, 1800); this._cam(); if (before) { const after = this.groundAt(sx, sy); if (after) { this.target.x += before.x - after.x; this.target.z += before.z - after.z; this._cam(); } } }
  rotateBy(a) { this.az += a; this._cam(); }
  groundAt(sx, sy) { const w = this.el.clientWidth, h = this.el.clientHeight; const nd = new THREE.Vector3((sx / w) * 2 - 1, -(sy / h) * 2 + 1, 0); const ray = new THREE.Raycaster(); ray.setFromCamera(nd, this.camera); const p = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null; }
  panPx(dx, dy) { const a = this.groundAt(0, 0), b = this.groundAt(dx, dy); if (a && b) { this.target.x -= b.x - a.x; this.target.z -= b.z - a.z; this._cam(); } }
  focus(x, z, viewW, anim) { const from = { x: this.target.x, z: this.target.z, w: this.viewW }; const to = { x, z, w: viewW || this.viewW }; if (!anim || this.reduced) { this.target.set(x, 0, z); this.viewW = to.w; this._cam(); return; } const t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 450); const e = 1 - Math.pow(1 - k, 3); this.target.set(from.x + (to.x - from.x) * e, 0, from.z + (to.z - from.z) * e); this.viewW = from.w + (to.w - from.w) * e; this._cam(); if (k < 1) requestAnimationFrame(step); }; step(); }
  project(v) { const p = v.clone().project(this.camera); return { x: (p.x + 1) / 2 * this.el.clientWidth, y: (1 - p.y) / 2 * this.el.clientHeight, vis: p.z < 1 }; }
  _gestures() {
    const el = this.renderer.domElement; const ptrs = new Map(); let last = null, pd = 0, pa = 0; this.dragged = false;
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) { last = { x: e.clientX, y: e.clientY }; this.dragged = false; } if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pd = Math.hypot(a.x - b.x, a.y - b.y); pa = Math.atan2(a.y - b.y, a.x - b.x); } });
    el.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1 && last) { const dx = e.clientX - last.x, dy = e.clientY - last.y; if (Math.abs(dx) + Math.abs(dy) > 3) this.dragged = true; this.panPx(dx, dy); last = { x: e.clientX, y: e.clientY }; } else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), an = Math.atan2(a.y - b.y, a.x - b.x); const r = el.getBoundingClientRect(); if (pd) this.zoomBy(d / pd, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); this.rotateBy(-(an - pa)); pd = d; pa = an; } });
    const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pd = 0; if (ptrs.size === 0) last = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); const r = el.getBoundingClientRect(); this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  }

  // ---------- geometry helpers ----------
  static ribbon(pts, w, y, color, uvLen) {
    const n = pts.length; if (n < 2) return null; const pos = [], idx = [], uv = []; const half = w / 2; let dist = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i]; const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)];
      let dx = next[0] - prev[0], dy = next[1] - prev[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const nx = -dy, ny = dx; if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      pos.push(p[0] + nx * half, y, -(p[1] + ny * half), p[0] - nx * half, y, -(p[1] - ny * half));
      const u = uvLen ? dist / uvLen : 0; uv.push(u, 0, u, 1);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (color !== undefined) { const c = new THREE.Color(color); const cols = []; for (let i = 0; i < pos.length / 3; i++) cols.push(c.r, c.g, c.b); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); }
    return g;
  }
  static polyGeo(pts, y, color) {
    const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
    const c = new THREE.Color(color); const cols = []; for (let i = 0; i < g.attributes.position.count; i++) cols.push(c.r, c.g, c.b); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); return g;
  }
  static inPoly(x, y, poly) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
  static bbox(poly) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } return [x0, y0, x1, y1]; }

  // ---------- area build ----------
  async loadArea(name, url) {
    if (this.areas[name]) return this.areas[name];
    const d = await (await fetch(url)).json();
    const A = { name, d, group: new THREE.Group(), nodes: new Map(), adj: new Map(), bld: [], walkRoads: [], carRoads: [], railLines: [], landmarks: new Map() };
    A.group.visible = false; this.scene.add(A.group);
    const lat0 = d.center[0], lng0 = d.center[1]; const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
    A.toXZ = (lat, lng) => ({ x: (lng - lng0) * kx, z: -((lat - lat0) * ky) });
    // ground
    const [s, n, w, e] = d.bbox; const gw = (e - w) * kx + 400, gh = (n - s) * ky + 400;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshLambertMaterial({ color: PAL.ground, map: this._studTex() }));
    ground.material.map.repeat.set(gw / 8, gh / 8); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; A.group.add(ground);
    const base = new THREE.Mesh(new THREE.BoxGeometry(gw, 14, gh), new THREE.MeshLambertMaterial({ color: 0x3a3632 })); base.position.y = -7.05; A.group.add(base);
    // flat polygons
    const flats = [];
    d.green.forEach(p => { const g = World.polyGeo(p, 0.03, PAL.green); if (g) flats.push(g); });
    d.plazas.forEach(p => { const g = World.polyGeo(p, 0.025, PAL.plaza); if (g) flats.push(g); });
    d.water.forEach(p => { const g = World.polyGeo(p, 0.035, PAL.water); if (g) flats.push(g); });
    // roads
    const ribbons = [];
    for (const r of d.roads) {
      if (r.tn) continue; const y = 0.05 + (r.b || r.l > 0 ? Math.max(r.l, 1) * 5.5 : 0);
      if (r.t === 'waterway') { const g = World.ribbon(r.pts, r.w, 0.03, PAL.water); if (g) flats.push(g); continue; }
      if (r.t === 'coastline') { // sea is on the right-hand side of the way direction
        const off = r.pts.map((p, i) => { const q = r.pts[Math.min(r.pts.length - 1, i + 1)], pr = r.pts[Math.max(0, i - 1)]; let dx = q[0] - pr[0], dy = q[1] - pr[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; return [p[0] + dy * 300, p[1] - dx * 300]; });
        const g = World.ribbon(off, 600, 0.03, PAL.water); if (g) flats.push(g); continue; }
      const foot = ['footway', 'pedestrian', 'path', 'steps', 'cycleway', 'corridor'].includes(r.t);
      const major = ['primary', 'secondary', 'trunk', 'motorway', 'primary_link', 'secondary_link', 'trunk_link', 'motorway_link'].includes(r.t);
      const col = foot ? PAL.sidewalk : major ? PAL.road : (r.t === 'service' ? PAL.roadService : PAL.roadMinor);
      const g = World.ribbon(r.pts, r.w, foot ? y + 0.03 : y, col); if (!g) continue; ribbons.push(g);
      if (!foot && r.w >= 9) { const sw = World.ribbon(r.pts, r.w + 6, y - 0.01, PAL.sidewalk); if (sw) ribbons.push(sw); }
      if (r.b || r.l > 0) { const under = World.ribbon(r.pts, r.w + 1, y - 1.2, 0x9a958c); if (under) ribbons.push(under); }
      if (r.t !== 'motorway' && r.t !== 'trunk' && r.t !== 'steps') { A.walkRoads.push(r); this._addGraph(A, r.pts, foot ? 1 : 1.15); }
      if (['primary', 'secondary', 'tertiary', 'trunk', 'unclassified', 'residential', 'living_street', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk_link'].includes(r.t)) A.carRoads.push(r);
    }
    // rails
    for (const r of d.rails) {
      if (r.tn || r.t === 'subway') continue; const el = r.t === 'monorail' ? 9 : (r.b || r.l > 0 ? Math.max(r.l, 1) * 5.5 : 0.1);
      if (r.t === 'monorail') { const g = World.ribbon(r.pts, 2.6, el, PAL.mono); if (g) ribbons.push(g); for (let i = 0; i < r.pts.length; i += 2) { const p = r.pts[i]; const pier = new THREE.Mesh(new THREE.BoxGeometry(1.6, el, 1.6), new THREE.MeshLambertMaterial({ color: PAL.pier })); pier.position.set(p[0], el / 2, -p[1]); A.group.add(pier); } }
      else { const g = World.ribbon(r.pts, 4.2, el, PAL.ballast); if (g) ribbons.push(g); [-0.75, 0.75].forEach(o => { const rp = r.pts.map((p, i) => { const q = r.pts[Math.min(r.pts.length - 1, i + 1)], pr = r.pts[Math.max(0, i - 1)]; let dx = q[0] - pr[0], dy = q[1] - pr[1]; const l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * o, p[1] + dx / l * o]; }); const rg = World.ribbon(rp, 0.3, el + 0.12, PAL.rail); if (rg) ribbons.push(rg); }); if (el > 1) { const under = World.ribbon(r.pts, 5, el - 1.4, 0x9a958c); if (under) ribbons.push(under); } }
      A.railLines.push({ pts: r.pts, y: el + 0.3, mono: r.t === 'monorail' });
    }
    const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    if (flats.length) A.group.add(new THREE.Mesh(mergeGeometries(flats, false), flatMat));
    if (ribbons.length) { const m = new THREE.Mesh(mergeGeometries(ribbons, false), flatMat); m.renderOrder = 1; A.group.add(m); }
    // buildings
    this._buildBuildings(A);
    // trees
    this._trees(A);
    this.areas[name] = A; return A;
  }
  _addGraph(A, pts, cost) {
    const key = p => (Math.round(p[0]) + '|' + Math.round(p[1]));
    let prevK = null;
    for (const p of pts) { const k = key(p); if (!A.nodes.has(k)) { A.nodes.set(k, { x: p[0], y: p[1], k }); A.adj.set(k, []); } if (prevK && prevK !== k) { const a = A.nodes.get(prevK), b = A.nodes.get(k); const l = Math.hypot(a.x - b.x, a.y - b.y) * cost; A.adj.get(prevK).push([k, l]); A.adj.get(k).push([prevK, l]); } prevK = k; }
  }
  _buildBuildings(A) {
    const geos = []; const sun = new THREE.Vector3(-0.5, 0.8, 0.35).normalize(); let i = 0;
    for (const b of A.d.buildings) {
      const pts = b.pts.slice(); if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop(); if (pts.length < 3) continue;
      const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
      if (b.holes) b.holes.forEach(h => { const hh = h.slice(); if (hh.length > 3) { hh.pop(); sh.holes.push(new THREE.Path(hh.map(p => new THREE.Vector2(p[0], p[1])))); } });
      let g; try { g = new THREE.ExtrudeGeometry(sh, { depth: b.h, bevelEnabled: false }); } catch (e) { continue; }
      g.rotateX(-Math.PI / 2); // (x, north, up) -> (x, up, -north)
      const base = new THREE.Color(PAL.walls[(i * 7 + pts.length) % PAL.walls.length]); i++;
      b._color = base; b._geo = g; b._bbox = World.bbox(pts); b._h = b.h; b.idx = geos.length;
      this._shade(g, base, sun); geos.push(g);
    }
    A.bld = A.d.buildings.filter(b => b._geo);
    const merged = mergeGeometries(geos, false); A.bldGeo = merged; A.bldMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true })); A.group.add(A.bldMesh);
    if (!this.lowperf) { const edges = new THREE.LineSegments(new THREE.EdgesGeometry(merged, 40), new THREE.LineBasicMaterial({ color: 0x3a342c, transparent: true, opacity: 0.22 })); A.group.add(edges); }
    // remember vertex ranges for recolor
    let off = 0; for (const b of A.bld) { b._start = off; b._count = b._geo.attributes.position.count; off += b._count; }
  }
  _shade(g, base, sun) {
    const n = g.attributes.normal, cnt = g.attributes.position.count, cols = new Float32Array(cnt * 3); const v = new THREE.Vector3();
    for (let k = 0; k < cnt; k++) { v.set(n.getX(k), n.getY(k), n.getZ(k)); let f; if (v.y > 0.7) f = 1.1; else { f = 0.58 + 0.42 * Math.max(0, v.dot(sun)); } cols[k * 3] = Math.min(1, base.r * f); cols[k * 3 + 1] = Math.min(1, base.g * f); cols[k * 3 + 2] = Math.min(1, base.b * f); }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  recolorBuilding(A, b, color) { const c = new THREE.Color(color); const attr = A.bldGeo.attributes.color; const n = A.bldGeo.attributes.normal; const sun = new THREE.Vector3(-0.5, 0.8, 0.35).normalize(); const v = new THREE.Vector3(); for (let k = b._start; k < b._start + b._count; k++) { v.set(n.getX(k), n.getY(k), n.getZ(k)); const f = v.y > 0.7 ? 1.1 : 0.7 + 0.3 * Math.max(0, v.dot(sun)); attr.setXYZ(k, Math.min(1, c.r * f), Math.min(1, c.g * f), Math.min(1, c.b * f)); } attr.needsUpdate = true; }
  _trees(A) {
    const spots = []; const inB = (x, y) => { for (const b of A.bld) { const bb = b._bbox; if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue; if (World.inPoly(x, y, b.pts)) return true; } return false; };
    for (const p of A.d.green) { const bb = World.bbox(p); const area = (bb[2] - bb[0]) * (bb[3] - bb[1]); const n = Math.min(60, Math.round(area / 260)); for (let k = 0; k < n * 3 && spots.length < 700; k++) { const x = bb[0] + Math.random() * (bb[2] - bb[0]), y = bb[1] + Math.random() * (bb[3] - bb[1]); if (World.inPoly(x, y, p)) { spots.push([x, y]); if (spots.length % 3 === 0) k++; } } }
    for (const r of A.d.roads) { if (!['primary', 'secondary', 'tertiary', 'trunk'].includes(r.t) || r.b || r.l > 0) continue; let acc = 12; for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const dx = (b[0] - a[0]) / (L || 1), dy = (b[1] - a[1]) / (L || 1); while (acc < L) { const x = a[0] + dx * acc, y = a[1] + dy * acc; const o = r.w / 2 + 3.2; [[-dy * o, dx * o], [dy * o, -dx * o]].forEach(([ox, oy]) => { if (spots.length < 1100 && !inB(x + ox, y + oy)) spots.push([x + ox, y + oy]); }); acc += 26; } acc -= L; } }
    if (!spots.length) return;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.34, 2.2, 6), new THREE.MeshLambertMaterial({ color: PAL.trunk }), spots.length);
    const can = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 3.2, 3.2), new THREE.MeshLambertMaterial({ color: PAL.treeA }), spots.length);
    const top = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 1.6, 2), new THREE.MeshLambertMaterial({ color: PAL.treeB }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach((p, k) => { const s = 0.8 + Math.random() * 0.5; m.makeScale(s, s, s); m.setPosition(p[0], 1.1 * s, -p[1]); trunk.setMatrixAt(k, m); m.makeScale(s, s, s); m.setPosition(p[0], 3.6 * s, -p[1]); can.setMatrixAt(k, m); m.makeScale(s, s, s); m.setPosition(p[0], 5.9 * s, -p[1]); top.setMatrixAt(k, m); });
    A.group.add(trunk, can, top);
  }
  _studTex() { if (this._stud) return this._stud; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#dcd6c8'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(8 + i * 16, 8 + j * 16, 4.2, 0, 7); x.fillStyle = 'rgba(0,0,0,.05)'; x.fill(); x.beginPath(); x.arc(8 + i * 16, 7 + j * 16, 3.6, 0, 7); x.fillStyle = 'rgba(255,255,255,.12)'; x.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; this._stud = t; return t; }

  // ---------- show area ----------
  async show(name, url) {
    const A = await this.loadArea(name, url);
    if (this.cur && this.cur !== A) this.cur.group.visible = false;
    this.cur = A; A.group.visible = true; this._clearDyn();
    if (this.ambient) { this._spawnNPCs(A, this.lowperf ? 14 : 30); this._spawnCars(A, this.lowperf ? 6 : 12); this._spawnTrains(A); }
    return A;
  }
  _clearDyn() { this.dyn.clear(); this.npcs = []; this.cars = []; this.trains = []; this.hero = null; this.heroPath = null; this.rings = []; this.routeMeshes = []; }

  // ---------- routing ----------
  nearestNode(A, x, y) { let best = null, bd = 1e12; for (const nd of A.nodes.values()) { const d = (nd.x - x) ** 2 + (nd.y - y) ** 2; if (d < bd) { bd = d; best = nd; } } return best; }
  route(A, ax, ay, bx, by) {
    const s = this.nearestNode(A, ax, ay), t = this.nearestNode(A, bx, by); if (!s || !t) return { pts: [[ax, ay], [bx, by]], len: Math.hypot(bx - ax, by - ay) };
    const dist = new Map([[s.k, 0]]), prev = new Map(); const heap = [[0, s.k]]; const seen = new Set();
    const push = (d, k) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) { const [d, k] = pop(); if (seen.has(k)) continue; seen.add(k); if (k === t.k) break; for (const [nk, l] of A.adj.get(k) || []) { const nd = d + l; if (nd < (dist.get(nk) ?? 1e12)) { dist.set(nk, nd); prev.set(nk, k); push(nd, nk); } } }
    if (!dist.has(t.k)) return { pts: [[ax, ay], [bx, by]], len: Math.hypot(bx - ax, by - ay) };
    const chain = []; let k = t.k; while (k) { const nd = A.nodes.get(k); chain.push([nd.x, nd.y]); k = prev.get(k); } chain.reverse();
    const pts = chain.length >= 2 ? chain : [[ax, ay], [bx, by]]; let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { pts, len };
  }
  _dashTex() { if (this._dash) return this._dash; const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d'); x.clearRect(0, 0, 64, 8); x.fillStyle = '#fff'; x.fillRect(0, 0, 36, 8); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; this._dash = t; return t; }
  addRoute(pts, color, dashed, hot) {
    const g = World.ribbon(pts, 2.2, 0.42, undefined, 4.5); if (!g) return null; const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: hot ? 0.98 : 0.55, depthWrite: false, depthTest: !hot, polygonOffset: true, polygonOffsetFactor: -2 }); if (dashed) { mat.map = this._dashTex().clone(); mat.map.needsUpdate = true; mat.alphaTest = 0.4; }
    const under = new THREE.Mesh(World.ribbon(pts, 3.4, 0.4, undefined, 4.5), new THREE.MeshBasicMaterial({ color: 0x1d1a16, transparent: true, opacity: hot ? 0.35 : 0.15, depthWrite: false, depthTest: !hot, polygonOffset: true, polygonOffsetFactor: -1 }));
    const m = new THREE.Mesh(g, mat); m.renderOrder = 5; under.renderOrder = 4; this.dyn.add(under, m); this.routeMeshes.push({ m, under, hot, dashed }); return m;
  }
  addRing(x, z, r, color) { const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.3, z); ring.renderOrder = 3; this.dyn.add(ring); this.rings.push({ ring, r }); return ring; }
  addBeacon(x, z, h, color) { const g = new THREE.CylinderGeometry(0.9, 0.9, 40, 12, 1, true); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })); m.position.set(x, h + 20, z); m.renderOrder = 2; this.dyn.add(m); return m; }
  findBuilding(A, x, y) { let best = null, bd = 1e9; for (const b of A.bld) { const bb = b._bbox; if (x >= bb[0] - 2 && x <= bb[2] + 2 && y >= bb[1] - 2 && y <= bb[3] + 2 && World.inPoly(x, y, b.pts)) return b; const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2; const d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = b; } } return bd < 28 ? best : null; }

  // ---------- characters ----------
  _makeTemplates() {
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    this.G = { leg: box(0.42, 0.9, 0.42), hip: box(0.92, 0.26, 0.46), torso: box(0.98, 1.02, 0.5), arm: box(0.3, 0.86, 0.3), hand: new THREE.CylinderGeometry(0.14, 0.14, 0.16, 8), head: new THREE.CylinderGeometry(0.33, 0.33, 0.52, 12), stud: new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8), hair: box(0.74, 0.24, 0.74), pack: box(0.62, 0.7, 0.3), bag: box(0.34, 0.4, 0.2),
      carBody: box(4.3, 1.1, 1.9), carCab: box(2.3, 0.8, 1.7), wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10), busBody: box(10.5, 2.6, 2.5), busWin: box(10.6, 0.9, 2.3), trainCar: box(19, 3.3, 2.9), trainWin: box(19.1, 0.8, 2.6) };
    this.M = {}; const mat = c => (this.M[c] ||= new THREE.MeshLambertMaterial({ color: c }));
    this.mat = mat;
  }
  makeFigure(opts = {}) {
    const mat = this.mat; const g = new THREE.Group(); const S = opts.scale || 1.55;
    const torsoC = opts.torso ?? TORSOS[Math.floor(Math.random() * TORSOS.length)], legC = opts.legs ?? LEGSC[Math.floor(Math.random() * LEGSC.length)], hairC = opts.hair ?? HAIRS[Math.floor(Math.random() * HAIRS.length)];
    const legL = new THREE.Group(), legR = new THREE.Group(); [legL, legR].forEach((lg, i) => { const m = new THREE.Mesh(this.G.leg, mat(legC)); m.position.y = -0.45; lg.add(m); lg.position.set(i ? 0.24 : -0.24, 0.92, 0); g.add(lg); });
    const hip = new THREE.Mesh(this.G.hip, mat(legC)); hip.position.y = 1.03; g.add(hip);
    const torso = new THREE.Mesh(this.G.torso, mat(torsoC)); torso.position.y = 1.67; g.add(torso);
    const armL = new THREE.Group(), armR = new THREE.Group(); [armL, armR].forEach((ar, i) => { const m = new THREE.Mesh(this.G.arm, mat(torsoC)); m.position.y = -0.4; ar.add(m); const h = new THREE.Mesh(this.G.hand, mat(SKIN)); h.position.y = -0.9; ar.add(h); ar.position.set(i ? 0.66 : -0.66, 2.1, 0); g.add(ar); });
    const head = new THREE.Mesh(this.G.head, mat(SKIN)); head.position.y = 2.46; g.add(head);
    const hair = new THREE.Mesh(this.G.hair, mat(hairC)); hair.position.y = 2.8; g.add(hair);
    if (opts.pack) { const p = new THREE.Mesh(this.G.pack, mat(opts.pack)); p.position.set(0, 1.7, -0.42); g.add(p); }
    if (opts.bag) { const b = new THREE.Mesh(this.G.bag, mat(opts.bag)); b.position.set(-0.66, 1.0, 0.1); g.add(b); }
    g.scale.setScalar(S); g.userData = { legL, legR, armL, armR, phase: Math.random() * 6.28, walking: true };
    return g;
  }
  makeCar(kind) {
    const mat = this.mat; const g = new THREE.Group();
    if (kind === 'bus') { const b = new THREE.Mesh(this.G.busBody, mat(0xd9cfb8)); b.position.y = 1.9; g.add(b); const w = new THREE.Mesh(this.G.busWin, mat(0x3a4650)); w.position.y = 2.4; g.add(w); [-3.5, 3.5].forEach(x => [-1.2, 1.2].forEach(z => { const wh = new THREE.Mesh(this.G.wheel, mat(0x222222)); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.5, z); g.add(wh); })); }
    else { const col = kind === 'taxi' ? 0xd8c88f : [0xe8e4dc, 0x8f9499, 0x2e3d5c, 0xb84a3a, 0x5a6b7a][Math.floor(Math.random() * 5)]; const b = new THREE.Mesh(this.G.carBody, mat(col)); b.position.y = 0.9; g.add(b); const c = new THREE.Mesh(this.G.carCab, mat(0x3a4650)); c.position.set(-0.3, 1.8, 0); g.add(c); if (kind === 'taxi') { const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.4), mat(0xffffff)); l.position.set(-0.3, 2.3, 0); g.add(l); } [-1.4, 1.4].forEach(x => [-0.95, 0.95].forEach(z => { const wh = new THREE.Mesh(this.G.wheel, mat(0x222222)); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.36, z); g.add(wh); })); }
    g.scale.setScalar(1.7); return g;
  }
  makeTrain(kind) {
    const mat = this.mat; const g = new THREE.Group(); const cars = kind === 'shinkansen' ? 4 : 3; const body = kind === 'shinkansen' ? 0xf4f2ee : kind === 'mono' ? 0xe9e6e0 : 0x3b6fb6; const band = kind === 'shinkansen' ? 0x3b5bdb : kind === 'mono' ? 0x2f7f86 : 0x2a4c86;
    for (let i = 0; i < cars; i++) { const c = new THREE.Mesh(this.G.trainCar, mat(body)); c.position.set(i * 19.6, 1.7, 0); g.add(c); const w = new THREE.Mesh(this.G.trainWin, mat(band)); w.position.set(i * 19.6, 2.1, 0); g.add(w); }
    if (kind === 'shinkansen') { const nose = new THREE.Mesh(new THREE.ConeGeometry(1.5, 6, 4), mat(body)); nose.rotation.z = Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.position.set(-12.2, 1.9, 0); g.add(nose); }
    return g;
  }
  _pickRoad(list) { return list[Math.floor(Math.random() * list.length)]; }
  _spawnNPCs(A, n) {
    if (!A.walkRoads.length) return;
    for (let i = 0; i < n; i++) { const f = this.makeFigure({ bag: Math.random() < 0.4 ? 0xb9926b : null, scale: 2.3 + Math.random() * 0.3 }); const r = this._pickRoad(A.walkRoads); const side = Math.random() < 0.5 ? 1 : -1; const a = { obj: f, road: r, seg: 0, t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, v: 1.7 + Math.random() * 0.9, off: side * (r.w / 2 + 1.2), A }; this.dyn.add(f); this.npcs.push(a); this._place(a); }
  }
  _spawnCars(A, n) {
    if (!A.carRoads.length) return;
    for (let i = 0; i < n; i++) { const kind = i % 5 === 0 ? 'bus' : i % 3 === 0 ? 'taxi' : 'car'; const c = this.makeCar(kind); const r = this._pickRoad(A.carRoads); const a = { obj: c, road: r, seg: 0, t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, v: kind === 'bus' ? 7 : 9 + Math.random() * 4, off: 0, lane: r.w / 4, A, car: true }; this.dyn.add(c); this.cars.push(a); this._place(a); }
  }
  _spawnTrains(A) {
    const lines = A.railLines.filter(l => l.pts.length > 3); const used = new Set();
    lines.sort((a, b) => World.plen(b.pts) - World.plen(a.pts));
    for (const l of lines.slice(0, 3)) { const len = World.plen(l.pts); if (len < 150) continue; const kind = l.mono ? 'mono' : (len > 600 && !used.has('shinkansen') ? 'shinkansen' : 'local'); used.add(kind); const tr = this.makeTrain(kind); const a = { obj: tr, pts: l.pts, y: l.y, d: Math.random() * len, len, dir: 1, v: kind === 'shinkansen' ? 34 : 16, wait: 0 }; this.dyn.add(tr); this.trains.push(a); }
  }
  static plen(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; }
  static posOn(pts, d) { let acc = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= acc + L || i === pts.length - 1) { const t = L ? Math.min(1, Math.max(0, (d - acc) / L)) : 0; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / (L || 1), dy: (b[1] - a[1]) / (L || 1) }; } acc += L; } return { x: pts[0][0], y: pts[0][1], dx: 1, dy: 0 }; }
  _place(a) {
    const pts = a.road.pts; const i = a.seg; const p = pts[i], q = pts[i + 1]; if (!q) return; const x = p[0] + (q[0] - p[0]) * a.t, y = p[1] + (q[1] - p[1]) * a.t; let dx = (q[0] - p[0]), dy = (q[1] - p[1]); const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; if (a.dir < 0) { dx = -dx; dy = -dy; }
    const off = a.car ? -a.lane : a.off; // cars keep left (Japan)
    const yy = a.road.b || a.road.l > 0 ? Math.max(a.road.l, 1) * 5.5 : 0;
    a.obj.position.set(x - dy * off, yy + 0.05, -(y + dx * off)); if (!a.car) a.obj.position.y += a.obj.userData.bob || 0;
    a.obj.rotation.y = -Math.atan2(-dy, dx);
  }
  _advance(a, dt) {
    const pts = a.road.pts; const i = a.seg; const p = pts[i], q = pts[i + 1]; const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; a.t += a.dir * a.v * dt / L;
    if (a.t > 1 || a.t < 0) { // next segment or next road
      const ns = a.seg + (a.dir > 0 ? 1 : -1);
      if (ns >= 0 && ns < pts.length - 1) { a.seg = ns; a.t = a.dir > 0 ? 0 : 1; }
      else { // choose a connected road
        const end = a.dir > 0 ? pts[pts.length - 1] : pts[0]; const list = a.car ? a.A.carRoads : a.A.walkRoads; const cands = [];
        for (let k = 0; k < 40; k++) { const r = list[Math.floor(Math.random() * list.length)]; if (r === a.road) continue; const s0 = r.pts[0], s1 = r.pts[r.pts.length - 1]; if (Math.hypot(s0[0] - end[0], s0[1] - end[1]) < 6) cands.push([r, 1]); else if (Math.hypot(s1[0] - end[0], s1[1] - end[1]) < 6) cands.push([r, -1]); }
        if (cands.length) { const [r, dir] = cands[Math.floor(Math.random() * cands.length)]; a.road = r; a.dir = dir; a.seg = dir > 0 ? 0 : r.pts.length - 2; a.t = dir > 0 ? 0 : 1; if (!a.car) a.off = (a.off < 0 ? -1 : 1) * (r.w / 2 + 1.2); else a.lane = r.w / 4; }
        else { a.dir *= -1; a.t = Math.min(1, Math.max(0, a.t)); }
      }
    }
    this._place(a);
  }
  setHeroNear(A, x, z) { const nd = this.nearestNode(A, x, -z); if (nd) this.setHero(nd.x, -nd.y); else this.setHero(x, z); }
  setHero(x, z, opts) { if (!this.hero) { this.hero = this.makeFigure({ torso: 0x2f7f86, legs: 0xc9bda4, hair: 0x4a2f1f, pack: 0x7b8a4a, scale: 2.8 }); const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.4, 40), new THREE.MeshBasicMaterial({ color: 0x2f7f86, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; this.hero.add(ring); this.hero.userData.ring = ring; this.dyn.add(this.hero); } this.hero.position.set(x, 0.05, z); this.heroPath = null; this.hero.userData.walking = false; }
  heroWalk(pts) { if (!this.hero) this.setHero(pts[0][0], -pts[0][1]); this.heroPath = { pts, len: World.plen(pts), d: 0, pause: 0 }; this.hero.userData.walking = true; }
  heroPos() { return this.hero ? this.hero.position.clone() : null; }

  _tick() {
    const cw = this.el.clientWidth, ch = this.el.clientHeight; if ((cw !== this._cw || ch !== this._ch) && cw > 0 && ch > 0) { this._cw = cw; this._ch = ch; this.resize(); }
    const dt = Math.min(0.05, this.clock.getDelta()); const t = performance.now() / 1000;
    if (this.ambient) {
      for (const a of this.npcs) { this._advance(a, dt); this._animFigure(a.obj, t, a.v); }
      for (const a of this.cars) this._advance(a, dt);
      for (const tr of this.trains) { if (tr.wait > 0) { tr.wait -= dt; } else { tr.d += tr.dir * tr.v * dt; if (tr.d > tr.len || tr.d < 0) { tr.dir *= -1; tr.d = Math.max(0, Math.min(tr.len, tr.d)); tr.wait = 2.5; } } const p = World.posOn(tr.pts, tr.d); tr.obj.position.set(p.x, tr.y, -p.y); tr.obj.rotation.y = -Math.atan2(-p.dy, p.dx) + (tr.dir < 0 ? Math.PI : 0); }
    }
    if (this.hero && this.heroPath) { const hp = this.heroPath; if (hp.pause > 0) { hp.pause -= dt; this.hero.userData.walking = false; } else { hp.d += 3.4 * dt; this.hero.userData.walking = true; if (hp.d >= hp.len) { hp.d = 0; hp.pause = 1.6; } } const p = World.posOn(hp.pts, hp.d); this.hero.position.set(p.x, 0.05, -p.y); this.hero.rotation.y = -Math.atan2(-p.dy, p.dx); }
    if (this.hero) { this._animFigure(this.hero, t, 2.6); const r = this.hero.userData.ring; const s = 1 + 0.12 * Math.sin(t * 4); r.scale.set(s, s, s); r.material.opacity = 0.6 + 0.35 * Math.sin(t * 4 + 1); }
    for (const r of this.rings) { const s = 1 + 0.06 * Math.sin(t * 2.5); r.ring.scale.set(s, s, s); r.ring.material.opacity = 0.55 + 0.3 * Math.sin(t * 2.5); }
    for (const rm of this.routeMeshes) if (rm.hot && rm.dashed && rm.m.material.map) rm.m.material.map.offset.x = -t * 0.9;
    this.renderer.render(this.scene, this.camera);
    if (this.onFrame) this.onFrame();
  }
  _animFigure(g, t, v) { const u = g.userData; if (!u.walking || this.reduced) { u.legL.rotation.x = u.legR.rotation.x = u.armL.rotation.x = u.armR.rotation.x = 0; return; } const w = Math.sin(t * (4.6 + v) + u.phase) * 0.55; u.legL.rotation.x = w; u.legR.rotation.x = -w; u.armL.rotation.x = -w * 0.8; u.armR.rotation.x = w * 0.8; g.position.y = 0.05 + Math.abs(Math.sin(t * (4.6 + v) + u.phase)) * 0.06; }
}
