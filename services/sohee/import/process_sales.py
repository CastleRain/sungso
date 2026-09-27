"""Read Toss POS export, retain original rows, normalize, and rebuild local analyses.
Usage: TOSS_EXPORT_PASSWORD=... python process_sales.py --zip PATH --out DIR
The password is read from the environment or a private prompt and never saved.
"""
import argparse, csv, getpass, hashlib, io, json, os, sqlite3, warnings
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
import pandas as pd
import numpy as np
import openpyxl
import zipfile

warnings.filterwarnings('ignore', message='Workbook contains no default style')
p=argparse.ArgumentParser(); p.add_argument('--zip',required=True); p.add_argument('--out',required=True); p.add_argument('--captured-at',default=datetime.now(ZoneInfo('Asia/Seoul')).isoformat()); a=p.parse_args()
src=Path(a.zip); out=Path(a.out)
for name in ['raw','normalized','analysis','metadata','scripts']: (out/name).mkdir(parents=True,exist_ok=True)
password=os.environ.get('TOSS_EXPORT_PASSWORD') or getpass.getpass('Export password: ')
with zipfile.ZipFile(src) as z:
    entries=[i for i in z.infolist() if i.filename.endswith('.xlsx')]
    if len(entries)!=1 or entries[0].file_size>80*1024*1024:
        raise ValueError('Expected one bounded XLSX export')
    name=entries[0].filename
    if Path(name).name!=name: raise ValueError('Unexpected archive path')
    content=z.read(name,pwd=password.encode())
password=None
wb=openpyxl.load_workbook(io.BytesIO(content),read_only=True,data_only=True)
archive_id=src.stem+'-'+hashlib.sha256(src.read_bytes()).hexdigest()[:12]
batch=out/'raw'/archive_id;batch.mkdir(exist_ok=True)
(batch/src.name).write_bytes(src.read_bytes())
sheets={}
for s in wb:
    s.reset_dimensions(); rows=list(s.values); sheets[s.title]=rows
    with (batch/f'{s.title}.csv').open('w',encoding='utf-8-sig',newline='') as f: csv.writer(f).writerows(rows)
(batch/name).write_bytes(content)
baseline=sheets['데이터 기준'][2]
start,end=pd.Timestamp(baseline[0]),pd.Timestamp(baseline[1])
incoming_start,incoming_end=start,end
captured=pd.Timestamp(a.captured_at)
if captured.tzinfo is None: raise ValueError('Timezone required')
captured_date=captured.tz_convert('Asia/Seoul').date()
if incoming_start>incoming_end or incoming_end.date()>captured_date: raise ValueError('Invalid export range')
old_manifest_path=out/'metadata'/'collection_manifest.json'
old_manifest=json.loads(old_manifest_path.read_text()) if old_manifest_path.exists() else {}
if old_manifest:
    if old_manifest['date_attribution']!=baseline[2] or old_manifest['day_start']!=baseline[3]:
        raise ValueError('집계 기준이 기존 데이터와 달라 병합하지 않았습니다. 별도 폴더에 수집해 비교하세요.')
    old_start=pd.Timestamp(old_manifest['requested_start']);old_end=pd.Timestamp(old_manifest['requested_end'])
    for prior in old_manifest.get('sources',[]):
        overlap=incoming_start<=pd.Timestamp(prior['end']) and incoming_end>=pd.Timestamp(prior['start'])
        if overlap and pd.Timestamp(a.captured_at)<pd.Timestamp(prior['captured_at']):
            raise ValueError('더 최근 수집본이 이미 있는 날짜입니다. 이전 파일로 최신 자료를 덮어쓰지 않습니다.')
    if incoming_start>old_end+pd.Timedelta(days=1) or incoming_end<old_start-pd.Timedelta(days=1):
        raise ValueError('기존 수집 기간과 새 기간 사이에 공백이 있습니다. 누락 기간을 먼저 수집하세요.')
    start=min(start,old_start);end=max(end,old_end)
def frame(sheet,skip,cols):
    rows=sheets[sheet][skip:]
    d=pd.DataFrame([list(r)+[None]*(len(cols)-len(r)) for r in rows],columns=cols)
    d['source_sheet']=sheet; d['source_row']=np.arange(skip+1,skip+1+len(d)); d['source_file']=src.name
    return d
