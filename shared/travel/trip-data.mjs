// Shared March 2027 plan. Candidate prices checked 2026-09-12; no booking automation.
export const HOTELS = [
  {
    "id": "park",
    "name": "파크로열 컬렉션 마리나베이",
    "area": "마리나센터 · 우선 추천",
    "room": "Urban Deluxe · 31~33㎡",
    "query": "PARKROYAL COLLECTION Marina Bay Singapore",
    "reason": "베이 산책과 쇼핑몰 식사, 호텔에서의 휴식을 함께 챙기기 좋은 위치.",
    "caution": "기본 객실의 샌즈 정면 전망은 보장되지 않아요.",
    "url": "https://www.panpacific.com/en/hotels-and-resorts/pr-collection-marina-bay/rooms.html"
  },
  {
    "id": "fair",
    "name": "페어몬트 싱가포르",
    "area": "시티홀 · 넓은 객실",
    "room": "Fairmont King · 약 45㎡",
    "query": "Fairmont Singapore",
    "reason": "시티홀 교통과 식사 편의가 좋아요. 캐리어를 펼치고 짐을 정리할 공간도 넉넉해요.",
    "caution": "기본 객실과 베이 전망 객실의 요금을 구분해요.",
    "url": "https://www.fairmont.com/en/hotels/singapore/fairmont-singapore.html"
  },
  {
    "id": "carl",
    "name": "칼튼 호텔 싱가포르",
    "area": "시티홀 · 실용적인 후보",
    "room": "Deluxe · 약 30㎡",
    "query": "Carlton Hotel Singapore 76 Bras Basah Road",
    "reason": "시티홀 위치를 챙기면서 숙박비를 비교하기 좋은 후보. 관광 중심 일정에 잘 맞아요.",
    "caution": "Carlton City와 다른 호텔이에요. 공사 종료 여부도 확인해요.",
    "url": "https://www.carltonhotel.sg/rooms-suites/deluxe-room"
  },
  {
    "id": "mbs",
    "name": "마리나베이 샌즈",
    "area": "베이프런트 · 인피니티풀",
    "room": "객실별 요금 비교 필요",
    "query": "Marina Bay Sands Singapore",
    "reason": "인피니티풀을 꼭 경험하고 싶다면. 3/11 오후 관광 일부를 호텔 시간으로 바꾸면 좋아요.",
    "caution": "3/12 이른 출발로 아침 시설 이용은 어려워요.",
    "url": "https://www.marinabaysands.com/booking.html"
  }
];

export const PLACES = {
  "airport": {
    "name": "창이공항",
    "q": "Changi Airport Singapore"
  },
  "hotel": {
    "name": "선택한 호텔"
  },
  "port": {
    "name": "크루즈 항구",
    "q": "Marina Bay Cruise Centre Singapore"
  },
  "merlion": {
    "name": "머라이언",
    "q": "Merlion Park Singapore"
  },
  "sands": {
    "name": "샌즈·야경",
    "q": "Marina Bay Sands Event Plaza Singapore"
  },
  "gardens": {
    "name": "가든스",
    "q": "Gardens by the Bay Singapore"
  },
  "resort": {
    "name": "아나네아",
    "q": "ananea Madivaru Maldives"
  }
};

