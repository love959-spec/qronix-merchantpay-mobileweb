/* =========================================================
   PayMerchant — 가맹점 결제 App (데모)
   순수 바닐라 JS SPA (해시 라우팅 + localStorage 목 백엔드)
   ========================================================= */

'use strict';

/* ---------------- 유틸 ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

const won = (n) => Number(n || 0).toLocaleString('ko-KR');
const pad = (n) => String(n).padStart(2, '0');

// HTML 출력 인코딩(XSS 방지) — innerHTML 에 들어가는 동적 값은 반드시 esc() 처리
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 비밀값 단방향 해시 (PIN 평문 저장 방지)
async function sha256b64(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return b64urlFromBuf(d);
}

function nowParts() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}
function rnd(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}
function genTxnNo() { return 'T' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + rnd(6); }
function genApprovalNo() { return rnd(8); }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ---------------- 저장소 (목 백엔드) ---------------- */
const Store = {
  KEY_TXN: 'pm_txns',
  KEY_CFG: 'pm_cfg',
  KEY_AUTH: 'pm_auth',

  cfg() {
    return Object.assign(
      { loginMethod: 'idpw', userId: 'master01', userRole: 'owner', storeName: '데모 분식 강남점' },
      JSON.parse(localStorage.getItem(this.KEY_CFG) || '{}')
    );
  },
  saveCfg(c) { localStorage.setItem(this.KEY_CFG, JSON.stringify(Object.assign(this.cfg(), c))); },

  txns() { return JSON.parse(localStorage.getItem(this.KEY_TXN) || '[]'); },
  saveTxns(arr) { localStorage.setItem(this.KEY_TXN, JSON.stringify(arr)); },
  addTxn(t) { const a = this.txns(); a.unshift(t); this.saveTxns(a); return t; },
  updateTxn(id, patch) {
    const a = this.txns();
    const i = a.findIndex((x) => x.id === id);
    if (i >= 0) { a[i] = Object.assign(a[i], patch); this.saveTxns(a); return a[i]; }
    return null;
  },

  isAuthed() { return sessionStorage.getItem(this.KEY_AUTH) === '1'; },
  login() { sessionStorage.setItem(this.KEY_AUTH, '1'); },
  logout() { sessionStorage.removeItem(this.KEY_AUTH); },

  seed() {
    if (localStorage.getItem(this.KEY_TXN)) return;
    const { date } = nowParts();
    const sample = [
      { method: '현장결제', amount: 12000, time: '11:24:07', card: '신한카드 ****1234' },
      { method: '카카오알림톡', amount: 28000, time: '12:02:51', card: '국민카드 ****8821' },
      { method: 'SMS결제', amount: 9500, time: '12:41:33', card: '삼성카드 ****4410' },
      { method: '현장결제', amount: 45000, time: '13:15:09', card: '현대카드 ****2030' },
    ].map((s) => ({
      id: 'tx_' + rnd(10), date, time: s.time, method: s.method, amount: s.amount,
      txnNo: genTxnNo(), approvalNo: genApprovalNo(), card: s.card, status: 'approved',
    }));
    this.saveTxns(sample);
  },
};

/* ---------------- 라우터 ---------------- */
const routes = {};
function route(path, fn) { routes[path] = fn; }
function nav(hash) { location.hash = hash; }
function go(hash) { nav(hash); }

