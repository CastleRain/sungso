const local=['localhost','127.0.0.1'].includes(location.hostname);
const endpoint=(local?'http://127.0.0.1:8025':'https://sungso-homehunt-api.onrender.com')+'/api/invitation/v5/rsvp';
const key='sungso_invitation_v5_rsvp',$=s=>document.querySelector(s),form=$('#rsvp-form');let proof,saved;
try{const value=JSON.parse(localStorage.getItem(key)||'null');if(/^[a-f0-9-]{36}$/.test(value?.id||'')&&/^[a-f0-9]{64}$/.test(value?.editToken||'')){proof={id:value.id,editToken:value.editToken};saved=value.saved;}}catch{}
function remember(){try{localStorage.setItem(key,JSON.stringify({...proof,saved}));}catch{}}
function reflect(){if(saved){form.elements.side.value=saved.side;form.elements.attendance.value=saved.attendance;form.elements.name.value=saved.name;form.elements.phoneLast4.value=saved.phoneLast4;$('#rsvp-saved').hidden=false;$('#rsvp-saved').textContent='참석 응답을 전달했어요. 같은 기기에서 수정할 수 있어요.';}}
reflect();
form.addEventListener('submit',async event=>{event.preventDefault();const button=$('#rsvp-submit'),status=$('#rsvp-status');if(button.disabled)return;
 if(!proof){proof={id:crypto.randomUUID(),editToken:Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')};remember();}
 const fields={side:form.elements.side.value,attendance:form.elements.attendance.value,name:form.elements.name.value.trim(),phoneLast4:form.elements.phoneLast4.value.trim()},body={...proof,...fields,consent:form.elements.consent.checked};
 button.disabled=true;status.textContent='참석 응답을 전달하고 있어요.';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
 try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,credentials:'omit'});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'다시 시도해 주세요.');saved=fields;remember();reflect();status.textContent='참석 응답이 전달되었어요. 감사합니다!';}
 catch(error){status.textContent=error.name==='AbortError'?'연결에 시간이 걸리고 있어요. 작성한 내용은 그대로 있으니 다시 시도해 주세요.':error.message==='Failed to fetch'?'연결하지 못했어요. 잠시 후 다시 시도해 주세요.':error.message;}
 finally{clearTimeout(timer);button.disabled=false;}
});
