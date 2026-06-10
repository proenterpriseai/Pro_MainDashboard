/**
 * SMS 비밀번호 재설정 API — Pro Enterprise AI 메인 대시보드
 *
 * POST /api/sms-pw-reset
 *   { action: 'request', empNo, name }             → 본인확인 + 인증번호 SMS 발송
 *   { action: 'confirm', empNo, otp, newPassword } → 인증번호 검증 + 비밀번호 즉시 변경
 *
 * 환경변수 (전부 Vercel Sensitive):
 *   SOLAPI_API_KEY / SOLAPI_API_SECRET / SMS_SENDER_PHONE / FIREBASE_ADMIN_REFRESH_TOKEN
 *
 * 보안 장치:
 *   - Origin/Referer 화이트리스트 (vertex-proxy 하드닝 패턴)
 *   - 사원번호당 발송 일 5회 + 재발송 쿨다운 60초
 *   - OTP 6자리 / 5분 만료 / 검증 5회 실패 시 무효화 / 해시 저장 (평문 저장 0)
 *   - 발송 대상 = Firestore users에 등록된 본인 번호만 (임의 번호 발송 불가)
 *   - OTP 문서(pw_reset_otps)는 Firestore 엄격 규칙 catch-all(if false)로 클라이언트 접근 차단,
 *     서버(owner 토큰)만 읽고 씀
 */
'use strict';

const crypto = require('crypto');

const PROJECT_ID = 'pro-enterprise-ai';
// Firebase CLI 공개 OAuth 클라이언트 (firebase-tools 소스에 내장된 공개값 — 비밀 아님)
const FB_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FB_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const OTP_TTL_MS = 5 * 60 * 1000;      // 인증번호 유효 5분
const RESEND_COOLDOWN_MS = 60 * 1000;  // 재발송 쿨다운 60초
const MAX_SENDS_PER_DAY = 5;           // 사원번호당 일일 발송 한도
const MAX_VERIFY_ATTEMPTS = 5;         // 검증 시도 한도

function isAllowedOrigin(req) {
  const src = req.headers.origin || req.headers.referer || '';
  let host = '';
  try { host = new URL(src).hostname; } catch (_) { return false; }
  if (host === 'pro-dashboards.com' || host === 'www.pro-dashboards.com') return true;
  // Vercel 기본/프리뷰 도메인 (pro-main-dashboard-*.vercel.app)
  if (/^pro-main-dashboard[a-z0-9.-]*\.vercel\.app$/.test(host)) return true;
  return false;
}

// ── 공통 fetch (JSON) ──
async function jfetch(url, options) {
  const resp = await fetch(url, options);
  let data = null;
  try { data = await resp.json(); } catch (_) { /* non-JSON body */ }
  return { status: resp.status, data: data };
}

// ── Google OAuth: refresh token → access token ──
async function getAccessToken() {
  const refreshToken = process.env.FIREBASE_ADMIN_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('SERVER_CONFIG:FIREBASE_ADMIN_REFRESH_TOKEN');
  const body = 'grant_type=refresh_token'
    + '&refresh_token=' + encodeURIComponent(refreshToken)
    + '&client_id=' + encodeURIComponent(FB_CLI_CLIENT_ID)
    + '&client_secret=' + encodeURIComponent(FB_CLI_CLIENT_SECRET);
  const resp = await jfetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  });
  if (!resp.data || !resp.data.access_token) throw new Error('ACCESS_TOKEN_FAIL');
  return resp.data.access_token;
}

// ── Firestore REST 헬퍼 ──
const FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';

function fsAuth(token) { return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }; }

async function fsGetDoc(token, col, id) {
  const r = await jfetch(FS_BASE + '/' + col + '/' + encodeURIComponent(id), { headers: fsAuth(token) });
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error('FS_GET_FAIL:' + col);
  return r.data;
}

async function fsSetDoc(token, col, id, fields, requireUpdateTime) {
  // requireUpdateTime 지정 시 낙관적 잠금 — 읽은 시점 이후 변경됐으면 실패 (병렬 시도 직렬화)
  let url = FS_BASE + '/' + col + '/' + encodeURIComponent(id);
  if (requireUpdateTime) url += '?currentDocument.updateTime=' + encodeURIComponent(requireUpdateTime);
  const r = await jfetch(url, {
    method: 'PATCH',
    headers: fsAuth(token),
    body: JSON.stringify({ fields: fields })
  });
  if (r.status !== 200) {
    if (requireUpdateTime && (r.status === 409 || r.status === 412 || r.status === 400)) {
      throw new Error('FS_PRECONDITION');
    }
    throw new Error('FS_SET_FAIL:' + col);
  }
}