export const TRIP_DAYS = [
  {
    "id": "arrival",
    "date": "2027-03-07",
    "label": "싱가포르 도착",
    "title": "도시의 첫 야경",
    "description": "08:50 인천 출발 → 14:25 싱가포르 도착. 호텔에 짐을 풀고 가볍게 걷는 첫날.",
    "focus": "airport",
    "route": [
      "airport",
      "hotel",
      "merlion",
      "sands"
    ],
    "events": [
      {
        "time": "14:25",
        "title": "창이공항 도착",
        "text": "입국과 수하물 수령 시간을 넉넉하게 잡아요.",
        "place": "airport"
      },
      {
        "time": "16:00~16:45 예상",
        "title": "호텔 체크인·잠깐 휴식",
        "text": "공항에서 택시/Grab으로 이동. 교통과 입국 상황에 따라 달라져요.",
        "place": "hotel"
      },
      {
        "time": "17:30",
        "title": "머라이언·베이 산책",
        "text": "에스플러네이드 주변부터 저녁 풍경을 즐겨요.",
        "place": "merlion"
      },
      {
        "time": "18:30",
        "title": "저녁 식사",
        "text": "당일 컨디션과 산책 동선에 맞춰 정해요."
      },
      {
        "time": "20:00 후보",
        "title": "스펙트라 야경",
        "text": "샌즈 Event Plaza 공연. 21시 전후 호텔로 돌아와요.",
        "place": "sands"
      }
    ],
    "note": "공연 시간은 현재 안내 기준이며 2027년 일정 재확인이 필요해요. 비행 지연이나 피로가 있으면 저녁과 짧은 산책만 해도 좋아요."
  },
  {
    "id": "board",
    "date": "2027-03-08",
    "label": "크루즈 승선",
    "title": "바다 위 디즈니로",
    "description": "싱가포르 호텔 체크아웃. 오늘부터 3박은 디즈니 어드벤처에서 보내요.",
    "focus": "port",
    "route": [
      "hotel",
      "port"
    ],
    "events": [
      {
        "time": "08:00~09:00",
        "title": "아침 식사·짐 정리",
        "text": "호텔 조식이나 근처에서 가볍게 아침을 먹어요.",
        "place": "hotel"
      },
      {
        "time": "지정 시간에 맞춰",
        "title": "호텔 → 크루즈 항구",
        "text": "차량 이동에 배차·혼잡 여유를 더해 출발해요.",
        "place": "port"
      },
      {
        "time": "Port Arrival Time",
        "title": "입항 터미널 도착·승선 수속",
        "text": "예약 후 배정되는 도착 시간이 기준이에요."
      },
      {
        "time": "승선 후",
        "title": "객실·선내 둘러보기",
        "text": "식사와 공연은 실제 배정 시간에 맞춰요."
      }
    ],
    "note": "목적지는 Marina Bay Cruise Centre Singapore. HarbourFront와 혼동하지 않기. 항구에 너무 일찍 도착하면 대기할 수 없을 수 있어요."
  },
  {
    "id": "sea-1",
    "date": "2027-03-09",
    "label": "디즈니 2일",
    "title": "오늘은 배가 여행지",
    "description": "쇼와 식사, 놀이시설을 즐기는 이틀. 빈 시간도 남겨두기로 해요.",
    "focus": "port",
    "route": null,
    "events": [
      {
        "time": "오전",
        "title": "느긋한 아침·선내 탐험",
        "text": "당일 프로그램을 보며 하고 싶은 활동을 골라요."
      },
      {
        "time": "오후",
        "title": "놀이시설·수영장·휴식",
        "text": "운영·예약 조건은 선내 안내 기준이에요."
      },
      {
        "time": "저녁",
        "title": "배정된 식사와 공연",
        "text": "실제 식사·공연 시간표 확인 후 순서를 정해요."
      }
    ],
    "note": "해상 항해 일정이며 별도 기항지 관광은 넣지 않았어요. 지도에는 출발·도착 항구를 표시해요."
  },
  {
    "id": "sea-2",
    "date": "2027-03-10",
    "label": "디즈니 2일",
    "title": "오늘은 배가 여행지",
    "description": "쇼와 식사, 놀이시설을 즐기는 이틀. 빈 시간도 남겨두기로 해요.",
    "focus": "port",
    "route": null,
    "events": [
      {
        "time": "오전",
        "title": "느긋한 아침·선내 탐험",
        "text": "당일 프로그램을 보며 하고 싶은 활동을 골라요."
      },
      {
        "time": "오후",
        "title": "놀이시설·수영장·휴식",
        "text": "운영·예약 조건은 선내 안내 기준이에요."
      },
      {
        "time": "저녁",
        "title": "배정된 식사와 공연",
        "text": "실제 식사·공연 시간표 확인 후 순서를 정해요."
      }
    ],
    "note": "해상 항해 일정이며 별도 기항지 관광은 넣지 않았어요. 지도에는 출발·도착 항구를 표시해요."
  },
  {
    "id": "back",
    "date": "2027-03-11",
    "label": "하선·가든스",
    "title": "다시 도시, 초록빛 저녁",
    "description": "하선 후 호텔에 짐을 맡기고 브런치. 오후에는 쉬었다가 가든스로 가요.",
    "focus": "gardens",
    "route": [
      "port",
      "hotel",
      "gardens",
      "hotel"
    ],
    "events": [
      {
        "time": "오전 · 하선 순서에 따라",
        "title": "하선·입국·짐 찾기",
        "text": "오전 시간 지정 관광 예약은 피하고 여유 있게.",
        "place": "port"
      },
      {
        "time": "10:00~11:00 목표",
        "title": "호텔 짐 보관·브런치",
        "text": "아직 객실 입실 전일 수 있어요. 시티홀 주변에서 쉬어가요.",
        "place": "hotel"
      },
      {
        "time": "15:00 전후",
        "title": "호텔 체크인·휴식",
        "text": "샤워하고 잠깐 쉬는 시간.",
        "place": "hotel"
      },
      {
        "time": "16:00~18:00",
        "title": "가든스 바이 더 베이",
        "text": "Cloud Forest 우선, Flower Dome은 체력과 티켓에 따라 추가.",
        "place": "gardens"
      },
      {
        "time": "18:00~19:00",
        "title": "저녁 식사",
        "text": "공연 전에 식사를 마쳐요."
      },
      {
        "time": "19:45 후보",
        "title": "Garden Rhapsody",
        "text": "관람 후 20:30~21:00 호텔 귀환·짐 정리.",
        "place": "gardens"
      }
    ],
    "note": "하선·조기 입실 시간은 확정이 아니에요. 가든스 2027년 휴장일·공연 시간 확인 필요. 샌즈 숙박 시 오후 관광 일부를 수영장으로 바꿔도 좋아요."
  },
  {
    "id": "maldives",
    "date": "2027-03-12",
    "label": "몰디브로",
    "title": "도시에서 섬으로",
    "description": "싱가포르 10:05 출발 → 몰디브 11:40 도착. 두 공항의 시간대가 달라요.",
    "focus": "airport",
    "route": [
      "hotel",
      "airport"
    ],
    "events": [
      {
        "time": "05:45~06:00",
        "title": "기상·출발 준비",
        "text": "아침은 공항에서 먹는 편이 편해요."
      },
      {
        "time": "06:20 전후 목표",
        "title": "호텔에서 출발",
        "text": "06:15쯤 체크아웃하고 차량에 탑승해요.",
        "place": "hotel"
      },
      {
        "time": "07:00 전후 목표",
        "title": "창이공항 도착·수속",
        "text": "항공사 권장 출발 3시간 전 도착 기준.",
        "place": "airport"
      },
      {
        "time": "10:05 → 11:40",
        "title": "싱가포르 → 몰디브",
        "text": "현재 검토 중인 항공편의 현지 시간."
      },
      {
        "time": "리조트 배정 시간",
        "title": "아나네아로 이동",
        "text": "입국 후 리조트 이동 안내에 따라 수상비행기를 타요.",
        "place": "resort"
      }
    ],
    "note": "비행편과 터미널, 리조트 이동 시간은 예약 확인서로 확정해야 해요. 이 날은 호텔 조식을 이용하기 어려울 수 있어요."
  },
  {
    "id": "island-1",
    "date": "2027-03-13",
    "label": "몰디브 휴식",
    "title": "아무것도 서두르지 않는 날",
    "description": "아나네아 마디바루에서 보내는 온전한 사흘.",
    "focus": "resort",
    "route": null,
    "events": [
      {
        "time": "아침",
        "title": "느긋한 식사",
        "text": "그날 날씨와 기분을 보고 하루를 정해요."
      },
      {
        "time": "낮",
        "title": "바다·수영·객실에서 쉬기",
        "text": "스노클링이나 액티비티는 예약한 식사·활동 플랜 확인 후 선택."
      },
      {
        "time": "저녁",
        "title": "해 질 무렵 산책·저녁 식사",
        "text": "리조트 레스토랑 예약 필요 여부 확인."
      }
    ],
    "note": "숙소는 예약 완료. 객실 종류와 포함 식사·액티비티를 확인한 뒤 필요한 예약만 더하면 돼요."
  },
  {
    "id": "island-2",
    "date": "2027-03-14",
    "label": "몰디브 휴식",
    "title": "아무것도 서두르지 않는 날",
    "description": "아나네아 마디바루에서 보내는 온전한 사흘.",
    "focus": "resort",
    "route": null,
    "events": [
      {
        "time": "아침",
        "title": "느긋한 식사",
        "text": "그날 날씨와 기분을 보고 하루를 정해요."
      },
      {
        "time": "낮",
        "title": "바다·수영·객실에서 쉬기",
        "text": "스노클링이나 액티비티는 예약한 식사·활동 플랜 확인 후 선택."
      },
      {
        "time": "저녁",
        "title": "해 질 무렵 산책·저녁 식사",
        "text": "리조트 레스토랑 예약 필요 여부 확인."
      }
    ],
    "note": "숙소는 예약 완료. 객실 종류와 포함 식사·액티비티를 확인한 뒤 필요한 예약만 더하면 돼요."
  },
  {
    "id": "island-3",
    "date": "2027-03-15",
    "label": "몰디브 휴식",
    "title": "아무것도 서두르지 않는 날",
    "description": "아나네아 마디바루에서 보내는 온전한 사흘.",
    "focus": "resort",
    "route": null,
    "events": [
      {
        "time": "아침",
        "title": "느긋한 식사",
        "text": "그날 날씨와 기분을 보고 하루를 정해요."
      },
      {
        "time": "낮",
        "title": "바다·수영·객실에서 쉬기",
        "text": "스노클링이나 액티비티는 예약한 식사·활동 플랜 확인 후 선택."
      },
      {
        "time": "저녁",
        "title": "해 질 무렵 산책·저녁 식사",
        "text": "리조트 레스토랑 예약 필요 여부 확인."
      }
    ],
    "note": "숙소는 예약 완료. 객실 종류와 포함 식사·액티비티를 확인한 뒤 필요한 예약만 더하면 돼요."
  },
  {
    "id": "home-1",
    "date": "2027-03-16",
    "label": "집으로",
    "title": "몰디브에서 싱가포르로",
    "description": "몰디브에서 낮 출발, 싱가포르에서 3시간 25분 환승 후 인천으로.",
    "focus": "airport",
    "route": null,
    "events": [
      {
        "time": "3/16 리조트 배정 시간",
        "title": "리조트 → 말레 공항",
        "text": "12:55 항공편에 맞춘 출발 시간을 리조트와 확인해요.",
        "place": "resort"
      },
      {
        "time": "3/16 12:55 → 20:45",
        "title": "몰디브 → 싱가포르",
        "text": "현재 항공 후보, 모두 현지 시간."
      },
      {
        "time": "3시간 25분",
        "title": "싱가포르 공항 환승",
        "text": "수하물 연결과 한 예약으로 발권되는지 확인 필요.",
        "place": "airport"
      }
    ],
    "note": "몰디브 출발 전에 리조트에서 점심까지 머물 수 있는 항공편은 아니에요. 마지막 날 리조트 이동 시간에 맞춰 준비해요."
  },
  {
    "id": "home-2",
    "date": "2027-03-17",
    "label": "집으로",
    "title": "우리 집으로",
    "description": "00:10 싱가포르 출발 → 07:25 인천 도착. 모두 현지 시간.",
    "focus": "airport",
    "route": null,
    "events": [
      {
        "time": "3/17 00:10 → 07:25",
        "title": "싱가포르 → 인천",
        "text": "싱가포르 호텔 숙박 없이 귀국하는 일정."
      }
    ],
    "note": "전날 몰디브에서 출발해 싱가포르에서 환승하는 항공 후보예요."
  }
];

