export const definition = {
  id: 'footprints',
  title: '우리 발자국',
  kicker: '함께 간 곳, 또 가고 싶은 곳',
  description: '맛있는 한 끼와 작은 데이트를 하나씩 모아둬요.',
  tabs: [
    {
      id: 'places', kind: 'places', title: '우리의 장소',
      description: '식당부터 산책길까지, 가고 싶은 곳을 담아두세요.',
      emptyTitle: '함께 가고 싶은 곳이 있나요?',
      emptyDescription: '장소 이름과 지역을 적어보세요. 네이버 지도에서 복사한 장소 링크도 함께 둘 수 있어요.',
      fields: [
        { name: 'name', label: '장소 이름', type: 'text', required: true, placeholder: '식당, 카페, 산책길 이름' },
        { name: 'region', label: '지역', type: 'text', placeholder: '예: 서울 성동구, 제주 서귀포시' },
        { name: 'category', label: '어떤 곳인가요?', type: 'select', options: [
          { value: 'restaurant', label: '식당' },
          { value: 'cafe', label: '카페' },
          { value: 'date', label: '데이트 장소' },
          { value: 'other', label: '그 밖의 곳' },
        ] },
        { name: 'address', label: '주소', type: 'text', placeholder: '알고 있다면 적어주세요.' },
        { name: 'mapUrl', label: '지도 링크', type: 'url', placeholder: '장소의 공유 링크를 붙여넣으세요.' },
        { name: 'wish', label: '가고 싶은 곳으로 표시', type: 'checkbox' },
        { name: 'memo', label: '메모', type: 'textarea', placeholder: '먹고 싶은 메뉴나 기억해둘 점' },
      ],
    },
    {
      id: 'visits', kind: 'visits', title: '방문 · 데이트',
      description: '어디에서 어떤 하루를 보냈는지 남겨봐요.',
      emptyTitle: '둘의 첫 발자국을 남겨볼까요?',
      emptyDescription: '저장한 장소를 고르고 다녀온 날을 적어주세요. 같은 곳에 다시 간 날도 따로 기록할 수 있어요.',
      fields: [
        { name: 'placeId', label: '다녀온 곳', type: 'place', required: true },
        { name: 'date', label: '다녀온 날', type: 'date', required: true },
        { name: 'memo', label: '그날의 이야기', type: 'textarea', placeholder: '맛있었던 것, 웃었던 순간, 다음에 하고 싶은 것…' },
      ],
    },
    {
      id: 'albums', kind: 'albums', title: '사진첩',
      description: '사진은 익숙한 곳에 보관하고, 그날의 앨범을 여기에서 열어요.',
      emptyTitle: '우리의 앨범을 연결해보세요.',
      emptyDescription: 'Google Photos나 Drive의 앨범 링크를 담아두세요. 사진은 원래 보관한 곳에서 열려요.',
      fields: [
        { name: 'title', label: '앨범 이름', type: 'text', required: true, placeholder: '예: 함께 걸었던 오후' },
        { name: 'url', label: '앨범 링크', type: 'url', required: true, placeholder: 'Google Photos 또는 Drive 보기 링크' },
        { name: 'visitId', label: '함께 기억할 방문', type: 'visit' },
        { name: 'memo', label: '짧은 이야기', type: 'textarea', placeholder: '이 앨범에 어떤 순간들이 담겨 있나요?' },
      ],
    },
  ],
};
