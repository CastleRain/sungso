export const definition = {
  id: 'table',
  title: '우리 식탁',
  kicker: '같이 고르고, 같이 먹는 하루',
  description: '살 것부터 둘만의 요리까지, 오늘의 식탁을 준비해요.',
  tabs: [
    {
      id: 'shopping', kind: 'shopping', title: '장보기',
      description: '필요한 것을 적고, 장바구니에 담으면 체크해요.',
      emptyTitle: '오늘 살 것을 하나 적어볼까요?',
      emptyDescription: '식재료도 생활용품도 좋아요. 산 것은 체크하고 다시 살 때 되돌릴 수 있어요.',
      fields: [
        { name: 'name', label: '살 것', type: 'text', required: true, placeholder: '예: 우유' },
        { name: 'quantity', label: '수량', type: 'text', placeholder: '예: 1' },
        { name: 'unit', label: '단위', type: 'text', placeholder: '예: 팩, 봉지, 개' },
        { name: 'category', label: '분류', type: 'select', options: [
          { value: 'ingredients', label: '식재료' },
          { value: 'daily', label: '생활용품' },
          { value: 'other', label: '그 밖의 것' },
        ] },
        { name: 'memo', label: '메모', type: 'textarea', placeholder: '용량이나 좋아하는 제품을 적어두세요.' },
      ],
    },
    {
      id: 'food', kind: 'food', title: '뭐 먹지',
      description: '집에서 해 먹을까, 좋아하는 곳에 갈까? 담아둔 후보에서 골라봐요.',
      emptyTitle: '우리의 먹고 싶은 목록을 만들어봐요.',
      emptyDescription: '레시피를 적거나 우리 발자국에 식당·카페를 저장하면 여기에서도 고를 수 있어요.',
      fields: [],
    },
    {
      id: 'recipes', kind: 'recipes', title: '둘만의 레시피',
      description: '맛있었던 방법과 다음번에 바꿔볼 작은 팁을 남겨요.',
      emptyTitle: '다시 만들고 싶은 요리가 있나요?',
      emptyDescription: '재료와 순서를 적어두면 다음 요리가 쉬워져요. 필요한 재료는 장보기로 옮길 수 있어요.',
      fields: [
        { name: 'title', label: '요리 이름', type: 'text', required: true, placeholder: '예: 주말 토마토 파스타' },
        { name: 'ingredients', label: '재료 · 한 줄에 하나씩', type: 'lines', required: true, placeholder: '파스타 면 2인분\n토마토 2개\n올리브유 2큰술' },
        { name: 'steps', label: '만드는 순서', type: 'textarea', placeholder: '우리에게 편한 순서대로 적어주세요.' },
        { name: 'memo', label: '우리의 팁', type: 'textarea', placeholder: '좋아하는 간, 다음에 바꾸고 싶은 것…' },
      ],
    },
  ],
};
