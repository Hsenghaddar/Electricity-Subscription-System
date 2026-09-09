"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFinance = getFinance;
exports.saveFinance = saveFinance;
exports.deleteFinance = deleteFinance;
exports.getInstitutionDebts = getInstitutionDebts;
const config = {
    expenses: { head: 'expenses', detail: 'expense_details', date: 'expense_date' },
    payments: { head: 'payments', detail: 'payment_details', date: 'payment_date' },
    repayments: { head: 'repayments', detail: 'repayment_details', date: 'repayment_date' },
};
function getFinance(db, kind, id) {
    const c = config[kind];
    const references = db.prepare(`SELECT id,reference,${c.date} date,${kind === 'repayments' ? `''` : `COALESCE(notes,'')`} notes FROM ${c.head} ORDER BY ${c.date} DESC,id DESC`).all();
    const header = id ? references.find(x => x.id === id) : undefined;
    let rows = [];
    const options = {};
    if (kind === 'expenses') {
        options.items = db.prepare(`SELECT id,name FROM expense_items ORDER BY name`).all();
        if (id)
            rows = db.prepare(`SELECT ed.id,ed.item_id itemId,i.name itemName,ed.quantity,ed.price_lbp price FROM expense_details ed JOIN expense_items i ON i.id=ed.item_id WHERE ed.expense_id=? ORDER BY ed.id`).all(id);
    }
    else if (kind === 'payments') {
        options.dues = db.prepare(`SELECT ed.id,e.id expenseId,i.name, e.reference, ed.price_lbp-COALESCE((SELECT SUM(pd.paid_value_lbp) FROM payment_details pd WHERE pd.expense_detail_id=ed.id),0) remaining FROM expense_details ed JOIN expenses e ON e.id=ed.expense_id JOIN expense_items i ON i.id=ed.item_id ORDER BY e.expense_date DESC,i.name`).all();
        if (id)
            rows = db.prepare(`SELECT pd.id,pd.expense_detail_id expenseDetailId,i.name itemName,e.reference dueReference,pd.paid_value_lbp paidValue,COALESCE(pd.notes,'') notes FROM payment_details pd JOIN expense_details ed ON ed.id=pd.expense_detail_id JOIN expenses e ON e.id=ed.expense_id JOIN expense_items i ON i.id=ed.item_id WHERE pd.payment_id=? ORDER BY pd.id`).all(id);
    }
    else {
        options.subscribers = db.prepare(`SELECT id,name,subscriber_number subscriberNumber FROM subscribers WHERE active=1 ORDER BY name`).all();
        if (id)
            rows = db.prepare(`SELECT rd.id,rd.subscriber_id subscriberId,s.name subscriberName,rd.paid_value_lbp paidValue,rd.month_date monthDate,COALESCE(rd.notes,'') notes FROM repayment_details rd JOIN subscribers s ON s.id=rd.subscriber_id WHERE rd.repayment_id=? ORDER BY rd.id`).all(id);
    }
    return { header, rows, references, options };
}
function saveFinance(db, kind, header, rows) {
    if (!header.reference.trim() || !header.date)
        throw new Error('المرجع والتاريخ مطلوبان.');
    const c = config[kind];
    return db.transaction(() => {
        let id = header.id;
        if (id) {
            if (kind === 'repayments')
                db.prepare(`UPDATE repayments SET reference=?,repayment_date=? WHERE id=?`).run(header.reference.trim(), header.date, id);
            else
                db.prepare(`UPDATE ${c.head} SET reference=?,${c.date}=?,notes=? WHERE id=?`).run(header.reference.trim(), header.date, header.notes ?? '', id);
        }
        else {
            const result = kind === 'repayments' ? db.prepare(`INSERT INTO repayments(reference,repayment_date) VALUES(?,?)`).run(header.reference.trim(), header.date) : db.prepare(`INSERT INTO ${c.head}(reference,${c.date},notes) VALUES(?,?,?)`).run(header.reference.trim(), header.date, header.notes ?? '');
            id = Number(result.lastInsertRowid);
        }
        if (kind === 'expenses') {
            const retained = rows.map(row => Number(row.id)).filter(Boolean);
            const deleteSql = retained.length ? `DELETE FROM expense_details WHERE expense_id=? AND id NOT IN (${retained.map(() => '?').join(',')})` : `DELETE FROM expense_details WHERE expense_id=?`;
            db.prepare(deleteSql).run(id, ...retained);
            const insert = db.prepare(`INSERT INTO expense_details(expense_id,item_id,quantity,price_lbp) VALUES(?,?,?,?)`);
            const update = db.prepare(`UPDATE expense_details SET item_id=?,quantity=?,price_lbp=? WHERE id=? AND expense_id=?`);
            for (const row of rows) {
                const item = Number(row.itemId);
                if (!item)
                    continue;
                const detailId = Number(row.id);
                if (detailId)
                    update.run(item, Number(row.quantity) || 0, Number(row.price) || 0, detailId, id);
                else
                    insert.run(id, item, Number(row.quantity) || 0, Number(row.price) || 0);
            }
        }
        else if (kind === 'payments') {
            db.prepare(`DELETE FROM payment_details WHERE payment_id=?`).run(id);
            const stmt = db.prepare(`INSERT INTO payment_details(payment_id,expense_id,expense_detail_id,paid_value_lbp,notes) VALUES(?,?,?,?,?)`);
            for (const row of rows) {
                const detail = Number(row.expenseDetailId);
                if (detail) {
                    const expense = db.prepare(`SELECT expense_id FROM expense_details WHERE id=?`).get(detail);
                    if (!expense)
                        throw new Error('المصروف المختار غير موجود. أعد تحميل المعلومات واختره مجدداً.');
                    stmt.run(id, expense.expense_id, detail, Number(row.paidValue) || 0, String(row.notes ?? ''));
                }
            }
        }
        else {
            db.prepare(`DELETE FROM repayment_details WHERE repayment_id=?`).run(id);
            const stmt = db.prepare(`INSERT INTO repayment_details(repayment_id,subscriber_id,paid_value_lbp,month_date,notes) VALUES(?,?,?,?,?)`);
            for (const row of rows) {
                const subscriber = Number(row.subscriberId);
                if (subscriber)
                    stmt.run(id, subscriber, Number(row.paidValue) || 0, String(row.monthDate ?? ''), String(row.notes ?? ''));
            }
        }
        return id;
    })();
}
function deleteFinance(db, kind, id) { const c = config[kind]; db.transaction(() => { db.prepare(`DELETE FROM ${c.detail} WHERE ${kind === 'expenses' ? 'expense_id' : kind === 'payments' ? 'payment_id' : 'repayment_id'}=?`).run(id); db.prepare(`DELETE FROM ${c.head} WHERE id=?`).run(id); })(); }
function getInstitutionDebts(db) {
    return db.prepare(`SELECT ed.id,e.id expenseId,e.reference,e.expense_date date,i.name itemName,ed.price_lbp requiredAmount,
    COALESCE((SELECT SUM(pd.paid_value_lbp) FROM payment_details pd WHERE pd.expense_detail_id=ed.id),0) paidAmount,
    ed.price_lbp-COALESCE((SELECT SUM(pd.paid_value_lbp) FROM payment_details pd WHERE pd.expense_detail_id=ed.id),0) remainingAmount
    FROM expense_details ed JOIN expenses e ON e.id=ed.expense_id JOIN expense_items i ON i.id=ed.item_id
    ORDER BY e.expense_date DESC,e.id DESC,ed.id`).all();
}
