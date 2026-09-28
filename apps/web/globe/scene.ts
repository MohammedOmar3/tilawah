import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineSegments,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PerspectiveCamera,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { clampTilt, clampZoom, type GlobeAction, ZOOM_STEP } from "./interaction";
import { type GlobeFrame, type GlobePin, cameraDistance, easeStep, latLngToVector, pinSize } from "./layers";

/** The globe's colours, read from the page's CSS tokens (--g-*). */
export interface GlobeColours {
  oceanA: string;
  oceanB: string;
  rim: string;
  land: string;
  grid: string;
  atmosphere: string;
  atmosphereAlpha: number;
  cell: string;
  /** Additive glows on the dark theme, normal blending on the light one. */
  cellAdditive: boolean;
  pinA: string;
  pinB: string;
  pinFill: string;
  /** How strongly the light shades the land dots (1 = fully). */
  landLit: number;
}

export const FOV_DEG = 30;
/** A join ring grows and fades over this long. */
export const RING_MS = 2400;
const DEG = Math.PI / 180;
const DEFAULT_ROT_Y = -0.35;
const DEFAULT_ROT_X = 0.32;
const MAX_TILT = clampTilt(90) * DEG;

/** Colours are given as sRGB hex and output as-is, so the globe matches the CSS exactly. */
const colour = (hex: string, into = new Color()) => into.setStyle(hex, LinearSRGBColorSpace);
const vec = (lat: number, lng: number, r: number) => new Vector3(...latLngToVector(lat, lng, r));

interface Ring {
  mesh: Mesh<RingGeometry, MeshBasicMaterial>;
  startedAt: number;
}

/**
 * The globe as a plain three.js scene: a lit ocean with a soft rim, a faint
 * graticule, land as round dots, an atmosphere, breathing glows under each
 * listener region and a crescent map pin standing on it. It knows nothing about
 * React; Globe.tsx drives it.
 */
