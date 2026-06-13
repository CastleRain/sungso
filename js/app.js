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
// On each meeting, a random romantic sequence is played.
function initCharAnimation() {
  const scene       = document.querySelector('.scene');
  if (!scene) return;
  const boyWrapper  = scene.querySelector('.char-h-boy');
  const girlWrapper = scene.querySelector('.char-h-girl');
  const girlSvg     = girlWrapper.querySelector('svg');
  const boyBobEl    = boyWrapper.querySelector('.char-bob');
  const girlBobEl   = girlWrapper.querySelector('.char-bob-delay');

  boyWrapper.style.animation  = 'none';
  girlWrapper.style.animation = 'none';
  girlSvg.style.transition    = 'transform 0.32s ease';

  const MEET_GAP       = 65;
  const BOY_SPEED      = 1.8;
  const GIRL_SPEED     = 2.0;
  const TOGETHER_SPEED = 1.4;

  let boyX  = -80;
  let girlX = window.innerWidth + 100;
  let state = 'walking';
  let inSeq = false;

  // ── Effect element factory ──
  const roseSvgStr =
    `<svg width="20" height="28" viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg">
      <line x1="10" y1="28" x2="10" y2="14" stroke="#4CAF50" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="14" cy="20" rx="4.5" ry="2" fill="#66BB6A" transform="rotate(30 14 20)"/>
      <circle cx="10" cy="10" r="4.5" fill="#E53935" opacity="0.95"/>
      <circle cx="6.5" cy="6.5" r="3.2" fill="#FF4081"/>
      <circle cx="13.5" cy="6.5" r="3.2" fill="#FF4081"/>
      <circle cx="10"   cy="3.5" r="3.2" fill="#FF85B3"/>
      <circle cx="10"   cy="9.5" r="2.2" fill="#FF8A80" opacity="0.55"/>
    </svg>`;

  function mkEl(html, css) {
    const el = document.createElement('div');
    Object.assign(el.style, { position:'absolute', opacity:'0', pointerEvents:'none', zIndex:'25', ...css });
    el.innerHTML = html;
    scene.appendChild(el);
    return el;
  }

  const flowerEl  = mkEl(roseSvgStr, { bottom:'32px', transition:'opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)' });
  const flower2El = mkEl(roseSvgStr, { bottom:'38px', transition:'opacity 0.4s ease' });
  const flower3El = mkEl(roseSvgStr, { bottom:'44px', transition:'opacity 0.4s ease' });
  const heartsEl  = mkEl(
    ['💕','✨','💖','✨','💗'].map((h, i) =>
      `<span style="font-size:15px;display:inline-block">${h}</span>`
    ).join(''),
    { bottom:'72px', display:'flex', gap:'5px', transition:'opacity 0.45s ease' }
  );
  const ringEl = mkEl('💍', {
    bottom:'85px', fontSize:'28px',
    transition:'opacity 0.35s ease, transform 0.45s cubic-bezier(0.34,1.56,0.64,1)',
    transform:'translateY(0) scale(0.3)',
  });
  const sparklesEl = mkEl(
    ['✨','⭐','✦','✧','💫'].map(s => `<span style="font-size:14px;display:inline-block">${s}</span>`).join(''),
    { bottom:'80px', display:'flex', gap:'8px', transition:'opacity 0.4s ease' }
  );

  function setPos() {
    boyWrapper.style.transform  = `translateX(${Math.round(boyX)}px)`;
    girlWrapper.style.transform = `translateX(${Math.round(girlX)}px)`;
  }

  function burstHearts() {
    heartsEl.style.left    = (boyX + MEET_GAP / 2 - 36) + 'px';
    heartsEl.style.opacity = '1';
    heartsEl.querySelectorAll('span').forEach((s, i) => {
      s.style.animation = 'none';
      void s.offsetHeight;
      s.style.animation = `heartPopUp 0.85s ease ${i * 0.13}s both`;
    });
    setTimeout(() => { heartsEl.style.opacity = '0'; }, 1400);
  }

  function restoreBob() {
    boyBobEl.style.animation   = '';
    boyBobEl.style.transition  = '';
    boyBobEl.style.transform   = '';
    girlBobEl.style.animation  = '';
    girlBobEl.style.transition = '';
    girlBobEl.style.transform  = '';
  }

  // Hop the girl count times. Does not restore bob — caller must call restoreBob later.
  function hopGirl(count, intervalMs, height) {
    girlBobEl.style.animation  = 'none';
    girlBobEl.style.transition = 'transform 0.22s ease';
    let i = 0;
    const tick = () => {
      if (i >= count * 2) { girlBobEl.style.transform = ''; return; }
      girlBobEl.style.transform = (i % 2 === 0) ? `translateY(-${height}px)` : 'translateY(0)';
      i++;
      setTimeout(tick, intervalMs);
    };
    tick();
  }

  function finishTogether() {
    girlSvg.style.transform = 'scaleX(1)';
    state = 'together';
  }

  // ── Sequence 1: Flower gift (cozy, classic) ──
  function seqFlower() {
    setTimeout(() => {
      flowerEl.style.transition = 'opacity 0.38s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
      flowerEl.style.left       = (boyX + 44) + 'px';
      flowerEl.style.transform  = 'translateY(-14px) scale(1.2)';
      flowerEl.style.opacity    = '1';
    }, 250);
    setTimeout(() => {
      flowerEl.style.transition = 'opacity 0.38s ease, left 0.7s cubic-bezier(0.25,0.46,0.45,0.94), transform 0.7s ease';
      flowerEl.style.left       = (girlX + 10) + 'px';
      flowerEl.style.transform  = 'translateY(0px) scale(1)';
    }, 1050);
    setTimeout(() => burstHearts(), 1800);
    setTimeout(() => {
      restoreBob();
      finishTogether();
    }, 3100);
  }

  // ── Sequence 2: Proposal (boy kneels, ring bounces) ──
  function seqProposal() {
    // Ring pops up from boy's hand
    setTimeout(() => {
      ringEl.style.left      = (boyX + 28) + 'px';
      ringEl.style.opacity   = '1';
      ringEl.style.transform = 'translateY(-24px) scale(1.3)';
    }, 300);
    // Boy kneels
    setTimeout(() => {
      boyBobEl.style.animation  = 'none';
      boyBobEl.style.transition = 'transform 0.5s ease';
      boyBobEl.style.transform  = 'rotate(-22deg) translateY(16px)';
    }, 550);
    // Ring pulses
    setTimeout(() => { ringEl.style.transform = 'translateY(-18px) scale(1.1)'; }, 1000);
    setTimeout(() => { ringEl.style.transform = 'translateY(-26px) scale(1.4)'; }, 1420);
    setTimeout(() => { ringEl.style.transform = 'translateY(-20px) scale(1.2)'; }, 1840);
    setTimeout(() => { ringEl.style.transform = 'translateY(-26px) scale(1.4)'; }, 2260);
    // Girl hops with joy
    setTimeout(() => hopGirl(2, 280, 20), 2100);
    // Hearts burst
    setTimeout(() => burstHearts(), 2900);
    // Boy stands, ring fades
    setTimeout(() => {
      ringEl.style.opacity   = '0';
      ringEl.style.transform = 'translateY(-40px) scale(0.4)';
      boyBobEl.style.transition = 'transform 0.45s ease';
      boyBobEl.style.transform  = '';
      setTimeout(() => restoreBob(), 450);
    }, 3900);
    setTimeout(() => finishTogether(), 4450);
  }

  // ── Sequence 3: Bouquet (3 roses, one by one) ──
  function seqBouquet() {
    const fls = [flowerEl, flower2El, flower3El];
    fls.forEach((fl, i) => {
      const t = 220 + i * 440;
      setTimeout(() => {
        fl.style.transition = 'opacity 0.35s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
        fl.style.left       = (boyX + 44) + 'px';
        fl.style.transform  = `translateY(-${14 + i * 8}px) scale(1.15)`;
        fl.style.opacity    = '1';
      }, t);
      setTimeout(() => {
        fl.style.transition = `opacity 0.4s ease, left ${0.65 + i * 0.08}s cubic-bezier(0.25,0.46,0.45,0.94), transform 0.6s ease`;
        fl.style.left       = (girlX + 5 + i * 4) + 'px';
        fl.style.transform  = 'translateY(4px) scale(0.88)';
      }, t + 540);
      // Girl hops as each flower arrives
      setTimeout(() => {
        hopGirl(1, 220, 16 - i * 3);
        setTimeout(() => { fl.style.opacity = '0'; }, 700);
      }, t + 1200);
    });
    setTimeout(() => burstHearts(), 2600);
    setTimeout(() => {
      restoreBob();
      finishTogether();
    }, 3800);
  }

  // ── Sequence 4: Dance (girl spins, boy watches then gives flower) ──
  function seqDance() {
    // Sparkles appear around girl
    setTimeout(() => {
      sparklesEl.style.left    = (girlX - 10) + 'px';
      sparklesEl.style.opacity = '1';
      sparklesEl.querySelectorAll('span').forEach((s, i) => {
        s.style.animation = `heartPopUp 0.9s ease ${i * 0.14}s infinite`;
      });
    }, 300);
    // Girl "spins" — scaleX oscillation creates a twirl effect
    setTimeout(() => {
      let n = 0;
      const spinFn = () => {
        girlSvg.style.transition = 'transform 0.15s ease';
        girlSvg.style.transform  = (n % 2 === 0) ? 'scaleX(-0.15) scaleY(0.72)' : 'scaleX(-1)';
        n++;
        if (n < 6) setTimeout(spinFn, 190);
        else { girlSvg.style.transition = 'transform 0.22s ease'; girlSvg.style.transform = 'scaleX(-1)'; }
      };
      spinFn();
    }, 500);
    // Boy gives flower to celebrate
    setTimeout(() => {
      flowerEl.style.transition = 'opacity 0.38s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
      flowerEl.style.left       = (boyX + 44) + 'px';
      flowerEl.style.transform  = 'translateY(-14px) scale(1.2)';
      flowerEl.style.opacity    = '1';
    }, 1800);
    setTimeout(() => {
      flowerEl.style.transition = 'opacity 0.38s ease, left 0.65s cubic-bezier(0.25,0.46,0.45,0.94), transform 0.65s ease';
      flowerEl.style.left       = (girlX + 10) + 'px';
      flowerEl.style.transform  = 'translateY(0) scale(1)';
    }, 2380);
    setTimeout(() => burstHearts(), 2750);
    // Clean up sparkles & walk
    setTimeout(() => {
      sparklesEl.style.opacity = '0';
      sparklesEl.querySelectorAll('span').forEach(s => { s.style.animation = 'none'; });
      flowerEl.style.opacity = '0';
      girlSvg.style.transition = 'transform 0.32s ease';
      restoreBob();
      finishTogether();
    }, 3950);
  }

  // Flower appears twice as often (familiar + comfortable)
  const SEQUENCES = [seqFlower, seqFlower, seqProposal, seqBouquet, seqDance];

  function runMeeting() {
    inSeq = true;
    SEQUENCES[Math.floor(Math.random() * SEQUENCES.length)]();
  }

  function resetAll() {
    inSeq = false;
    [flowerEl, flower2El, flower3El, heartsEl, ringEl, sparklesEl].forEach(el => {
      el.style.opacity = '0';
    });
    ringEl.style.transform    = 'translateY(0) scale(0.3)';
    flowerEl.style.transition = 'opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
    girlSvg.style.transition  = 'transform 0.32s ease';
    girlSvg.style.transform   = 'scaleX(-1)';
    restoreBob();
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
      // standstill — sequence setTimeout choreography handles transitions

    } else if (state === 'together') {
      boyX  += TOGETHER_SPEED;
      girlX  = boyX + MEET_GAP;
      // Flower follows girl during walk-away (only seqFlower keeps it visible)
      if (parseFloat(flowerEl.style.opacity) > 0) {
        flowerEl.style.transition = 'opacity 0.4s ease';
        flowerEl.style.left       = (girlX + 10) + 'px';
      }
      if (boyX > vw + 200) resetAll();
    }

    setPos();
    requestAnimationFrame(loop);
  }

  setPos();
  requestAnimationFrame(loop);
}

initCharAnimation();
