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

type NodeSpec = { pos: [number, number, number]; r: number; chrome: boolean };

const NODES: NodeSpec[] = [
  { pos: [0, 0, 0], r: 1.05, chrome: false },
  { pos: [1.9, 0.55, -0.3], r: 0.42, chrome: true },
  { pos: [-1.85, 0.75, 0.2], r: 0.36, chrome: true },
  { pos: [0.7, -1.4, 0.5], r: 0.3, chrome: true },
  { pos: [-0.72, -1.25, -0.55], r: 0.55, chrome: false },
  { pos: [2.15, -0.85, 0.65], r: 0.5, chrome: false },
  { pos: [-2.05, -0.65, -0.45], r: 0.48, chrome: false },
];

const WIRES: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [0, 4],
  [0, 5],
  [1, 3],
  [2, 6],
  [3, 4],
  [5, 6],
  [1, 6],
  [2, 5],
  [3, 5],
  [4, 6],
  [1, 4],
  [2, 3],
];

export function HeroNodes() {
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
      });
    } catch {
      mount.classList.add("is-fallback");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    camera.position.set(0, 1.3, 9.6);
    camera.lookAt(0, 0.1, 0);

    const root = new THREE.Group();
    scene.add(root);

    const chromeMat = new THREE.MeshPhysicalMaterial({
      color: 0xd5d5d5,
      metalness: 1,
      roughness: 0.18,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.1,
    });
    const frostMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.05,
      roughness: 0.45,
      clearcoat: 0.5,
      clearcoatRoughness: 0.4,
      transparent: true,
      opacity: 0.5,
      envMapIntensity: 0.9,
    });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dimCoreMat = new THREE.MeshBasicMaterial({ color: 0xe4e4e4 });

    const meshes: THREE.Mesh[] = [];
    const cores: THREE.Mesh[] = [];
    for (const n of NODES) {
      const mat = n.chrome ? chromeMat : frostMat;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(n.r * 1.3, 48, 32), mat);
      mesh.position.set(...n.pos);
      root.add(mesh);
      meshes.push(mesh);

      if (!n.chrome) {
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(n.r * 1.3 * 0.42, 24, 16),
          n.r > 0.7 ? coreMat : dimCoreMat,
        );
        core.position.set(0.001, 0.001, 0.001);
        mesh.add(core);
        cores.push(core);
      }
    }

    const wireGeo = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (const [a, b] of WIRES) {
      const p = NODES[a].pos;
      const q = NODES[b].pos;
      pts.push(p[0], p[1], p[2], q[0], q[1], q[2]);
    }
    wireGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x9b9b9b,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const wires = new THREE.LineSegments(wireGeo, wireMat);
    root.add(wires);

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(4, 6, 6);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(-5, -3, 4);
    const coreGlow = new THREE.PointLight(0xffffff, 0.7, 8);
    coreGlow.position.set(0, 0, 0);
    root.add(coreGlow);
    scene.add(ambient, key, rim);

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

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let hoverX = 0;
    let hoverY = 0;
    const onMove = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      if (r.width === 0) return;
      hoverX = ((e.clientX - r.left) / r.width - 0.5) * 2;
      hoverY = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    mount.addEventListener("pointermove", onMove);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    io.observe(mount);
    let visible = true;

    let raf = 0;
    const t0 = performance.now();

    if (reduce) {
      root.rotation.y = 0.5;
      root.rotation.x = 0.16;
      renderer.render(scene, camera);
    } else {
      const loop = () => {
        const t = (performance.now() - t0) / 1000;
        if (visible) {
          const rx = 0.22 + Math.sin(t * 0.09) * 0.05 + hoverY * 0.14;
          const ry = 0.42 + Math.sin(t * 0.12) * 0.14 + hoverX * 0.18;
          root.rotation.x += (rx - root.rotation.x) * 0.06;
          root.rotation.y += (ry - root.rotation.y) * 0.06;
          root.position.y = Math.sin(t * 0.5) * 0.12;
          meshes.forEach((m, i) => {
            m.position.x = NODES[i].pos[0] + Math.sin(t * 0.4 + i * 1.7) * 0.05;
            m.position.y = NODES[i].pos[1] + Math.cos(t * 0.33 + i * 2.1) * 0.05;
            m.position.z = NODES[i].pos[2] + Math.sin(t * 0.28 + i) * 0.04;
          });
          cores.forEach((c, i) => {
            (c.material as THREE.MeshBasicMaterial).color.setHSL(
              0,
              0,
              0.92 + Math.sin(t * 0.8 + i * 2) * 0.05,
            );
          });
          renderer.render(scene, camera);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      mount.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      chromeMat.dispose();
      frostMat.dispose();
      coreMat.dispose();
      dimCoreMat.dispose();
      wireMat.dispose();
      wireGeo.dispose();
      meshes.forEach((m) => {
        m.geometry.dispose();
      });
      cores.forEach((c) => {
        c.geometry.dispose();
      });
      if (renderer.domElement.parentElement === mount) renderer.domElement.remove();
      renderer.dispose();
    };
  }, []);

  return <div ref={ref} className="hero-nodes" aria-hidden />;
}
