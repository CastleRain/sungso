/** Optional editorial passages. These are composition choices, never server data. */
export const SENTIMENT_SECTION_IDS = Object.freeze(['promises', 'couple-notes', 'thank-you']);
export const SENTIMENT_CHOICES = Object.freeze({
  promiseStyle: Object.freeze(['lines', 'paired']),
  noteStyle: Object.freeze(['conversation', 'pages']),
  thanksStyle: Object.freeze(['letter', 'signature']),
});
const SECTION_KEYS = Object.freeze({ promises: 'promiseStyle', 'couple-notes': 'noteStyle', 'thank-you': 'thanksStyle' });
const LABELS = Object.freeze({ promises: '우리의 약속', 'couple-notes': '우리의 한 문장', 'thank-you': '감사 인사' });

// For editor descriptions/documentation, not an additional banner in the invitation.
// The promises and thanks are proposed copy, not a claim that the couple wrote it.
export const SENTIMENT_COPY_META = Object.freeze({
  promises: Object.freeze({ source: 'suggested', note: '일상의 작은 순간·서로의 일·대화를 위한 제안 문구입니다. 두 분이 확인해 선택하는 장면입니다.' }),
  'couple-notes': Object.freeze({ source: 'paraphrase', note: '소희가 카페를 운영하는 모습을 보며 함께라면 무엇이든 할 수 있겠다고 느낀 성우의 설명을 짧게 다듬었습니다. 직접 인용이나 소희의 답변을 만들지 않았습니다.' }),
  'thank-you': Object.freeze({ source: 'suggested', note: '하객에게 전하는 감사 인사 제안 문구입니다. 실제 감사 편지나 새로운 에피소드가 아닙니다.' }),
});

export function sentimentChoices(input) {
  return Object.fromEntries(Object.entries(SENTIMENT_CHOICES).map(([key, values]) => [key, values.includes(input?.[key]) ? input[key] : values[0]]));
}

const name = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : fallback;

/** Create each optional section once. Switching layouts preserves its live nodes. */
export function mountSentimentScenes({ doc = document, win = window, composition, wedding = {} } = {}) {
  const main = doc.querySelector('main.paper'), tail = main?.querySelector('.closing-section');
  const nav = doc.querySelector('.quick-nav');
  const sections = [], links = [], created = [];
  let disposed = false;

  function element(tag, className, copy, parent) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (copy !== undefined) node.textContent = copy;
    parent?.append(node);
    return node;
  }
  function heading(parent, id, english, script) {
    const header = element('header', 'section-title sentiment-heading', undefined, parent);
    element('p', 'eyebrow', english, header);
    const title = element('h2', '', script, header); title.id = `${id}-title`;
    element('p', 'sentiment-korean-title', LABELS[id], header);
  }
  function fill(section, id) {
    const inner = element('div', 'section-inner', undefined, section);
    if (id === 'promises') {
      heading(inner, id, 'THE LITTLE THINGS', 'Everyday, us');
      const list = element('ol', 'promise-lines', undefined, inner);
      [
        ['함께하는 순간', '일상의 작은 순간도 함께 나눌게요.'],
        ['서로의 일', '각자의 일을 곁에서 응원할게요.'],
        ['우리의 대화', '서로의 말을 끝까지 들어 줄게요.'],
      ].forEach(([title, copy], index) => {
        const item = element('li', 'promise-item', undefined, list);
        const number = element('span', 'promise-number', `0${index + 1}`, item); number.setAttribute('aria-hidden', 'true');
        const words = element('div', 'promise-words', undefined, item);
        element('h3', '', title, words); element('p', '', copy, words);
      });
    } else if (id === 'couple-notes') {
      heading(inner, id, 'A THOUGHT TO KEEP', 'One little thought');
      const page = element('div', 'couple-note-sheet', undefined, inner);
      const context = element('div', 'couple-note-context', undefined, page);
      element('span', 'couple-note-kicker', '마음이 단단해진 순간', context);
      element('p', '', '카페를 꾸려 가는 모습을 보며', context);
      const thought = element('div', 'couple-note-thought', undefined, page);
      element('span', 'couple-note-script', 'Together, we can.', thought);
      element('p', '', '함께라면 무엇이든 해 볼 수 있겠다는 믿음이 생겼어요.', thought);
    } else {
      heading(inner, id, 'FOR BEING HERE', 'With all our love');
      const letter = element('div', 'thank-you-letter', undefined, inner);
      element('p', 'thank-you-lead', '함께해 주시는 마음,\n오래 기억할게요.', letter);
      element('p', 'thank-you-body', '저희의 시작을 축하해 주셔서 고맙습니다.\n그날, 반갑게 만나요.', letter);
      const signature = element('p', 'thank-you-signature', undefined, letter);
      element('span', '', name(wedding.groom, '성우'), signature);
      const join = element('i', '', '&', signature); join.setAttribute('aria-hidden', 'true');
      element('span', '', name(wedding.bride, '소희'), signature);
      element('span', 'thank-you-postscript', '마음을 담아', letter);
    }
  }

  for (const id of SENTIMENT_SECTION_IDS) {
    let section = doc.getElementById(id);
    if (!section && main && tail) {
      section = element('section', `section sentiment-section ${id}-section`);
      section.id = id; section.hidden = true; section.dataset.optionalSection = id;
      section.setAttribute('aria-labelledby', `${id}-title`);
      fill(section, id); main.insertBefore(section, tail); created.push(section);
    }
    if (section) sections.push({ node: section, hidden: section.hidden, layout: section.dataset.optionalLayout });
    let link = nav && [...nav.querySelectorAll('a')].find(node => node.dataset.optionalNav === id);
    if (!link && nav && section) {
      link = element('a', '', LABELS[id], nav); link.setAttribute('href', `#${id}`);
      link.dataset.jump = ''; link.dataset.optionalNav = id; link.hidden = true; created.push(link);
    }
    if (link) links.push({ node: link, hidden: link.hidden });
  }

  function setComposition(input) {
    if (disposed) return;
    const choices = sentimentChoices(input);
    const active = new Set(Array.isArray(input?.extras) ? input.extras.filter(id => SENTIMENT_SECTION_IDS.includes(id)) : []);
    for (const { node } of sections) {
      node.hidden = !active.has(node.id);
      node.dataset.optionalLayout = choices[SECTION_KEYS[node.id]];
    }
    for (const { node } of links) node.hidden = !active.has(node.dataset.optionalNav);
  }
  setComposition(composition);
  return {
    setComposition,
    // Shared scroll effects control these sections, respecting reduced motion globally.
    setEnabled() {}, refresh() {},
    destroy() {
      if (disposed) return;
      disposed = true;
      for (const { node, hidden, layout } of sections) {
        node.hidden = hidden;
        if (layout === undefined) delete node.dataset.optionalLayout; else node.dataset.optionalLayout = layout;
      }
      for (const { node, hidden } of links) node.hidden = hidden;
      created.forEach(node => node.remove());
    },
  };
}
