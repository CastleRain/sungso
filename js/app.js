// Particles
(function () {
  const c = document.getElementById('particles');
  const sym = ['♥','♡','✦','✧','❋','✿'];
  const col = ['#FF6B9D','#FFB3CC','#FF85B3','#FFD0E4','#FF4081'];
  for (let i = 0; i < 16; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    el.textContent = sym[i % sym.length];
    el.style.setProperty('--x',     (Math.random() * 100) + '%');
    el.style.setProperty('--dur',   (7 + Math.random() * 9) + 's');
    el.style.setProperty('--delay', '-' + (Math.random() * 14) + 's');
    el.style.setProperty('--color', col[Math.floor(Math.random() * col.length)]);
    el.style.setProperty('--size',  (10 + Math.random() * 11) + 'px');
    c.appendChild(el);
  }
})();

// Flatpickr date picker
flatpickr('#formDate', {
  locale: 'ko',
  dateFormat: 'Y-m-d',
  minDate: 'today',
  disableMobile: true,
});

// D-day initial render (loading state before Firebase connects)
(function () {
  const wedding = new Date('2027-03-06T00:00:00');
  const today   = new Date(); today.setHours(0,0,0,0);
  const diff    = Math.ceil((wedding - today) / 86400000);
  const el      = document.getElementById('ddayNum');
  if (el) {
    if      (diff > 0)   el.textContent = 'D-' + diff;
    else if (diff === 0) el.textContent = 'D-Day 💒';
    else                 el.textContent = 'D+' + Math.abs(diff);
  }
})();