pay_cols=['report_date','paid_at','channel','order_number','payment_count','amount','vat','method','acquirer','status','cancelled_at']
item_cols=['report_date','status','ordered_at','channel','order_number','menu_original','product_code','category','options','item_discount_name','order_discount_name','quantity','base_amount','option_amount','item_discount_amount','order_discount_amount','net_amount','taxable','vat']
pdaily_cols=['report_date','amount','vat','payment_count','spacer_1','cash','card','qr','transfer','prepaid','other','spacer_2']+list(sheets['결제 합계'][1][12:])
idaily_cols=['report_date','menu_original','product_code','category','quantity','base_amount','option_amount','discount_amount','net_amount','vat']
pay=frame('결제 상세내역',2,pay_cols); items=frame('상품 주문 상세내역',2,item_cols)
pdaily=frame('결제 합계',2,pdaily_cols); idaily=frame('상품 주문 합계',1,idaily_cols)
def merge_history(df,filename):
    previous=out/'normalized'/f'{filename}.csv'
    df['partial_day']=pd.to_datetime(df.report_date).dt.date.eq(captured_date)
    if previous.exists():
        old=pd.read_csv(previous,dtype={'order_number':str,'product_code':str})
        old=old[~pd.to_datetime(old.report_date).between(incoming_start,incoming_end)]
        return pd.concat([old,df],ignore_index=True,sort=False)
    return df
pay=merge_history(pay,'payment_lines');items=merge_history(items,'item_lines')
pdaily=merge_history(pdaily,'payment_daily_source');idaily=merge_history(idaily,'menu_daily_source')
for df in [pay,items,pdaily,idaily]:
    df['date']=pd.to_datetime(df['report_date']);df['month']=df['date'].dt.strftime('%Y-%m')
    for c in df.select_dtypes('number').columns: df[c]=df[c].fillna(0)
items['ordered_time']=pd.to_datetime(items['ordered_at']); items['hour']=items.ordered_time.dt.hour
pay['paid_time']=pd.to_datetime(pay['paid_at']);pay['hour']=pay.paid_time.dt.hour
items['weekday']=items.date.dt.dayofweek
mapping={'(포장전용)아메리카노':'아메리카노 통합','(포장전용)아메리카노_ 매장❌':'아메리카노 통합','아메리카노':'아메리카노 통합'}
items['menu_group']=items.menu_original.map(mapping).fillna(items.menu_original)
items['mapping_status']=np.where(items.menu_original.isin(mapping),'user_reported_same_product_keep_original','unchanged')
items['order_reference']=items.report_date.astype(str)+'|'+items.channel.astype(str)+'|'+items.order_number.astype(str)
items['order_key']=items.order_reference+'|'+items.ordered_at.astype(str)
pay['order_reference']=pay.report_date.astype(str)+'|'+pay.channel.astype(str)+'|'+pay.order_number.astype(str)
pay=pay.drop(columns=['order_key'],errors='ignore')

def save(df,name,folder='analysis'):
    df.to_csv(out/folder/f'{name}.csv',index=False,encoding='utf-8-sig')
    return df
