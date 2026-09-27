// Entirely synthetic cafe records. Never load the private archive in a build.
export function fixture() {
  const daily = [], menus = [], items = [], receipt = [];
  const names = ['예시 아메리카노', '예시 라떼', '예시 쿠키', '예시 마들렌 4구', '예시 신메뉴'];
  for (let m = 1; m <= 4; m++) {
    const month = `2026-${String(m).padStart(2,'0')}`, count = m===2?28:m===4?16:31;
    for (let day=1;day<=count;day++) {
      const date = `${month}-${String(day).padStart(2,'0')}`, weekday=(new Date(date+'T12:00:00').getDay()+6)%7;
      const source=m===1?'payhere':'toss', partial_day=m===4&&day===16;
      let amount=0;
      names.forEach((name,n)=>{const quantity=day%7===0?0:((day+n*3+m)%8+1), value=quantity*(n===3?12000:3000+n*500);amount+=value;
        menus.push({month,source,menu_original:name,menu_group:name,category:n>1?'디저트':'음료',quantity,amount:value});
        if(source==='toss'&&!partial_day)items.push({date,weekday,hour:9+(day+n)%9,menu_original:name,menu_group:name,quantity,amount:value});
      });
      daily.push({date,month,source,weekday,partial_day,record_day:amount>0,amount,payment_count:amount?10:0});
      if(!partial_day)receipt.push({source,month,weekday,hour:9+day%9,amount});
    }
  }
  const menu_monthly=[];for(const row of menus){let old=menu_monthly.find(v=>v.month===row.month&&v.menu_original===row.menu_original);if(!old){old={...row,quantity:0,amount:0};menu_monthly.push(old);}old.quantity+=row.quantity;old.amount+=row.amount;}
  const monthly=[...new Set(daily.map(v=>v.month))].map(month=>{const rows=daily.filter(v=>v.month===month),amount=rows.reduce((s,v)=>s+v.amount,0),record_days=rows.filter(v=>v.record_day).length;return{month,source:rows[0].source,amount,record_days,per_record_day:amount/record_days,partial:rows.some(v=>v.partial_day)};});
  const plans=[]; for(let weekday=0;weekday<6;weekday++)for(let n=2;n<5;n++)plans.push({menu:names[n],weekday,expected:n+0.7,hours:Array.from({length:24},(_,h)=>h>=9&&h<18?(n+0.7)/9:0),unit:n===3?'팩 (4개)':'개',sample_days:24,same_weekday_days:n===4?1:5,selling_days:20,history_min:1,history_max:8,status:n===4?'참고용':'준비 기준',start:'2026-03-01',end:'2026-04-15',first_observed:'2026-03-01',last_observed:'2026-04-15',recent_quantity:30});
  const current=daily.filter(v=>v.date>='2026-04-01'&&v.date<='2026-04-15'),previous=daily.filter(v=>v.date>='2026-03-01'&&v.date<='2026-03-15');
  const current_amount=current.reduce((s,v)=>s+v.amount,0), previous_amount=previous.reduce((s,v)=>s+v.amount,0);
  return {store:'양정커피 QA · 가상 자료',start:'2026-01-01',end:'2026-04-16',complete_through:'2026-04-15',generated_at:'2026-04-16',partial_dates:['2026-04-16'],total:daily.reduce((s,v)=>s+v.amount,0),daily,monthly,bulk:[2,3,4].map(m=>({date:`2026-0${m}-02`,order_key:`synthetic-${m}`,amount:120000})),menu_monthly,menu_toss:items,receipt_hour:receipt,files:[{file:'synthetic-example.xlsx',sha256:'a'.repeat(64),start:'2026-01-01',end:'2026-01-31'}],checks:[],forecast:{cutoff:'2026-04-15',window_days:56,plans,metrics:[{menu:'전체',mae:2.4,baseline_mae:1.8,wape:61,n:40},{menu:names[2],mae:2.1,baseline_mae:1.7,wape:55,n:20}],holdout_start:'2026-03-19',holdout_end:'2026-04-15'},existing:{monthly_large_order_sensitivity:monthly.filter(v=>v.source==='toss').map(v=>({month:v.month,all_sales:v.amount,large_order_sales:120000,large_order_count:1,sales_without_100k_orders:v.amount-120000})),americano_before_after_28d:[]},comparison:{current_start:'2026-04-01',current_end:'2026-04-15',previous_start:'2026-03-01',previous_end:'2026-03-15',current_days:13,previous_days:13,current_amount,previous_amount,change_pct:(current_amount/previous_amount-1)*100,per_day_change_pct:(current_amount/previous_amount-1)*100}};
}
