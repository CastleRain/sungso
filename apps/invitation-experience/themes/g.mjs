import { mountExperience } from '../js/experience.mjs';

export const theme = Object.freeze({
  id: 'g', name: '가볍게 펼쳐지는 초대', english: 'Air',
  description: '밝은 여백 위에서 필요한 정보가 가볍게 펼쳐지는 초대입니다.',
});
export const mountTheme = options => mountExperience({ ...options, variant: 'g' });