for n,d in [('payment_lines',pay),('item_lines',items),('payment_daily_source',pdaily),('menu_daily_source',idaily)]: save(d,n,'normalized')
dates=pd.date_range(start,end)
daily=pd.DataFrame({'date':dates}).merge(pdaily[['date','amount','vat','payment_count']],on='date',how='left')
daily['has_payment_record']=daily.amount.notna()
daily[['amount','vat','payment_count']]=daily[['amount','vat','payment_count']].fillna(0)
it=items.groupby('date').agg(item_net=('net_amount','sum'),quantity=('quantity','sum')).reset_index()
daily=daily.merge(it,on='date',how='left'); daily[['item_net','quantity']]=daily[['item_net','quantity']].fillna(0)
daily['month']=daily.date.dt.strftime('%Y-%m');daily['weekday']=daily.date.dt.dayofweek
partial_dates={pd.Timestamp(day) for day in old_manifest.get('partial_dates',[]) if not incoming_start<=pd.Timestamp(day)<=incoming_end}
if incoming_start.date()<=captured_date<=incoming_end.date(): partial_dates.add(pd.Timestamp(captured_date))
daily['partial_day']=daily.date.isin(partial_dates); daily['net_diff']=daily.amount-daily.item_net
daily['avg_payment']=np.where(daily.payment_count!=0,daily.amount/daily.payment_count,np.nan)
daily['rolling_7d']=daily.amount.rolling(7,min_periods=7).mean()
save(daily,'daily')
monthly=daily.groupby('month').agg(net_sales=('amount','sum'),net_payment_count=('payment_count','sum'),net_quantity=('quantity','sum'),calendar_days=('date','count'),days_with_payments=('has_payment_record','sum'),partial_month=('partial_day','max')).reset_index()
monthly['sales_per_payment_day']=monthly.net_sales/monthly.days_with_payments
monthly['avg_payment']=monthly.net_sales/monthly.net_payment_count
monthly['sales_change_pct']=monthly.net_sales.pct_change()*100
save(monthly,'monthly')
matched=daily[daily.date.dt.day<end.day].groupby('month').agg(net_sales=('amount','sum'),net_payment_count=('payment_count','sum'),net_quantity=('quantity','sum'),days_with_payments=('has_payment_record','sum')).reset_index()
matched['sales_per_payment_day']=matched.net_sales/matched.days_with_payments
matched['avg_payment']=matched.net_sales/matched.net_payment_count
matched['sales_change_pct']=matched.net_sales.pct_change()*100
save(matched,'monthly_matched_days')
full=items[~items.partial_day].copy(); fulld=daily[~daily.partial_day].copy()
last=fulld.date.max(); current_start=last-pd.Timedelta(days=27); previous_start=current_start-pd.Timedelta(days=28); previous_end=current_start-pd.Timedelta(days=1)
def growth(group):
    recent=full[full.date.between(current_start,last)].groupby(group).agg(current_sales=('net_amount','sum'),current_qty=('quantity','sum'))
    previous=full[full.date.between(previous_start,previous_end)].groupby(group).agg(previous_sales=('net_amount','sum'),previous_qty=('quantity','sum'))
    result=recent.join(previous,how='outer').fillna(0).reset_index()
    result['sales_delta']=result.current_sales-result.previous_sales
    result['quantity_delta']=result.current_qty-result.previous_qty
    result['sales_change_pct']=np.where(result.previous_sales>0,result.sales_delta/result.previous_sales*100,np.nan)
    result['quantity_change_pct']=np.where(result.previous_qty>0,result.quantity_delta/result.previous_qty*100,np.nan)
    result['comparison_type']=np.where(result.previous_qty>0,'existing_in_previous_period','no_previous_period_sales')
    return result.sort_values('sales_delta',ascending=False)
save(growth('menu_original'),'menu_change_28d_original')
save(growth('menu_group'),'menu_change_28d_grouped')
save(growth('category'),'category_change_28d')
for grain,cols in [('menu_daily',['date','menu_original','menu_group','category']),('menu_monthly',['month','menu_original','menu_group','category']),('menu_hourly',['menu_original','menu_group','hour']),('menu_month_hour',['month','menu_original','menu_group','hour']),('menu_date_hour',['date','menu_original','menu_group','hour']),('menu_weekday',['menu_original','menu_group','weekday']),('category_monthly',['month','category']),('options_monthly',['month','options']),('channel_monthly',['month','channel'])]:
    data=items if grain in ['menu_daily','menu_monthly','menu_date_hour','category_monthly','options_monthly','channel_monthly'] else full
    result=data.groupby(cols,dropna=False).agg(net_sales=('net_amount','sum'),net_quantity=('quantity','sum'),line_count=('net_amount','size')).reset_index()
    save(result,grain)
