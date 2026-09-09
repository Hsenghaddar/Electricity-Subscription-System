"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasUsers = hasUsers;
exports.authenticate = authenticate;
exports.listUsers = listUsers;
exports.saveUser = saveUser;
exports.deleteUser = deleteUser;
const node_crypto_1 = require("node:crypto");
function hashPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(16).toString('hex');
    return `${salt}:${(0, node_crypto_1.scryptSync)(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password, stored) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash)
        return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = (0, node_crypto_1.scryptSync)(password, salt, expected.length);
    return expected.length === actual.length && (0, node_crypto_1.timingSafeEqual)(expected, actual);
}
function toUser(row) {
    return { id: row.id, displayName: row.display_name, username: row.username, active: row.active === 1 };
}
function hasUsers(db) {
    return db.prepare('SELECT COUNT(*) count FROM users').get().count > 0;
}
function authenticate(db, username, password) {
    const row = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username.trim());
    return row && passwordMatches(password, row.password_hash) ? toUser(row) : undefined;
}
function listUsers(db) {
    return db.prepare('SELECT * FROM users ORDER BY id').all().map(toUser);
}
function saveUser(db, input) {
    const displayName = input.displayName.trim();
    const username = input.username.trim();
    if (!displayName || !username)
        throw new Error('يرجى إدخال اسم المستخدم واسم الدخول.');
    if (input.id) {
        if (input.password) {
            db.prepare(`UPDATE users SET display_name=?, username=?, password_hash=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
                .run(displayName, username, hashPassword(input.password), input.active ? 1 : 0, input.id);
        }
        else {
            db.prepare(`UPDATE users SET display_name=?, username=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
                .run(displayName, username, input.active ? 1 : 0, input.id);
        }
    }
    else {
        if (!input.password)
            throw new Error('يرجى إدخال كلمة السر.');
        db.prepare('INSERT INTO users (display_name, username, password_hash, active) VALUES (?, ?, ?, ?)')
            .run(displayName, username, hashPassword(input.password), input.active ? 1 : 0);
    }
}
function deleteUser(db, id) {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
}
