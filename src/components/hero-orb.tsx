import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

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

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 7);
    camera.lookAt(0, 0, 0);

    // Soft white studio reflections for crisp, neutral metal
    let pmrem: THREE.PMREMGenerator | null = null;
    let envTex: THREE.Texture | null = null;
    try {
      pmrem = new THREE.PMREMGenerator(renderer);
      envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
    } catch {
      pmrem = null;
      envTex = null;
    }

    // All-neutral lighting — no warm tones
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(4, 7, 6);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, -2, -4);
    const underLight = new THREE.DirectionalLight(0xffffff, 0.28);
    underLight.position.set(1, -6, 2);
    scene.add(ambient, keyLight, fillLight, underLight);

    // Specular key-light that rides the parallax so metal "answers" the cursor
    const specLight = new THREE.PointLight(0xffffff, 0, 8);
    specLight.position.set(3, 2.5, 3);
    scene.add(specLight);

    const chromeMat = new THREE.MeshPhysicalMaterial({
      color: 0x161616,
      metalness: 1.0,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.6,
    });
    const chromeDimMat = new THREE.MeshPhysicalMaterial({
      color: 0x4a4a4a,
      metalness: 1.0,
      roughness: 0.45,
      clearcoat: 0.6,
      envMapIntensity: 0.8,
    });
    const nucleusMat = new THREE.MeshPhysicalMaterial({
      color: 0xd9a441,
      metalness: 0.6,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      emissive: 0xffb347,
      emissiveIntensity: 0.5,
      envMapIntensity: 1.6,
    });
    const ringMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a2a2a,
      metalness: 1.0,
      roughness: 0.32,
      envMapIntensity: 1.1,
      anisotropy: 1.0,
    });

    // Theme-aware palette: dark metal on light background, bright metal on dark background.
    // Highlights ride on the studio reflections so the orb always contrasts its canvas.
    const isDarkTheme = () =>
      typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    const applyPalette = (dark: boolean) => {
      if (dark) {
        chromeMat.color.setHex(0x1c1c1c);
        chromeMat.roughness = 0.38;
        chromeMat.envMapIntensity = 1.35;
        chromeDimMat.color.setHex(0x3f3f3f);
        chromeDimMat.roughness = 0.5;
        chromeDimMat.envMapIntensity = 0.8;
        ringMat.color.setHex(0x303030);
        ringMat.roughness = 0.42;
        ringMat.envMapIntensity = 1.05;
      } else {
        chromeMat.color.setHex(0x161616);
        chromeMat.roughness = 0.28;
        chromeMat.envMapIntensity = 1.2;
        chromeDimMat.color.setHex(0x4a4a4a);
        chromeDimMat.roughness = 0.45;
        chromeDimMat.envMapIntensity = 0.65;
        ringMat.color.setHex(0x2a2a2a);
        ringMat.roughness = 0.32;
        ringMat.envMapIntensity = 0.85;
      }
    };
    applyPalette(isDarkTheme());
    const themeObs = new MutationObserver(() => applyPalette(isDarkTheme()));
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // root: parallax + breath + bob — never spins on its own
    const root = new THREE.Group();
    scene.add(root);

    // shell: nodes + web, slow spin
    const shell = new THREE.Group();
    root.add(shell);

    // core: nucleus + calibration rings, counter-spin
    const core = new THREE.Group();
    root.add(core);

    const disposedGeos: THREE.BufferGeometry[] = [];

    // Equal-sphere (fibonacci) node ring, radius 2.15
    const nodePositions: THREE.Vector3[] = [];
    const phi = Math.PI * (3 - Math.sqrt(5));
    const count = 22;
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = phi * i;
      nodePositions.push(
        new THREE.Vector3(Math.cos(theta) * radius * 2.15, y * 2.15, Math.sin(theta) * radius * 2.15),
      );
    }

    // Fake depth: front nodes slightly larger + bright, back smaller + dim
    const nodeGeos: THREE.BufferGeometry[] = [];
    const nodeMeshes: THREE.Mesh[] = [];
    nodePositions.forEach((pos) => {
      const size = pos.z > 0.3 ? 0.135 : pos.z < -0.3 ? 0.1 : 0.115;
      const g = new THREE.SphereGeometry(size, 16, 16);
      nodeGeos.push(g);
      const mesh = new THREE.Mesh(g, pos.z < -0.3 ? chromeDimMat : chromeMat);
      mesh.position.copy(pos);
      shell.add(mesh);
      nodeMeshes.push(mesh);
    });

    // Nodes float free — no outer connections

    const nucleusGeo = new THREE.SphereGeometry(0.28, 24, 24);
    const nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
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
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffc56b,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.setScalar(1.7);
    glowSprite.position.set(0, 0, -0.1);
    core.add(glowSprite);

    // Calibration rings, counter-rotating
    // Three counter-rotating rings, equal thickness
    const ringGeo = new THREE.TorusGeometry(1.15, 0.032, 12, 64);
    const ringA = new THREE.Mesh(ringGeo, ringMat);
    ringA.rotation.x = Math.PI / 4;
    core.add(ringA);

    const ringGeo2 = new THREE.TorusGeometry(0.85, 0.032, 12, 64);
    const ringB = new THREE.Mesh(ringGeo2, ringMat);
    ringB.rotation.x = -Math.PI / 3;
    ringB.rotation.y = Math.PI / 6;
    core.add(ringB);

    const ringGeo3 = new THREE.TorusGeometry(0.72, 0.032, 12, 64);
    const ringC = new THREE.Mesh(ringGeo3, ringMat);
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

    // Paint the opening frame right away and fade out the CSS placeholder.
    renderer.render(scene, camera);
    mount.setAttribute("data-hero-ready", "");

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