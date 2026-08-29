// Small dependency-free confetti burst — canvas-based, no external library.
// Fired when a bowler logs a strike or a "ten" so the entry moment feels rewarding.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  life: number;
  shape: "square" | "pin";
}

const COLORS = ["#f97316", "#2563eb", "#22c55e", "#eab308", "#ec4899", "#7c3aed"];

// A tiny bowling-pin silhouette, drawn around the origin, used for a portion
// of the confetti particles so the celebration reads as "bowling", not just
// generic confetti.
function drawPin(ctx: CanvasRenderingContext2D, size: number) {
  const w = size * 0.6;
  const h = size * 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.bezierCurveTo(w / 2, -h / 2, w / 2, -h / 6, w / 3, 0);
  ctx.bezierCurveTo(w / 2, h / 4, w / 2, h / 2, 0, h / 2);
  ctx.bezierCurveTo(-w / 2, h / 2, -w / 2, h / 4, -w / 3, 0);
  ctx.bezierCurveTo(-w / 2, -h / 6, -w / 2, -h / 2, 0, -h / 2);
  ctx.closePath();
  ctx.fill();
}

export function fireConfetti(originX = 0.5, originY = 0.3) {
  if (typeof window === "undefined") return;

  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  document.body.appendChild(canvas);

  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const particleCount = 90;
  const particles: Particle[] = Array.from({ length: particleCount }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 8;
    return {
      x: width * originX,
      y: height * originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 5 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.4,
      life: 1,
      shape: Math.random() < 0.2 ? "pin" : "square",
    };
  });

  const gravity = 0.25;
  const drag = 0.99;
  let frame = 0;
  const maxFrames = 90;

  function tick() {
    if (!ctx) return;
    frame++;
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.life = Math.max(0, 1 - frame / maxFrames);

      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.shape === "pin" ? "#f4f5f7" : p.color;
      if (p.shape === "pin") {
        drawPin(ctx, p.size);
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      }
      ctx.restore();
    }

    if (frame < maxFrames) {
      requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(tick);
}
