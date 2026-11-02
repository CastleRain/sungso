export const SURFACE_KEY = 'sungso.ui.surface.v1';
export const normalizeSurface = value => value === 'glass' ? 'glass' : 'solid';
export const GROUPS = Object.freeze([
  {id:'money',title:'돈',icon:'wallet'}, {id:'home',title:'집',icon:'house'},
  {id:'travel',title:'여행',icon:'plane'}, {id:'wedding',title:'결혼',icon:'heart'},
  {id:'life',title:'일상·기록',icon:'calendar-days'}, {id:'work',title:'작업실',icon:'coffee'}
]);
export const APPS = Object.freeze([
  {id:'hub',title:'우리 공간',short:'우리 홈',description:'함께 챙길 일과 이어서 볼 도구를 한곳에.',path:'',icon:'house',accent:'#35658a'},
  {id:'wecost',title:'WeCost',description:'우리 자금부터 결혼 준비, 집 계획까지.',path:'wecost/',group:'money',icon:'wallet',accent:'#7063bc'},
  {id:'homehunt',title:'집 탐색',description:'조건에 맞는 집을 찾고, 직접 확인해요.',path:'homehunt/',group:'home',icon:'house',accent:'#2868b5'},
  {id:'homehunt-v2',title:'집 판단',description:'생활·자금·가격의 근거를 함께 살펴봐요.',path:'homehunt-v2/',group:'home',icon:'landmark',accent:'#2868b5'},
  {id:'travel',title:'여행 일정',description:'일정과 예약, 비용과 출발 준비를 함께.',path:'travel/',group:'travel',icon:'plane',accent:'#6d6aab'},
  {id:'honeymoon',title:'리조트 비교',description:'우리에게 맞는 신혼여행을 골라요.',path:'honeymoon/',group:'travel',icon:'palm-tree',accent:'#197d66'},
  {id:'wedding',title:'우리 결혼',description:'하객과 남은 준비를 차근차근.',path:'wedding/',group:'wedding',icon:'heart',accent:'#ae6389'},
  {id:'invitation',title:'청첩장 선택',description:'우리다운 초대장을 함께 골라요.',path:'invitation/',group:'wedding',icon:'mail',accent:'#9873ad'},
  {id:'dates',title:'우리 일정',description:'기념일도, 소소한 약속도 함께 기억해요.',path:'dates/',group:'life',icon:'calendar-days',accent:'#bf5a8b'},
  {id:'table',title:'우리 식탁',description:'장보기부터 오늘의 한 끼까지.',path:'table/',group:'life',icon:'utensils',accent:'#64845c'},
  {id:'footprints',title:'장소·데이트',description:'가고 싶은 곳과 함께한 날을 기록해요.',path:'footprints/',group:'life',icon:'map-pin',accent:'#9270aa'},
  {id:'journey',title:'이동·사진 기록',description:'서로에게 향한 길, 함께 남긴 하루.',path:'journey/',group:'life',icon:'route',accent:'#3d839d'},
  {id:'sohee-workspace',title:'소희의 작업실',description:'작은 시도가 쌓이는 곳.',path:'sohee/workspace/',group:'work',icon:'briefcase-business',accent:'#527ca0'},
  {id:'sohee-sales',title:'양정커피',description:'매출을 읽고, 오늘의 준비를 결정해요.',path:'sohee/sales/',group:'work',icon:'coffee',accent:'#527ca0'}
]);
export function appForPath(pathname) {
  const path = String(pathname).replace(/^\/sungso(?:\/|$)/,'/').replace(/^\//,'');
  if (!path || path === 'index.html') return APPS[0];
  if (path === 'sohee/' || path === 'sohee/index.html') return APPS.find(app => app.id === 'sohee-workspace');
  return APPS.find(app => app.path && (path === app.path.slice(0,-1) || path.startsWith(app.path))) || null;
}
export function readSurface(storage) { try { return normalizeSurface(storage.getItem(SURFACE_KEY)); } catch { return 'solid'; } }
export function writeSurface(storage, value) { const surface=normalizeSurface(value); try { storage.setItem(SURFACE_KEY,surface); return true; } catch { return false; } }
export function searchApps(query='',group='all') {
  const needle=query.normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
  return APPS.filter(app => (group==='all'||app.group===group) && (!needle || [app.title,app.short,app.description,app.id].join(' ').toLocaleLowerCase('ko-KR').includes(needle)));
}
export const NAV_SELECTORS = Object.freeze({
  hub:'[data-home-view]', wecost:'#app-nav .nav-item[data-tab]',
  homehunt:'.portal-nav [data-view-target]', 'homehunt-v2':'#navigation [data-view-link]',
  honeymoon:'.tab-nav .tab-btn[data-tab]', travel:'[data-travel-view-link]',
  dates:'.view-tabs [role="tab"]', invitation:'nav[aria-label="청첩장 화면"] a',
  table:'.life-tabs [role="tab"]', footprints:'.life-tabs [role="tab"]', wedding:'.life-tabs [role="tab"]',
  'sohee-sales':'#sales-navigation a'
});
export const AUXILIARY_LABELS = /모델 검증|사용 안내|연결 상태|변경 기록|토너먼트|PDF/;