export class GlobeScene {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV_DEG, 1, 0.1, 100);
  private readonly earth = new Group();
  private readonly uniforms = {
    uTime: { value: 0 },
    uLight: { value: new Vector3(-0.55, 0.5, 0.68).normalize() },
    uPR: { value: 1 },
  };
  private readonly tokens = {
    ocA: { value: new Color() },
    ocB: { value: new Color() },
    rim: { value: new Color() },
    land: { value: new Color() },
    grid: { value: new Color() },
    atmo: { value: new Color() },
    cell: { value: new Color() },
    atmoStrength: { value: 1 },
    landGlow: { value: 1 },
  };
  private readonly disposables: { dispose(): void }[] = [];
  private readonly pinCanvas: HTMLCanvasElement;
  private readonly pinTexture: CanvasTexture;
  private readonly cellMaterial: ShaderMaterial;
  private landDots: Points | null = null;
  private cells: Points | null = null;
  private pins: Sprite[] = [];
  private rings: Ring[] = [];
  private ringColour = new Color();

  private width = 1;
  private height = 1;
  private readonly current: GlobeFrame = { cx: 0, cy: 0, r: 0 };
  private target: GlobeFrame = { cx: 0, cy: 0, r: 0 };
  private placed = false;
  private zoom = 1;

  rotY = DEFAULT_ROT_Y;
  rotX = DEFAULT_ROT_X;
  private velY = 0;
  private drag: { x: number; y: number; ry: number; rx: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.scene.add(this.earth);

    this.addOcean();
    this.addGraticule();
    this.addAtmosphere();

    this.cellMaterial = this.own(
      new ShaderMaterial({
        uniforms: { ...this.uniforms, cell: this.tokens.cell },
        transparent: true,
        depthWrite: false,
        vertexShader: `uniform float uPR,uTime;attribute vec2 wp;varying float vF;varying float vW;
          void main(){vec3 n=normalize(normalMatrix*position);vF=smoothstep(0.,.3,n.z);vW=wp.x;float br=.8+.2*sin(uTime*.8+wp.y);
          vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=uPR*(10.+wp.x*26.)*br*(3.4/-mv.z);gl_Position=projectionMatrix*mv;}`,
        fragmentShader: `uniform vec3 cell;varying float vF;varying float vW;
          void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float g=exp(-d*d*6.)*.55;gl_FragColor=vec4(cell,g*vF*(.4+.4*vW));}`,
      }),
    );

    this.pinCanvas = document.createElement("canvas");
    this.pinCanvas.width = 128;
    this.pinCanvas.height = 168;
    this.pinTexture = this.own(new CanvasTexture(this.pinCanvas));
    this.pinTexture.anisotropy = 4;
  }

  private own<T extends { dispose(): void }>(thing: T): T {
    this.disposables.push(thing);
    return thing;
  }

  private addOcean(): void {
    const material = this.own(
      new ShaderMaterial({
        uniforms: { ...this.uniforms, ocA: this.tokens.ocA, ocB: this.tokens.ocB, rim: this.tokens.rim },
        vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform vec3 ocA,ocB,rim,uLight;varying vec3 vN;
          void main(){float l=dot(vN,uLight);float d=smoothstep(-.35,1.,l);vec3 c=mix(ocA,ocB,d);
          float f=pow(1.-max(vN.z,0.),2.6);c=mix(c,rim,f*.55);gl_FragColor=vec4(c,1.);}`,
      }),
    );
    this.earth.add(new Mesh(this.own(new SphereGeometry(1, 96, 96)), material));
  }

  /** A line every 15°, fading towards the edge of the disc. */
  private addGraticule(): void {
    const points: Vector3[] = [];
    for (let la = -75; la <= 75; la += 15) {
      for (let lo = 0; lo < 360; lo += 3) points.push(vec(la, lo, 1.002), vec(la, lo + 3, 1.002));
    }
    for (let lo = 0; lo < 360; lo += 15) {
      for (let la = -84; la < 84; la += 3) points.push(vec(la, lo, 1.002), vec(la + 3, lo, 1.002));
    }
    const material = this.own(
      new ShaderMaterial({
        uniforms: { grid: this.tokens.grid },
        transparent: true,
        depthWrite: false,
        vertexShader: `varying float vF;void main(){vec3 n=normalize(normalMatrix*position);vF=smoothstep(0.,.5,n.z);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform vec3 grid;varying float vF;void main(){gl_FragColor=vec4(grid,.16*vF);}`,
      }),
    );
    this.earth.add(new LineSegments(this.own(new BufferGeometry().setFromPoints(points)), material));
  }

  private addAtmosphere(): void {
    const material = this.own(
      new ShaderMaterial({
        uniforms: { atmo: this.tokens.atmo, atmoStrength: this.tokens.atmoStrength },
        side: BackSide,
        transparent: true,
        depthWrite: false,
        vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform vec3 atmo;uniform float atmoStrength;varying vec3 vN;void main(){float i=pow(smoothstep(0.,.45,-vN.z),2.2);gl_FragColor=vec4(atmo,i*atmoStrength);}`,
      }),
    );
    this.scene.add(new Mesh(this.own(new SphereGeometry(1.12, 64, 64)), material));
  }

  /** Land as round dots, lit by the same light and fading at the limb. `points` is flat lat, lng pairs. */
  setLand(points: readonly number[], random: () => number = Math.random): void {
    if (this.landDots) return;
    const n = points.length / 2;
    const positions = new Float32Array(n * 3);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      positions.set(latLngToVector(points[i * 2]!, points[i * 2 + 1]!, 1.004), i * 3);
      seeds[i] = random();
    }
    const geometry = this.own(new BufferGeometry());
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("rnd", new BufferAttribute(seeds, 1));
    const material = this.own(
      new ShaderMaterial({
        uniforms: { ...this.uniforms, land: this.tokens.land, landGlow: this.tokens.landGlow },
        transparent: true,
        depthWrite: false,
        vertexShader: `uniform float uPR;uniform vec3 uLight;attribute float rnd;varying float vL;varying float vF;
          void main(){vec3 n=normalize(normalMatrix*position);vF=smoothstep(-.05,.35,n.z);vL=.35+.65*smoothstep(-.3,.9,dot(n,uLight));vL*=.85+.3*rnd;
          vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=uPR*(12./-mv.z)*(.8+.4*rnd);gl_Position=projectionMatrix*mv;}`,
        fragmentShader: `uniform vec3 land;uniform float landGlow;varying float vL;varying float vF;
          void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=smoothstep(.5,.2,d);gl_FragColor=vec4(land*mix(1.,vL,landGlow),a*vF*(.45+.55*vL));}`,
      }),
    );
    this.landDots = new Points(geometry, material);
    this.earth.add(this.landDots);
  }

  /** Listener regions: a soft glow under each, and a crescent pin standing on it. */
  setPins(pins: readonly GlobePin[]): void {
    if (this.cells) {
      this.earth.remove(this.cells);
      this.cells.geometry.dispose();
      this.cells = null;
    }
    for (const s of this.pins) {
      this.earth.remove(s);
      s.material.dispose();
    }
    this.pins = [];
    if (pins.length === 0) return;

    const positions: number[] = [];
    const weights: number[] = [];
    pins.forEach((p, i) => {
      positions.push(...latLngToVector(p.lat, p.lng, 1.01));
      weights.push(p.weight, i * 1.7);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("wp", new Float32BufferAttribute(weights, 2));
    this.cells = new Points(geometry, this.cellMaterial);
    this.earth.add(this.cells);

    this.pins = pins.map((p) => {
      const sprite = new Sprite(
        new SpriteMaterial({ map: this.pinTexture, transparent: true, depthWrite: false, depthTest: false }),
      );
      sprite.center.set(0.5, 0);
      sprite.position.copy(vec(p.lat, p.lng, 1));
      const k = pinSize(p.weight);
      sprite.scale.set(k, k * 1.3125, 1);
      this.earth.add(sprite);
      return sprite;
    });
  }

  /** A ring spreading from a region where someone just joined. */
  addRing(lat: number, lng: number, now: number): void {
    const material = new MeshBasicMaterial({
      color: this.ringColour,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(new RingGeometry(0.82, 1, 48), material);
    const normal = vec(lat, lng, 1);
    mesh.position.copy(normal.clone().multiplyScalar(1.006));
    mesh.lookAt(normal.multiplyScalar(2));
    mesh.scale.setScalar(0.001);
    this.earth.add(mesh);
    this.rings.push({ mesh, startedAt: now });
  }

  get ringCount(): number {
    return this.rings.length;
  }

  setColours(c: GlobeColours): void {
    const t = this.tokens;
    colour(c.oceanA, t.ocA.value);
    colour(c.oceanB, t.ocB.value);
    colour(c.rim, t.rim.value);
    colour(c.land, t.land.value);
    colour(c.grid, t.grid.value);
    colour(c.atmosphere, t.atmo.value);
    colour(c.cell, t.cell.value);
    colour(c.pinA, this.ringColour);
    t.atmoStrength.value = c.atmosphereAlpha;
    t.landGlow.value = c.landLit;
    this.cellMaterial.blending = c.cellAdditive ? AdditiveBlending : NormalBlending;
    this.cellMaterial.needsUpdate = true;
    this.drawPin(c.pinA, c.pinB, c.pinFill);
  }

  /** The pin: an outlined map pin with a gradient edge and a crescent inside. */
  private drawPin(a: string, b: string, fill: string): void {
    const ctx = this.pinCanvas.getContext("2d");
    if (!ctx) return;
    const W = 128;
    const H = 168;
    const cx = 64;
    const cy = 58;
    const R = 48;
    ctx.clearRect(0, 0, W, H);
    const path = new Path2D();
    path.moveTo(cx, H - 6);
    path.bezierCurveTo(cx - 16, H - 44, cx - R, cy + 30, cx - R, cy);
    path.arc(cx, cy, R, Math.PI, 0);
    path.bezierCurveTo(cx + R, cy + 30, cx + 16, H - 44, cx, H - 6);
    path.closePath();
    const g = ctx.createLinearGradient(0, H, W, 0);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = fill;
    ctx.fill(path);
    ctx.lineWidth = 8;
    ctx.lineJoin = "round";
    ctx.strokeStyle = g;
    ctx.stroke(path);
    const mask = document.createElement("canvas");
    mask.width = W;
    mask.height = H;
    const m = mask.getContext("2d");
    if (m) {
      m.fillStyle = g;
      m.beginPath();
      m.arc(cx - 3, cy + 2, 24, 0, Math.PI * 2);
      m.fill();
      m.globalCompositeOperation = "destination-out";
      m.beginPath();
      m.arc(cx + 9, cy - 7, 20, 0, Math.PI * 2);
      m.fill();
      ctx.drawImage(mask, 0, 0);
    }
    this.pinTexture.needsUpdate = true;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.uniforms.uPR.value = pixelRatio;
  }

  /** Where the globe should sit; it eases there unless `immediate` (first placement, reduced motion). */
  setFrame(frame: GlobeFrame, immediate: boolean): void {
    this.target = { ...frame };
    if (!this.placed || immediate) {
      Object.assign(this.current, frame);
      this.placed = true;
    }
  }

  /** The globe's frame as drawn right now (for the sky). */
  get frame(): Readonly<GlobeFrame> {
    return this.current;
  }

  apply(action: GlobeAction): void {
    switch (action.type) {
      case "rotate":
        this.rotY += action.degrees * DEG;
        this.velY = 0;
        break;
      case "tilt":
        this.rotX = clampTilt(this.rotX / DEG + action.degrees) * DEG;
        break;
      case "zoom":
        this.zoom = clampZoom(action.direction === "in" ? this.zoom * ZOOM_STEP : this.zoom / ZOOM_STEP);
        break;
      case "reset":
        this.rotY = DEFAULT_ROT_Y;
        this.rotX = DEFAULT_ROT_X;
        this.zoom = 1;
        this.velY = 0;
        break;
    }
  }

  zoomBy(factor: number): void {
    this.zoom = clampZoom(this.zoom * factor);
  }

  startDrag(x: number, y: number): void {
    this.drag = { x, y, ry: this.rotY, rx: this.rotX };
    this.velY = 0;
  }

  moveDrag(x: number, y: number): void {
    if (!this.drag) return;
    const k = 1 / Math.max(this.current.r * this.zoom, 80);
    const next = this.drag.ry + (x - this.drag.x) * k;
    this.velY = next - this.rotY;
    this.rotY = next;
    this.rotX = Math.max(-MAX_TILT, Math.min(MAX_TILT, this.drag.rx + (y - this.drag.y) * k));
  }

  endDrag(): void {
    this.drag = null;
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  /**
   * Advances everything that moves by `dtMs`: auto-rotation, the glide after a
   * drag, the ease towards a new frame and the join rings. Returns true while
   * something is still settling.
   */
  step(dtMs: number, now: number, opts: { autoRotateRad: number; reducedMotion: boolean }): boolean {
    this.uniforms.uTime.value = now / 1000;
    if (!this.drag) {
      this.rotY += opts.autoRotateRad + this.velY;
      this.velY *= Math.pow(0.92, dtMs / (1000 / 60));
      if (Math.abs(this.velY) < 1e-5) this.velY = 0;
    }
    const e = easeStep(dtMs, opts.reducedMotion);
    const c = this.current;
    const t = this.target;
    c.cx += (t.cx - c.cx) * e;
    c.cy += (t.cy - c.cy) * e;
    c.r += (t.r - c.r) * e;
    const easing = Math.abs(t.cx - c.cx) + Math.abs(t.cy - c.cy) + Math.abs(t.r - c.r) > 0.3;

    this.rings = this.rings.filter((ring) => {
      const p = (now - ring.startedAt) / RING_MS;
      if (p >= 1) {
        this.earth.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        ring.mesh.material.dispose();
        return false;
      }
      ring.mesh.scale.setScalar(0.001 + Math.max(0, p) * 0.09);
      ring.mesh.material.opacity = 0.9 * (1 - Math.max(0, p));
      return true;
    });

    return easing || this.velY !== 0 || this.rings.length > 0;
  }

  render(): void {
    const { width: W, height: H } = this;
    const r = this.current.r * this.zoom;
    this.earth.rotation.set(this.rotX, this.rotY, 0);
    this.camera.position.set(0, 0, cameraDistance(r, H, FOV_DEG));
    this.camera.lookAt(0, 0, 0);
    this.camera.setViewOffset(W, H, W / 2 - this.current.cx, H / 2 - this.current.cy, W, H);
    this.camera.updateProjectionMatrix();
    this.earth.updateMatrixWorld();
    this.fadePins();
    this.renderer.render(this.scene, this.camera);
  }

  /** Pins draw over the sphere (no depth test), so fade them out as they turn away. */
  private fadePins(): void {
    const camDir = this.camera.position.clone().normalize();
    const p = new Vector3();
    for (const s of this.pins) {
      p.copy(s.position).applyQuaternion(this.earth.quaternion);
      const facing = p.dot(camDir);
      s.material.opacity = Math.max(0, Math.min(1, (facing - 0.12) / 0.3));
      s.visible = s.material.opacity > 0.01;
    }
  }

  dispose(): void {
    this.setPins([]);
    for (const ring of this.rings) {
      ring.mesh.geometry.dispose();
      ring.mesh.material.dispose();
    }
    this.rings = [];
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
