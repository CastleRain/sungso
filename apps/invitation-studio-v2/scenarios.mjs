import {experienceDefaults,normalizeExperience} from './js/experience-config.mjs';
import {normalizeContentDraft,resolveDraftPhotos} from './js/content-draft.mjs';
import {normalizeComposition} from './js/composition.mjs';

// Editorial proposals use only the couple's confirmed history. They are drafts,
// never seeded into the published invitation or the real account/guestbook APIs.
export const SCENARIOS=[
  {id:'rose-cover',section:'top',title:'로즈 꽃잎과 손글씨',detail:'사진 위로 작은 꽃잎이 흐르고, 원래 손글씨와 음악이 이어져요.',values:{petals:'rose',coverMedia:'photo',audioStyle:'vinyl'}},
  {id:'ivory-cover',section:'top',title:'화이트 꽃잎과 여백',detail:'아이보리 꽃잎과 작은 음악 버튼으로 가볍게 시작해요.',values:{petals:'ivory',coverMedia:'photo',audioStyle:'minimal'}},
  {id:'story-perspective',section:'our-story',title:'서로의 시선으로',detail:'성우 · 소희 · 함께 탭을 눌러 같은 시작을 다른 문장으로 읽어요.',values:{storyMode:'perspective',groomStory:'소개로 만난 어느 날, 커피숍에서 우리의 이야기가 시작됐어요.\n\n소희가 자신의 카페를 꾸려가는 모습을 보면서 생각했어요. 이 사람과는 뭘 해도 되겠다고.',brideStory:'커피숍에서 시작된 우리.\n\n이제는 각자의 하루를 넘어, 함께할 일상을 만들어 가려고 해요.'}},
  {id:'story-chat',section:'our-story',title:'한 문장씩 이어지는 대화',detail:'다음 문장을 누르면 두 사람의 메시지가 이어져요. 대사는 수정용 제안이에요.',values:{storyMode:'chat'},lists:{dialogue:[{side:'groom',text:'우리, 커피숍에서 처음 만났지.'},{side:'bride',text:'이제 함께할 하루가 더 많아지겠네.'},{side:'groom',text:'네가 카페를 꾸려가는 모습을 보면서, 너와는 뭐든 해볼 수 있겠다고 생각했어.'},{side:'bride',text:'우리답게, 하나씩 함께해 보자.'}]}},
  {id:'profile-interview',section:'couple-profile',title:'사진과 함께 넘기는 인터뷰',detail:'두 질문을 이전·다음으로 넘기며 읽는 완성 예시예요.',composition:{profileStyle:'interview'},lists:{profiles:[{side:'groom',question:'결혼을 결심한 순간은?',answer:'소희가 카페를 운영하는 모습을 볼 때요. 이 사람과는 뭘 해도 되겠다고 느꼈어요.',photo:'$photo1'},{side:'bride',question:'우리의 이야기는 어디서 시작됐나요?',answer:'소개로 만난 커피숍에서요. 이제 함께할 일상을 기다리고 있어요.',photo:'$photo2'}]}},
  {id:'quiz-first',section:'wedding-quiz',title:'첫 만남을 맞혀 봐요',detail:'보기 선택 → 정답과 사진 공개까지 이어지는 한 문제예요.',composition:{quizStyle:'cards'},lists:{quizzes:[{question:'성우와 소희가 처음 만난 곳은?',a:'커피숍',b:'영화관',answer:'a',story:'소개로 만난 커피숍. 그날부터 우리의 이야기가 시작됐어요.',photo:'$photo1'}]}},
  {id:'busan-stroll',section:'busan-guide',title:'예식 후 부산 한 장면',detail:'산책 후보 두 곳과 지도 연결을 준비했어요. 두 사람이 좋아하는 곳으로 바꿔 주세요.',composition:{busanStyle:'postcards'},lists:{places:[{name:'광안리해수욕장',description:'부산에서 바다를 보고 싶다면, 예식 전후 일정에 맞춰 들러 보세요.',url:'https://map.naver.com/p/search/%EA%B4%91%EC%95%88%EB%A6%AC%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5'},{name:'부산시민공원',description:'잠깐의 산책을 더하고 싶은 분들을 위한 장소예요.',url:'https://map.naver.com/p/search/%EB%B6%80%EC%82%B0%EC%8B%9C%EB%AF%BC%EA%B3%B5%EC%9B%90'}]}},
  {id:'playlist-ours',section:'playlist',title:'우리의 배경음악',detail:'Ever After, Us와 연결해 둔 음원 링크를 보여줘요. 미리 듣기는 직접 준비한 파일을 선택하면 생겨요.',composition:{playlistStyle:'records'},lists:{playlist:[{title:'Ever After, Us',artist:'우리의 청첩장 배경음악',url:'https://www.youtube.com/watch?v=yhAJdMuR55c',photo:'$photo1'}]}},
  {id:'photos-two',section:'time-machine',title:'두 순간을 겹쳐 보기',detail:'현재 사진 두 장으로 경계 이동을 체험해요. 어린 시절 사진을 넣어도 좋아요.',composition:{portraitStyle:'slider'},values:{beforePhoto:'$photo1',afterPhoto:'$photo2'}},
  {id:'gallery-sequence',section:'gallery',title:'사진이 이어지는 입구',detail:'사진 프레임이 바뀌며 하나의 사진첩으로 이어져요.',composition:{album:'film'},values:{bridge:'sequence'}},
  {id:'date-timeline',section:'wedding-day',title:'예식 시각을 한눈에',detail:'확정한 예식 시각만 시간표에 넣어요. 식사·주차 시간은 임의로 채우지 않아요.',lists:{timeline:[{time:'15:30',title:'성우 · 소희의 결혼식',detail:'부산 목화웨딩홀 · 15층 벨리스홀'}]}},
  {id:'arrival-floor',section:'location',title:'홀까지 이어지는 안내',detail:'펼쳐지는 약도와 확인된 15층 홀 안내를 함께 보여줘요.',composition:{arrival:'unfold'},lists:{floors:[{floor:'15F',name:'벨리스홀',detail:'성우 · 소희의 예식'}]}},
  {id:'letter-stamp',section:'guestbook',title:'스탬프가 있는 축하 편지',detail:'편지를 열고 종이 색·스탬프를 고를 수 있어요. 메시지를 자동 작성하지 않아요.',composition:{wishes:'envelope'},values:{messageStyle:'stamp',reactions:true}},
  {id:'closing-petals',section:'closing',title:'꽃잎으로 전하는 축하',detail:'하객이 축하 버튼을 누르면 꽃잎이 피어올라요.',values:{celebration:true}},
];
export function scenariosFor(section){return SCENARIOS.filter(s=>s.section===section);}
export function applyScenario(snapshot,id,photos=[]){
  const recipe=SCENARIOS.find(s=>s.id===id);if(!recipe)throw Error('Unknown scenario');
  const draft=normalizeContentDraft(snapshot.content),e=experienceDefaults(draft.experience),available=resolveDraftPhotos(draft,photos);
  const resolve=v=>v==='$photo1'?available[0]?.id||'':v==='$photo2'?(available[1]||available[0])?.id||'':v;
  // Only empty copy is filled. Selecting a scenario intentionally switches its
  // presentation, never erases an existing story, photo selection, or list.
  for(const [key,value]of Object.entries(recipe.values||{}))if(['petals','storyMode','coverMedia','audioStyle','bridge','messageStyle','celebration','reactions'].includes(key)||!e.values[key])e.values[key]=resolve(value);
  for(const [key,rows]of Object.entries(recipe.lists||{}))if(!e.lists[key]?.length)e.lists[key]=rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,resolve(v)])));
  return {composition:normalizeComposition({...snapshot.composition,...recipe.composition}),content:normalizeContentDraft({...draft,experience:normalizeExperience(e)})};
}
