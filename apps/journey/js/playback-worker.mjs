import { selectJourneyScenes, prepareJourneyScene } from '../../../shared/journey/playback-core.mjs';

export function handleJourneyPlaybackMessage(data) {
  try {
    let result;
    if (data?.type === 'select') result = selectJourneyScenes(data.days, data.options);
    else if (data?.type === 'prepare') result = prepareJourneyScene(data.scene, data.day);
    else throw Error('지원하지 않는 재생 준비 요청입니다.');
    return { requestId: data?.requestId, ok: true, result };
  } catch (error) {
    return { requestId: data?.requestId, ok: false, error: error.message || '재생할 기록을 준비하지 못했어요.', ...(error.code ? { code: error.code } : {}) };
  }
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  self.onmessage = ({ data }) => self.postMessage(handleJourneyPlaybackMessage(data));
}
