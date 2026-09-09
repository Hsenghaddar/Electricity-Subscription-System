"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBreakerMonth = getBreakerMonth;
exports.saveBreakerMonth = saveBreakerMonth;
exports.deleteBreakerMonth = deleteBreakerMonth;
const detailsSql = `SELECT d.id,d.subscriber_id subscriberId,s.name subscriberName,bx.name boxName,bx.region_id regionId,
 d.breaker_id breakerId,br.type breakerName,d.breaker_price_usd priceUsd,d.discount_usd discountUsd,
 d.paid,d.paid_value_usd paidValueUsd,COALESCE(d.notes,'') notes
 FROM breaker_month_details d JOIN subscribers s ON s.id=d.subscriber_id JOIN boxes bx ON bx.id=s.box_id
 JOIN breakers br ON br.id=d.breaker_id WHERE d.breaker_month_id=? ORDER BY bx.region_id,bx.display_order,s.name`;
function getBreakerMonth(db, id) {
    const periods = db.prepare(`SELECT id,reference,month_date monthDate,COALESCE(notes,'') notes FROM breaker_months ORDER BY month_date DESC,id DESC`).all();
    const header = id ? db.prepare(`SELECT id,reference,month_date monthDate,COALESCE(notes,'') notes FROM breaker_months WHERE id=?`).get(id) : undefined;
    const details = id ? db.prepare(detailsSql).all(id) : [];
    const candidates = db.prepare(`SELECT s.id subscriberId,s.name subscriberName,bx.name boxName,bx.region_id regionId,
   br.id breakerId,br.type breakerName,br.price_usd priceUsd,0 discountUsd,0 paid,0 paidValueUsd,'' notes
   FROM subscribers s JOIN boxes bx ON bx.id=s.box_id JOIN breakers br ON br.id=s.breaker_id
   WHERE s.active=1 AND br.type<>'عداد' AND NOT EXISTS(SELECT 1 FROM counters c WHERE c.subscriber_id=s.id AND c.active=1)
   ORDER BY bx.region_id,bx.display_order,s.name`).all();
    const regions = db.prepare(`SELECT id,name FROM regions ORDER BY display_order,id`).all();
    return { header, details, periods, regions, candidates };
}
function saveBreakerMonth(db, header, details) {
    if (!header.reference.trim() || !header.monthDate)
        throw new Error('المرجع والتاريخ مطلوبان.');
    return db.transaction(() => { let id = Number(header.id) || 0; if (id)
        db.prepare(`UPDATE breaker_months SET reference=?,month_date=?,notes=? WHERE id=?`).run(header.reference.trim(), header.monthDate, header.notes ?? '', id);
    else
        id = Number(db.prepare(`INSERT INTO breaker_months(reference,month_date,notes) VALUES(?,?,?)`).run(header.reference.trim(), header.monthDate, header.notes ?? '').lastInsertRowid); db.prepare(`DELETE FROM breaker_month_details WHERE breaker_month_id=?`).run(id); const insert = db.prepare(`INSERT INTO breaker_month_details(breaker_month_id,subscriber_id,breaker_id,breaker_price_lbp,discount_lbp,notes,paid,paid_value_lbp,breaker_price_usd,discount_usd,paid_value_usd) VALUES(?,?,?,?,?,?,?,?,?,?,?)`); for (const d of details)
        insert.run(id, d.subscriberId, d.breakerId, 0, 0, d.notes ?? '', d.paid ? 1 : 0, 0, Number(d.priceUsd) || 0, Number(d.discountUsd) || 0, Number(d.paidValueUsd) || 0); return id; })();
}
function deleteBreakerMonth(db, id) { db.transaction(() => { db.prepare(`DELETE FROM breaker_month_details WHERE breaker_month_id=?`).run(id); db.prepare(`DELETE FROM breaker_months WHERE id=?`).run(id); })(); }
