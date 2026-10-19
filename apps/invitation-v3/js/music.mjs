// Official visible YouTube player; no media extraction or autoplay.
let api;
function loadAPI(){
 if(window.YT?.Player)return Promise.resolve();
 if(api)return api;
 api=new Promise((resolve,reject)=>{
  const previous=window.onYouTubeIframeAPIReady;
  const timer=setTimeout(()=>{api=null;reject(Error('timeout'));},20000);
  window.onYouTubeIframeAPIReady=()=>{clearTimeout(timer);previous?.();resolve();};
  const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timer);api=null;script.remove();reject(Error('network'));};document.head.append(script);
 });return api;
}
export class InvitationMusic{
 constructor(config,onState){this.config=config;this.onState=onState;this.volume=config.volume;this.playing=false;this.pending=false;this.wantsPlay=false;}
 async initialize(){
  if(this.ready)return this.ready;
  this.ready=loadAPI().then(()=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('player-timeout')),20000);
   this.player=new window.YT.Player('youtube-player',{width:'100%',height:240,videoId:this.config.videoId,playerVars:{playsinline:1,controls:1,loop:1,playlist:this.config.videoId,origin:location.origin,rel:0},events:{
    onReady:()=>{clearTimeout(timer);this.player.setVolume(this.volume*100);resolve();},
    onStateChange:event=>{this.playing=event.data===1;this.onState(this.playing);},
    onAutoplayBlocked:()=>{this.wantsPlay=false;this.onState(false,'영상의 재생 버튼을 한 번 더 눌러 주세요.');},
    onError:()=>{clearTimeout(timer);this.onState(false,'음악을 연결하지 못했어요. YouTube에서 직접 들을 수 있어요.');reject(Error('youtube'));},
   }});
  })).catch(error=>{this.ready=null;throw error;});return this.ready;
 }
 async play(){
  if(this.pending)return;this.pending=true;this.wantsPlay=true;this.onState(false,'음악을 준비하고 있어요.');
  try{await this.initialize();if(this.wantsPlay&&!document.hidden)this.player.playVideo();}
  catch{this.onState(false,'YouTube 연결이 제한되어 있어요. 아래 원본 영상에서 들을 수 있어요.');}
  finally{this.pending=false;}
 }
 pause(){this.wantsPlay=false;this.player?.pauseVideo?.();this.playing=false;this.onState(false);}
 setVolume(value){this.volume=Math.max(0,Math.min(1,value));this.player?.setVolume?.(this.volume*100);}
}
