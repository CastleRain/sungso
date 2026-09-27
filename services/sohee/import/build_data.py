"""Toss-first local analysis. Payhere receipt and period-menu grains stay separate."""
from pathlib import Path
import argparse, hashlib, json, shutil, warnings
from datetime import datetime
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
import openpyxl

warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')
def records(df):
    return json.loads(df.to_json(orient='records', date_format='iso', force_ascii=False))
def save(df, path):
    path.parent.mkdir(parents=True,exist_ok=True)
    df.to_csv(path,index=False,encoding='utf-8-sig')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def num(v): return float(v or 0)
def canonical(n):
    # Explicit existing Toss aliases plus clearly named Payhere Americano variants.
    if n in {'(포장전용)아메리카노','(포장전용)아메리카노_ 매장❌','아메리카노','♨️아메리카노','♨️아메리카노(포장)','아메리카노(포장)','아메리카노(포장)핫'}: return '아메리카노 통합'
    return n

def import_payhere(files, out):
    tx=[]; menus=[]; checks=[]; manifests=[]
    for f in sorted(files):
        target=out/'payhere/raw/exports'/f.name;target.parent.mkdir(parents=True,exist_ok=True)
        if target.resolve()!=f.resolve():
            if target.exists() and sha(target)!=sha(f): raise ValueError('Immutable source conflict: '+f.name)
            shutil.copy2(f,target)
        w=openpyxl.load_workbook(f,read_only=True,data_only=True)
        s=w['매출 내역'];s.reset_dimensions();r=list(s.values)
        start,end=r[3][0].split('~'); total=r[8]; filetx=[]
        assert r[10][0]=='결제일' and r[10][14]=='환불 일시'
        for rn,row in enumerate(r[12:],13):
            if not row[0]:continue
            gross=num(row[3]);discount=sum(num(row[i]) for i in [4,5,11,13])
            net=gross-discount;refund=num(row[14]); paid=sum(num(row[i]) for i in range(6,11))
            assert net==paid, (f.name,rn,net,paid)
            dt=pd.Timestamp(str(row[0])+' '+str(row[1]))
            x=dict(date=dt.strftime('%Y-%m-%d'),timestamp=str(dt),hour=dt.hour,weekday=dt.weekday(),month=dt.strftime('%Y-%m'),source='payhere',grain='receipt',description=row[2],gross=gross,discount=discount,amount=net,refund_reported=refund,payment_count=int(refund==0),source_file=f.name,source_sheet='매출 내역',source_row=rn)
            x.update({field:num(row[i]) for i,field in [(4,'item_discount'),(5,'order_discount'),(6,'card_payment'),(7,'cash_payment'),(8,'easy_payment'),(9,'other_payment'),(10,'online_payment'),(11,'points_used'),(12,'points_earned'),(13,'prepaid_used'),(15,'instant_refund_count'),(16,'refund_discount_total'),(17,'post_refund_count')]})
            filetx.append(x)
        ft=pd.DataFrame(filetx)
        assert ft.amount.sum()==total[1] and ft.payment_count.sum()==total[2]
        assert ft.refund_reported.sum()==total[4]
        tx+=filetx
        s=w['상품별'];s.reset_dimensions();rr=list(s.values); fm=[]
        for rn,row in enumerate(rr[10:],11):
            if not str(row[0]).isdigit() or not row[2]:continue
            fm.append(dict(period_start=start,period_end=end,source='payhere',grain='menu_period_price',category=row[1],menu_original=row[2],menu_group=canonical(row[2]),unit_price=num(row[3]),quantity=num(row[4]),gross=num(row[6]),discount=num(row[8]),amount=num(row[9]),source_file=f.name,source_sheet='상품별',source_row=rn))
        fmd=pd.DataFrame(fm)
        for field,index in [('quantity',4),('gross',6),('discount',8),('amount',9)]: assert fmd[field].sum()==rr[8][index],(field,f.name)
        menus+=fm
        checks.append(dict(file=f.name,receipts=len(ft),payment_count=int(total[2]),refund_count=int(total[5]),amount=total[1],quantity=rr[8][4],refund_reported=total[4],receipt_sum_ok=True,menu_sum_ok=True))
        manifests.append(dict(file=f.name,sha256=sha(f),start=start,end=end,status='received_validated'))
        w.close()
    return pd.DataFrame(tx),pd.DataFrame(menus),checks,manifests

