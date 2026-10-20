// The story is a separate view in this document so the music and guestbook draft survive.
const invitation = document.querySelector('#top');
const story = document.querySelector('#our-story');
const heading = document.querySelector('#our-story-title');
const title = document.title;
let opened = false, returnScroll = 0, returnFocus, opening = false, openingRevision = 0, doorAnimations = [];

function resetDoor() {
  doorAnimations.forEach(animation => animation.cancel());
  doorAnimations = [];
  document.querySelectorAll('[data-open-story]').forEach(link => { link.removeAttribute('aria-busy'); link.classList.remove('is-opening'); });
}
function cancelOpening() { openingRevision++; opening = false; resetDoor(); }

function renderStory() {
  const next = ['#our-story', '#our-story-title'].includes(location.hash);
  if (next === opened) return;
  if (next) returnScroll = scrollY;
  opened = next;
  invitation.hidden = next;
  story.hidden = !next;
  document.body.classList.toggle('story-open', next);
  document.querySelector('#skip-link').href = next ? '#our-story-title' : '#invitation';
  document.querySelector('#skip-link').textContent = next ? '이야기로 바로가기' : '초대글로 바로가기';
  document.title = next ? '우리 이야기 · 성우와 소희' : title;
  if (next) {
    heading.focus({ preventScroll: true });
    scrollTo({ top: 0, behavior: 'instant' });
  } else {
    resetDoor();
    returnFocus?.focus({ preventScroll: true });
    scrollTo({ top: returnFocus ? returnScroll : document.querySelector('#story').offsetTop, behavior: 'instant' });
  }
  dispatchEvent(new Event('invitation:viewchange'));
}

document.querySelectorAll('[data-open-story]').forEach(link => link.addEventListener('click', async event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (opening || opened) return;
  opening = true;
  const revision = ++openingRevision;
  returnFocus = link;
  if (document.documentElement.dataset.motion === 'on') {
    link.setAttribute('aria-busy', 'true'); link.classList.add('is-opening');
    doorAnimations = [...link.querySelectorAll('.door-leaf')].map((leaf, index) => leaf.animate([
      { transform: getComputedStyle(leaf).transform }, { transform: `rotateY(${index ? 105 : -105}deg)` },
    ], { duration: 950, easing: 'cubic-bezier(.22,.65,.2,1)', fill: 'forwards' }));
    await Promise.all(doorAnimations.map(animation => animation.finished.catch(() => {})));
  }
  if (revision !== openingRevision) return;
  opening = false;
  history.pushState({ ...history.state, invitationStory: true }, '', '#our-story');
  renderStory();
}));
function closeStory(event) {
  if (event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey) return;
  event?.preventDefault();
  if (history.state?.invitationStory) history.back();
  else {
    history.replaceState(history.state, '', '#story');
    renderStory();
  }
}
document.querySelectorAll('[data-close-story]').forEach(link => link.addEventListener('click', closeStory));
addEventListener('popstate', () => { cancelOpening(); renderStory(); });
addEventListener('hashchange', () => { if (opening) cancelOpening(); renderStory(); });
document.addEventListener('keydown', event => {
  if (opening && event.key === 'Escape') { event.preventDefault(); cancelOpening(); returnFocus?.focus({ preventScroll: true }); return; }
  if (opened && event.key === 'Escape') closeStory(event);
});
renderStory();