async function fsDeleteDoc(token, col, id) {
  const r = await jfetch(FS_BASE + '/' + col + '/' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: fsAuth(token)
  });
  if (r.status !== 200 && r.status !== 204) throw new Error('FS_DELETE_FAIL:' + col);
}

async function fsFindUserByEmpNo(token, empNo) {
  const body = JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: { fieldFilter: { field: { fieldPath: 'employeeNo' }, op: 'EQUAL', value: { stringValue: empNo } } }
    }
  });
  const r = await jfetch(FS_BASE + ':runQuery', { method: 'POST', headers: fsAuth(token), body: body });
  if (r.status !== 200) throw new Error('FS_QUERY_FAIL');
  const rows = Array.isArray(r.data) ? r.data : [];
  const users = [];
  for (const row of rows) {
    if (!row.document) continue;
    const f = row.document.fields || {};
    users.push({
      uid: (row.document.name || '').split('/').pop(),
      email: (f.email && f.email.stringValue) || '',
      displayName: (f.displayName && f.displayName.stringValue) || '',
      phone: (f.phone && f.phone.stringValue) || ''
    });
  }
  return users;
}

function str(v) { return { stringValue: String(v) }; }
function int(v) { return { integerValue: String(v) }; }
function getInt(fields, key) { return parseInt((fields[key] && fields[key].integerValue) || '0', 10); }
function getStr(fields, key) { return (fields[key] && fields[key].stringValue) || ''; }

// ── OTP ──
function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp(empNo, otp) {
  // pepper로 SOLAPI_API_SECRET 재사용 (DB 유출 시에도 OTP 역산 불가)
  return crypto.createHash('sha256').update(empNo + ':' + otp + ':' + (process.env.SOLAPI_API_SECRET || '')).digest('hex');
}

function kstDateString() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function maskPhone(phone) {
  if (phone.length < 8) return '***';
  return phone.slice(0, 3) + '-****-' + phone.slice(-4);
}

// ── SOLAPI SMS 발송 ──
async function sendSms(to, text) {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const from = process.env.SMS_SENDER_PHONE;
  if (!apiKey || !apiSecret || !from) throw new Error('SERVER_CONFIG:SOLAPI');
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  const r = await jfetch('https://api.solapi.com/messages/v4/send-many/detail', {
    method: 'POST',
    headers: {
      'Authorization': 'HMAC-SHA256 apiKey=' + apiKey + ', date=' + date + ', salt=' + salt + ', signature=' + signature,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages: [{ to: to, from: from, text: text }] })
  });
  if (r.status !== 200) {
    console.error('[sms-pw-reset] SOLAPI 발송 실패', r.status, JSON.stringify(r.data));
    throw new Error('SMS_SEND_FAIL');
  }
}

// ── Identity Toolkit: 비밀번호 변경 ──
async function updateAuthPassword(token, uid, newPassword) {
  const r = await jfetch('https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT_ID + '/accounts:update', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, password: newPassword })
  });
  if (r.status !== 200) throw new Error('PW_UPDATE_FAIL');
}

