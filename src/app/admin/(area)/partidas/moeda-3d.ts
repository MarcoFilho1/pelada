// A moeda em 3D (Three.js): um cilindro de metal com borda serrilhada, as duas faces em relevo com
// a cor de cada time, reflexo de ambiente e uma sombra no chão. A jogada é uma animação calculada a
// cada quadro: sobe girando, cai, quica, balança e assenta deitada na face sorteada. Inclinar o
// celular gira a câmera em volta, e o reflexo do metal corre como numa moeda de verdade.
//
// Este arquivo só é carregado (import dinâmico) quando a moeda aparece na tela.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type Lado = 'A' | 'B';
export type Face = { cor: string; texto: string; time: string; escuro: boolean };

export type Moeda3D = {
  /** Joga a moeda e resolve quando ela assenta na face do `lado`. */
  jogar(lado: Lado): Promise<void>;
  /** Mostra a face, parada (sem animação). */
  mostrar(lado: Lado | null): void;
  /** Inclinação da câmera em graus: x = frente/trás, y = lados (giroscópio ou mouse). */
  inclinar(x: number, y: number): void;
  destruir(): void;
};

const RAIO = 1;
const ESPESSURA = 0.13;
const ALTURA_MAX = 2.1;
const DURACAO_MS = 2600;
/** Voltas no ar (de ponta-cabeça, como moeda jogada com o polegar). */
const VOLTAS = 6;

/** Textura de uma face: anel de metal com pontinhos, o miolo na cor do time e o texto em relevo. */
function texturasDaFace(face: Face, espelhar: boolean): { cor: THREE.CanvasTexture; relevo: THREE.CanvasTexture } {
  const T = 512;
  const desenhar = (relevo: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = T;
    const g = c.getContext('2d')!;
    if (espelhar) {
      // A tampa de baixo do cilindro vem espelhada; desespelha para o texto ler certo.
      g.translate(T, 0);
      g.scale(-1, 1);
    }
    const centro = T / 2;
    // A tampa do cilindro mapeia a textura girada 90°: gira de volta para o texto ficar de frente para a câmera.
    g.translate(centro, centro);
    // A de baixo chega de cabeça para baixo depois do giro: meia volta a mais.
    g.rotate(espelhar ? Math.PI / 2 : -Math.PI / 2);
    if (espelhar) g.scale(1, -1);
    g.translate(-centro, -centro);
    // Fundo/anel.
    if (relevo) {
      g.fillStyle = '#666';
      g.fillRect(0, 0, T, T);
    } else {
      const anel = g.createRadialGradient(centro * 0.8, centro * 0.7, T * 0.05, centro, centro, T * 0.55);
      anel.addColorStop(0, '#f2f2f2');
      anel.addColorStop(1, '#8d8d8d');
      g.fillStyle = anel;
      g.fillRect(0, 0, T, T);
    }
    // Borda alta (aro) e pontinhos.
    g.beginPath();
    g.arc(centro, centro, T * 0.48, 0, Math.PI * 2);
    g.lineWidth = T * 0.03;
    g.strokeStyle = relevo ? '#fff' : '#d8d8d8';
    g.stroke();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      g.beginPath();
      g.arc(centro + Math.cos(a) * T * 0.425, centro + Math.sin(a) * T * 0.425, T * 0.008, 0, Math.PI * 2);
      g.fillStyle = relevo ? '#ddd' : '#b5b5b5';
      g.fill();
    }
    // Miolo na cor do time (rebaixado no relevo).
    g.beginPath();
    g.arc(centro, centro, T * 0.38, 0, Math.PI * 2);
    if (relevo) {
      g.fillStyle = '#333';
    } else {
      const miolo = g.createRadialGradient(centro * 0.85, centro * 0.75, T * 0.02, centro, centro, T * 0.4);
      miolo.addColorStop(0, face.cor);
      miolo.addColorStop(1, shade(face.cor, -0.35));
      g.fillStyle = miolo;
    }
    g.fill();
    g.lineWidth = T * 0.012;
    g.strokeStyle = relevo ? '#999' : 'rgba(255,255,255,.35)';
    g.stroke();
    // Texto em relevo.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = relevo ? '#fff' : face.escuro ? '#f4f4f4' : '#0b0b0b';
    g.font = `700 ${T * 0.17}px "Barlow Condensed", "Arial Narrow", system-ui, sans-serif`;
    g.fillText(face.texto, centro, centro - T * 0.02);
    g.font = `600 ${T * 0.065}px "Barlow Condensed", "Arial Narrow", system-ui, sans-serif`;
    g.fillText(face.time, centro, centro + T * 0.14);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    if (!relevo) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  return { cor: desenhar(false), relevo: desenhar(true) };
}

