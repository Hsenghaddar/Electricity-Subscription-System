import hashlib
import argparse
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / '.migration'
DEFAULT_OUTPUT = ROOT / 'seed' / 'initial-data.sqlite'

MAPPINGS = {
    'regions': ('Regions', [('id','RegionID'),('name','RegionName'),('subscription_fee_lbp','SubscriptionFee'),('kilo_price_lbp','KiloPrice'),('pricing_date','PricingDate'),('display_order','RegionOrder'),('kilo_price_usd','KiloPriceDollar')]),
    'boxes': ('Boxes', [('id','BoxID'),('name','BoxName'),('region_id','RgnID'),('display_order','BoxOrder')]),
    'breakers': ('Breakers', [('id','BreakerID'),('type','BreakerType'),('price_lbp','BreakerPrice')]),
    'region_breaker_prices': ('RegionBreakerPrices', [('id','RegionBreakerID'),('region_id','RgnID'),('breaker_id','BrkrID'),('price_lbp','Price')]),
    'subscribers': ('Subscribers', [('id','SubscriberID'),('subscriber_number','SubscriberNb'),('name','SubscriberName'),('address','Address'),('phone','Phone'),('notes','Notes'),('box_id','BxID'),('breaker_id','BrkrID'),('active','InUse')]),
    'ampere_plans': ('AmperAmounts', [('id','AmperAmountID'),('amperes','AmperAmount'),('subscription_fee_lbp','SubscriptionFee'),('subscription_fee_usd','SubscriptionFeeDollar')]),
    'counters': ('Counters', [('id','CounterID'),('counter_number','CounterNb'),('subscriber_id','SbscrbrID'),('ampere_plan_id','AmprAmntID'),('insurance_fee_lbp','InsuranceFee'),('counter_price_lbp','CounterPrice'),('active','InUse')]),
    'collectors': ('Collectors', [('id','CollectorID'),('name','CollectorName'),('phone','Phone'),('active','InUse')]),
    'consumption_periods': ('Consumptions', [('id','ConsumptionID'),('reference','Reference'),('consumption_date','ConsumptionDate'),('notes','Notes'),('dollar_rate','DollarVal')]),
    'consumption_details': ('ConsumptionDetails', [('id','ConsumptionDetailID'),('consumption_id','CnsmptionID'),('subscriber_id','SbscrbrID'),('counter_value','CounterVal'),('kilo_price_lbp','KiloPrice'),('kilo_price_usd','KiloPriceDollar'),('subscription_fee_lbp','SubscriptionFee'),('subscription_fee_usd','SubscriptionFeeDollar'),('notes','Notes'),('paid','IsPaid'),('discount_lbp','Discount'),('paid_value_lbp','PaidVal'),('counter_id','CntrID'),('collector_id','CllctrID'),('discount_usd','DiscountDollar'),('paid_value_usd','PaidValDollar')]),
    'breaker_months': ('BrkrSbscrbrMonths', [('id','BSMonthID'),('reference','Reference'),('month_date','BSDate'),('notes','Notes')]),
    'breaker_month_details': ('BSMonthDetails', [('id','BSMonthDetailID'),('breaker_month_id','BSMnthID'),('subscriber_id','SbscrbrID'),('breaker_id','BrkrID'),('breaker_price_lbp','BrkrPrice'),('discount_lbp','Discount'),('notes','Notes'),('paid','IsPaid'),('paid_value_lbp','PaidVal')]),
    'expense_items': ('Items', [('id','ItemID'),('name','Item')]),
    'expenses': ('Outlays', [('id','OutlayID'),('reference','Reference'),('expense_date','OutlayDate'),('notes','Notes')]),
    'expense_details': ('OutlayDetails', [('id','OutlayDetailID'),('expense_id','OtlyID'),('item_id','ItemID'),('quantity','Qty'),('price_lbp','Price')]),
    'payments': ('Payments', [('id','PaymentID'),('reference','Reference'),('payment_date','PaymentDate'),('notes','Notes')]),
    'payment_details': ('PaymentDetails', [('id','PaymentDetailID'),('payment_id','PymntID'),('expense_id','OtlyID'),('expense_detail_id','OtlyDtlID'),('paid_value_lbp','PaidVal'),('notes','Notes')]),
    'repayments': ('Repayments', [('id','RepaymentID'),('reference','Reference'),('repayment_date','RepaymentDate')]),
    'repayment_details': ('RepaymentDetails', [('id','RepaymentDetailID'),('repayment_id','RpymntID'),('subscriber_id','SbscrbrID'),('paid_value_lbp','PaidVal'),('month_date','Mnth'),('notes','Notes')]),
}

def load(source, name):
    with (source / f'{name}.json').open(encoding='utf-8-sig') as file:
        value = json.load(file)
        return value if isinstance(value, list) else [value]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--backup-date', default='2026-07-15T10:00:00')
    args = parser.parse_args()
    source_dir = args.source.resolve()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists(): output.unlink()
    source = (ROOT / 'src' / 'main' / 'database.js').read_text(encoding='utf-8')
    schema = re.search(r'database\.exec\(`(.*?)`\);', source, re.S)
    if not schema: raise RuntimeError('Could not locate SQLite schema')
    db = sqlite3.connect(output)
    try:
        db.executescript(schema.group(1))
        db.execute('PRAGMA foreign_keys=OFF')
        for target, (old, columns) in MAPPINGS.items():
            rows = load(source_dir, old)
            if not rows: continue
            names = [new for new, _ in columns]
            sql = f"INSERT INTO {target} ({','.join(names)}) VALUES ({','.join('?' for _ in names)})"
            db.executemany(sql, [[row.get(old_name) for _, old_name in columns] for row in rows])
            print(f'{target}: {len(rows)}')
        fingerprint = hashlib.sha256((source_dir / 'Subscribers.json').read_bytes()).hexdigest()
        db.execute("INSERT INTO legacy_imports(source_name,source_backup_date,source_fingerprint) VALUES(?,?,?)", ('Ishtirak SQL Server backup',args.backup_date,fingerprint))
        violations = db.execute('PRAGMA foreign_key_check').fetchall()
        if violations: raise RuntimeError(f'Foreign key violations: {violations[:10]}')
        db.commit()
        db.execute('VACUUM')
    finally: db.close()

if __name__ == '__main__': main()