// ── Character meeting animation ──
// State machine: walking → approaching → meeting → together → (reset)
// Boy SVG 58×92: right hand at cx=47,cy=60 → boyX+47, 32px from scene bottom
// Girl SVG 62×98 with scaleX(-1): toward-boy arm at visual_x=62-12=50... no:
//   original right arm cx=50 → visual_x = 62-50 = 12 → girlX+12 (her left side facing boy)
function initCharAnimation() {
  const scene       = document.querySelector('.scene');
  if (!scene) return;
  const boyWrapper  = scene.querySelector('.char-h-boy');
  const girlWrapper = scene.querySelector('.char-h-girl');
  const girlSvg     = girlWrapper.querySelector('svg');

  // Take over horizontal movement from CSS animations
  boyWrapper.style.animation  = 'none';
  girlWrapper.style.animation = 'none';
  girlSvg.style.transition    = 'transform 0.32s ease';  // smooth flip

  const MEET_GAP       = 65;   // px between wrappers when stopped
  const BOY_SPEED      = 1.8;
  const GIRL_SPEED     = 2.0;
  const TOGETHER_SPEED = 1.4;

  let boyX  = -80;
  let girlX = window.innerWidth + 100;
  let state = 'walking';   // walking | approaching | meeting | together
  let inSeq = false;

  // ── Flower element (rose) ──
  const flowerEl = document.createElement('div');
  Object.assign(flowerEl.style, {
    position: 'absolute', bottom: '32px', left: '0',
    opacity: '0', pointerEvents: 'none', zIndex: '25',
    transition: 'opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
  });
  flowerEl.innerHTML =
    `<svg width="20" height="28" viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg">
      <line x1="10" y1="28" x2="10" y2="14" stroke="#4CAF50" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="14" cy="20" rx="4.5" ry="2" fill="#66BB6A" transform="rotate(30 14 20)"/>
      <circle cx="10" cy="10" r="4.5" fill="#E53935" opacity="0.95"/>
      <circle cx="6.5" cy="6.5" r="3.2" fill="#FF4081"/>
      <circle cx="13.5" cy="6.5" r="3.2" fill="#FF4081"/>
      <circle cx="10"   cy="3.5" r="3.2" fill="#FF85B3"/>
      <circle cx="10"   cy="9.5" r="2.2" fill="#FF8A80" opacity="0.55"/>
    </svg>`;
  scene.appendChild(flowerEl);

  // ── Hearts burst element ──
  const heartsEl = document.createElement('div');
  Object.assign(heartsEl.style, {
    position: 'absolute', bottom: '72px', left: '0',
    opacity: '0', pointerEvents: 'none', zIndex: '25',
    display: 'flex', gap: '5px',
    transition: 'opacity 0.45s ease',
  });
  heartsEl.innerHTML = ['💕','✨','💖','✨','💗'].map((h, i) =>
    `<span style="font-size:15px;display:inline-block;animation:heartPopUp 0.85s ease ${i*0.13}s both">${h}</span>`
  ).join('');
  scene.appendChild(heartsEl);

  function setPos() {
    boyWrapper.style.transform  = `translateX(${Math.round(boyX)}px)`;
    girlWrapper.style.transform = `translateX(${Math.round(girlX)}px)`;
  }

  function runMeeting() {
    inSeq = true;
    const cx = boyX + MEET_GAP / 2;

    // 250ms — flower pops up above boy's right hand
    setTimeout(() => {
      flowerEl.style.transition = 'opacity 0.38s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
      flowerEl.style.left       = (boyX + 44) + 'px';
      flowerEl.style.transform  = 'translateY(-14px) scale(1.2)';
      flowerEl.style.opacity    = '1';
    }, 250);

    // 1050ms — flower glides to girl's left hand
    setTimeout(() => {
      flowerEl.style.transition = 'opacity 0.38s ease, left 0.7s cubic-bezier(0.25,0.46,0.45,0.94), transform 0.7s ease';
      flowerEl.style.left       = (girlX + 10) + 'px';
      flowerEl.style.transform  = 'translateY(0px) scale(1)';
    }, 1050);

    // 1800ms — hearts burst
    setTimeout(() => {
      heartsEl.style.left    = (cx - 36) + 'px';
      heartsEl.style.opacity = '1';
      heartsEl.querySelectorAll('span').forEach((s, i) => {
        s.style.animation = 'none';
        void s.offsetHeight;
        s.style.animation = `heartPopUp 0.85s ease ${i * 0.13}s both`;
      });
    }, 1800);

    // 3100ms — girl faces right, both walk together
    setTimeout(() => {
      heartsEl.style.opacity  = '0';
      girlSvg.style.transform = 'scaleX(1)';
      state = 'together';
    }, 3100);
  }

  function resetAll() {
    inSeq = false;
    flowerEl.style.opacity    = '0';
    heartsEl.style.opacity    = '0';
    girlSvg.style.transform   = 'scaleX(-1)';
    boyX  = -80;
    girlX = window.innerWidth + 100;
    state = 'walking';
  }

  function loop() {
    const vw = window.innerWidth;

    if (state === 'walking') {
      boyX  += BOY_SPEED;
      girlX -= GIRL_SPEED;
      if (boyX  >  vw + 200) boyX  = -80;
      if (girlX < -200)      girlX = vw + 100;
      if (girlX - boyX < 160 && girlX > boyX) state = 'approaching';

    } else if (state === 'approaching') {
      const dist  = girlX - boyX;
      const speed = Math.max(0.1, (dist - MEET_GAP) * 0.04);
      boyX  += speed;
      girlX -= speed;
      if (dist <= MEET_GAP + 1) {
        state = 'meeting';
        if (!inSeq) runMeeting();
      }

    } else if (state === 'meeting') {
      // standstill — setTimeout choreography handles transitions

    } else if (state === 'together') {
      boyX  += TOGETHER_SPEED;
      girlX  = boyX + MEET_GAP;
      flowerEl.style.transition = 'opacity 0.4s ease';  // no left transition while walking
      flowerEl.style.left       = (girlX + 10) + 'px';
      if (boyX > vw + 200) resetAll();
    }

    setPos();
    requestAnimationFrame(loop);
  }

  setPos();
  requestAnimationFrame(loop);
}

initCharAnimation();
