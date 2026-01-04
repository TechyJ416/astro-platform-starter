class GlobalParticleField {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = window.devicePixelRatio || 1;

    this.flowParticles = [];
    this.galaxyParticles = [];

    this.flowCount = 6000;
    this.galaxyCount = 9000;

    this.time = 0;
    this.scroll = 0;

    this.resize();
    this.initFlow();
    this.initGalaxy();
    this.bind();
    this.animate();
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cx = this.w / 2;
    this.cy = this.h / 2;
  }

  bind() {
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("scroll", () => {
      this.scroll = window.scrollY * 0.00035;
    });

    document.addEventListener("astro:before-swap", () => {
      this.scroll += 0.8;
    });
  }

  initFlow() {
    for (let i = 0; i < this.flowCount; i++) {
      this.flowParticles.push({
        u: Math.random() * Math.PI * 2,
        v: Math.random() * Math.PI,
        speed: 0.5 + Math.random(),
        len: 1.5 + Math.random() * 3,
        hue: Math.random() < 0.65 ? 190 : 345,
        alpha: 0.12 + Math.random() * 0.25
      });
    }
  }

  initGalaxy() {
    for (let i = 0; i < this.galaxyCount; i++) {
      this.galaxyParticles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: Math.random() * 1.8,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        alpha: 0.03 + Math.random() * 0.15
      });
    }
  }

  curl(u, v, t) {
    return {
      x: Math.sin(v * 2 + t) + Math.cos(u * 3 - t),
      y: Math.sin(u * 2 - t) - Math.cos(v * 3 + t)
    };
  }

  project(u, v) {
    const R = Math.min(this.w, this.h) * 0.38;
    const warp = Math.sin(v * 3 + this.time) * 55;

    return {
      x: this.cx + (R + warp) * Math.sin(v) * Math.cos(u + this.scroll),
      y: this.cy + (R - warp) * Math.cos(v)
    };
  }

  drawFlow(p) {
    const f = this.curl(p.u, p.v, this.time);
    p.u += f.x * 0.002 * p.speed;
    p.v += f.y * 0.002 * p.speed;

    const a = this.project(p.u, p.v);
    const b = this.project(p.u + 0.01, p.v + 0.01);

    this.ctx.strokeStyle = `hsla(${p.hue},100%,65%,${p.alpha})`;
    this.ctx.beginPath();
    this.ctx.moveTo(a.x, a.y);
    this.ctx.lineTo(a.x + (b.x - a.x) * p.len, a.y + (b.y - a.y) * p.len);
    this.ctx.stroke();
  }

  drawGalaxy(p) {
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0) p.x = this.w;
    if (p.x > this.w) p.x = 0;
    if (p.y < 0) p.y = this.h;
    if (p.y > this.h) p.y = 0;

    this.ctx.fillStyle = `rgba(140,180,255,${p.alpha})`;
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  render() {
    this.ctx.fillStyle = "rgba(2,2,8,0.25)";
    this.ctx.fillRect(0, 0, this.w, this.h);

    this.ctx.globalCompositeOperation = "lighter";
    for (const g of this.galaxyParticles) this.drawGalaxy(g);
    for (const f of this.flowParticles) this.drawFlow(f);
    this.ctx.globalCompositeOperation = "source-over";
  }

  animate() {
    this.time += 0.012;
    this.render();
    requestAnimationFrame(() => this.animate());
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!window.__globalParticles) {
    const canvas = document.getElementById("global-particles");
    if (canvas) window.__globalParticles = new GlobalParticleField(canvas);
  }
});
