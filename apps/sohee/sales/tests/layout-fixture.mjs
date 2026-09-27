// Synthetic density stress only: never included in the production entrypoint.
// Split each original row into four names while preserving total amount/quantity.
export function layoutFixture(data){
 const variants=[' · 가상 시즌 한정 디저트 컬렉션',' · 가상 포장 전용 구성',' · 가상 특별 주문 메뉴',' · 가상 기본 구성'];
 const split=rows=>rows.flatMap(row=>variants.map((suffix,index)=>({...row,menu_original:row.menu_original+suffix,menu_group:row.menu_group+suffix,amount:index===3?row.amount-Math.trunc(row.amount/4)*3:Math.trunc(row.amount/4),quantity:index===3?row.quantity-Math.trunc(row.quantity/4)*3:Math.trunc(row.quantity/4)})));
 return {...data,menu_monthly:split(data.menu_monthly),menu_toss:split(data.menu_toss)};
}