export const DECISIONS = [
  {
    "id": "hotels",
    "title": "싱가포르 호텔 2박",
    "detail": "3/7과 3/11 각각 1박 · 후보를 고르고 예약하기",
    "href": "travel/#hotels",
    "status": "candidate"
  },
  {
    "id": "cruise",
    "title": "크루즈 객실·예약",
    "detail": "3/8 출발 3박 · 06B 베란다 객실 검토",
    "href": "travel/#cruise",
    "status": "candidate"
  },
  {
    "id": "flights",
    "title": "항공권 구매",
    "detail": "4구간·2인 약 320만 원 후보 · 연결 발권 확인",
    "href": "travel/#flights",
    "status": "candidate"
  },
  {
    "id": "activities",
    "title": "싱가포르 관광·식사",
    "detail": "3/7 야경 · 3/11 가든스 · 식당과 운영 시간 확인",
    "href": "travel/#activities",
    "status": "candidate"
  },
  {
    "id": "resort",
    "title": "아나네아 예약 세부 확인",
    "detail": "숙소 예약 완료 · 객실·숙박일·식사 플랜 확인",
    "href": "travel/#resort",
    "status": "pending"
  },
  {
    "id": "transfers",
    "title": "리조트↔공항 이동",
    "detail": "몰디브 3/12 도착·3/16 12:55 출발에 맞추기",
    "href": "travel/#transfers",
    "status": "pending"
  }
];
