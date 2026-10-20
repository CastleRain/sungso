// Scroll remains native. All transforms follow position, including reverse scrolling.
export function initScrollScenes() {
  const root = document.documentElement;
  const hero = document.querySelector('.hero');
  const photo = document.querySelector('.hero-photo');
  const letter = document.querySelector('.hero-letter');
  const details = document.querySelector('.hero-details');
  const portal = document.querySelector('.story-door');
  const leaves = [...portal.querySelectorAll('.door-leaf')];
  let frame = 0;
  let album = [...document.querySelectorAll('.gallery-item')];
  const clamp = value => Math.min(1, Math.max(0, value));
  function render() {
    frame = 0;
    const enabled = root.dataset.motion === 'on' && !document.querySelector('#top').hidden;
    const rect = hero.getBoundingClientRect();
    const progress = enabled ? clamp(-rect.top / (rect.height * .85)) : 0;
    photo.style.transform = `translate3d(0,${progress * 68}px,0) scale(${1.025 + progress * .075})`;
    letter.style.setProperty('--scroll-rise', `${progress * -36}px`);
    details.style.setProperty('--scroll-rise', `${progress * -18}px`);
    hero.style.setProperty('--scroll-shade', progress * .15);
    const door = portal.getBoundingClientRect();
    const reveal = enabled ? clamp((innerHeight * .8 - door.top) / (innerHeight * .65)) : 0;
    if (!portal.classList.contains('is-opening')) leaves.forEach((leaf, index) => {
      leaf.style.transform = `rotateY(${(index ? 1 : -1) * reveal * 12}deg)`;
    });
    album.forEach((item, index) => {
      if (item.hidden) return;
      const box = item.getBoundingClientRect();
      const travel = enabled ? (clamp((innerHeight - box.top) / (innerHeight + box.height)) - .5) * 24 : 0;
      item.style.setProperty('--photo-travel', `${travel * (index % 2 ? -1 : 1)}px`);
    });
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  addEventListener('invitation:motionchange', schedule);
  addEventListener('invitation:viewchange', schedule);
  addEventListener('invitation:albumchange', () => { album = [...document.querySelectorAll('.gallery-item')]; schedule(); });
  render();
}
