// ============================================
// JOSÉ EN LA VIDA ADULTA — Atmosphere & FX
// ============================================
(function () {
  'use strict';

  /* --- Particle System --- */
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H;
  const P = [];
  const N = 55;
  const C = [
    [255, 195, 55], [94, 234, 212], [167, 139, 250],
    [251, 113, 133], [255, 255, 240], [56, 189, 248], [251, 146, 60],
  ];

  function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }

  function spawn(rAge) {
    const c = C[(Math.random() * C.length) | 0];
    const ml = 320 + Math.random() * 380;
    return {
      x: Math.random() * W, y: rAge ? Math.random() * H : H + 10,
      vx: (Math.random() - 0.5) * 0.22, vy: -(0.12 + Math.random() * 0.3),
      s: 1 + Math.random() * 2.2, r: c[0], g: c[1], b: c[2],
      life: rAge ? Math.random() * ml : ml, ml
    };
  }

  resize();
  for (let i = 0; i < N; i++) P.push(spawn(true));

  (function loop() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      const t = p.life / p.ml;
      const a = (t > .8 ? (1 - t) * 5 : t < .2 ? t * 5 : 1) * 0.42;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a})`; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 3.8, 0, 6.283);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a * .18})`; ctx.fill();
      if (p.life <= 0 || p.y < -20) P[i] = spawn(false);
    }
    requestAnimationFrame(loop);
  })();

  addEventListener('resize', resize);

  /* --- Node Click --- */
  document.querySelectorAll('.node').forEach(n => {
    n.addEventListener('click', () => {
      document.querySelectorAll('.node.selected').forEach(x => x.classList.remove('selected'));
      n.classList.add('selected');
    });
  });

  /* --- Lid Panel Toggles --- */
  document.querySelectorAll('[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = 'panel-' + btn.dataset.panel;
      const el = document.getElementById(id);
      if (!el) return;
      const opening = el.hidden;
      document.querySelectorAll('.lid-panel').forEach(p => { p.hidden = true; });
      document.querySelectorAll('[data-panel]').forEach(b => b.classList.remove('on'));
      if (opening) { el.hidden = false; btn.classList.add('on'); }
    });
  });
  document.querySelectorAll('.lid-close').forEach(b => {
    b.addEventListener('click', () => {
      b.closest('.lid-panel').hidden = true;
      document.querySelectorAll('[data-panel]').forEach(x => x.classList.remove('on'));
    });
  });

  /* --- Action card click feedback --- */
  document.querySelectorAll('.action-card').forEach(c => {
    c.addEventListener('click', () => {
      c.classList.add('pressed');
      setTimeout(() => c.classList.remove('pressed'), 400);
    });
  });
})();
