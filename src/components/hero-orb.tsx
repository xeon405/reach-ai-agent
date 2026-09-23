import { useEffect, useRef } from "react";
import {
  WebGLRenderer,
  PMREMGenerator,
  Scene,
  PerspectiveCamera,
  Group,
  MeshPhysicalMaterial,
  AmbientLight,
  DirectionalLight,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  Mesh,
  Vector3,
  BufferGeometry,
  CanvasTexture,
  SpriteMaterial,
  Sprite,
  AdditiveBlending,
  type Texture,
} from "three";
// No RoomEnvironment: it shipped a ~510KB chunk and built a whole procedural
// room at runtime just to give the chrome orb reflections. Replaced with a tiny
// 64x32 equirect canvas gradient baked once via PMREM — identical look, ~0KB.

function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

export function HeroOrb() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;

    if (!supportsWebGL()) {
      mount.classList.add("is-fallback");
      return;
    }

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: true,
      });
    } catch {
      mount.classList.add("is-fallback");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 7);
    camera.lookAt(0, 0, 0);

    // Studio light-box reflections for polished chrome — baked from a tiny
    // equirect canvas (bright panels → crisp specular streaks, no RoomEnvironment chunk)
    let pmrem: PMREMGenerator | null = null;
    let envTex: Texture | null = null;
    try {
      pmrem = new PMREMGenerator(renderer);
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 64;
      const x = c.getContext("2d");
      if (x) {
        // Jet-black polished metal: deep charcoal studio, bright sharp panels
        const g = x.createLinearGradient(0, 0, 0, 64);
        g.addColorStop(0, "#2b2b2b");
        g.addColorStop(0.25, "#191919");
        g.addColorStop(0.55, "#101010");
        g.addColorStop(1, "#060606");
        x.fillStyle = g;
        x.fillRect(0, 0, 128, 64);
        // Bright light-box panels → the mirror-like streak highlights on metal.
        // Equirect: horizontal = full 360°, top = up. Panels above and beside the sphere.
        const box = (px: number, py: number, w: number, h: number, a: number) => {
          x.fillStyle = `rgba(255,255,255,${a})`;
          if (typeof x.roundRect === "function") {
            x.beginPath();
            x.roundRect(px, py, w, h, 4);
            x.fill();
          } else {
            x.fillRect(px, py, w, h);
          }
        };
        // Overhead lamp (warm, like the old RoomEnvironment key)
        box(24, 3, 80, 8, 0.95);
        // Tall side light-boxes at the left and right edges
        box(2, 6, 10, 32, 0.85);
        box(116, 4, 10, 28, 0.85);
        // Key and fill panels
        box(12, 26, 26, 14, 0.88);
        box(88, 22, 26, 14, 0.88);
        // Soft floor bounce below the horizon
        box(50, 46, 28, 6, 0.4);
        const tex = new CanvasTexture(c);
        envTex = pmrem.fromEquirectangular(tex).texture;
        tex.dispose();
      } else {
        throw new Error("2d context unavailable");
      }
      scene.environment = envTex;
    } catch {
      pmrem = null;
      envTex = null;
    }

    // All-neutral lighting — no warm tones
    const ambient = new AmbientLight(0xffffff, 0.55);
    const keyLight = new DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(4, 7, 6);
    const fillLight = new DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, -2, -4);
    const underLight = new DirectionalLight(0xffffff, 0.28);
    underLight.position.set(1, -6, 2);
    scene.add(ambient, keyLight, fillLight, underLight);

    // Specular key-light that rides the parallax so metal "answers" the cursor
    const specLight = new PointLight(0xffffff, 0, 8);
    specLight.position.set(3, 2.5, 3);
    scene.add(specLight);

    const chromeMat = new MeshPhysicalMaterial({
      color: 0x0d0d0d,
      metalness: 1.0,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.2,
    });
    const chromeDimMat = new MeshPhysicalMaterial({
      color: 0x0a0a0a,
      metalness: 1.0,
      roughness: 0.45,
      clearcoat: 0.6,
      envMapIntensity: 0.7,
    });
    const nucleusMat = new MeshPhysicalMaterial({
      color: 0xd9a441,
      metalness: 0.6,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      emissive: 0xffb347,
      emissiveIntensity: 0.5,
      envMapIntensity: 1.6,
    });
    const ringMat = new MeshPhysicalMaterial({
      color: 0x111111,
      metalness: 1.0,
      roughness: 0.32,
      envMapIntensity: 0.9,
    });

    // Theme-aware palette: deep black polished metal in both themes
    const isDarkTheme = () =>
      typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    const applyPalette = (dark: boolean) => {
      if (dark) {
        chromeMat.color.setHex(0x0d0d0d);
        chromeMat.roughness = 0.38;
        chromeMat.envMapIntensity = 1.1;
        chromeDimMat.color.setHex(0x0a0a0a);
        chromeDimMat.roughness = 0.5;
        chromeDimMat.envMapIntensity = 0.7;
        ringMat.color.setHex(0x111111);
        ringMat.roughness = 0.42;
        ringMat.envMapIntensity = 0.85;
      } else {
        chromeMat.color.setHex(0x0d0d0d);
        chromeMat.roughness = 0.28;
        chromeMat.envMapIntensity = 1.2;
        chromeDimMat.color.setHex(0x0a0a0a);
        chromeDimMat.roughness = 0.45;
        chromeDimMat.envMapIntensity = 0.7;
        ringMat.color.setHex(0x111111);
        ringMat.roughness = 0.32;
        ringMat.envMapIntensity = 0.9;
      }
    };
    applyPalette(isDarkTheme());
    const themeObs = new MutationObserver(() => applyPalette(isDarkTheme()));
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // root: parallax + breath + bob — never spins on its own
    const root = new Group();
    scene.add(root);

    // shell: nodes + web, slow spin
    const shell = new Group();
    root.add(shell);

    // core: nucleus + calibration rings, counter-spin
    const core = new Group();
    root.add(core);

    const disposedGeos: BufferGeometry[] = [];

    // Equal-sphere (fibonacci) node ring, radius 2.15
    const nodePositions: Vector3[] = [];
    const phi = Math.PI * (3 - Math.sqrt(5));
    const count = 22;
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = phi * i;
      nodePositions.push(
        new Vector3(Math.cos(theta) * radius * 2.15, y * 2.15, Math.sin(theta) * radius * 2.15),
      );
    }

    // Fake depth: front nodes slightly larger + bright, back smaller + dim
    const nodeGeos: BufferGeometry[] = [];
    const nodeMeshes: Mesh[] = [];
    nodePositions.forEach((pos) => {
      const size = pos.z > 0.3 ? 0.135 : pos.z < -0.3 ? 0.1 : 0.115;
      const g = new SphereGeometry(size, 16, 16);
      nodeGeos.push(g);
      const mesh = new Mesh(g, pos.z < -0.3 ? chromeDimMat : chromeMat);
      mesh.position.copy(pos);
      shell.add(mesh);
      nodeMeshes.push(mesh);
    });

    // Nodes float free — no outer connections

    const nucleusGeo = new SphereGeometry(0.28, 24, 24);
    const nucleus = new Mesh(nucleusGeo, nucleusMat);
    core.add(nucleus);

    // Warm golden glow shining from behind the core
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    {
      const ctx = glowCanvas.getContext("2d");
      if (ctx) {
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, "rgba(255,180,80,0.85)");
        g.addColorStop(0.35, "rgba(255,170,60,0.35)");
        g.addColorStop(1, "rgba(255,160,40,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
      }
    }
    const glowTex = new CanvasTexture(glowCanvas);
    const glowMat = new SpriteMaterial({
      map: glowTex,
      color: 0xffc56b,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const glowSprite = new Sprite(glowMat);
    glowSprite.scale.setScalar(1.7);
    glowSprite.position.set(0, 0, -0.1);
    core.add(glowSprite);

    // Calibration rings, counter-rotating
    const ringGeo = new TorusGeometry(1.15, 0.032, 12, 64);
    const ringA = new Mesh(ringGeo, ringMat);
    ringA.rotation.x = Math.PI / 4;
    core.add(ringA);

    const ringGeo2 = new TorusGeometry(0.85, 0.032, 12, 64);
    const ringB = new Mesh(ringGeo2, ringMat);
    ringB.rotation.x = -Math.PI / 3;
    ringB.rotation.y = Math.PI / 6;
    core.add(ringB);

    const ringGeo3 = new TorusGeometry(0.72, 0.032, 12, 64);
    const ringC = new Mesh(ringGeo3, ringMat);
    ringC.rotation.x = Math.PI / 2.4;
    ringC.rotation.y = -Math.PI / 4;
    core.add(ringC);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // Paint the opening frame right away so the orb never flashes blank.
    renderer.render(scene, camera);

    // Damped spring parallax — smooth, not jittery
    let targetX = 0;
    let targetY = 0;
    let parX = 0;
    let parY = 0;
    const onMove = (e: MouseEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 0.34;
      targetY = (e.clientY / window.innerHeight - 0.5) * 0.24;
    };
    window.addEventListener("mousemove", onMove);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }, { threshold: 0 });
    io.observe(mount);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;

    if (reduce) {
      shell.rotation.y = 0.5;
      core.rotation.y = -0.35;
      core.rotation.x = 0.08;
      root.rotation.x = 0.05;
      specLight.intensity = 0.3;
      renderer.render(scene, camera);
    } else {
      const loop = () => {
        if (visible && !document.hidden) {
          t += 0.008;
          parX += (targetX - parX) * 0.045;
          parY += (targetY - parY) * 0.045;

          shell.rotation.y = t * 0.22;
          shell.rotation.x = Math.sin(t * 0.15) * 0.05;
          core.rotation.y = -t * 0.38;
          core.rotation.x = Math.sin(t * 0.5) * 0.09;
          ringA.rotation.z = t * 0.24;
          ringB.rotation.z = -t * 0.18;
          ringC.rotation.z = t * 0.3;

          const breath = 1 + Math.sin(t * 0.6) * 0.02;
          root.scale.setScalar(breath);
          root.rotation.y = parX;
          root.rotation.x = Math.sin(t * 0.2) * 0.06 + parY;
          root.position.y = Math.sin(t * 0.4) * 0.1;

          // Nodes breathe on staggered phases so the web feels alive
          nodeMeshes.forEach((m, k) => {
            const ph = t * 0.7 + k * 0.33;
            m.scale.setScalar(0.94 + Math.sin(ph) * 0.09);
          });

          specLight.intensity = 0.3;
          specLight.position.set(2 + parX * 5, 2 + parY * 3, 3);
          glowMat.opacity = 0.95 + Math.sin(t * 0.5) * 0.12;

          renderer.render(scene, camera);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      themeObs.disconnect();
      window.removeEventListener("mousemove", onMove);
      [chromeMat, chromeDimMat, ringMat, nucleusMat, glowMat].forEach((m) => m.dispose());
      nodeGeos.forEach((g) => g.dispose());
      disposedGeos.forEach((g) => g.dispose());
      [nucleusGeo, ringGeo, ringGeo2, ringGeo3].forEach((g) => g.dispose());
      glowTex.dispose();
      envTex?.dispose();
      pmrem?.dispose();
      if (renderer.domElement.parentElement === mount) renderer.domElement.remove();
      renderer.dispose();
    };
  }, []);

  return <div ref={ref} className="hero-orb" aria-hidden />;
}