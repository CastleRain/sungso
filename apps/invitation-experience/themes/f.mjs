import { mountExperience } from '../js/experience.mjs';

export const theme = Object.freeze({
  id: 'f', name: '장면이 이어지는 초대', english: 'Flow',
  description: '날짜와 사진, 도착 안내가 스크롤을 따라 하나의 장면으로 이어집니다.',
});
export const mountTheme = options => mountExperience({ ...options, variant: 'f' });
