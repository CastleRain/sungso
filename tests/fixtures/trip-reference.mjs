// Entirely synthetic data. Production dates, prices and plans do not belong in fixtures.
import { hydrateTripReference } from '../../shared/travel/trip-data.mjs';
export const testReference = {
  HOTELS: ['hotel-a','hotel-b','hotel-c'].map(id => ({id,name:id,query:id})),
  PLACES: { airport:{name:'테스트 공항',q:'Example Airport'},port:{name:'테스트 항구',q:'Example Port'},merlion:{name:'테스트 장소',q:'Example Place'},hotel:{name:'테스트 호텔'} },
  TRIP_DAYS: Array.from({length:11},(_,index)=>({id:`day-${index}`,date:`2035-06-${10+index}`,title:`테스트 날짜 ${index+1}`,focus:index===2?'port':'airport',route:['airport','hotel'],events:[{time:'09:00',title:'테스트 일정',text:'인공 자료',place:'airport'}]})),
  DECISIONS: ['hotels','cruise','flights','activities','resort','transfers','documents','insurance','connectivity','homebound'].map(id=>({id,title:`테스트 ${id}`,status:['resort','transfers','documents','insurance','connectivity','homebound'].includes(id)?'pending':'candidate'})),
  TRIP_SETTINGS: {weddingDate:'2035-06-09'}, TRAVEL_LOCATIONS: {}, PREPARATIONS: [], READINESS_SOURCES: [], BUDGET_QUOTES: {}
};
hydrateTripReference(testReference);