weekday=fulld.groupby('weekday').agg(net_sales=('amount','sum'),calendar_days=('date','count'),days_with_payments=('has_payment_record','sum'),net_quantity=('quantity','sum'),net_payment_count=('payment_count','sum')).reset_index()
weekday['sales_per_calendar_day']=weekday.net_sales/weekday.calendar_days
weekday['sales_per_payment_day']=np.where(weekday.days_with_payments>0,weekday.net_sales/weekday.days_with_payments,np.nan)
save(weekday,'weekday')
hourly=full.groupby('hour').agg(net_sales=('net_amount','sum'),net_quantity=('quantity','sum')).reset_index()
hourly['share']=hourly.net_sales/hourly.net_sales.sum(); save(hourly,'hourly_order_time')
save(pay[~pay.partial_day].groupby(['month','method','acquirer']).agg(net_sales=('amount','sum'),net_payment_count=('payment_count','sum')).reset_index(),'payments_monthly')
orders=items.groupby(['order_key','date','channel','order_number']).agg(net_sales=('net_amount','sum'),net_quantity=('quantity','sum'),distinct_menus=('menu_original','nunique'),first_time=('ordered_time','min')).reset_index()
save(orders.sort_values('net_sales',ascending=False),'orders')
menu_lifecycle=items[items.status.eq('완료') & items.quantity.gt(0)].groupby('menu_original').agg(first_observed=('date','min'),last_observed=('date','max'),positive_quantity=('quantity','sum'),days_sold=('date','nunique'),category=('category','first')).reset_index()
menu_lifecycle['left_censored']=menu_lifecycle.first_observed.eq(start)
save(menu_lifecycle,'menu_lifecycle')
am=items[items.menu_original.isin(mapping)].copy();am['base_price_per_unit']=am.base_amount/am.quantity.replace(0,np.nan);am['net_price_per_unit']=am.net_amount/am.quantity.replace(0,np.nan)
save(am,'americano_lines')
save(am.groupby(['month','menu_original']).agg(net_sales=('net_amount','sum'),net_quantity=('quantity','sum'),min_base_unit=('base_price_per_unit','min'),max_base_unit=('base_price_per_unit','max'),first_observed=('date','min'),last_observed=('date','max')).reset_index(),'americano_monthly')
save(am[am.status.eq('완료')].groupby(['menu_original','base_price_per_unit']).agg(quantity=('quantity','sum'),first_observed=('date','min'),last_observed=('date','max')).reset_index(),'americano_price_history')
save(items[items.item_discount_amount.ne(0)|items.order_discount_amount.ne(0)|items.option_amount.lt(0)],'discount_lines')
save(items.groupby('month').agg(base_amount=('base_amount','sum'),option_amount=('option_amount','sum'),item_discount_amount=('item_discount_amount','sum'),order_discount_amount=('order_discount_amount','sum'),net_amount=('net_amount','sum')).reset_index(),'discounts_monthly')

# Detect sustained two-week sales changes. Overlapping candidates are thinned, not causal claims.
changes=[]
for menu,g in full.groupby('menu_group'):
    if g.quantity.sum()<30: continue
    series=g.groupby('date').quantity.sum().reindex(pd.date_range(start,last),fill_value=0)
    candidates=[]
    for i in range(14,len(series)-13):
        before=float(series.iloc[i-14:i].sum());after=float(series.iloc[i:i+14].sum());delta=after-before
        if abs(delta)<15 or max(before,after)<25:continue
        candidates.append({'menu_group':menu,'candidate_date':series.index[i],'qty_before_14d':before,'qty_after_14d':after,'quantity_delta':delta,'change_pct':delta/before*100 if before>0 else None})
    chosen=[]
    for r in sorted(candidates,key=lambda r:abs(r['quantity_delta']),reverse=True):
        if all(abs((r['candidate_date']-v['candidate_date']).days)>=28 for v in chosen):chosen.append(r)
        if len(chosen)==2:break
    changes+=chosen
save(pd.DataFrame(changes,columns=['menu_group','candidate_date','qty_before_14d','qty_after_14d','quantity_delta','change_pct']).sort_values('quantity_delta',key=abs,ascending=False),'change_candidates_14d')

