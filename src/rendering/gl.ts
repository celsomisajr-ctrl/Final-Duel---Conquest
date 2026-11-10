// A small WebGL2 renderer: instanced primitive meshes, flat ground decals, and a shaded ground
// plane. Simulation space (x, y) maps to 3D space (x, height, -y), so north is into the screen.
type M4 = Float32Array;
function persp(fovy: number, asp: number, n: number, f: number): M4 { const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f); return o; }
function lookAt(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): M4 {
  let fx = tx - ex, fy = ty - ey, fz = tz - ez; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let sx = -fz, sy = 0, sz = fx; const sl = Math.hypot(sx, sz); sx /= sl; sz /= sl; // f x up(0,1,0)
  const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
  return new Float32Array([sx, ux, -fx, 0, sy, uy, -fy, 0, sz, uz, -fz, 0, -(sx * ex + sy * ey + sz * ez), -(ux * ex + uy * ey + uz * ez), fx * ex + fy * ey + fz * ez, 1]);
}
function mul(a: M4, b: M4): M4 { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
function invert(m: M4): M4 {
  const o = new Float32Array(16), a = m;
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
  o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
  o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
  o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
  return o;
}

function box() { const p: number[] = [], n: number[] = []; const f = (nx: number, ny: number, nz: number, v: number[][]) => { for (const i of [0, 1, 2, 0, 2, 3]) { p.push(...v[i]); n.push(nx, ny, nz); } };
  const a = -0.5, b = 0.5;
  f(0, 0, 1, [[a, 0, b], [b, 0, b], [b, 1, b], [a, 1, b]]); f(0, 0, -1, [[b, 0, a], [a, 0, a], [a, 1, a], [b, 1, a]]);
  f(1, 0, 0, [[b, 0, b], [b, 0, a], [b, 1, a], [b, 1, b]]); f(-1, 0, 0, [[a, 0, a], [a, 0, b], [a, 1, b], [a, 1, a]]);
  f(0, 1, 0, [[a, 1, b], [b, 1, b], [b, 1, a], [a, 1, a]]); f(0, -1, 0, [[a, 0, a], [b, 0, a], [b, 0, b], [a, 0, b]]);
  return { p, n }; }
function lathe(seg: number, top: number) { const p: number[] = [], n: number[] = [];
  for (let i = 0; i < seg; i++) { const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, c0 = Math.cos(a0) * 0.5, s0 = Math.sin(a0) * 0.5, c1 = Math.cos(a1) * 0.5, s1 = Math.sin(a1) * 0.5;
    p.push(c0, 0, s0, c1, 0, s1, c1 * top, 1, s1 * top, c0, 0, s0, c1 * top, 1, s1 * top, c0 * top, 1, s0 * top);
    const ny = top ? 0 : 0.5; n.push(c0 * 2, ny, s0 * 2, c1 * 2, ny, s1 * 2, c1 * 2, ny, s1 * 2, c0 * 2, ny, s0 * 2, c1 * 2, ny, s1 * 2, c0 * 2, ny, s0 * 2);
    if (top) { p.push(0, 1, 0, c0 * top, 1, s0 * top, c1 * top, 1, s1 * top); n.push(0, 1, 0, 0, 1, 0, 0, 1, 0); } }
  return { p, n }; }
function sphere(seg: number, rings: number) { const p: number[] = [], n: number[] = []; const v = (i: number, j: number) => { const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) { const q = v(a, b); p.push(q[0] * 0.5, q[1] * 0.5 + 0.5, q[2] * 0.5); n.push(q[0], q[1], q[2]); }
  return { p, n }; }

const MESH_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
layout(location=2) in vec3 iPos; layout(location=3) in vec3 iScale; layout(location=4) in float iRot; layout(location=5) in vec4 iCol;
uniform mat4 uVP; out vec3 vN; out vec4 vC; out float vH;
void main(){ float c=cos(iRot), s=sin(iRot); vec3 p=aPos*iScale; vec3 n=aNor/max(abs(iScale),vec3(.001));
  vec3 w=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z)+iPos; vN=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z); vC=iCol; vH=aPos.y; gl_Position=uVP*vec4(w,1.); }`;
const MESH_FS = `#version 300 es
precision mediump float; in vec3 vN; in vec4 vC; in float vH; out vec4 o;
void main(){ vec3 n=normalize(vN); float d=max(dot(n,normalize(vec3(.45,1.,.35))),0.);
  vec3 l=mix(vec3(.34,.30,.40),vec3(.74,.78,.90),n.y*.5+.5)+vec3(1.,.95,.86)*d*.62; vec3 lit=vC.rgb*l*(.86+.14*vH);
  o=vec4(mix(lit,vC.rgb*1.25,vC.a),1.); }`;
// Scene-graph meshes (heroes, minions): one draw per node with its own matrix, lit like the Arena.
const NODE_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; uniform mat4 uVP; uniform mat4 uM; out vec3 vN;
void main(){ vN=mat3(uM)*aNor; gl_Position=uVP*uM*vec4(aPos,1.); }`;
const NODE_FS = `#version 300 es
precision mediump float; in vec3 vN; uniform vec3 uColor; uniform vec3 uEmi; uniform float uA; out vec4 o;
void main(){ vec3 n=normalize(vN); float d=max(dot(n,normalize(vec3(.45,1.,.35))),0.);
  vec3 l=mix(vec3(.34,.30,.40),vec3(.74,.78,.90),n.y*.5+.5)+vec3(1.,.95,.86)*d*.62; o=vec4(uColor*l+uEmi,uA); }`;
