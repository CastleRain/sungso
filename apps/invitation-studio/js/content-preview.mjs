import { normalizeContentDraft, draftDefaults, resolveDraftPhotos } from './content-draft.mjs';

/** Text is always inserted as text, never markup. Persistent audio, dialogs and form nodes remain mounted. */
export function mountContentPreview({ doc = document, win = window, gallery, config = {}, onLayout = () => {} } = {}) {
  const defaults = draftDefaults(config), originals = new Map(), originalAttributes = new Map(), added = [], basePhotos = (config.photos || []).map(photo => ({ ...photo }));
  let current = normalizeContentDraft(), disposed = false, photoFingerprint = '';
  function remember(node) {
    if (node && !originals.has(node)) originals.set(node, { children: [...node.childNodes].map(child => child.cloneNode(true)), whiteSpace: node.style.whiteSpace, overflowWrap: node.style.overflowWrap });
    return node;
  }
  function write(node, value) {
    if (!remember(node)) return;
    if (node.textContent !== value) node.textContent = value;
    node.style.whiteSpace = 'pre-line'; node.style.overflowWrap = 'anywhere';
  }
  function restore(node) {
    const original = originals.get(node); if (!original) return;
    node.replaceChildren(...original.children.map(child => child.cloneNode(true)));
    node.style.whiteSpace = original.whiteSpace; node.style.overflowWrap = original.overflowWrap;
  }
  function attribute(node, name, value) {
    if (!node) return;
    if (!originalAttributes.has(node)) originalAttributes.set(node, new Map());
    const attrs = originalAttributes.get(node); if (!attrs.has(name)) attrs.set(name, node.getAttribute(name));
    if (value === undefined) { const old = attrs.get(name); if (old === null) node.removeAttribute(name); else node.setAttribute(name, old); }
    else node.setAttribute(name, value);
  }
  const invite = remember(doc.querySelector('.invitation-copy')), closing = remember(doc.querySelector('.closing-copy'));
  const heroNames = remember(doc.querySelector('.hero-names'));
  const hero = doc.querySelector('.hero'), storyTitle = remember(doc.querySelector('#story-title'));
  const family = [...doc.querySelectorAll('.family-person')].slice(0, 2).map(node => ({ parents: remember(node.querySelector('p')), name: remember(node.querySelector('strong')) }));
  const chapters = [...doc.querySelectorAll('.story-page')].slice(0, 3).map(node => {
    const copy = node.querySelector('.story-page-copy');
    let quote = copy?.querySelector('blockquote');
    if (!quote && copy) { quote = doc.createElement('blockquote'); quote.hidden = true; copy.insertBefore(quote, copy.querySelector('.story-note')); added.push(quote); }
    return { title: remember(copy?.querySelector('h3')), body: remember(copy?.querySelector('p:not(.story-note)')), quote: remember(quote), note: remember(copy?.querySelector('.story-note')), quoteHidden: quote?.hidden };
  });
  const secondaryNames = [...doc.querySelectorAll('[data-keepsake-fact="names"], .guest-pass-names')].map(remember);
  const thankYouNames = [...doc.querySelectorAll('.thank-you-signature > span')].slice(0, 2).map(remember);
  const chapterButtons = [...doc.querySelectorAll('.story-chapters button')];
  function setDraft(value) {
    if (disposed) return;
    current = normalizeContentDraft(value);
    const text = { ...defaults, ...current.text };
    if (current.text.invitation) write(invite, text.invitation); else restore(invite);
    if (current.text.closing) write(closing, text.closing); else restore(closing);
    if (current.text.groom || current.text.bride) {
      if (heroNames) {
        const join = doc.createElement('span'); join.textContent = '&';
        heroNames.replaceChildren(doc.createTextNode(`${text.groom} `), join, doc.createTextNode(` ${text.bride}`)); heroNames.style.overflowWrap = 'anywhere';
      }
      secondaryNames.forEach(node => write(node, `${text.groom} & ${text.bride}`));
      thankYouNames.forEach((node, i) => write(node, i ? text.bride : text.groom));
      attribute(hero, 'aria-label', `${text.groom} · ${text.bride}의 결혼식 초대`);
      write(storyTitle, `${text.groom} · ${text.bride}의 세 가지 이야기`);
    } else { restore(heroNames); secondaryNames.forEach(restore); thankYouNames.forEach(restore); attribute(hero, 'aria-label'); restore(storyTitle); }
    for (const [index, side] of ['groom', 'bride'].entries()) {
      const nodes = family[index]; if (!nodes) continue;
      if (current.text[side]) write(nodes.name, text[side]); else restore(nodes.name);
      if (current.text[`${side}Father`] || current.text[`${side}Mother`]) {
        const relation = doc.createElement('span'); relation.textContent = `의 ${index ? '딸' : '아들'}`;
        nodes.parents?.replaceChildren(doc.createTextNode(`${text[`${side}Father`]} · ${text[`${side}Mother`]}`), relation);
      } else restore(nodes.parents);
    }
    chapters.forEach((nodes, i) => {
      for (const [key, suffix] of [['title', 'Title'], ['body', 'Body'], ['quote', 'Quote'], ['note', 'Note']]) {
        const field = `story${i + 1}${suffix}`;
        if (current.text[field]) write(nodes[key], text[field]); else restore(nodes[key]);
      }
      if (nodes.quote) nodes.quote.hidden = current.text[`story${i + 1}Quote`] ? false : nodes.quoteHidden;
      attribute(chapterButtons[i], 'aria-label', current.text[`story${i + 1}Title`] ? `${i + 1}장 ${text[`story${i + 1}Title`]}` : undefined);
    });
    const photos = resolveDraftPhotos(current, basePhotos), nextFingerprint = JSON.stringify(photos.map(photo => [photo.id, photo.src]));
    if (gallery && photoFingerprint !== nextFingerprint) { photoFingerprint = nextFingerprint; gallery.render(photos); }
    doc.dispatchEvent(new (win.CustomEvent || CustomEvent)('invitation:content-change',{detail:current}));
    onLayout();
    doc.dispatchEvent(new win.Event('lab:layout-changed'));
  }
  return {
    setDraft,
    getDraft: () => normalizeContentDraft(current),
    getWedding: () => ({ ...config.wedding, groom: current.text.groom || config.wedding?.groom, bride: current.text.bride || config.wedding?.bride }),
    destroy() {
      if (disposed) return; disposed = true;
      originals.forEach((_, node) => restore(node)); added.forEach(node => node.remove()); gallery?.render(basePhotos);
      originalAttributes.forEach((attrs, node) => attrs.forEach((_, name) => attribute(node, name)));
    },
  };
}