function render() {
  const hash = location.hash.replace(/^#/, '') || '/login';
  const [path] = hash.split('?');
  const params = parseQuery(hash);

  // 인증 가드
  if (path !== '/login' && !Store.isAuthed()) { nav('/login'); return; }
  if (path === '/login' && Store.isAuthed()) { nav('/main'); return; }

  const fn = routes[path] || routes['/main'];
  closeDrawer();
  app.innerHTML = '';
  fn(params);
  updateBottomNav(path);
  window.scrollTo(0, 0);
}

/* ---------------- 하단 네비게이션 바 ---------------- */
const BOTTOM_TABS = [
  { path: '/main', icon: '⌂', label: '홈' },
  { path: '/onsite', icon: '📷', label: '현장결제' },
  { path: '/sms', icon: '💬', label: 'SMS결제' },
  { path: '/kakao', icon: '🟡', label: '알림톡' },
  { path: '/sales', icon: '📊', label: '매출관리' },
];
const SIDE_MORE = [
  { path: '/admin', icon: '🏪', label: '관리자' },
  { path: '/settings', icon: '⚙️', label: '설정' },
];
function updateBottomNav(path) {
  const bn = document.getElementById('bottomnav');
  const sb = document.getElementById('sidebar');
  const authed = Store.isAuthed();
  if (!authed || path === '/login') {
    if (bn) bn.classList.add('hidden');
    if (sb) sb.classList.add('hidden');
    document.body.classList.remove('has-bottomnav');
    return;
  }
  const active = (p) => (path === p ? 'active' : '');
  if (bn) {
    bn.innerHTML = BOTTOM_TABS.map((t) =>
      `<button class="bn-item ${active(t.path)}" onclick="go('${t.path}')">
         <span class="bn-ic">${t.icon}</span><span class="bn-lb">${esc(t.label)}</span>
       </button>`).join('');
    bn.classList.remove('hidden');
  }
  if (sb) {
    const cfg = Store.cfg();
    const item = (t) =>
      `<button class="sb-item ${active(t.path)}" onclick="go('${t.path}')"><span class="sb-ic">${t.icon}</span><span>${esc(t.label)}</span></button>`;
    sb.innerHTML =
      `<div class="sb-brand"><div class="sb-logo">₩</div><div class="sb-info"><div class="sb-title">PayMerchant</div><div class="sb-store">${esc(cfg.storeName)}</div></div></div>` +
      `<nav class="sb-list">${BOTTOM_TABS.map(item).join('')}<div class="sb-div"></div>${SIDE_MORE.map(item).join('')}` +
      `<button class="sb-item sb-logout" onclick="doLogout()"><span class="sb-ic">⎋</span><span>로그아웃</span></button></nav>`;
    sb.classList.remove('hidden');
  }
  document.body.classList.add('has-bottomnav');
}
function parseQuery(hash) {
  const q = hash.split('?')[1];
  const o = {};
  if (q) q.split('&').forEach((kv) => { const [k, v] = kv.split('='); o[k] = decodeURIComponent(v || ''); });
  return o;
}
window.addEventListener('hashchange', render);

/* ---------------- 공통 컴포넌트 ---------------- */
function appbar(title, opts = {}) {
  const back = opts.back ? `<button class="icon-btn" onclick="history.back()" aria-label="이전">‹</button>` : `<div class="spacer"></div>`;
  const menu = opts.menu ? `<button class="icon-btn" onclick="openDrawer()" aria-label="메뉴">☰</button>` : `<div class="spacer"></div>`;
  return `<header class="appbar">${back}<h1>${title}</h1><div class="bar-right">${menu}</div></header>`;
}
function stepBar(cur, total) {
  let h = '<div class="steps">';
  for (let i = 1; i <= total; i++) {
    const cls = i < cur ? 'done' : i === cur ? 'on' : '';
    h += `<div class="dot ${cls}">${i < cur ? '✓' : i}</div>`;
    if (i < total) h += `<div class="bar ${i < cur ? 'done' : ''}"></div>`;
  }
  return h + '</div>';
}
function methodBadge(m) {
  const map = { 'SMS결제': 'sms', '카카오알림톡': 'kakao' };
  return `<span class="badge ${map[m] || 'method'}">${esc(m)}</span>`;
}

/* ---------------- 드로어(네비게이션) ---------------- */
function openDrawer() {
  const cfg = Store.cfg();
  const roleTxt = cfg.userRole === 'owner' ? '가맹점주' : '판매직원';
  const d = $('#drawer');
  d.innerHTML = `
    <div class="dhead">
      <div class="nm">${esc(cfg.storeName)}</div>
      <div class="role">${esc(cfg.userId)} · ${roleTxt}</div>
    </div>
    <button class="ditem" onclick="closeDrawer();go('/admin')"><span class="di">🏪</span> 관리자</button>
    <button class="ditem" onclick="closeDrawer();go('/settings')"><span class="di">⚙️</span> 설정</button>
    <button class="ditem logout" onclick="doLogout()"><span class="di">⎋</span> 로그아웃</button>
  `;
  d.classList.remove('hidden');
  $('#drawer-backdrop').classList.remove('hidden');
}
function closeDrawer() {
  $('#drawer').classList.add('hidden');
  $('#drawer-backdrop').classList.add('hidden');
}
$('#drawer-backdrop').addEventListener('click', closeDrawer);
function doLogout() { Store.logout(); closeDrawer(); toast('로그아웃 되었습니다'); nav('/login'); }

/* =========================================================
   화면: 로그인
   ========================================================= */
let pendingUser = null;   // 1차 인증(ID/PW) 통과한 사용자
let pendingSecret = null; // OTP 등록 중 임시 시크릿

function loginShell(inner) {
  return `<div class="login-wrap">
      <div class="brand"><div class="logo">₩</div><h1>PayMerchant</h1><p>가맹점 결제 단말 · 데모</p></div>
      <div class="login-card">${inner}</div>
    </div>`;
}
function loginSwitchLinks(cur) {
  const opts = [];
  if (cur !== 'idpw') opts.push(`<a onclick="renderLogin('idpw')">ID/비밀번호</a>`);
  if (cur !== 'faceid' && hasBio()) opts.push(`<a onclick="renderLogin('faceid')">Face ID</a>`);
  if (cur !== 'fingerprint' && hasBio()) opts.push(`<a onclick="renderLogin('fingerprint')">지문</a>`);
  if (!opts.length) return '';
  return `<div class="login-switch">다른 방법: ${opts.join(' · ')}</div>`;
}

route('/login', () => renderLogin());
function renderLogin(method) {
  const cfg = Store.cfg();
  const m = method || cfg.loginMethod || 'idpw';
  let inner = '';
  if (m === 'idpw') {
    inner = `<h2>ID / 비밀번호 로그인</h2>
      <div class="field"><label>아이디</label><input id="lg-id" value="${esc(cfg.userId)}" autocomplete="username"></div>
      <div class="field"><label>비밀번호</label><input id="lg-pw" type="password" placeholder="비밀번호 입력" value="demo1234"></div>
      <button class="btn" onclick="loginSubmit()">다음</button>
      ${loginSwitchLinks('idpw')}
      <div class="note">데모: ID/비밀번호는 검증하지 않습니다. 다음 단계에서 <b>구글 OTP</b> 인증을 진행합니다.</div>`;
  } else if (m === 'faceid' || m === 'fingerprint') {
    const ic = m === 'faceid' ? '🙂' : '☝️';
    const nm = m === 'faceid' ? 'Face ID' : '지문인증';
    if (!hasBio()) {
      inner = `<h2>${nm} 로그인</h2>
        <div class="note" style="white-space:pre-line">생체인증이 아직 등록되지 않았습니다.\n먼저 ID/비밀번호로 로그인한 뒤 생체인증을 등록하세요.</div>
        <button class="btn" style="margin-top:14px" onclick="renderLogin('idpw')">ID/비밀번호로 로그인</button>
        ${loginSwitchLinks(m)}`;
    } else {
      inner = `<h2>${nm} 로그인</h2>
        <button class="bio-btn" onclick="bioLogin('${nm}')"><span class="big">${ic}</span>${nm}로 로그인</button>
        ${loginSwitchLinks(m)}`;
    }
  } else if (m === 'pin') {
    inner = `<h2>간편인증번호 로그인</h2>
      <div class="field"><label>간편인증번호 6자리</label>
      <input id="lg-code" type="tel" inputmode="numeric" maxlength="6" placeholder="••••••" style="letter-spacing:8px;text-align:center;font-size:24px"></div>
      <button class="btn" onclick="pinLogin()">인증 후 로그인</button>
      ${loginSwitchLinks('pin')}
      <div class="note">처음 입력한 6자리가 이 기기의 간편인증번호로 등록됩니다.</div>`;
  }
  app.innerHTML = loginShell(inner);
}

function loginSubmit() {
  const id = $('#lg-id').value.trim();
  if (!id) return toast('아이디를 입력하세요');
  if (!$('#lg-pw').value) return toast('비밀번호를 입력하세요');
  pendingUser = id;
  renderOtpStep();
}

/* ----- 구글 OTP (TOTP) 등록/인증 ----- */
function renderOtpStep() { if (hasTotp()) renderOtpEntry(); else renderOtpSetup(); }

function renderOtpSetup() {
  pendingSecret = randomBase32(16);
  const label = encodeURIComponent('PayMerchant:' + (pendingUser || 'user'));
  const uri = `otpauth://totp/${label}?secret=${pendingSecret}&issuer=PayMerchant&algorithm=SHA1&digits=6&period=30`;
  app.innerHTML = loginShell(`
    <h2>구글 OTP 등록</h2>
    <p style="font-size:13px;color:var(--muted);margin:0 0 12px">Google Authenticator(구글 OTP) 앱에서 아래 QR을 스캔하거나 설정키를 입력해 계정을 추가하세요.</p>
    <div id="otp-qr" style="text-align:center;margin:6px 0 12px"></div>
    <div class="kv"><span class="k">설정키</span><span class="v" style="font-family:monospace;font-size:13px">${pendingSecret}</span></div>
    <div class="field" style="margin-top:14px"><label>앱에 표시된 6자리 코드</label>
      <input id="otp-code" type="tel" inputmode="numeric" maxlength="6" placeholder="••••••" style="letter-spacing:8px;text-align:center;font-size:24px"></div>
    <button class="btn" onclick="otpRegister()">등록 완료</button>
    <button class="btn ghost" style="margin-top:10px" onclick="renderLogin('idpw')">취소</button>
    <div class="note">구글 OTP 앱이 없다면 설정키를 지원하는 어떤 TOTP 앱이든 사용할 수 있습니다.</div>`);
  renderOtpQr(uri);
}
function renderOtpQr(uri) {
  const box = $('#otp-qr'); if (!box) return;
  if (typeof qrcode === 'undefined') { box.innerHTML = '<div class="note">QR 라이브러리를 불러오지 못했습니다. 설정키를 직접 입력하세요.</div>'; return; }
  try {
    const qr = qrcode(0, 'M'); qr.addData(uri); qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    const svg = box.querySelector('svg'); if (svg) { svg.style.width = '170px'; svg.style.height = '170px'; }
  } catch (e) { box.innerHTML = '<div class="note">QR 생성 실패: ' + e.message + '</div>'; }
}
async function otpRegister() {
  const code = ($('#otp-code').value || '').trim();
  if (!/^\d{6}$/.test(code)) return toast('6자리 코드를 입력하세요');
  if (!(await verifyTotp(pendingSecret, code))) return toast('코드가 일치하지 않습니다. 앱의 현재 코드를 확인하세요');
  localStorage.setItem(TOTP_KEY, pendingSecret);
  Store.saveCfg({ userId: pendingUser });
  toast('구글 OTP가 등록되었습니다');
  primaryLoginDone();
}
function renderOtpEntry() {
  app.innerHTML = loginShell(`
    <h2>구글 OTP 인증</h2>
    <p style="font-size:13px;color:var(--muted);margin:0 0 12px">Google Authenticator 앱에 표시된 6자리 코드를 입력하세요.</p>
    <div class="field"><label>OTP 6자리</label>
      <input id="otp-code" type="tel" inputmode="numeric" maxlength="6" placeholder="••••••" style="letter-spacing:8px;text-align:center;font-size:24px"></div>
    <button class="btn" onclick="otpVerify()">인증 후 로그인</button>
    <button class="btn ghost" style="margin-top:10px" onclick="renderLogin('idpw')">이전</button>
    <button class="btn ghost" style="margin-top:10px" onclick="otpReset()">구글 OTP 재등록</button>`);
}
async function otpVerify() {
  const code = ($('#otp-code').value || '').trim();
  if (!(await verifyTotp(localStorage.getItem(TOTP_KEY), code))) return toast('코드가 일치하지 않습니다');
  if (pendingUser) Store.saveCfg({ userId: pendingUser });
  primaryLoginDone();
}
function otpReset() { if (confirm('구글 OTP 등록을 초기화하고 다시 등록합니다.')) { localStorage.removeItem(TOTP_KEY); renderOtpSetup(); } }

/* ----- 1차 인증 완료 → (선택) 생체인증 등록 제안 ----- */
function primaryLoginDone() {
  Store.login();
  if (bioAvailable() && !hasBio()) { nav('/bio-enroll?first=1'); }
  else { toast('로그인 성공'); nav('/main'); }
}

async function pinLogin() {
  const c = $('#lg-code').value || '';
  if (!/^\d{6}$/.test(c)) return toast('6자리 숫자를 입력하세요');
  if (!(window.crypto && crypto.subtle)) return toast('보안 연결(HTTPS)에서만 사용할 수 있습니다');
  const rec = JSON.parse(localStorage.getItem('pm_pin') || 'null');
  if (rec && rec.salt) {
    // 평문이 아닌 솔트+해시 비교
    if ((await sha256b64(rec.salt + ':' + c)) !== rec.hash) return toast('간편인증번호가 일치하지 않습니다');
  } else {
    const salt = b64urlFromBuf(randBytes(8));
    localStorage.setItem('pm_pin', JSON.stringify({ salt, hash: await sha256b64(salt + ':' + c) }));
    toast('간편인증번호가 등록되었습니다');
  }
  Store.login(); toast('로그인 성공'); nav('/main');
}
/* =========================================================
   인증 공통: 바이트/Base32 + TOTP(구글 OTP) + WebAuthn(생체)
   ========================================================= */
const TOTP_KEY = 'pm_totp_secret';
const CRED_KEY = 'pm_webauthn_cred';

function randBytes(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
function b64urlFromBuf(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bufFromB64url(b64) {
  b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const s = atob(b64); const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b.buffer;
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function randomBase32(len = 16) { const r = randBytes(len); let s = ''; for (let i = 0; i < r.length; i++) s += B32[r[i] % 32]; return s; }
function base32Decode(str) {
  str = (str || '').replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0; const out = [];
  for (const ch of str) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  return new Uint8Array(out);
}
async function totpAt(secret, t) {
  let counter = Math.floor((t / 1000) / 30);
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) { msg[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = sig[sig.length - 1] & 0x0f;
  const bin = ((sig[off] & 0x7f) << 24) | ((sig[off + 1] & 0xff) << 16) | ((sig[off + 2] & 0xff) << 8) | (sig[off + 3] & 0xff);
  return (bin % 1000000).toString().padStart(6, '0');
}
async function verifyTotp(secret, code) {
  if (!secret || !/^\d{6}$/.test(code)) return false;
  const now = Date.now();
  for (const d of [0, -1, 1]) { if ((await totpAt(secret, now + d * 30000)) === code) return true; } // ±30초 허용
  return false;
}
function hasTotp() { return !!localStorage.getItem(TOTP_KEY); }
function hasBio() { return !!localStorage.getItem(CRED_KEY) || localStorage.getItem('pm_bio_sim') === '1'; }
function bioAvailable() {
  return window.isSecureContext && !!window.PublicKeyCredential
    && !/^\d{1,3}(\.\d{1,3}){3}$/.test(location.hostname); // IP는 WebAuthn 불가
}

/* ----- WebAuthn: 등록(create) / 로그인(get) 분리 ----- */
async function webauthnRegister() {
  const cfg = Store.cfg();
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randBytes(32),
      rp: { name: 'PayMerchant', id: location.hostname },
      user: { id: randBytes(16), name: cfg.userId, displayName: cfg.userId },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, attestation: 'none',
    },
  });
  localStorage.setItem(CRED_KEY, b64urlFromBuf(cred.rawId));
}
async function webauthnLogin() {
  await navigator.credentials.get({
    publicKey: {
      challenge: randBytes(32), rpId: location.hostname, timeout: 60000, userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: bufFromB64url(localStorage.getItem(CRED_KEY)), transports: ['internal'] }],
    },
  });
}