checks={
 'payment_daily_total':float(pdaily.amount.sum()),'payment_detail_total':float(pay.amount.sum()),
 'menu_daily_total':float(idaily.net_amount.sum()),'item_detail_total':float(items.net_amount.sum()),
 'daily_max_abs_payment_item_diff':float(daily.net_diff.abs().max()),
 'item_formula_max_abs_diff':float((items.base_amount+items.option_amount+items.item_discount_amount+items.order_discount_amount-items.net_amount).abs().max()),
 'payment_count_summary':float(pdaily.payment_count.sum()),'payment_count_detail':float(pay.payment_count.sum()),
 'item_qty_summary':float(idaily.quantity.sum()),'item_qty_detail':float(items.quantity.sum()),
 'cancelled_item_rows':int(items.status.eq('취소').sum()),'cancelled_payment_rows':int(pay.status.eq('취소').sum()),
 'unknown_item_statuses':sorted(set(items.status)-{'완료','취소'}),
 'unknown_payment_statuses':sorted(set(pay.status)-{'승인','취소'}),
 'today_partial':bool(daily.partial_day.any()),'menu_group_mapping_verified_policy_date':False
}
assert len(set(checks[k] for k in ['payment_daily_total','payment_detail_total','menu_daily_total','item_detail_total']))==1
assert checks['daily_max_abs_payment_item_diff']==0
assert checks['item_formula_max_abs_diff']==0
assert not checks['unknown_item_statuses'] and not checks['unknown_payment_statuses']
assert not pdaily.date.duplicated().any()
assert checks['payment_count_summary']==checks['payment_count_detail']
assert checks['item_qty_summary']==checks['item_qty_detail']
save(daily[daily.net_diff.ne(0)],'reconciliation_exceptions')
(out/'metadata'/'checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
source_entry={'archive_id':archive_id,'start':str(incoming_start.date()),'end':str(incoming_end.date()),'captured_at':a.captured_at,'zip_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'xlsx_sha256':hashlib.sha256(content).hexdigest()}
sources=[s for s in old_manifest.get('sources',[]) if s.get('archive_id')!=archive_id]+[source_entry]
manifest={'store':'양정커피','timezone':'Asia/Seoul','requested_start':str(start.date()),'requested_end':str(end.date()),'verified_complete_through':str(fulld.date.max().date()),'partial_dates':[str(d.date()) for d in sorted(partial_dates)],'source_export_created_local':a.captured_at,'latest_payment_timestamp':str(pay.paid_time.max()),'date_attribution':baseline[2],'day_start':baseline[3],'grain':baseline[4],'zip_name':src.name,'zip_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'xlsx_name':name,'xlsx_sha256':hashlib.sha256(content).hexdigest(),'sheets_latest_export':{k:len(v) for k,v in sheets.items()},'payment_records':len(pay),'item_records':len(items),'distinct_menu_names':int(items.menu_original.nunique()),'calendar_days':len(daily),'days_with_payment_records':int(daily.has_payment_record.sum()),'comparison_current':[str(current_start.date()),str(last.date())],'comparison_previous':[str(previous_start.date()),str(previous_end.date())],'status':'exported_normalized_validated','sources':sources,'notes':['Rows retain source sheet and source row; no order IDs are globally unique.','Negative refund rows retained.','Hour analysis uses order start hour; refunds retain original order time where export does so.','No-record days are not automatically marked as closed.','No personal contribution or policy date inferred as fact.','Incoming covered dates replace previous rows; non-overlapping historical dates remain.','Old raw batches remain immutable.']}
(out/'metadata'/'collection_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
with sqlite3.connect(out/'normalized'/'sales.sqlite') as con:
    for name,d in [('payment_lines',pay),('item_lines',items),('payment_daily',pdaily),('menu_daily',idaily)]:d.to_sql(name,con,if_exists='replace',index=False)
    con.execute('CREATE INDEX IF NOT EXISTS item_date_menu_idx ON item_lines(report_date,menu_original)')
    con.execute('CREATE INDEX IF NOT EXISTS item_hour_idx ON item_lines(hour)')
print(json.dumps({'manifest':manifest,'checks':checks,'monthly':monthly.to_dict('records'),'matched_days':matched.to_dict('records'),'top_increases':growth('menu_group').head(8).to_dict('records'),'top_decreases':growth('menu_group').tail(8).to_dict('records'),'americano':menu_lifecycle[menu_lifecycle.menu_original.isin(mapping)].to_dict('records')},ensure_ascii=False,default=str))
