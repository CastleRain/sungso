export const definition = {
  id: 'wedding',
  title: '우리 결혼',
  kicker: '소중한 사람들과 맞이할 하루',
  description: '초대할 분들과 남은 준비를 한곳에서 차근차근 정리해요.',
  tabs: [
    {
      id: 'guests', kind: 'guests', title: '하객노트',
      description: '초대할 분을 적고, 초대와 참석 소식을 확인해요.',
      emptyTitle: '함께하고 싶은 분들을 적어볼까요?',
      emptyDescription: '이름과 관계부터 시작해도 괜찮아요. 초대 여부와 참석 인원은 나중에 바꿀 수 있어요.',
      fields: [
        { name: 'name', label: '이름', type: 'text', required: true, placeholder: '초대할 분의 이름' },
        { name: 'side', label: '어느 쪽 지인인가요?', type: 'select', options: [
          { value: 'both', label: '함께 아는 분' },
          { value: 'sungwoo', label: '성우 쪽' },
          { value: 'sohee', label: '소희 쪽' },
        ] },
        { name: 'relation', label: '관계', type: 'text', placeholder: '예: 가족, 친구, 직장 동료' },
        { name: 'invitation', label: '초대', type: 'select', options: [
          { value: 'pending', label: '아직 전하기 전' },
          { value: 'sent', label: '초대했어요' },
        ] },
        { name: 'attendance', label: '참석', type: 'select', options: [
          { value: 'unknown', label: '아직 몰라요' },
          { value: 'yes', label: '참석해요' },
          { value: 'no', label: '함께하기 어려워요' },
        ] },
        { name: 'count', label: '동반인을 포함한 인원', type: 'number', required: true, placeholder: '1' },
        { name: 'memo', label: '메모', type: 'textarea', placeholder: '초대할 때 기억해둘 이야기' },
      ],
    },
    {
      id: 'tasks', kind: 'tasks', title: '준비 메모',
      description: '생각나는 준비를 적어두고, 마친 일은 체크해요.',
      emptyTitle: '함께 준비할 일을 하나 적어봐요.',
      emptyDescription: '크고 작은 일들을 기억해둘 수 있어요. 일정에 넣을 일은 기존 일정 앱에서 관리해요.',
      fields: [
        { name: 'title', label: '준비할 일', type: 'text', required: true, placeholder: '예: 함께 청첩장 디자인 고르기' },
        { name: 'memo', label: '메모', type: 'textarea', placeholder: '먼저 확인할 것, 함께 정할 것…' },
      ],
    },
  ],
  links: [
    { title: '청첩장', description: '우리에게 어울리는 디자인 고르기', href: '../invitation/' },
    { title: '결혼비용', description: '예산과 지금까지의 지출 보기', href: '../wecost/' },
    { title: '리조트 비교', description: '신혼여행 숙소와 견적 살펴보기', href: '../honeymoon/' },
    { title: '여행 일정', description: '여행 계획과 출발 준비 이어가기', href: '../travel/' },
    { title: '우리 일정', description: '함께 챙길 날을 달력에 남기기', href: '../dates/' },
  ],
};