/* ----- 생체 로그인(등록된 자격증명으로 기기 생체 인증) ----- */
async function bioLogin(name) {
  // 데모 시뮬레이션으로 등록한 경우 (실제 생체정보 없이 흐름 시연)
  if (localStorage.getItem('pm_bio_sim') === '1' && !localStorage.getItem(CRED_KEY)) {
    const c = app.querySelector('.login-card');
    c.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div><p>${name} 인증 중...(데모)</p></div>`;
    return setTimeout(() => { Store.login(); toast(name + ' 인증 성공(데모)'); nav('/main'); }, 1000);
  }
  if (!bioAvailable()) return bioFallback(name, '이 환경에서는 생체인증을 사용할 수 없습니다.\nHTTPS(sslip.io 도메인) 접속이 필요합니다.');
  if (!hasBio()) return renderLogin('idpw');
  const card = app.querySelector('.login-card');
  card.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div><p>${name} 인증 중...<br><span style="font-size:12px;color:var(--muted)">기기의 생체 인증을 진행하세요</span></p></div>`;
  try {
    await webauthnLogin();
    Store.login(); toast(name + ' 인증 성공'); nav('/main');
  } catch (e) {
    const msg = (e && e.name === 'NotAllowedError') ? '인증이 취소되었거나 시간이 초과되었습니다.' : (e && e.message) || '인증에 실패했습니다.';
    bioFallback(name, msg);
  }
}
function bioFallback(name, message) {
  const card = app.querySelector('.login-card');
  const ic = name.indexOf('Face') >= 0 ? '🙂' : '☝️';
  card.innerHTML = `
    <h2>${name} 로그인</h2>
    <div class="note" style="border-color:#f5c6cb;background:#fff5f6;color:var(--danger);white-space:pre-line">${message}</div>
    <button class="bio-btn" style="margin-top:14px" onclick="bioLogin('${name}')"><span class="big">${ic}</span>다시 시도</button>
    <button class="btn ghost" style="margin-top:12px" onclick="renderLogin('idpw')">ID/비밀번호로 로그인</button>`;
}

/* =========================================================
   화면: 생체인증 등록 (1차 로그인 성공 후 / 설정에서 진입)
   ========================================================= */
function bioKindLabel() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return 'Face ID / Touch ID';
  if (/Android/.test(ua)) return '지문 / 얼굴인증';
  if (/Mac/.test(ua)) return 'Touch ID';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return '생체인증';
}
route('/bio-enroll', (p) => {
  const first = p.first === '1';
  const supported = bioAvailable();
  const enrolled = hasBio();
  const sim = localStorage.getItem('pm_bio_sim') === '1';
  const kind = bioKindLabel();
  const faceLike = /iPhone|iPad|iPod|Mac/.test(navigator.userAgent || '');

  let body;
  if (enrolled) {
    // 등록 완료 상태
    body = `
      <div class="enroll-hero done">
        <div class="eh-icon">✓</div>
        <h2>생체인증이 등록됐어요</h2>
        <p>이제 <b>${kind}</b>${sim ? '(데모)' : ''}으로<br>비밀번호 없이 바로 로그인할 수 있어요.</p>
      </div>
      <div class="card">
        <div class="kv"><span class="k">로그인 사용자</span><span class="v">${esc(Store.cfg().userId)}</span></div>
        <div class="kv"><span class="k">인증 방식</span><span class="v">${kind}${sim ? ' · 데모' : ''}</span></div>
        <div class="kv"><span class="k">상태</span><span class="v" style="color:var(--success);font-weight:700">● 사용 중</span></div>
      </div>
      <button class="btn" onclick="go('/main')">홈으로</button>
      <button class="btn ghost danger-text" style="margin-top:10px" onclick="bioRemove()">생체인증 해제</button>`;
  } else if (!supported) {
    // 등록 불가 환경
    body = `
      <div class="enroll-hero">
        <div class="eh-icon">🔒</div>
        <h2>생체인증 등록</h2>
        <p>현재 접속 환경에서는 등록할 수 없어요.</p>
      </div>
      <div class="card">
        <h3>등록하려면 이렇게 해주세요</h3>
        <ul class="check-list">
          <li>주소창이 <b>sslip.io (HTTPS)</b> 인지 확인 (IP 주소로는 불가)</li>
          <li>기기에 <b>Face ID·지문·화면잠금</b>이 설정되어 있어야 해요</li>
          <li>사이트 <b>인증서 신뢰</b>가 필요할 수 있어요</li>
        </ul>
        <button class="btn secondary" style="margin-top:8px" onclick="showCertHelp()">인증서 설치 안내 보기</button>
      </div>
      <button class="btn ghost" onclick="go('/main')">${first ? '나중에 하기 (홈으로)' : '홈으로'}</button>`;
  } else {
    // 등록 안내 (메인)
    body = `
      <div class="enroll-hero">
        <div class="eh-icon gradient">${faceLike ? '🙂' : '☝️'}</div>
        <h2>생체인증으로 간편 로그인</h2>
        <p>다음부터 비밀번호·OTP 없이<br><b>${kind}</b>으로 바로 로그인하세요.</p>
      </div>

      <div class="benefit-row">
        <div class="benefit"><div class="bi">⚡</div><div class="bt">빠른 로그인</div></div>
        <div class="benefit"><div class="bi">🛡️</div><div class="bt">안전한 인증</div></div>
        <div class="benefit"><div class="bi">🔑</div><div class="bt">비번 입력 불필요</div></div>
      </div>

      <div class="card">
        <h3>등록 방법 (약 10초)</h3>
        <ol class="how-steps">
          <li><span class="n">1</span><span>아래 <b>등록하기</b> 버튼을 누릅니다.</span></li>
          <li><span class="n">2</span><span>기기의 <b>${kind}</b> 인증 화면이 뜨면 인증합니다.</span></li>
          <li><span class="n">3</span><span>끝! 다음 로그인부터 생체인증을 사용해요.</span></li>
        </ol>
      </div>

      <button class="btn btn-lg" onclick="doBioEnroll()"><span class="big-ic">📲</span> ${kind}로 등록하기</button>
      <div class="cert-hint">인증 창이 안 뜨거나 실패하나요? <a onclick="showCertHelp()">인증서 설치 안내</a></div>
      <button class="btn ghost" style="margin-top:10px" onclick="go('/main')">${first ? '나중에 하기' : '홈으로'}</button>`;
  }

  app.innerHTML = `${appbar('생체인증 등록', { back: !first, menu: !first })}<div class="screen">${body}</div>`;
});
async function doBioEnroll() {
  if (!bioAvailable()) return toast('이 환경에서는 생체인증을 등록할 수 없습니다');
  // 기기에 Face ID/지문이 등록돼 있는지 먼저 확인 — 미등록이면 등록 안내 화면으로
  try {
    if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      const ready = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!ready) return renderNoBiometric();
    }
  } catch (e) {}
  const scr = app.querySelector('.screen');
  if (scr) scr.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div><p>생체 인증을 진행하세요...<br><span style="font-size:12px;color:var(--muted)">기기의 Face ID / 지문</span></p></div>`;
  try {
    await webauthnRegister();           // 기기의 실제 생체정보로 자격증명 생성
    localStorage.removeItem('pm_bio_sim');
    Store.saveCfg({ loginMethod: 'faceid' });
    toast('생체인증이 등록되었습니다');
    go('/main');
  } catch (e) {
    await showBioError(e);
  }
}
function bioRemove() {
  if (!confirm('이 기기의 생체인증 등록을 해제합니다.')) return;
  localStorage.removeItem(CRED_KEY);
  localStorage.removeItem('pm_bio_sim');
  if (['faceid', 'fingerprint'].includes(Store.cfg().loginMethod)) Store.saveCfg({ loginMethod: 'idpw' });
  toast('생체인증이 해제되었습니다');
  go('/bio-enroll');
}

/* ----- 생체 등록 실패 진단 / 인증서 설치 안내 / 데모 폴백 ----- */
function certUrl() {
  // CA 인증서를 '평문 HTTP'로 받음 — 신뢰 안 된 HTTPS에서는 다운로드가 멈춤
  // 서비스별 인증서 HTTP 포트: 웹(8443→8080), 모바일(9443→9080)
  const cp = (Number(location.port) === 9443) ? 9080 : 8080;
  return 'http://' + location.hostname + ':' + cp + '/devca.crt';
}
function certInstallSteps() {
  return [
    '※ iPhone은 Safari, Android는 Chrome으로 진행하세요.',
    '※ 반드시 “CA 인증서”로 설치 — “사용자/VPN 인증서”로 하면 “개인키가 필요”라고 막힙니다.',
    '',
    '[iPhone · Safari]',
    '1) 위 버튼/주소(HTTP)로 접속 → “프로파일이 다운로드됨”',
    '2) 설정 > 일반 > VPN 및 기기 관리 > 다운로드한 프로필 > 설치',
    '3) 설정 > 일반 > 정보 > 인증서 신뢰 설정 → 이 인증서 “전체 신뢰” 켜기',
    '4) Safari로 앱(https) 재접속(경고 없이 열림) 후 다시 등록',
    '',
    '[삼성 갤럭시]',
    '1) 위 버튼/주소(HTTP)로 인증서 다운로드',
    '2) 설정 검색창에 “CA” → “CA 인증서 설치”',
    '   (또는 설정 > 보안 및 개인정보 보호 > 기타 보안 설정 > 인증서 설치 > CA 인증서)',
    '3) 다운로드 폴더의 devca.crt 선택 → 설치',
    '4) Chrome로 앱(https) 재접속 후 다시 등록',
    '   ※ 화면 잠금(PIN/패턴)이 설정돼 있어야 설치됩니다.',
  ].join('\n');
}
function certHelpCard() {
  const url = certUrl();
  return `
    <div class="card">
      <h3>인증서 설치 / 신뢰</h3>
      <p style="font-size:13px;color:var(--muted);line-height:1.6;margin:0 0 10px">
        이 데모는 <b>자체서명 인증서</b>라, 휴대폰이 사이트를 신뢰하지 않으면 생체인증(WebAuthn)이 차단됩니다.
        다운로드가 <b>“일시중지”</b>로 멈췄다면, 신뢰 안 된 HTTPS에서 받으려 했기 때문입니다 — 아래 <b>HTTP 주소</b>로 받으세요.</p>
      <a class="btn" style="display:block;text-align:center;text-decoration:none" href="${url}">인증서 다운로드 (HTTP)</a>
      <div class="kv" style="margin-top:10px"><span class="k">직접 입력</span><span class="v" style="font-size:11.5px;font-family:monospace">${url}</span></div>
      <div class="note" style="white-space:pre-line;margin-top:12px">${certInstallSteps()}</div>
    </div>`;
}
function showCertHelp() {
  const scr = app.querySelector('.screen');
  if (!scr) return;
  scr.innerHTML = `
    <div class="section-title" style="margin-top:6px">생체인증이 안 될 때</div>
    ${certHelpCard()}
    <div class="btn-row">
      <button class="btn" onclick="doBioEnroll()">인증서 설치 후 · 다시 등록</button>
      <button class="btn ghost" onclick="go('/bio-enroll')">이전</button>
    </div>
    <button class="btn secondary" style="margin-top:12px" onclick="bioEnrollSimulate()">데모용으로 등록 (생체 없이 시뮬레이션)</button>`;
}
async function showBioError(e) {
  const name = (e && e.name) || 'Error';
  let uvpaa = true;
  try { if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) uvpaa = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (_) {}
  let reason, certCause = false, noBio = false;
  if (name === 'NotAllowedError') {
    if (!uvpaa) return renderNoBiometric();   // Face ID/지문 미등록 → 등록 안내 화면
    reason = '브라우저가 생체인증을 차단했거나 취소되었습니다. 대부분 “인증서 미신뢰”가 원인입니다.'; certCause = true;
  } else if (name === 'InvalidStateError') {
    reason = '이미 이 기기에 등록되어 있습니다. (그대로 로그인에 사용할 수 있어요)';
  } else if (name === 'SecurityError') {
    reason = '보안 오류입니다. sslip.io 도메인(HTTPS)으로 접속했는지 확인하세요.';
  } else if (name === 'NotSupportedError') {
    reason = '이 브라우저가 플랫폼 생체인증을 지원하지 않습니다.';
  } else {
    reason = '등록 중 오류가 발생했습니다.' + (e && e.message ? ' (' + e.message + ')' : '');
    certCause = true;
  }
  const scr = app.querySelector('.screen');
  if (!scr) return;
  scr.innerHTML = `
    <div class="result" style="padding:14px 0 4px"><div class="circle fail">!</div><h2>등록 실패</h2><p>${reason}</p></div>
    ${certCause ? certHelpCard() : ''}
    ${noBio ? `<div class="note">기기 설정에서 Face ID / Touch ID / 지문 또는 화면잠금을 먼저 등록한 뒤 다시 시도하세요.</div>` : ''}
    <div class="btn-row">
      <button class="btn" onclick="doBioEnroll()">다시 시도</button>
      <button class="btn ghost" onclick="go('/main')">홈으로</button>
    </div>
    <button class="btn secondary" style="margin-top:12px" onclick="bioEnrollSimulate()">데모용으로 등록 (생체 없이 시뮬레이션)</button>`;
}
function bioEnrollSimulate() {
  localStorage.setItem('pm_bio_sim', '1');
  Store.saveCfg({ loginMethod: 'faceid' });
  toast('데모용 생체인증으로 등록되었습니다 (시뮬레이션)');
  go('/main');
}

/* ----- 기기에 Face ID/지문 미등록 시: 안내 + 기기 설정으로 이동 ----- */
function renderNoBiometric() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  const kind = ios ? 'Face ID' : '지문 / 얼굴 인증';
  const steps = ios
    ? ['설정 앱 열기', '"Face ID 및 암호" 선택', '"Face ID 설정"으로 얼굴 등록', 'Safari로 돌아와 다시 등록']
    : ['설정 앱 열기', '"보안" 또는 "생체 인식 및 보안" 선택', '얼굴 인식 / 지문 등록', '브라우저로 돌아와 다시 등록'];
  const scr = app.querySelector('.screen');
  if (!scr) return go('/bio-enroll');
  scr.innerHTML = `
    <div class="result" style="padding:14px 0 4px">
      <div class="circle fail" style="background:var(--primary-light);color:var(--primary)">📱</div>
      <h2>${kind}가 등록되어 있지 않아요</h2>
      <p>이 기기에 ${kind}가 설정되어 있지 않습니다.<br>먼저 <b>기기 설정</b>에서 등록한 뒤 다시 시도해 주세요.</p>
    </div>
    <div class="card">
      <h3>${kind} 등록 방법</h3>
      <ol class="how-steps">${steps.map((s, i) => `<li><span class="n">${i + 1}</span><span>${esc(s)}</span></li>`).join('')}</ol>
    </div>
    <button class="btn" onclick="openDeviceBiometricSettings()">📲 기기 설정 열기</button>
    <div class="cert-hint">설정이 자동으로 안 열리면 위 순서대로 직접 이동해 주세요.</div>
    <div class="btn-row">
      <button class="btn ghost" onclick="doBioEnroll()">등록 완료 후 · 다시 시도</button>
      <button class="btn ghost" onclick="go('/main')">홈으로</button>
    </div>`;
}
function openDeviceBiometricSettings() {
  const ua = navigator.userAgent || '';
  if (/Android/.test(ua)) {
    toast('기기 설정(생체 등록)을 여는 중...');
    try { location.href = 'intent:#Intent;action=android.settings.BIOMETRIC_ENROLL;end'; } catch (e) {}
    return;
  }
  if (/iPhone|iPad|iPod/.test(ua)) {
    // 최신 iOS Safari는 웹에서 설정 앱 직접 열기를 막을 수 있어, 시도 후 수동 안내를 함께 표시
    toast('설정 앱이 열리지 않으면 직접 이동해 주세요');
    try { location.href = 'App-Prefs:PASSCODE'; } catch (e) {}
    return;
  }
  toast('기기 설정에서 Face ID / 지문을 등록해 주세요');
}

/* =========================================================
   화면: 메인
   ========================================================= */
route('/main', () => {
  const cfg = Store.cfg();
  const txns = Store.txns();
  const today = nowParts().date;
  const todays = txns.filter((t) => t.date === today && t.status === 'approved');
  const total = todays.reduce((s, t) => s + t.amount, 0);

  app.innerHTML = `
    ${appbar('PayMerchant', { menu: true })}
    <div class="screen">
      <div class="hero">
        <div class="store">${esc(cfg.storeName)}</div>
        <div class="amt">₩ ${won(total)}</div>
        <div class="sub">오늘 매출 · 승인 ${todays.length}건</div>
      </div>
      <div class="section-title">결제하기</div>
      <div class="menu-grid">
        <button class="menu-card" onclick="go('/onsite')">
          <div class="ic pay">📷</div><div class="t">현장결제</div>
          <div class="d">QR·바코드 스캔 결제</div>
        </button>
        <button class="menu-card" onclick="go('/sms')">
          <div class="ic sms">💬</div><div class="t">SMS결제</div>
          <div class="d">문자로 결제창 전송</div>
        </button>
        <button class="menu-card" onclick="go('/kakao')">
          <div class="ic kakao">🟡</div><div class="t">카카오 알림톡</div>
          <div class="d">알림톡으로 결제창 전송</div>
        </button>
        <button class="menu-card" onclick="go('/sales')">
          <div class="ic sales">📊</div><div class="t">매출관리</div>
          <div class="d">매출조회·거래취소</div>
        </button>
      </div>
    </div>`;
});

/* =========================================================
   화면: 현장결제 (4 step)
   ========================================================= */
const onsite = { amount: 0 };
route('/onsite', () => { onsite.amount = 0; onsiteStep1(); });

function onsiteStep1() {
  app.innerHTML = `
    ${appbar('현장결제', { back: true })}
    <div class="screen">
      ${stepBar(1, 4)}
      <div class="amount-display">
        <div class="label">결제금액</div>
        <div class="value" id="amt-val">0<span class="won">원</span></div>
      </div>
      <div class="quick-amt">
        ${[1000, 5000, 10000, 50000].map((q) => `<button onclick="amtAdd(${q})">+${won(q)}</button>`).join('')}
      </div>
      ${keypadHtml()}
      <button class="btn" style="margin-top:18px" onclick="onsiteToScan()">다음 · QR/바코드 스캔</button>
    </div>`;
  bindKeypad(() => onsite.amount, (v) => { onsite.amount = v; }, '#amt-val');
}
function onsiteToScan() {
  if (onsite.amount <= 0) return toast('결제금액을 입력하세요');
  onsiteStep2();
}
function onsiteStep2() {
  app.innerHTML = `
    ${appbar('현장결제', { back: true })}
    <div class="screen">
      ${stepBar(2, 4)}
      <div class="card" style="text-align:center">
        <div style="font-size:13px;color:var(--muted)">결제금액</div>
        <div style="font-size:24px;font-weight:800">₩ ${won(onsite.amount)}</div>
      </div>
      <div class="section-title">고객 앱카드 QR / 바코드 스캔</div>
      <div id="reader"></div>
      <div class="scan-hint">카메라에 고객의 결제 QR 또는 바코드를 비춰주세요.</div>
      <button class="btn secondary" onclick="simScan()">📷 스캔 시뮬레이션 (데모)</button>
      <a class="btn ghost" style="display:block;text-align:center;text-decoration:none;margin-top:10px" href="testqr.html" target="_blank" rel="noopener">🧪 테스트 앱카드 QR 페이지 (PC 화면에서 열기)</a>
      <div class="note">처음 한 번 카메라 권한 허용이 필요합니다. QR과 주요 1D 바코드(EAN/UPC/CODE128 등)를 인식합니다. 테스트 QR은 <b>PC 모니터에 띄워</b> 휴대폰으로 스캔하세요. 인식이 안 되면 시뮬레이션 버튼으로 진행하세요.</div>
    </div>`;
  startScanner();
}

let qrScanner = null;
function scanFormats() {
  if (typeof Html5QrcodeSupportedFormats === 'undefined') return undefined;
  const F = Html5QrcodeSupportedFormats;
  return [F.QR_CODE, F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8,
    F.UPC_A, F.UPC_E, F.CODABAR, F.ITF, F.DATA_MATRIX, F.PDF_417];
}
function scanError(msg) {
  const r = document.querySelector('#reader');
  if (!r) return;
  r.innerHTML = `<div style="padding:28px 16px;text-align:center;color:#fff">
      <div style="font-size:38px">📷🚫</div>
      <p style="font-size:13px;margin:10px 0 0">${msg}</p>
    </div>`;
}
function startScanner() {
  if (typeof Html5Qrcode === 'undefined') { scanError('스캐너 로딩 중입니다. 잠시 후 다시 시도하거나 시뮬레이션을 사용하세요.'); return; }
  if (!window.isSecureContext) { scanError('카메라는 HTTPS 보안 연결에서만 동작합니다.<br>아래 시뮬레이션 버튼으로 진행하세요.'); return; }
  try {
    qrScanner = new Html5Qrcode('reader', { formatsToSupport: scanFormats(), verbose: false });
    qrScanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: { width: 250, height: 180 }, aspectRatio: 1.2 },
      (decoded) => { stopScanner(); toast('스캔 완료'); onsiteScanned(decoded); },
      () => {}
    ).catch((err) => {
      const m = (err && err.name === 'NotAllowedError')
        ? '카메라 권한이 거부되었습니다.<br>브라우저 설정에서 카메라를 허용해 주세요.'
        : '카메라를 열 수 없습니다.<br>아래 시뮬레이션 버튼으로 진행할 수 있습니다.';
      scanError(m);
    });
  } catch (e) { scanError('카메라 초기화에 실패했습니다.'); }
}
function stopScanner() {
  if (qrScanner) { try { qrScanner.stop().then(() => qrScanner.clear()).catch(() => {}); } catch (e) {} qrScanner = null; }
}
function simScan() {
  stopScanner();
  const fake = 'PAYCARD:' + rnd(16);
  onsiteScanned(fake);
}
const CARD_BRANDS = { SHINHAN: '신한카드', KB: '국민카드', SAMSUNG: '삼성카드', HYUNDAI: '현대카드', BC: 'BC카드', LOTTE: '롯데카드' };
function parseScannedCard(code) {
  // 테스트 QR 형식: PAYCARD|브랜드코드|마스킹번호|토큰
  if (typeof code === 'string' && code.indexOf('PAYCARD|') === 0) {
    const p = code.split('|');
    if (p.length >= 3 && p[1]) {
      const safe = (s) => String(s || '').replace(/[^0-9A-Za-z가-힣*\- ]/g, '').slice(0, 24); // 화이트리스트 + 길이 제한
      const brand = CARD_BRANDS[p[1]] || safe(p[1]);
      return `${brand} ${safe(p[2])}`.trim();
    }
  }
  // 그 외(임의 QR/바코드/시뮬레이션) → 데모 카드 임의 배정
  const cards = ['신한카드 ****1234', '국민카드 ****8821', '삼성카드 ****4410', '현대카드 ****2030'];
  return cards[Math.floor(Math.random() * cards.length)];
}
function onsiteScanned(code) {
  // step3: PG 결제 전문 생성 → 서버 전송
  const { date, time } = nowParts();
  const txnNo = genTxnNo();
  const packet = {
    msgType: 'PAYMENT_REQUEST',
    pgMid: 'DEMO_MID_0001',
    txnNo,
    amount: onsite.amount,
    currency: 'KRW',
    payToken: code,
    approvalType: 'QR_BARCODE',
    reqTime: `${date}T${time}`,
    terminalId: 'TID00012345',
  };
  app.innerHTML = `
    ${appbar('현장결제', {})}
    <div class="screen">
      ${stepBar(3, 4)}
      <div class="section-title">PG 결제 전문 생성 · 서버 전송</div>
      <div class="codebox" id="packet">${esc(JSON.stringify(packet, null, 2))}</div>
      <div class="spinner-wrap"><div class="spinner"></div><p>결제 승인 요청 중...</p></div>
    </div>`;
  setTimeout(() => {
    const card = parseScannedCard(code);
    const txn = Store.addTxn({
      id: 'tx_' + rnd(10), date, time, method: '현장결제', amount: onsite.amount,
      txnNo, approvalNo: genApprovalNo(), card,
      status: 'approved',
    });
    onsiteStep4(txn);
  }, 1800);
}
function onsiteStep4(txn) {
  app.innerHTML = `
    ${appbar('결제완료', {})}
    <div class="screen">
      ${stepBar(5, 4)}
      <div class="result">
        <div class="circle ok">✓</div>
        <h2>결제 승인 완료</h2>
        <p>정상적으로 결제가 처리되었습니다.</p>
      </div>
      <div class="card">
        <div class="kv"><span class="k">결제금액</span><span class="v">₩ ${won(txn.amount)}</span></div>
        <div class="kv"><span class="k">결제수단</span><span class="v">${esc(txn.card)}</span></div>
        <div class="kv"><span class="k">거래일시</span><span class="v">${txn.date} ${txn.time}</span></div>
        <div class="kv"><span class="k">거래번호</span><span class="v">${txn.txnNo}</span></div>
        <div class="kv"><span class="k">승인번호</span><span class="v">${txn.approvalNo}</span></div>
      </div>
      <div class="btn-row">
        <button class="btn ghost" onclick="go('/sales')">매출 보기</button>
        <button class="btn" onclick="go('/main')">홈으로</button>
      </div>
    </div>`;
}

/* ----- 금액 키패드 공통 ----- */
function keypadHtml() {
  const keys = ['1','2','3','4','5','6','7','8','9','00','0','←'];
  return `<div class="keypad">${keys.map((k) =>
    `<button class="${k === '←' ? 'fn' : ''}" data-k="${k}">${k}</button>`).join('')}</div>`;
}
function bindKeypad(get, set, displaySel) {
  const disp = $(displaySel);
  app.querySelectorAll('.keypad button').forEach((b) => {
    b.addEventListener('click', () => {
      let v = String(get());
      const k = b.dataset.k;
      if (k === '←') v = v.slice(0, -1) || '0';
      else if (k === '00') v = v === '0' ? '0' : v + '00';
      else v = v === '0' ? k : v + k;
      v = v.replace(/^0+(?=\d)/, '');
      const n = Math.min(Number(v), 99999999);
      set(n);
      disp.innerHTML = `${won(n)}<span class="won">원</span>`;
    });
  });
}
function amtAdd(q) {
  onsite.amount = Math.min(onsite.amount + q, 99999999);
  $('#amt-val').innerHTML = `${won(onsite.amount)}<span class="won">원</span>`;
}

/* =========================================================
   화면: SMS결제 / 카카오 알림톡 결제
   ========================================================= */
const TELCOS = ['SKT', 'KT', 'LG U+', '알뜰폰'];

function remitForm(kind) {
  const isKakao = kind === 'kakao';
  const title = isKakao ? '카카오 알림톡 결제' : 'SMS결제';
  app.innerHTML = `
    ${appbar(title, { back: true })}
    <div class="screen">
      ${stepBar(1, 2)}
      <div class="card">
        <h3>결제 정보 입력</h3>
        <div class="field"><label>결제금액</label>
          <input id="rm-amt" type="tel" inputmode="numeric" placeholder="금액 입력" oninput="this.value=this.value.replace(/[^0-9]/g,'');rmAmtFmt()">
          <div id="rm-amt-fmt" class="amt-hint">₩ 0</div>
          <div class="quick-amt" style="justify-content:flex-start;margin:10px 0 0">
            ${[1000, 5000, 10000, 50000].map((q) => `<button type="button" onclick="rmAmtAdd(${q})">+${won(q)}</button>`).join('')}
            <button type="button" onclick="rmAmtClear()">지움</button>
          </div>
        </div>
        <div class="field"><label>통신사</label>
          <select id="rm-telco">${TELCOS.map((t) => `<option>${t}</option>`).join('')}</select></div>
        <div class="field"><label>고객 휴대폰번호</label>
          <input id="rm-phone" type="tel" inputmode="numeric" placeholder="01012345678" oninput="this.value=this.value.replace(/[^0-9]/g,'')" maxlength="11"></div>
      </div>
      <button class="btn ${isKakao ? 'kakao' : 'sms'}" onclick="remitSend('${kind}')">
        ${isKakao ? '알림톡 전송' : 'SMS 전송'}
      </button>
    </div>`;
}
route('/sms', () => remitForm('sms'));
route('/kakao', () => remitForm('kakao'));

function rmAmtFmt() {
  const i = $('#rm-amt'), f = $('#rm-amt-fmt');
  if (f) f.textContent = '₩ ' + won(Number(i.value || 0));
}
function rmAmtAdd(q) {
  const i = $('#rm-amt');
  i.value = String(Math.min(Number(i.value || 0) + q, 99999999));
  rmAmtFmt();
}
function rmAmtClear() { const i = $('#rm-amt'); i.value = ''; rmAmtFmt(); }

function remitSend(kind) {
  const amt = Number($('#rm-amt').value || 0);
  const telco = $('#rm-telco').value;
  const phone = $('#rm-phone').value;
  if (amt <= 0) return toast('결제금액을 입력하세요');
  if (phone.length < 10) return toast('휴대폰번호를 정확히 입력하세요');

  const isKakao = kind === 'kakao';
  const { date, time } = nowParts();
  const txnNo = genTxnNo();
  const payUrl = `${location.origin}/pay.html?txn=${txnNo}&amt=${amt}`;

  // 발송중
  app.innerHTML = `${appbar(isKakao ? '카카오 알림톡 결제' : 'SMS결제', {})}
    <div class="screen">${stepBar(2, 2)}
    <div class="spinner-wrap"><div class="spinner"></div><p>${isKakao ? '알림톡' : 'SMS'} 전송 중...</p></div></div>`;

  setTimeout(() => {
    // 미결제(전송됨) 상태로 거래 기록
    Store.addTxn({
      id: 'tx_' + rnd(10), date, time, method: isKakao ? '카카오알림톡' : 'SMS결제',
      amount: amt, txnNo, approvalNo: '-', card: `${telco} ${phone}`, status: 'sent', payUrl,
    });
    const phoneFmt = phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
    const preview = isKakao ? `
      <div class="msg-preview kakao">
        <div class="head">🟡 ${esc(Store.cfg().storeName)} 결제요청</div>
        <div class="bubble">
          안녕하세요, 고객님.<br>
          아래 결제를 요청드립니다.<br><br>
          • 가맹점: ${esc(Store.cfg().storeName)}<br>
          • 결제금액: <b>${won(amt)}원</b><br>
          • 거래번호: ${txnNo}<br><br>
          ▶ 결제하기<br>
          <span class="link">${payUrl}</span>
        </div>
      </div>` : `
      <div class="msg-preview sms">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px">[Web발신]</div>
        <div class="bubble">
          [${esc(Store.cfg().storeName)}] 결제요청<br>
          금액 ${won(amt)}원<br>
          거래 ${txnNo}<br>
          결제 ▶ <span class="link">${payUrl}</span>
        </div>
      </div>`;

    app.innerHTML = `
      ${appbar(isKakao ? '카카오 알림톡 결제' : 'SMS결제', {})}
      <div class="screen">
        ${stepBar(3, 2)}
        <div class="result" style="padding:18px 0 8px">
          <div class="circle ok">✓</div>
          <h2>전송 완료</h2>
          <p>${telco} ${phoneFmt} 으로<br>결제정보와 결제창 URL을 전송했습니다.</p>
        </div>
        <div class="section-title">고객에게 전송된 ${isKakao ? '알림톡' : '문자'} 미리보기</div>
        ${preview}
        <div class="btn-row">
          <button class="btn ghost" onclick="window.open('${payUrl}','_blank','noopener')">결제창 미리보기</button>
          <button class="btn" onclick="go('/main')">홈으로</button>
        </div>
        <div class="note">데모에서는 실제 발송 대신 미리보기를 표시합니다. '결제창 미리보기'로 고객 결제 화면을 확인할 수 있습니다.</div>
      </div>`;
  }, 1500);
}

/* =========================================================
   화면: 매출관리
   ========================================================= */
route('/sales', () => {
  const txns = Store.txns();
  const today = nowParts().date;
  const todays = txns.filter((t) => t.date === today);
  const approved = todays.filter((t) => t.status === 'approved');
  const total = approved.reduce((s, t) => s + t.amount, 0);
  const canceled = todays.filter((t) => t.status === 'canceled');

  const listHtml = txns.length ? txns.map(txnCard).join('') :
    `<div class="empty"><div class="ic">🧾</div>거래 내역이 없습니다.</div>`;

  app.innerHTML = `
    ${appbar('매출관리', { back: true, menu: true })}
    <div class="screen">
      <div class="hero">
        <div class="store">오늘 매출 합계</div>
        <div class="amt">₩ ${won(total)}</div>
        <div class="sub">승인 ${approved.length}건 · 취소 ${canceled.length}건</div>
      </div>
      <div class="btn-row" style="margin-bottom:6px">
        <button class="btn danger" onclick="go('/cancel')">거래취소</button>
      </div>
      <div class="section-title">전체 거래내역</div>
      ${listHtml}
    </div>`;
});
function txnCard(t) {
  const statusBadge = t.status === 'approved' ? '<span class="badge ok">승인</span>'
    : t.status === 'canceled' ? '<span class="badge cancel">취소</span>'
    : '<span class="badge sms">전송됨</span>';
  return `
    <div class="list-item" onclick="go('/txn?id=${t.id}')">
      <div class="top">
        <div class="amount">₩ ${won(t.amount)}</div>
        ${statusBadge}
      </div>
      <div class="meta">
        ${methodBadge(t.method)} ${esc(t.card)}<br>
        ${t.date} ${t.time} · 거래 ${t.txnNo} · 승인 ${t.approvalNo}
      </div>
    </div>`;
}

/* =========================================================
   화면: 거래취소 — step1 조회조건 입력
   ========================================================= */
route('/cancel', () => {
  const { date } = nowParts();
  app.innerHTML = `
    ${appbar('거래취소', { back: true })}
    <div class="screen">
      ${stepBar(1, 3)}
      <div class="card">
        <h3>거래 조회</h3>
        <div class="row2">
          <div class="field"><label>거래일</label><input id="c-date" type="date" value="${date}"></div>
          <div class="field"><label>거래시간(시)</label><input id="c-time" type="tel" inputmode="numeric" placeholder="예: 13" maxlength="2"></div>
        </div>
        <div class="field"><label>결제수단</label>
          <select id="c-method">
            <option value="">전체</option>
            <option>현장결제</option><option>SMS결제</option><option>카카오알림톡</option>
          </select></div>
        <div class="field"><label>거래번호</label><input id="c-txn" placeholder="거래번호 (선택)"></div>
        <div class="row2">
          <div class="field"><label>승인번호</label><input id="c-appr" placeholder="승인번호 (선택)"></div>
          <div class="field"><label>금액</label><input id="c-amt" type="tel" inputmode="numeric" placeholder="금액 (선택)"></div>
        </div>
      </div>
      <button class="btn" onclick="cancelSearch()">조회</button>
      <div class="note">조건을 비워두면 해당 일자 전체를 조회합니다. 데모 데이터로 조회됩니다.</div>
    </div>`;
});
function cancelSearch() {
  const f = {
    date: $('#c-date').value,
    hour: $('#c-time').value.trim(),
    method: $('#c-method').value,
    txn: $('#c-txn').value.trim(),
    appr: $('#c-appr').value.trim(),
    amt: $('#c-amt').value.trim(),
  };
  let list = Store.txns().filter((t) => t.status === 'approved');
  if (f.date) list = list.filter((t) => t.date === f.date);
  if (f.hour) list = list.filter((t) => t.time.startsWith(pad(f.hour)));
  if (f.method) list = list.filter((t) => t.method === f.method);
  if (f.txn) list = list.filter((t) => t.txnNo.includes(f.txn));
  if (f.appr) list = list.filter((t) => t.approvalNo.includes(f.appr));
  if (f.amt) list = list.filter((t) => String(t.amount) === f.amt.replace(/[^0-9]/g, ''));

  cancelResults(list);
}
function cancelResults(list) {
  const rows = list.length ? list.map((t) => `
    <div class="list-item">
      <div class="top">
        <div class="amount">₩ ${won(t.amount)}</div>
        ${methodBadge(t.method)}
      </div>
      <div class="meta">
        ${t.date} ${t.time}<br>
        거래 ${t.txnNo} · 승인 ${t.approvalNo}
      </div>
      <button class="btn secondary" style="margin-top:10px;padding:10px" onclick="go('/txn?id=${t.id}&from=cancel')">상세내역</button>
    </div>`).join('') : `<div class="empty"><div class="ic">🔍</div>조회 결과가 없습니다.<br>조건을 변경해 다시 조회하세요.</div>`;

  app.innerHTML = `
    ${appbar('거래취소', { back: true })}
    <div class="screen">
      ${stepBar(2, 3)}
      <div class="section-title">거래 조회 결과 · ${list.length}건</div>
      ${rows}
    </div>`;
}

/* =========================================================
   화면: 거래 상세내역 (취소 진행)
   ========================================================= */
route('/txn', (p) => {
  const t = Store.txns().find((x) => x.id === p.id);
  if (!t) { toast('거래를 찾을 수 없습니다'); return go('/sales'); }
  const fromCancel = p.from === 'cancel';
  const cancellable = t.status === 'approved';

  app.innerHTML = `
    ${appbar('거래 상세내역', { back: true })}
    <div class="screen">
      ${fromCancel ? stepBar(3, 3) : ''}
      <div class="result" style="padding:14px 0 6px">
        <div class="circle ${t.status === 'canceled' ? 'fail' : 'ok'}">${t.status === 'canceled' ? '↩' : '✓'}</div>
        <h2>₩ ${won(t.amount)}</h2>
        <p>${t.status === 'approved' ? '승인완료' : t.status === 'canceled' ? '취소완료' : '결제창 전송됨'}</p>
      </div>
      <div class="card">
        <div class="kv"><span class="k">결제수단</span><span class="v">${esc(t.method)}</span></div>
        <div class="kv"><span class="k">카드/대상</span><span class="v">${esc(t.card)}</span></div>
        <div class="kv"><span class="k">거래일시</span><span class="v">${t.date} ${t.time}</span></div>
        <div class="kv"><span class="k">거래번호</span><span class="v">${t.txnNo}</span></div>
        <div class="kv"><span class="k">승인번호</span><span class="v">${t.approvalNo}</span></div>
        <div class="kv"><span class="k">상태</span><span class="v">${t.status === 'approved' ? '승인' : t.status === 'canceled' ? '취소' : '전송됨'}</span></div>
        ${t.canceledAt ? `<div class="kv"><span class="k">취소일시</span><span class="v">${t.canceledAt}</span></div>` : ''}
      </div>
      <div class="btn-row">
        <button class="btn ghost" onclick="history.back()">이전화면</button>
        ${cancellable ? `<button class="btn danger" onclick="confirmCancel('${t.id}')">거래취소</button>` : ''}
      </div>
    </div>`;
});
function confirmCancel(id) {
  const t = Store.txns().find((x) => x.id === id);
  if (!t) return;
  if (!confirm(`해당 거래를 취소하시겠습니까?\n\n금액: ${won(t.amount)}원\n거래번호: ${t.txnNo}`)) return;

  // step5: 거래정보 서버 전송
  const packet = {
    msgType: 'CANCEL_REQUEST', pgMid: 'DEMO_MID_0001',
    origTxnNo: t.txnNo, approvalNo: t.approvalNo, amount: t.amount,
    reqTime: `${nowParts().date}T${nowParts().time}`,
  };
  app.innerHTML = `
    ${appbar('거래취소', {})}
    <div class="screen">
      <div class="section-title">취소 전문 생성 · 서버 전송</div>
      <div class="codebox">${esc(JSON.stringify(packet, null, 2))}</div>
      <div class="spinner-wrap"><div class="spinner"></div><p>취소 처리 중...</p></div>
    </div>`;
  setTimeout(() => {
    const { date, time } = nowParts();
    Store.updateTxn(id, { status: 'canceled', canceledAt: `${date} ${time}` });
    // step6: 결과 안내
    app.innerHTML = `
      ${appbar('거래취소 완료', {})}
      <div class="screen">
        <div class="result">
          <div class="circle ok">✓</div>
          <h2>거래취소 완료</h2>
          <p>정상적으로 취소 처리되었습니다.</p>
        </div>
        <div class="card">
          <div class="kv"><span class="k">취소금액</span><span class="v">₩ ${won(t.amount)}</span></div>
          <div class="kv"><span class="k">원거래번호</span><span class="v">${t.txnNo}</span></div>
          <div class="kv"><span class="k">승인번호</span><span class="v">${t.approvalNo}</span></div>
          <div class="kv"><span class="k">취소일시</span><span class="v">${date} ${time}</span></div>
        </div>
        <div class="btn-row">
          <button class="btn ghost" onclick="go('/cancel')">거래취소 계속</button>
          <button class="btn" onclick="go('/sales')">매출관리</button>
        </div>
      </div>`;
  }, 1700);
}

/* =========================================================
   화면: 관리자
   ========================================================= */
route('/admin', () => {
  const cfg = Store.cfg();
  const txns = Store.txns();
  const today = nowParts().date;
  const todays = txns.filter((t) => t.date === today);
  const approved = todays.filter((t) => t.status === 'approved');
  const canceled = todays.filter((t) => t.status === 'canceled');
  const byMethod = {};
  approved.forEach((t) => { byMethod[t.method] = (byMethod[t.method] || 0) + t.amount; });
  const methodRows = Object.keys(byMethod).length
    ? Object.entries(byMethod).map(([m, v]) => `<div class="kv"><span class="k">${m}</span><span class="v">₩ ${won(v)}</span></div>`).join('')
    : `<div class="kv"><span class="k">데이터 없음</span><span class="v">-</span></div>`;

  app.innerHTML = `
    ${appbar('관리자', { back: true, menu: true })}
    <div class="screen">
      <div class="section-title">가맹점 정보</div>
      <div class="card">
        <div class="kv"><span class="k">가맹점명</span><span class="v">${esc(cfg.storeName)}</span></div>
        <div class="kv"><span class="k">가맹점 MID</span><span class="v">DEMO_MID_0001</span></div>
        <div class="kv"><span class="k">단말기(TID)</span><span class="v">TID00012345</span></div>
        <div class="kv"><span class="k">사업자번호</span><span class="v">123-45-67890</span></div>
        <div class="kv"><span class="k">로그인 사용자</span><span class="v">${esc(cfg.userId)} (${cfg.userRole === 'owner' ? '가맹점주' : '판매직원'})</span></div>
      </div>
      <div class="section-title">오늘 정산 요약</div>
      <div class="card">
        <div class="kv"><span class="k">승인 합계</span><span class="v">₩ ${won(approved.reduce((s, t) => s + t.amount, 0))} (${approved.length}건)</span></div>
        <div class="kv"><span class="k">취소 합계</span><span class="v">₩ ${won(canceled.reduce((s, t) => s + t.amount, 0))} (${canceled.length}건)</span></div>
      </div>
      <div class="section-title">결제수단별 매출</div>
      <div class="card">${methodRows}</div>
      <div class="section-title">테스트 도구</div>
      <a class="btn secondary" style="display:block;text-align:center;text-decoration:none;margin-bottom:12px" href="testqr.html" target="_blank" rel="noopener">🧪 테스트 앱카드 QR 코드</a>
      <div class="section-title">데이터 관리</div>
      <button class="btn ghost" onclick="resetData()">데모 데이터 초기화</button>
    </div>`;
});
function resetData() {
  if (!confirm('모든 거래내역을 초기화하고 샘플 데이터를 다시 생성합니다.')) return;
  localStorage.removeItem(Store.KEY_TXN);
  Store.seed();
  toast('초기화 완료');
  go('/admin');
}

/* =========================================================
   화면: 설정
   ========================================================= */
route('/settings', () => {
  const cfg = Store.cfg();
  const methods = [
    ['idpw', 'ID / 비밀번호 + 구글 OTP', '비밀번호 입력 후 구글 OTP 2단계 인증'],
    ['faceid', 'Face ID', '기기 얼굴인식으로 로그인 (등록 필요)'],
    ['fingerprint', '지문인증', '기기 지문으로 로그인 (등록 필요)'],
    ['pin', '간편인증번호', '6자리 PIN으로 로그인'],
  ];
  app.innerHTML = `
    ${appbar('설정', { back: true, menu: true })}
    <div class="screen">
      <div class="section-title">로그인 방법 설정</div>
      <div class="opt-list">
        ${methods.map(([v, t, d]) => `
          <label class="opt-item">
            <input type="radio" name="lm" value="${v}" ${cfg.loginMethod === v ? 'checked' : ''} onchange="setLoginMethod('${v}')">
            <div class="oc"><div class="ot">${t}</div><div class="od">${d}</div></div>
          </label>`).join('')}
      </div>

      <div class="section-title">로그인 사용자 정보</div>
      <div class="card">
        <div class="field"><label>아이디 (ID)</label><input id="set-id" value="${esc(cfg.userId)}"></div>
        <div class="field"><label>가맹점명</label><input id="set-store" value="${esc(cfg.storeName)}"></div>
        <label style="font-size:13px;font-weight:600;color:var(--muted)">사용자 구분</label>
      </div>
      <div class="opt-list">
        <label class="opt-item">
          <input type="radio" name="role" value="owner" ${cfg.userRole === 'owner' ? 'checked' : ''}>
          <div class="oc"><div class="ot">가맹점주</div><div class="od">전체 기능 · 정산 관리</div></div>
        </label>
        <label class="opt-item">
          <input type="radio" name="role" value="staff" ${cfg.userRole === 'staff' ? 'checked' : ''}>
          <div class="oc"><div class="ot">판매직원</div><div class="od">결제 · 매출조회</div></div>
        </label>
      </div>

      <div class="section-title">보안 등록</div>
      <div class="card">
        <div class="kv"><span class="k">구글 OTP</span><span class="v">${hasTotp() ? '등록됨 ✓' : '미등록'}</span></div>
        <div class="kv"><span class="k">생체인증(Face ID/지문)</span><span class="v">${hasBio() ? '등록됨 ✓' : '미등록'}</span></div>
      </div>
      <a class="btn secondary" style="display:block;text-align:center;text-decoration:none;margin-bottom:10px" onclick="go('/bio-enroll')">생체인증 등록 / 관리</a>
      <button class="btn ghost" onclick="otpReregister()">구글 OTP 재등록</button>

      <button class="btn" style="margin-top:18px" onclick="saveSettings()">저장</button>
    </div>`;
});
function setLoginMethod(v) {
  if ((v === 'faceid' || v === 'fingerprint') && !hasBio()) {
    toast('먼저 생체인증을 등록하세요');
    return go('/bio-enroll');
  }
  Store.saveCfg({ loginMethod: v });
  toast('로그인 방법이 변경되었습니다');
}
function otpReregister() {
  if (!confirm('구글 OTP 등록을 초기화합니다. 다음 ID/비밀번호 로그인 시 다시 등록합니다.')) return;
  localStorage.removeItem(TOTP_KEY);
  toast('구글 OTP가 초기화되었습니다');
  go('/settings');
}
function saveSettings() {
  const role = app.querySelector('input[name="role"]:checked').value;
  const clean = (s, max) => String(s || '').replace(/[<>"'`\\]/g, '').trim().slice(0, max);
  Store.saveCfg({
    userId: clean($('#set-id').value, 32) || 'master01',
    storeName: clean($('#set-store').value, 40) || '데모 가맹점',
    userRole: (role === 'owner' || role === 'staff') ? role : 'owner',
  });
  toast('저장되었습니다');
  go('/main');
}

/* ---------------- 부팅 ---------------- */
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.doLogout = doLogout;
window.go = go;
Store.seed();
render();
