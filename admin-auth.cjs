'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const equal = (a, b) => {
  const first = Buffer.from(String(a)), second = Buffer.from(String(b));
  return first.length === second.length && crypto.timingSafeEqual(first, second);
};
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

module.exports = function createAuth(dataDir) {
  const file = path.join(dataDir, 'admin-auth.json');
  const setupFile = path.join(dataDir, '管理员首次设置码.txt');
  const sessions = new Map(), attempts = new Map();
  let state;
  function save() {
    fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  }
  if (fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    const code = crypto.randomBytes(18).toString('hex').toUpperCase().match(/.{1,6}/g).join('-');
    state = { version: 1, admin: null, setupHash: digest(code), keys: [] };
    fs.writeFileSync(setupFile, '管理员首次设置码（仅首次创建账户使用）\r\n\r\n' + code + '\r\n\r\n打开 admin.html，输入此设置码并设置自己的账户与密码。请勿公开此文件。\r\n', { mode: 0o600 });
    save();
  }
  function throttle(req) {
    const key = digest(req.socket.remoteAddress || 'local'), now = Date.now();
    const entry = attempts.get(key);
    if (entry && now < entry.until && entry.count >= 8) throw fail('尝试次数较多，请 15 分钟后再试。', 429);
    const current = entry && now < entry.until ? entry : { count: 0, until: now + 15 * 60000 };
    current.count++; attempts.set(key, current);
    if (attempts.size > 5000) for (const [id, item] of attempts) if (item.until < now) attempts.delete(id);
    return key;
  }
  function session(req) {
    const cookie = /(?:^|;\s*)jianying_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
    if (!cookie) return null;
    const entry = sessions.get(cookie[1]);
    if (!entry || entry.expires <= Date.now()) { sessions.delete(cookie[1]); return null; }
    return entry;
  }
  function makeSession(req, res) {
    const id = crypto.randomBytes(32).toString('hex');
    const entry = { id, username: state.admin.username, csrf: crypto.randomBytes(32).toString('hex'), expires: Date.now() + 12 * 3600000 };
    sessions.set(id, entry);
    const secure = req.socket.encrypted || process.env.PUBLIC_ORIGIN?.startsWith('https://');
    res.setHeader('Set-Cookie', `jianying_admin=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure ? '; Secure' : ''}`);
    return entry;
  }
  function requireSession(req) {
    const entry = session(req);
    if (!entry) throw fail('请先登录管理员账户。', 401);
    return entry;
  }
  function requireCsrf(req) {
    const entry = requireSession(req);
    if (!equal(req.headers['x-editor-token'] || '', entry.csrf)) throw fail('操作验证已过期，请刷新管理页。', 403);
    return entry;
  }
  async function password(value, salt = crypto.randomBytes(16).toString('hex')) {
    if (typeof value !== 'string' || value.length < 10 || value.length > 128) throw fail('密码需要为 10～128 个字符。');
    return { salt, hash: (await scrypt(value, salt, 64)).toString('hex') };
  }
  async function checkPassword(value) {
    if (typeof value !== 'string' || value.length > 128 || !state.admin) return false;
    return equal((await scrypt(value, state.admin.salt, 64)).toString('hex'), state.admin.hash);
  }
  async function setup(req, res, input) {
    const attemptKey = throttle(req);
    if (state.admin) throw fail('管理员账户已经创建，请登录。', 409);
    if (typeof input.code !== 'string' || !equal(digest(input.code.trim().toUpperCase()), state.setupHash)) throw fail('首次设置码不正确。', 403);
    if (typeof input.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,40}$/.test(input.username)) throw fail('账户名需要为 3～40 位字母、数字、点、横线或下划线。');
    const credentials = await password(input.password);
    if (state.admin) throw fail('管理员账户已经创建，请登录。', 409);
    state.admin = { username: input.username, ...credentials, createdAt: new Date().toISOString() };
    state.setupHash = ''; save();
    if (fs.existsSync(setupFile)) fs.unlinkSync(setupFile);
    attempts.delete(attemptKey);
    return makeSession(req, res);
  }
  async function login(req, res, input) {
    const attemptKey = throttle(req);
    if (!state.admin || input.username !== state.admin.username || !await checkPassword(input.password)) throw fail('账户或密码不正确。', 401);
    attempts.delete(attemptKey);
    return makeSession(req, res);
  }
  function logout(req, res) {
    const entry = requireCsrf(req); sessions.delete(entry.id);
    res.setHeader('Set-Cookie', 'jianying_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  }
  async function changePassword(req, input) {
    const current = requireCsrf(req); throttle(req);
    if (!await checkPassword(input.currentPassword)) throw fail('当前密码不正确。', 403);
    Object.assign(state.admin, await password(input.password), { changedAt: new Date().toISOString() }); save();
    for (const id of sessions.keys()) if (id !== current.id) sessions.delete(id);
  }
  function keys() { return state.keys.map(({ hash, ...key }) => key); }
  function createKey(name) {
    if (state.keys.length >= 5) throw fail('最多保存 5 个接口密钥，请先撤销不用的密钥。');
    if (typeof name !== 'string' || !name.trim() || name.length > 80) throw fail('请填写 80 字以内的密钥名称。');
    const token = 'jy_' + crypto.randomBytes(32).toString('hex');
    const key = { id: crypto.randomUUID(), name: name.trim(), prefix: token.slice(0, 11), hash: digest(token), scope: 'analytics:read', createdAt: new Date().toISOString(), lastUsedAt: null };
    state.keys.push(key); save(); return { key: keys().find(item => item.id === key.id), token };
  }
  function revokeKey(id) { state.keys = state.keys.filter(key => key.id !== id); save(); }
  function apiKey(req) {
    const match = /^Bearer (jy_[a-f0-9]{64})$/.exec(req.headers.authorization || '');
    const hash = match ? digest(match[1]) : '';
    const key = state.keys.find(item => equal(item.hash, hash));
    if (!key) throw fail('统计接口密钥无效或已撤销。', 401);
    if (!key.lastUsedAt || Date.now() - Date.parse(key.lastUsedAt) > 60000) { key.lastUsedAt = new Date().toISOString(); save(); }
    return key;
  }
  return { session, requireSession, requireCsrf, setup, login, logout, changePassword, keys, createKey, revokeKey, apiKey, setupRequired: () => !state.admin };
};
