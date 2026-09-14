// Unfolding and room choices are cosmetic, tab-memory state only.
export function createImmersiveExperiences() {
  const states = new Map();
  let host = null;
  function apply(root) {
    const choices = [...root.querySelectorAll('[data-immersive-choice]')];
    const state = states.get(root.dataset.immersiveRoot) || { unfolded: false, choice: choices[0]?.dataset.immersiveChoice };
    if (!choices.some(button => button.dataset.immersiveChoice === state.choice)) state.choice = choices[0]?.dataset.immersiveChoice;
    states.set(root.dataset.immersiveRoot, state);
    root.dataset.unfolded = state.unfolded ? 'on' : 'off';
    if (state.choice) root.dataset.choice = state.choice;
    for (const button of choices) button.setAttribute('aria-pressed', String(button.dataset.immersiveChoice === state.choice));
    for (const panel of root.querySelectorAll('[data-immersive-panel]')) panel.hidden = panel.dataset.immersivePanel !== state.choice;
    for (const button of root.querySelectorAll('[data-immersive-toggle]')) {
      button.setAttribute('aria-pressed', String(state.unfolded));
      const text = button.querySelector('span');
      if (text) text.textContent = state.unfolded ? '스크롤에 맡기기' : button.dataset.idleLabel;
    }
  }
  function click(event) {
    const button = event.target.closest?.('button[data-immersive-toggle],button[data-immersive-choice]');
    const root = button?.closest('[data-immersive-root]');
    if (!root || !host?.contains(root)) return;
    const state = states.get(root.dataset.immersiveRoot);
    if (!state) return;
    if (button.hasAttribute('data-immersive-toggle')) state.unfolded = !state.unfolded;
    else state.choice = button.dataset.immersiveChoice;
    apply(root);
  }
  function dispose() { host?.removeEventListener('click', click); host = null; }
  return {
    mount(container) { dispose(); host = container; if (!host) return; host.querySelectorAll('[data-immersive-root]').forEach(apply); host.addEventListener('click', click); },
    dispose,
  };
}
