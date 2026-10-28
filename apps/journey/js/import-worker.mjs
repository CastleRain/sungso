import { importTimeline } from '../../../shared/journey/import.mjs';
self.onmessage=async({data})=>{try{const result=await importTimeline(data.text,data.options);self.postMessage({ok:true,result});}catch(error){self.postMessage({ok:false,error:error.message||'타임라인을 읽지 못했어요.'});}};