// Additive glow sprites and beams.
const SPR_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aCol; uniform mat4 uVP; out vec2 vUV; out vec4 vC;
void main(){ vUV=aUV; vC=aCol; gl_Position=uVP*vec4(aPos,1.); }`;
const SPR_FS = `#version 300 es
precision mediump float; in vec2 vUV; in vec4 vC; out vec4 o;
void main(){ float a=pow(max(0.,1.-length(vUV)),1.7); o=vec4(vC.rgb*vC.a*a,vC.a*a); }`;
const DECAL_VS = `#version 300 es
layout(location=0) in vec2 aPos; layout(location=1) in vec4 iA; layout(location=2) in vec4 iCol; layout(location=3) in vec3 iP;
uniform mat4 uVP; out vec2 vUv; out vec4 vC; out vec3 vP;
void main(){ vUv=aPos; vC=iCol; vP=iP; gl_Position=uVP*vec4(iA.x+aPos.x*iA.z,iA.w,iA.y+aPos.y*iA.z,1.); }`;
const DECAL_FS = `#version 300 es
precision mediump float; in vec2 vUv; in vec4 vC; in vec3 vP; out vec4 o;
void main(){ float d=length(vUv), a=0.;
  if(vP.x<.5) a=smoothstep(1.,.86,d)*(.55+.45*d);
  else if(vP.x<1.5) a=smoothstep(vP.z,0.,abs(d-(1.-vP.z)));
  else if(vP.x<2.5){ float ang=atan(-vUv.y,vUv.x)-vP.y; ang=abs(atan(sin(ang),cos(ang))); a=step(ang,vP.z)*smoothstep(1.,.9,d)*(.35+.65*d); }
  else a=pow(max(0.,1.-d),1.5);
  o=vec4(vC.rgb,vC.a*a); }`;
const GROUND_VS = `#version 300 es
layout(location=0) in vec2 aPos; uniform mat4 uVP; out vec2 vW;
void main(){ vW=aPos; gl_Position=uVP*vec4(aPos.x,0.,-aPos.y,1.); }`;
const GROUND_FS = `#version 300 es
precision mediump float; in vec2 vW; out vec4 o;
uniform vec4 uSeg[7]; uniform vec4 uRiver; uniform vec4 uCore; uniform vec4 uSpawn; uniform float uTime;
float seg(vec2 p, vec4 s){ vec2 a=s.xy, b=s.zw, ab=b-a; float t=clamp(dot(p-a,ab)/dot(ab,ab),0.,1.); return length(p-a-ab*t); }
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
void main(){ vec2 p=vW; float n=noise(p*.35)*.6+noise(p*1.7)*.4;
  vec3 c=mix(vec3(.13,.27,.17),vec3(.20,.36,.21),n);
  float rv=seg(p,uRiver); c=mix(c,mix(vec3(.13,.36,.52),vec3(.20,.50,.66),noise(p*.6+vec2(uTime*.4,uTime*.25))),smoothstep(7.,5.,rv));
  float ld=1e9; for(int i=0;i<7;i++) ld=min(ld,seg(p,uSeg[i]));
  c=mix(c,mix(vec3(.50,.42,.29),vec3(.60,.51,.36),n),smoothstep(6.2,4.6,ld));
  float b=min(distance(p,uCore.xy),distance(p,uCore.zw)); c=mix(c,mix(vec3(.30,.29,.37),vec3(.37,.36,.45),noise(p*.9)),smoothstep(31.,28.,b));
  float s0=distance(p,uSpawn.xy), s1=distance(p,uSpawn.zw);
  c=mix(c,vec3(.20,.42,.72),smoothstep(12.2,11.2,s0)*.55); c=mix(c,vec3(.72,.24,.24),smoothstep(12.2,11.2,s1)*.55);
  c+=vec3(.25,.5,.9)*smoothstep(.5,0.,abs(s0-12.))*.6+vec3(.9,.3,.3)*smoothstep(.5,0.,abs(s1-12.))*.6;
  float e=max(max(-p.x,p.x-200.),max(-p.y,p.y-200.)); c=mix(c,vec3(.06,.05,.10),smoothstep(-1.5,1.5,e));
  o=vec4(c,1.); }`;

const FLOATS = 11, DFLOATS = 11, CAP = 3000, QUAD = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
export type MeshKind = 'box' | 'cyl' | 'cone' | 'sph';
interface Batch { vao: WebGLVertexArrayObject; buf: WebGLBuffer; data: Float32Array; n: number; verts: number }
export interface Geo { vao: WebGLVertexArrayObject; n: number }
interface NodeDraw { g: Geo; m: Float32Array; col: number[]; emi: number[]; a: number }
const SPR_CAP = 5000;

export class Renderer {
  gl: WebGL2RenderingContext; vp: M4 = new Float32Array(16); ivp: M4 = new Float32Array(16);
  private meshP: WebGLProgram; private decalP: WebGLProgram; private groundP: WebGLProgram;
  private batches = {} as Record<MeshKind, Batch>; private decals: Batch; private ground: WebGLVertexArrayObject;
  private groundInit = false; w = 1; h = 1;
  private nodeP: WebGLProgram; private sprP: WebGLProgram; private geos = new Map<string, Geo>(); private nodes: NodeDraw[] = []; private glass: NodeDraw[] = [];
  private sprVao: WebGLVertexArrayObject; private sprBuf: WebGLBuffer; private sprData = new Float32Array(SPR_CAP * 54); private sprN = 0;
  private eye = [0, 0, 0]; private right = [1, 0, 0]; private up = [0, 1, 0];

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;
    this.meshP = this.prog(MESH_VS, MESH_FS); this.decalP = this.prog(DECAL_VS, DECAL_FS); this.groundP = this.prog(GROUND_VS, GROUND_FS); this.nodeP = this.prog(NODE_VS, NODE_FS); this.sprP = this.prog(SPR_VS, SPR_FS);
    { this.sprVao = gl.createVertexArray()!; gl.bindVertexArray(this.sprVao); this.sprBuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.sprBuf); gl.bufferData(gl.ARRAY_BUFFER, this.sprData.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20); }
    const geo: Record<MeshKind, { p: number[]; n: number[] }> = { box: box(), cyl: lathe(14, 1), cone: lathe(12, 0), sph: sphere(12, 8) };
    for (const k of Object.keys(geo) as MeshKind[]) {
      const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
      for (const [loc, arr] of [[0, geo[k].p], [1, geo[k].n]] as [number, number[]][]) { gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); }
      const buf = gl.createBuffer()!, data = new Float32Array(CAP * FLOATS); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
      let off = 0; for (const [loc, size] of [[2, 3], [3, 3], [4, 1], [5, 4]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, FLOATS * 4, off * 4); gl.vertexAttribDivisor(loc, 1); off += size; }
      this.batches[k] = { vao, buf, data, n: 0, verts: geo[k].p.length / 3 };
    }
    { const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const buf = gl.createBuffer()!, data = new Float32Array(CAP * DFLOATS); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
      let off = 0; for (const [loc, size] of [[1, 4], [2, 4], [3, 3]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, DFLOATS * 4, off * 4); gl.vertexAttribDivisor(loc, 1); off += size; }
      this.decals = { vao, buf, data, n: 0, verts: 6 }; }
    { this.ground = gl.createVertexArray()!; gl.bindVertexArray(this.ground); const a = -60, b = 260;
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([a, a, b, a, b, b, a, a, b, b, a, b]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
    gl.bindVertexArray(null);
  }
  private prog(vs: string, fs: string) { const gl = this.gl, p = gl.createProgram()!;
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as [number, string][]) { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader'); gl.attachShader(p, sh); }
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link'); return p; }

  /** Lane, river, base and sanctuary geometry for the ground shader (set once). */
  setMap(segs: number[][], river: number[], cores: number[], spawns: number[]) { const gl = this.gl; gl.useProgram(this.groundP);
    gl.uniform4fv(gl.getUniformLocation(this.groundP, 'uSeg'), new Float32Array(segs.flat())); gl.uniform4fv(gl.getUniformLocation(this.groundP, 'uRiver'), river);
    gl.uniform4fv(gl.getUniformLocation(this.groundP, 'uCore'), cores); gl.uniform4fv(gl.getUniformLocation(this.groundP, 'uSpawn'), spawns); this.groundInit = true; }

  resize(maxDpr = 1.5) { const dpr = Math.min(window.devicePixelRatio || 1, maxDpr), w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (w !== this.canvas.width || h !== this.canvas.height) { this.canvas.width = w; this.canvas.height = h; } this.w = this.canvas.clientWidth; this.h = this.canvas.clientHeight; }

  /** Starts a frame looking at simulation point (tx, ty). `flip` turns the camera to face south (Red's view). */
  begin(tx: number, ty: number, flip: boolean, zoom = 0.86) {
    const s = flip ? -1 : 1, asp = this.canvas.width / Math.max(1, this.canvas.height), back = (asp < 1.3 ? 34 : 27) * zoom, up = (asp < 1.3 ? 46 : 37) * zoom;
    const view = lookAt(tx, up, -ty + back * s, tx, 0, -ty - 2 * s);
    this.vp = mul(persp(0.66, asp, 1, 400), view); this.ivp = invert(this.vp);
    this.eye = [tx, up, -ty + back * s]; this.right = [view[0], view[4], view[8]]; this.up = [view[1], view[5], view[9]];
    for (const k in this.batches) this.batches[k as MeshKind].n = 0; this.decals.n = 0; this.nodes.length = 0; this.glass.length = 0; this.sprN = 0;
  }
  mesh(k: MeshKind, x: number, h: number, y: number, sx: number, sy: number, sz: number, rot: number, c: number[], glow = 0) {
    const b = this.batches[k]; if (b.n >= CAP) return; const d = b.data, o = b.n++ * FLOATS;
    d[o] = x; d[o + 1] = h; d[o + 2] = -y; d[o + 3] = sx; d[o + 4] = sy; d[o + 5] = sz; d[o + 6] = rot; d[o + 7] = c[0]; d[o + 8] = c[1]; d[o + 9] = c[2]; d[o + 10] = glow;
  }
  /** shape: 0 disc, 1 ring (p2 = band width 0..1), 2 cone (p1 = direction, p2 = half angle), 3 soft shadow */
  decal(x: number, y: number, r: number, shape: number, c: number[], a: number, p1 = 0, p2 = 0.12, lift = 0.06) {
    const b = this.decals; if (b.n >= CAP) return; const d = b.data, o = b.n++ * DFLOATS;
    d[o] = x; d[o + 1] = -y; d[o + 2] = r; d[o + 3] = lift; d[o + 4] = c[0]; d[o + 5] = c[1]; d[o + 6] = c[2]; d[o + 7] = a; d[o + 8] = shape; d[o + 9] = p1; d[o + 10] = p2;
  }
  /** Uploads (once) a triangle list in model space. Flat normals are derived per face, pointing away from the centre. */
  geo(key: string, build: () => { p: number[]; n?: number[] | null }): Geo {
    let g = this.geos.get(key); if (g) return g;
    const gl = this.gl, src = build(), p = new Float32Array(src.p); let n: Float32Array;
    if (src.n) n = new Float32Array(src.n);
    else { n = new Float32Array(p.length); const N = p.length / 3; let cx = 0, cy = 0, cz = 0; for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; } cx /= N; cy /= N; cz /= N;
      for (let i = 0; i < p.length; i += 9) { const ax = p[i], ay = p[i + 1], az = p[i + 2], bx = p[i + 3] - ax, by = p[i + 4] - ay, bz = p[i + 5] - az, qx = p[i + 6] - ax, qy = p[i + 7] - ay, qz = p[i + 8] - az;
        let nx = by * qz - bz * qy, ny = bz * qx - bx * qz, nz = bx * qy - by * qx; const l = Math.hypot(nx, ny, nz); if (l < 1e-9) { nx = 0; ny = 1; nz = 0; } else { nx /= l; ny /= l; nz /= l; }
        const mx = (ax + p[i + 3] + p[i + 6]) / 3 - cx, my = (ay + p[i + 4] + p[i + 7]) / 3 - cy, mz = (az + p[i + 5] + p[i + 8]) / 3 - cz; if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        for (let k = 0; k < 3; k++) { n[i + k * 3] = nx; n[i + k * 3 + 1] = ny; n[i + k * 3 + 2] = nz; } } }
    const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    for (const [loc, arr] of [[0, p], [1, n]] as [number, Float32Array][]) { gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); }
    gl.bindVertexArray(null); g = { vao, n: p.length / 3 }; this.geos.set(key, g); return g;
  }
  /** Queues one mesh with a full model matrix (3D space, column-major). */
  node(g: Geo, m: Float32Array, col: number[], emi: number[], a = 1) { (a < 1 ? this.glass : this.nodes).push({ g, m, col, emi, a }); }
  /** Additive glow billboard at a simulation point and height. */
  spr(x: number, h: number, y: number, sx: number, sy: number, c: number[], a: number) {
    if (this.sprN >= SPR_CAP || a <= 0.003) return; const D = this.sprData, R = this.right, U = this.up, z = -y, hx = sx / 2, hy = sy / 2; let o = this.sprN++ * 54;
    for (const [ux, uy] of QUAD) { D[o++] = x + R[0] * ux * hx + U[0] * uy * hy; D[o++] = h + R[1] * ux * hx + U[1] * uy * hy; D[o++] = z + R[2] * ux * hx + U[2] * uy * hy; D[o++] = ux; D[o++] = uy; D[o++] = c[0]; D[o++] = c[1]; D[o++] = c[2]; D[o++] = a; }
  }
  /** Additive camera-facing beam between two [x, height, y] points. */
  beam(p: number[], q: number[], w: number, c: number[], a: number) {
    if (this.sprN >= SPR_CAP || a <= 0.003) return; const D = this.sprData, e = this.eye, ax = p[0], ay = p[1], az = -p[2], bx = q[0], by = q[1], bz = -q[2];
    const dx = bx - ax, dy = by - ay, dz = bz - az, vx = e[0] - (ax + bx) / 2, vy = e[1] - (ay + by) / 2, vz = e[2] - (az + bz) / 2;
    let px = dy * vz - dz * vy, py = dz * vx - dx * vz, pz = dx * vy - dy * vx; const l = Math.hypot(px, py, pz) || 1; px *= w / 2 / l; py *= w / 2 / l; pz *= w / 2 / l;
    let o = this.sprN++ * 54;
    for (const [end, side] of [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]]) { D[o++] = (end ? bx : ax) + px * side; D[o++] = (end ? by : ay) + py * side; D[o++] = (end ? bz : az) + pz * side; D[o++] = side * 0.75; D[o++] = 0; D[o++] = c[0]; D[o++] = c[1]; D[o++] = c[2]; D[o++] = a; }
  }
  private drawNodes(list: NodeDraw[]) { const gl = this.gl, P = this.nodeP; if (!list.length) return; gl.useProgram(P); gl.uniformMatrix4fv(gl.getUniformLocation(P, 'uVP'), false, this.vp);
    const uM = gl.getUniformLocation(P, 'uM'), uC = gl.getUniformLocation(P, 'uColor'), uE = gl.getUniformLocation(P, 'uEmi'), uA = gl.getUniformLocation(P, 'uA');
    for (const d of list) { gl.uniformMatrix4fv(uM, false, d.m); gl.uniform3fv(uC, d.col); gl.uniform3fv(uE, d.emi); gl.uniform1f(uA, d.a); gl.bindVertexArray(d.g.vao); gl.drawArrays(gl.TRIANGLES, 0, d.g.n); } }
  end(time: number) {
    const gl = this.gl; gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(0.06, 0.05, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
    if (this.groundInit) { gl.useProgram(this.groundP); gl.uniformMatrix4fv(gl.getUniformLocation(this.groundP, 'uVP'), false, this.vp); gl.uniform1f(gl.getUniformLocation(this.groundP, 'uTime'), time); gl.bindVertexArray(this.ground); gl.drawArrays(gl.TRIANGLES, 0, 6); }
    gl.useProgram(this.meshP); gl.uniformMatrix4fv(gl.getUniformLocation(this.meshP, 'uVP'), false, this.vp);
    for (const k in this.batches) { const b = this.batches[k as MeshKind]; if (!b.n) continue; gl.bindVertexArray(b.vao); gl.bindBuffer(gl.ARRAY_BUFFER, b.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data.subarray(0, b.n * FLOATS)); gl.drawArraysInstanced(gl.TRIANGLES, 0, b.verts, b.n); }
    this.drawNodes(this.nodes);
    if (this.decals.n) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.useProgram(this.decalP); gl.uniformMatrix4fv(gl.getUniformLocation(this.decalP, 'uVP'), false, this.vp);
      const b = this.decals; gl.bindVertexArray(b.vao); gl.bindBuffer(gl.ARRAY_BUFFER, b.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data.subarray(0, b.n * DFLOATS)); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, b.n); gl.depthMask(true); gl.disable(gl.BLEND); }
    if (this.glass.length) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); this.drawNodes(this.glass); gl.depthMask(true); gl.disable(gl.BLEND); }
    if (this.sprN) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.useProgram(this.sprP); gl.uniformMatrix4fv(gl.getUniformLocation(this.sprP, 'uVP'), false, this.vp);
      gl.bindVertexArray(this.sprVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.sprBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sprData.subarray(0, this.sprN * 54)); gl.drawArrays(gl.TRIANGLES, 0, this.sprN * 6); gl.depthMask(true); gl.disable(gl.BLEND); }
    gl.bindVertexArray(null);
  }
  /** Simulation point at a height -> CSS pixel position. Returns null when behind the camera. */
  project(x: number, h: number, y: number): [number, number] | null { const m = this.vp, z = -y, w = m[3] * x + m[7] * h + m[11] * z + m[15]; if (w <= 0.01) return null;
    return [((m[0] * x + m[4] * h + m[8] * z + m[12]) / w * 0.5 + 0.5) * this.w, (1 - ((m[1] * x + m[5] * h + m[9] * z + m[13]) / w * 0.5 + 0.5)) * this.h]; }
  /** CSS pixel position -> simulation point on the ground. */
  unproject(px: number, py: number): { x: number; y: number } { const nx = (px / this.w) * 2 - 1, ny = 1 - (py / this.h) * 2, m = this.ivp;
    const at = (z: number) => { const w = m[3] * nx + m[7] * ny + m[11] * z + m[15]; return [(m[0] * nx + m[4] * ny + m[8] * z + m[12]) / w, (m[1] * nx + m[5] * ny + m[9] * z + m[13]) / w, (m[2] * nx + m[6] * ny + m[10] * z + m[14]) / w]; };
    const a = at(-1), b = at(1), t = a[1] / (a[1] - b[1]); return { x: a[0] + (b[0] - a[0]) * t, y: -(a[2] + (b[2] - a[2]) * t) }; }
}
export const hex = (s: string) => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
