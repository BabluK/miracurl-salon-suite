import asyncio, sys, uuid
from datetime import date, datetime, timezone, timedelta
sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from database import _raw_db
import routes.gift_cards as g

async def main():
    t = await _raw_db.tenants.find_one({'slug': 'miracurl-marathahalli'}, {'_id': 0})
    now = datetime.now(timezone.utc)
    # 1) expiry reminder: card expiring in 10 days
    gc_id = str(uuid.uuid4())
    await _raw_db.gift_cards.insert_one({
        'id': gc_id, 'tenant_id': t['id'], 'tenant_slug': t['slug'], 'code': 'GC-TEST-REM1',
        'occasion': 'birthday', 'amount': 1000, 'balance': 600, 'currency': 'INR',
        'buyer_name': 'Buyer T', 'buyer_email': 'buyer.t@example.com',
        'recipient_name': 'Recip T', 'recipient_email': 'recip.t@example.com',
        'message': '', 'send_on': '', 'pay_method': 'upi', 'status': 'active',
        'validity_days': 180, 'created_at': now.isoformat(),
        'expires_at': (now.date() + timedelta(days=10)).isoformat()})
    n = await g.send_expiry_reminders()
    doc = await _raw_db.gift_cards.find_one({'id': gc_id}, {'_id': 0, 'reminder_14_sent': 1, 'reminder_3_sent': 1})
    print('reminders sent:', n, '| flags:', doc)
    n2 = await g.send_expiry_reminders()
    print('idempotent (should be 0):', n2)

    # 2) occasion calendar
    print('upcoming @ Nov 3 2026:', g._upcoming_occasion(date(2026, 11, 3)))
    print('upcoming @ Feb 10 2027:', g._upcoming_occasion(date(2027, 2, 10)))
    print('upcoming @ Dec 27 2026:', g._upcoming_occasion(date(2026, 12, 27)))
    print('upcoming today (none expected):', g._upcoming_occasion(now.date()))

    # 3) campaign full path with forced occasion
    orig = g._upcoming_occasion
    g._upcoming_occasion = lambda today: ('diwali', '2026-11-08')
    total = await g.send_occasion_campaigns()
    g._upcoming_occasion = orig
    log = await _raw_db.gift_campaign_log.find_one({'occasion': 'diwali'}, {'_id': 0})
    print('campaign emails sent:', total, '| log:', log)
    total2_forced = None
    g._upcoming_occasion = lambda today: ('diwali', '2026-11-08')
    total2_forced = await g.send_occasion_campaigns()
    g._upcoming_occasion = orig
    print('campaign idempotent (should be 0):', total2_forced)

    # 4) balance-update email on redemption
    r = await g.redeem_gift_card('GC-TEST-REM1', t['id'], 250, 'inv-test-1')
    print('redeem:', r)

    # cleanup
    await _raw_db.gift_cards.delete_one({'id': gc_id})
    await _raw_db.gift_campaign_log.delete_many({'occasion': 'diwali', 'occasion_date': '2026-11-08'})
    print('cleaned up')

asyncio.run(main())
