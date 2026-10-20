// The real counter value stays separate from the temporary visual digit layers.
export function settleDigits(counter) {
  counter.getAnimations({subtree:true}).forEach(animation=>animation.cancel());
  counter.querySelectorAll('.digit-outgoing').forEach(node=>node.remove());
}
export function renderNumber(field,value,{animate=false}={}) {
  const previous=field.dataset.value;
  if(previous===value)return;
  field.dataset.value=value;
  if(!previous||previous.length!==value.length) {
    field.replaceChildren(...[...value].map(digit=>{
      const window=document.createElement('span'),current=document.createElement('span');
      window.className='digit-window';current.className='digit-current';current.textContent=digit;window.append(current);return window;
    }));return;
  }
  [...value].forEach((digit,index)=>{
    if(previous[index]===digit)return;
    const window=field.children[index];
    window.getAnimations({subtree:true}).forEach(animation=>animation.cancel());
    window.replaceChildren();
    const current=document.createElement('span');current.className='digit-current';current.textContent=digit;window.append(current);
    if(!animate)return;
    const outgoing=document.createElement('span');outgoing.className='digit-outgoing';outgoing.textContent=previous[index];window.append(outgoing);
    const options={duration:620,delay:(value.length-index-1)*35,easing:'cubic-bezier(.22,.7,.2,1)'};
    current.animate([{transform:'translateY(90%)',opacity:0},{transform:'translateY(0)',opacity:1}],options);
    const exit=outgoing.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(-90%)',opacity:0}],options);
    exit.onfinish=exit.oncancel=()=>outgoing.remove();
  });
}
