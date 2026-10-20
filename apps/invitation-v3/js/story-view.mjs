// The story is a separate view in this document so the music and guestbook draft survive.
const invitation = document.querySelector('#top');
const story = document.querySelector('#our-story');
const heading = document.querySelector('#our-story-title');
const title = document.title;
let opened = false, returnScroll = 0, returnFocus;

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
    returnFocus?.focus({ preventScroll: true });
    scrollTo({ top: returnFocus ? returnScroll : document.querySelector('#story').offsetTop, behavior: 'instant' });
  }
  dispatchEvent(new Event('invitation:viewchange'));
}

document.querySelectorAll('[data-open-story]').forEach(link => link.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  returnFocus = link;
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
addEventListener('popstate', renderStory);
addEventListener('hashchange', renderStory);
document.addEventListener('keydown', event => {
  if (opened && event.key === 'Escape' && document.querySelector('#sound-settings')?.hidden !== false) closeStory(event);
});
renderStory();