// ── action: request ──
async function handleRequest(token, empNo, name) {
  // 1. 본인확인: employee_lookup 이름 매칭
  const lookupDoc = await fsGetDoc(token, 'employee_lookup', empNo);
  if (!lookupDoc) return { ok: false, code: 'NO_MATCH' };
  const lf = lookupDoc.fields || {};
  if (getStr(lf, 'displayName').trim() !== name) return { ok: false, code: 'NO_MATCH' };
  const lookupUid = getStr(lf, 'uid');

  // 2. users에서 휴대폰 번호 조회 — lookup uid 정확 매칭만 허용
  //    (중복 가입 계정 존재 시 엉뚱한 계정 비번 변경 차단 — 2026-05-07 최은주 중복계정 사례)
  const users = await fsFindUserByEmpNo(token, empNo);
  const user = users.find(function (u) { return u.uid === lookupUid; });
  if (!user) return { ok: false, code: 'NO_MATCH' };
  const phone = (user.phone || '').replace(/[^0-9]/g, '');
  if (!phone || phone.length < 10) return { ok: false, code: 'NO_PHONE' };

  // 3. 발송 한도 검사 (쿨다운 60초 + 일 5회)
  const now = Date.now();
  const today = kstDateString();
  const otpDoc = await fsGetDoc(token, 'pw_reset_otps', empNo);
  let sendCount = 0;
  if (otpDoc) {
    const f = otpDoc.fields || {};
    const lastSentAt = getInt(f, 'lastSentAt');
    if (now - lastSentAt < RESEND_COOLDOWN_MS) {
      return { ok: false, code: 'COOLDOWN', wait: Math.ceil((RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000) };
    }
    if (getStr(f, 'sendDate') === today) sendCount = getInt(f, 'sendCount');
    if (sendCount >= MAX_SENDS_PER_DAY) return { ok: false, code: 'DAILY_LIMIT' };
  }

  // 4. OTP 생성 + 해시 저장 + SMS 발송
  const otp = generateOtp();
  await fsSetDoc(token, 'pw_reset_otps', empNo, {
    otpHash: str(hashOtp(empNo, otp)),
    uid: str(user.uid),
    expiresAt: int(now + OTP_TTL_MS),
    attempts: int(0),
    sendDate: str(today),
    sendCount: int(sendCount + 1),
    lastSentAt: int(now)
  });
  await sendSms(phone, '[Pro Enterprise AI] 인증번호 ' + otp + ' (5분내 유효)');
  return { ok: true, maskedPhone: maskPhone(phone) };
}

// ── action: confirm ──
async function handleConfirm(token, empNo, otp, newPassword) {
  const otpDoc = await fsGetDoc(token, 'pw_reset_otps', empNo);
  if (!otpDoc) return { ok: false, code: 'NO_REQUEST' };
  const f = otpDoc.fields || {};
  const now = Date.now();

  if (now > getInt(f, 'expiresAt')) return { ok: false, code: 'OTP_EXPIRED' };
  const attempts = getInt(f, 'attempts');
  if (attempts >= MAX_VERIFY_ATTEMPTS) return { ok: false, code: 'OTP_LOCKED' };

  // 시도 슬롯 선점: 해시 비교 전에 attempts를 낙관적 잠금으로 증분 →
  // 병렬 confirm 폭주여도 검증 기회가 정확히 5회로 직렬화됨 (무차별 대입 차단)
  const preserved = {};
  for (const k of ['otpHash', 'uid', 'expiresAt', 'sendDate', 'sendCount', 'lastSentAt']) {
    if (f[k]) preserved[k] = f[k];
  }
  preserved.attempts = int(attempts + 1);
  try {
    await fsSetDoc(token, 'pw_reset_otps', empNo, preserved, otpDoc.updateTime);
  } catch (err) {
    if (err.message === 'FS_PRECONDITION') return { ok: false, code: 'OTP_BUSY' };
    throw err;
  }

  if (getStr(f, 'otpHash') !== hashOtp(empNo, otp)) {
    return { ok: false, code: 'OTP_INVALID', remaining: MAX_VERIFY_ATTEMPTS - attempts - 1 };
  }

  const uid = getStr(f, 'uid');
  if (!uid) return { ok: false, code: 'NO_REQUEST' };
  await updateAuthPassword(token, uid, newPassword);
  await fsDeleteDoc(token, 'pw_reset_otps', empNo);
  return { ok: true };
}

// ── 엔트리 ──
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
    return;
  }
  if (!isAllowedOrigin(req)) {
    res.status(403).json({ ok: false, code: 'FORBIDDEN_ORIGIN' });
    return;
  }

  const body = req.body || {};
  const action = String(body.action || '');
  const empNo = String(body.empNo || '').trim();
  const name = String(body.name || '').trim();

  if (!/^[0-9]{4,10}$/.test(empNo)) {
    res.status(200).json({ ok: false, code: 'NO_MATCH' });
    return;
  }

  try {
    if (action === 'request') {
      if (!name || name.length > 20) { res.status(200).json({ ok: false, code: 'NO_MATCH' }); return; }
      const token = await getAccessToken();
      res.status(200).json(await handleRequest(token, empNo, name));
      return;
    }
    if (action === 'confirm') {
      const otp = String(body.otp || '').trim();
      const newPassword = String(body.newPassword || '');
      if (!/^[0-9]{6}$/.test(otp)) { res.status(200).json({ ok: false, code: 'OTP_INVALID', remaining: null }); return; }
      if (newPassword.length < 6 || newPassword.length > 100) { res.status(200).json({ ok: false, code: 'WEAK_PASSWORD' }); return; }
      const token = await getAccessToken();
      res.status(200).json(await handleConfirm(token, empNo, otp, newPassword));
      return;
    }
    res.status(400).json({ ok: false, code: 'BAD_ACTION' });
  } catch (err) {
    console.error('[sms-pw-reset] 오류:', err && err.message);
    res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
  }
};
