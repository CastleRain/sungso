// Small dependency-injected scope for SDK callbacks and multi-step requests.
// The scope retires with the page even before the auth state notification fires.
export function createMemberWork({ getMember, registerPrivateCleanup }) {
  let active = true;
  const stops = new Set();
  function capture() {
    const member = getMember();
    if (!active || !member) throw new Error('로그인이 필요해요.');
    const current = () => active && getMember()?.uid === member.uid && getMember()?.role === member.role;
    return { member, current, assert() { if (!current()) throw new Error('로그인 계정이 바뀌었어요.'); } };
  }
  function observe(onSnapshot, reference, ...args) {
    const options = typeof args[0] === 'function' ? null : args.shift();
    const [next, error] = args;
    const request = capture();
    let subscribed = true;
    const callbacks = [snapshot => { if (subscribed && request.current()) next(snapshot); }, failure => { if (subscribed && request.current()) error?.(failure); }];
    const unsubscribe = options ? onSnapshot(reference, options, ...callbacks) : onSnapshot(reference, ...callbacks);
    const stop = () => { if (!subscribed) return; subscribed = false; unsubscribe(); stops.delete(stop); };
    stops.add(stop);
    return stop;
  }
  registerPrivateCleanup(() => { active = false; for (const stop of [...stops]) stop(); });
  return { capture, observe };
}