/** Borda serrilhada: listras para o relevo da lateral. */
function texturaDaBorda(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 8;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 512; x += 4) {
    g.fillStyle = x % 8 === 0 ? '#fff' : '#555';
    g.fillRect(x, 0, 4, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

/** Sombra macia do chão. */
function texturaDaSombra(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(0,0,0,.75)');
  r.addColorStop(0.6, 'rgba(0,0,0,.35)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Clareia (+) ou escurece (−) uma cor hex. */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const canal = (v: number) => Math.round(Math.min(255, Math.max(0, f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(canal);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const suave = (u: number) => u * u * (3 - 2 * u);

export function criarMoeda3D(canvas: HTMLCanvasElement, faces: { A: Face; B: Face }, opcoes: { aoBater?: () => void } = {}): Moeda3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environment = ambiente;
  const luz = new THREE.DirectionalLight(0xffffff, 1.6);
  luz.position.set(2.5, 5, 3);
  cena.add(luz, new THREE.AmbientLight(0xffffff, 0.25));

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  // A moeda: lateral, tampa de cima (cara, time A) e tampa de baixo (coroa, time B).
  const geo = new THREE.CylinderGeometry(RAIO, RAIO, ESPESSURA, 96, 1);
  const borda = texturaDaBorda();
  const fa = texturasDaFace(faces.A, false);
  const fb = texturasDaFace(faces.B, true);
  const materiais = [
    new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 1, roughness: 0.32, bumpMap: borda, bumpScale: 3 }),
    new THREE.MeshStandardMaterial({ map: fa.cor, bumpMap: fa.relevo, bumpScale: 4, metalness: 0.55, roughness: 0.36 }),
    new THREE.MeshStandardMaterial({ map: fb.cor, bumpMap: fb.relevo, bumpScale: 4, metalness: 0.55, roughness: 0.36 }),
  ];
  const moeda = new THREE.Mesh(geo, materiais);
  // Grupo de fora: posição e balanço; a malha gira de ponta-cabeça (eixo X).
  const corpo = new THREE.Group();
  corpo.add(moeda);
  cena.add(corpo);

  const sombraTex = texturaDaSombra();
  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({ map: sombraTex, transparent: true, depthWrite: false }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.001;
  cena.add(sombra);

  // Estado.
  let angulo = 0; // giro de ponta-cabeça (0 = cara para cima)
  let altura = 0;
  let balanco = 0;
  let incAlvo = { x: 0, y: 0 };
  const inc = { x: 0, y: 0 };
  let olhar = 0;
  let jogada: { inicio: number; de: number; ate: number; resolver: () => void; bateu: boolean } | null = null;
  let quadro = 0;
  let vivo = true;

  function ajustarTamanho() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observador = new ResizeObserver(ajustarTamanho);
  observador.observe(canvas);
  ajustarTamanho();

  function passo(agora: number) {
    if (jogada) {
      const t = Math.min(1, (agora - jogada.inicio) / DURACAO_MS);
      const { de, ate } = jogada;
      const voo = 0.6;
      if (t < voo) {
        // No ar: parábola e giro rápido que vai freando um pouco.
        const u = t / voo;
        altura = ALTURA_MAX * 4 * u * (1 - u);
        const pouso = ate + 0.5; // cai ainda um pouco virada
        angulo = de + (pouso - de) * (1 - Math.pow(1 - u, 1.6));
        balanco = 0;
      } else if (t < 0.76) {
        // Quique.
        const u = (t - voo) / 0.16;
        if (!jogada.bateu) {
          jogada.bateu = true;
          opcoes.aoBater?.();
        }
        altura = 0.32 * 4 * u * (1 - u);
        angulo = ate + 0.5 - 0.65 * suave(u);
        balanco = 0.18 * Math.sin(u * Math.PI);
      } else {
        // Balança no chão até assentar (como moeda rodando no lugar).
        const u = (t - 0.76) / 0.24;
        const am = Math.pow(1 - u, 2.2);
        altura = 0;
        angulo = ate - 0.15 * am * Math.cos(u * Math.PI * 3);
        balanco = 0.22 * am * Math.sin(u * Math.PI * 7);
      }
      if (t >= 1) {
        angulo = ate;
        altura = 0;
        balanco = 0;
        const r = jogada.resolver;
        jogada = null;
        r();
      }
    }

    moeda.rotation.x = angulo;
    corpo.position.y = ESPESSURA / 2 + altura;
    corpo.rotation.z = balanco;
    corpo.rotation.y = jogada ? altura * 0.25 : corpo.rotation.y * 0.92;
    const s = 1 - Math.min(0.65, altura / (ALTURA_MAX * 1.2));
    sombra.scale.setScalar(s);
    (sombra.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.65 * s;

    // Câmera: de cima e de frente; inclina com o celular e acompanha a moeda no alto.
    inc.x += (incAlvo.x - inc.x) * 0.12;
    inc.y += (incAlvo.y - inc.y) * 0.12;
    olhar += (altura * 0.55 - olhar) * 0.15;
    const elev = THREE.MathUtils.degToRad(48 + inc.x);
    const azim = THREE.MathUtils.degToRad(inc.y);
    const raio = 6.4 + altura * 0.6;
    camera.position.set(Math.sin(azim) * Math.cos(elev) * raio, Math.sin(elev) * raio + olhar, Math.cos(azim) * Math.cos(elev) * raio);
    camera.lookAt(0, 0.15 + olhar, 0);

    renderer.render(cena, camera);
    if (vivo) quadro = requestAnimationFrame(passo);
  }
  quadro = requestAnimationFrame(passo);

  const faceDe = (lado: Lado | null) => (lado === 'B' ? Math.PI : 0);

  return {
    jogar(lado) {
      return new Promise((resolver) => {
        const base = Math.round(angulo / (Math.PI * 2)) * Math.PI * 2;
        jogada = { inicio: performance.now(), de: angulo, ate: base + VOLTAS * Math.PI * 2 + faceDe(lado), resolver, bateu: false };
      });
    },
    mostrar(lado) {
      jogada = null;
      angulo = faceDe(lado);
      altura = 0;
      balanco = 0;
    },
    inclinar(x, y) {
      incAlvo = { x, y };
    },
    destruir() {
      vivo = false;
      cancelAnimationFrame(quadro);
      observador.disconnect();
      geo.dispose();
      for (const m of materiais) m.dispose();
      for (const t of [borda, fa.cor, fa.relevo, fb.cor, fb.relevo, sombraTex]) t.dispose();
      sombra.geometry.dispose();
      (sombra.material as THREE.MeshBasicMaterial).dispose();
      ambiente.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