def forecast(items,payments,cutoff):
    """56-day recency weighted weekday shrinkage; no future or partial-day rows."""
    x=items[items.date.le(cutoff) & ~items.partial_day].copy()
    order_sales=x.groupby('order_key').net_amount.sum()
    bulk_keys=order_sales[order_sales.ge(100000)].index
    clean=x[~x.order_key.isin(bulk_keys)]
    dessert=clean[clean.category.eq('디저트') & ~clean.menu_original.str.contains('선물|세트|포장',regex=True) & clean.menu_original.ne('ㅇㅇ')].copy()
    days=sorted(payments.loc[payments.date.le(cutoff)&~payments.partial_day&payments.amount.gt(0),'date'].unique())
    first=dessert[dessert.quantity.gt(0)].groupby('menu_original').date.min().to_dict()
    # Net quantity remains signed before clipping at menu/date/hour, not at source row.
    daily=dessert.groupby(['menu_original','date']).quantity.sum().clip(lower=0).to_dict()
    hourly=dessert.groupby(['menu_original','date','hour']).quantity.sum().clip(lower=0).to_dict()
    cutoff_t=pd.Timestamp(cutoff)
    recent=dessert[dessert.date.ge(str((cutoff_t-pd.Timedelta(days=27)).date()))].groupby('menu_original').quantity.sum()
    active=recent[recent.gt(0)].index.tolist()
    def fit(menu,asof,weekday):
        end=pd.Timestamp(asof); start=max(end-pd.Timedelta(days=55),pd.Timestamp(first[menu]))
        ds=[d for d in days if str(start.date())<=d<=asof]
        if not ds:return None
        same=[d for d in ds if pd.Timestamp(d).weekday()==weekday]
        if not same:return None
        w=np.array([2**(-(end-pd.Timestamp(d)).days/21) for d in ds]);ws=np.array([2**(-(end-pd.Timestamp(d)).days/21) for d in same])
        values=np.array([daily.get((menu,d),0) for d in ds]);sv=np.array([daily.get((menu,d),0) for d in same])
        strength=len(same)/(len(same)+4)
        avg=float(np.average(values,weights=w));mean=strength*float(np.average(sv,weights=ws))+(1-strength)*avg
        hv=np.array([[hourly.get((menu,d,h),0) for h in range(24)] for d in ds])
        hs=np.array([[hourly.get((menu,d,h),0) for h in range(24)] for d in same])
        all_h=np.average(hv,axis=0,weights=w); same_h=np.average(hs,axis=0,weights=ws)
        h=strength*same_h+(1-strength)*all_h
        h=h/h.sum()*mean if h.sum()>0 else np.zeros(24)
        last_sale=max((d for d in ds if daily.get((menu,d),0)>0),default=ds[0])
        status='참고용' if len(same)<4 or (values>0).sum()<8 or (end-pd.Timestamp(last_sale)).days>=14 else '준비 기준'
        return dict(menu=menu,weekday=weekday,expected=round(mean,4),hours=[round(float(v),6) for v in h],sample_days=len(ds),same_weekday_days=len(same),selling_days=int((values>0).sum()),history_min=int(sv.min()),history_max=int(sv.max()),status=status,start=str(start.date()),end=asof,unit='팩(4개)' if '4구' in menu else '개',first_observed=first[menu],last_observed=last_sale,recent_quantity=int(recent.get(menu,0)))
    plans=[p for m in active for wd in range(7) if (p:=fit(m,cutoff,wd))]
    # Rolling origin: product list and launch dates for each target are known strictly before target.
    bt=[];tests=[d for d in days if d>=str((cutoff_t-pd.Timedelta(days=27)).date())]
    for target in tests:
        origin=str((pd.Timestamp(target)-pd.Timedelta(days=1)).date())
        eligible=[m for m,f in first.items() if f<=origin and sum(daily.get((m,d),0) for d in days if str((pd.Timestamp(origin)-pd.Timedelta(days=27)).date())<=d<=origin)>0]
        for m in eligible:
            pred=fit(m,origin,pd.Timestamp(target).weekday())
            if pred is None or pred['status']!='준비 기준':continue
            bd=[d for d in days if max(first[m],str((pd.Timestamp(origin)-pd.Timedelta(days=27)).date()))<=d<=origin]
            baseline=float(np.mean([daily.get((m,d),0) for d in bd]))
            actual=float(daily.get((m,target),0)); err=abs(actual-pred['expected'])
            bt.append(dict(date=target,train_end=origin,menu=m,actual=actual,predicted=pred['expected'],baseline=baseline,absolute_error=err,baseline_error=abs(actual-baseline),hourly_absolute_error=sum(abs(hourly.get((m,target,h),0)-pred['hours'][h]) for h in range(24))))
    back=pd.DataFrame(bt)
    metrics=[]
    if len(back):
        for m,g in [('전체',back),*list(back.groupby('menu'))]:
            metrics.append(dict(menu=m,n=len(g),mae=round(g.absolute_error.mean(),3),baseline_mae=round(g.baseline_error.mean(),3),wape=round(g.absolute_error.sum()/g.actual.sum()*100,2) if g.actual.sum()>0 else None,actual_quantity=float(g.actual.sum()),hourly_mae=round(g.hourly_absolute_error.sum()/len(g)/24,3)))
    observed=dessert.groupby(['menu_original','date','weekday','hour']).agg(quantity=('quantity','sum'),amount=('net_amount','sum')).reset_index()
    return plans,back,metrics,observed,bulk_keys

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);ap.add_argument('--payhere-dir',type=Path);args=ap.parse_args()
    root=args.root;out=args.out;out.mkdir(parents=True,exist_ok=True)
    files=[p for p in (args.payhere_dir or out/'payhere/raw/exports').glob('*.xlsx') if p.name.startswith(('20260101~20260430_', '20251001~20251231_'))]; assert len(files)==2,'Expected the two original, non-overlapping Payhere exports'
    tx,pm,checks,manifest=import_payhere(files,out)
    save(tx,out/'payhere/normalized/receipt_lines.csv');save(pm,out/'payhere/normalized/menu_period_price.csv')
    ui=pd.read_csv(root/'payhere/normalized/menu_monthly_ui.csv')
    cats=pm.groupby('menu_original').category.first().to_dict()
    ui=ui.rename(columns={'ui_order_count':'quantity','payment_amount_krw':'amount'})
    ui['menu_group']=ui.menu_original.map(canonical);ui['category']=ui.menu_original.map(cats).fillna('미분류');ui['grain']='menu_month';ui['quantity_basis']='월별 UI 건수, 엑셀 수량 대조';ui['source']='payhere'
    differences=[]
    for mf in manifest:
        a=pm[pm.source_file.eq(mf['file'])].groupby('menu_original')[['quantity','amount']].sum()
        b=ui[ui.month.between(mf['start'][:7],mf['end'][:7])].groupby('menu_original')[['quantity','amount']].sum()
        diff=a.subtract(b,fill_value=0)
        for n,row in diff[(diff.abs()>0.01).any(axis=1)].iterrows():differences.append(dict(file=mf['file'],menu=n,quantity_diff=row.quantity,amount_diff=row.amount))
    # Stop rather than replacing unknown monthly values by allocations.
    assert not differences,differences
    it=pd.read_csv(root/'normalized/item_lines.csv',dtype={'order_number':str}).fillna('')
    pt=pd.read_csv(root/'normalized/payment_lines.csv',dtype={'order_number':str})
    for df in [it,pt]:df['date']=df.date.astype(str);df['month']=df.date.str[:7];df['weekday']=pd.to_datetime(df.date).dt.weekday
    it['menu_group']=it.menu_original.map(canonical)
    tossmonthly=it.groupby(['month','menu_original','menu_group','category']).agg(quantity=('quantity','sum'),amount=('net_amount','sum')).reset_index();tossmonthly['source']='toss';tossmonthly['grain']='menu_month';tossmonthly['quantity_basis']='상품 주문 상세 순수량'
    um=pd.concat([ui[tossmonthly.columns],tossmonthly],ignore_index=True)
    save(um,out/'analysis/menu_monthly.csv')
    pdaily=tx.groupby('date').agg(amount=('amount','sum'),payment_count=('payment_count','sum'),refund_reported=('refund_reported','sum')).reindex(pd.date_range(min(m['start'] for m in manifest),max(m['end'] for m in manifest)).strftime('%Y-%m-%d'),fill_value=0).rename_axis('date').reset_index();pdaily['source']='payhere';pdaily['partial_day']=False;pdaily['record_day']=pdaily.payment_count.gt(0)
    old=pd.read_csv(root/'payhere/normalized/daily_calendar_ui.csv').set_index('date')
    assert np.allclose(pdaily.set_index('date').amount,old.loc[pdaily.date,'displayed_sales_krw'])
    source_manifest=json.loads((root/'metadata/collection_manifest.json').read_text())
    td=pt.groupby('date').agg(amount=('amount','sum'),payment_count=('payment_count','sum')).reindex(pd.date_range(source_manifest['requested_start'],source_manifest['requested_end']).strftime('%Y-%m-%d'),fill_value=0).rename_axis('date').reset_index();td['source']='toss';td['refund_reported']=None
    td['partial_day']=td.date.isin(source_manifest['partial_dates']);td['record_day']=td.date.isin(pt.loc[pt.amount.gt(0),'date'])
    assert set(pdaily.date).isdisjoint(set(td.date)),'Source dates overlap; define an explicit replacement rule first'
    ud=pd.concat([pdaily,td],ignore_index=True);ud['month']=ud.date.str[:7];ud['weekday']=pd.to_datetime(ud.date).dt.weekday
    save(ud,out/'analysis/daily.csv')
    month=ud.groupby(['month','source']).agg(amount=('amount','sum'),payment_count=('payment_count','sum'),record_days=('record_day','sum'),partial=('partial_day','max')).reset_index()
    q=um.groupby('month').quantity.sum();month['quantity']=month.month.map(q);month['per_record_day']=np.where(month.record_days>0,month.amount/month.record_days,0)
    assert np.allclose(month.amount,month.month.map(um.groupby('month').amount.sum()).fillna(0))
    save(month,out/'analysis/monthly.csv')
    full=ud[~ud.partial_day];cutoff=td.loc[~td.partial_day,'date'].max()
    plans,back,metrics,observed,bulk_keys=forecast(it,pt,cutoff)
    save(back,out/'analysis/forecast_backtest.csv');save(pd.DataFrame(metrics),out/'analysis/forecast_metrics.csv');save(observed,out/'analysis/dessert_date_hour.csv')
    flat=[]
    for p in plans:
        for h,v in enumerate(p['hours']):flat.append({k:v for k,v in p.items() if k!='hours'}|dict(hour=h,expected_hour=v))
    save(pd.DataFrame(flat),out/'analysis/dessert_forecast_hourly.csv')
    save(pd.DataFrame([{k:v for k,v in p.items() if k!='hours'} for p in plans]),out/'analysis/dessert_forecast_daily.csv')
    prep_rows=[]
    windows=[('00–08시',0,8),('08–10시',8,10),('10–12시',10,12),('12–14시',12,14),('14–16시',14,16),('16–18시',16,18),('18–24시',18,24)]
    for p in plans:
        if p['status']!='준비 기준':continue
        target=int(np.floor(p['expected']+.5));bins=np.array([sum(p['hours'][a:b]) for _,a,b in windows]);raw=bins/bins.sum()*target if bins.sum() else np.zeros(7);qty=np.floor(raw).astype(int)
        for i in sorted(range(7),key=lambda i:(-(raw[i]-qty[i]),i))[:target-int(qty.sum())]:qty[i]+=1
        assert qty.sum()==target
        prep_rows.append({'요일':'월화수목금토일'[p['weekday']],'메뉴':p['menu'],'단위':p['unit'],'예상수량':round(p['expected'],2),'당일준비':target,'실물개수':target*(4 if '4개' in p['unit'] else 1),**{w[0]:int(q) for w,q in zip(windows,qty)},'여유분퍼센트':0,'같은요일표본일':p['same_weekday_days']})
    save(pd.DataFrame(prep_rows),out/'analysis/weekday_prep_default.csv')
    menu_toss=it[~it.partial_day].groupby(['menu_original','menu_group','date','weekday','hour']).agg(quantity=('quantity','sum'),amount=('net_amount','sum')).reset_index()
    receipt_hour=pd.concat([tx[['source','date','month','weekday','hour','amount']],pt.assign(source='toss')[['source','date','month','weekday','hour','amount']]],ignore_index=True)
    receipt_hour=receipt_hour[~receipt_hour.date.isin(ud.loc[ud.partial_day,'date'])].groupby(['source','month','weekday','hour']).amount.sum().reset_index()
    save(receipt_hour,out/'analysis/receipt_month_weekday_hour.csv')
    bulk=it[it.order_key.isin(bulk_keys)].groupby(['order_key','date','menu_original']).agg(quantity=('quantity','sum'),amount=('net_amount','sum')).reset_index()
    forecasts=dict(cutoff=cutoff,window_days=56,half_life_days=21,bulk_cutoff=100000,plans=plans,metrics=metrics,holdout_start=str((pd.Timestamp(cutoff)-pd.Timedelta(days=27)).date()),holdout_end=cutoff)
    end_t=pd.Timestamp(cutoff);cur_start=end_t.replace(day=1);prev_start=cur_start-pd.DateOffset(months=1);prev_end=min(prev_start+pd.Timedelta(days=end_t.day-1),cur_start-pd.Timedelta(days=1))
    curr=full[full.date.between(str(cur_start.date()),cutoff)];prev=full[full.date.between(str(prev_start.date()),str(prev_end.date()))]
    comparison=dict(current_start=str(cur_start.date()),current_end=cutoff,previous_start=str(prev_start.date()),previous_end=str(prev_end.date()),current_days=int(curr.record_day.sum()),previous_days=int(prev.record_day.sum()),current_amount=float(curr.amount.sum()),previous_amount=float(prev.amount.sum()))
    comparison['change_pct']=(comparison['current_amount']/comparison['previous_amount']-1)*100 if comparison['previous_amount'] else None
    comparison['per_day_change_pct']=((comparison['current_amount']/comparison['current_days'])/(comparison['previous_amount']/comparison['previous_days'])-1)*100 if comparison['current_days'] and comparison['previous_days'] and comparison['previous_amount'] else None
    existing={}
    for name in ['menu_change_28d_grouped','menu_change_28d_excluding_large_orders','americano_before_after_28d','monthly_large_order_sensitivity','menu_peaks']:
        fp=root/'analysis'/f'{name}.csv'
        if fp.exists():existing[name]=records(pd.read_csv(fp))
    # Recompute bulk sensitivity from the current merged Toss records; historical
    # Americano before/after comparison remains explicitly dated in the UI.
    orders=it.groupby(['month','order_key']).net_amount.sum().reset_index()
    sensitivity=[]
    for month_key, group in orders.groupby('month'):
        large=group[group.net_amount>=100000]
        total=float(group.net_amount.sum()); amount=float(large.net_amount.sum())
        sensitivity.append(dict(month=month_key,all_sales=total,large_order_sales=amount,large_order_count=len(large),sales_without_100k_orders=total-amount,large_order_share=amount/total*100 if total else 0))
    existing['monthly_large_order_sensitivity']=sensitivity
    # The historical detailed report remains a dated artifact; updateable data comes from normalized rows.
    checks.append(dict(test='UI monthly menu quantity and amount vs both Excel exports',ok=True));checks.append(dict(test='Payhere every calendar day vs Excel receipt amounts',ok=True));checks.append(dict(test='Unified monthly receipt amount vs monthly menu amounts',ok=True));checks.append(dict(test='Source coverage disjoint',ok=True))
    data=dict(store='양정커피',generated_at=datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d'),start=ud.date.min(),end=ud.date.max(),complete_through=cutoff,partial_dates=list(ud.loc[ud.partial_day,'date']),total=float(ud.amount.sum()),monthly=records(month),daily=records(ud),menu_monthly=records(um),menu_toss=records(menu_toss),receipt_hour=records(receipt_hour),payhere_prices=records(pm),forecast=forecasts,bulk=records(bulk),existing=existing,checks=checks,files=manifest)
    data['comparison']=comparison
    (out/'analysis/dashboard-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False))
    (out/'metadata/import_validation.json').write_text(json.dumps(dict(checks=checks,files=manifest,source_grains={'toss':'payment + item transaction','payhere':'receipt + menu period-price + independently verified monthly menu UI'},status='received_validated'),ensure_ascii=False,indent=2))
    print(json.dumps(dict(total=data['total'],months=len(month),menu_rows=len(um),forecast_plans=len(plans),forecast_metrics=metrics,payhere_checks=checks[:2]),ensure_ascii=False,indent=2))

if __name__=='__main__':main()
