/** Explanations concern public identity matching, never absence of facilities. */
export function officialComplexMatchNote(info) {
  if (!info || info.complexMatchConfirmed) return '';
  const messages = {
    'combined-complex': '여러 단지가 합쳐진 공식 자료여서 이 단지만의 주차·승강기로 사용하지 않았습니다.',
    'household-mismatch': '공식 자료와 세대수가 달라 같은 범위의 단지인지 확인이 필요합니다.',
    'address-mismatch': '비슷한 이름의 공식 자료가 있지만 주소가 일치하지 않아 연결을 보류했습니다.',
    'name-mismatch': '공식 목록과 단지명 대조가 되지 않았습니다. 시설이 없다는 뜻은 아닙니다.',
    'insufficient-identity': '단지를 대조할 주소·식별정보가 부족합니다. 시설이 없다는 뜻은 아닙니다.',
  };
  return messages[info.matchIssue] || (['unmatched', 'ambiguous'].includes(info.status)
    ? '공식 단지명·주소 대조가 필요합니다. 주차·난방·승강기가 없다는 뜻은 아닙니다.' : '');
}
