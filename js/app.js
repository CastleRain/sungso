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
