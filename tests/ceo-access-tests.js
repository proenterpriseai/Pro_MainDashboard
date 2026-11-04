/**
 * api/ceo-access-code.js 테스트 (FEATURE_CEO_CARD, 2026-11-04)
 * 네트워크 0 — 로컬 RSA 키로 서명한 토큰 + fetch 스텁(공개 인증서·Firestore 응답)으로 전 경로 검증
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const handler = require(path.join(__dirname, '..', 'api', 'ceo-access-code.js'));
const T = handler._test;

const PROJECT_ID = 'pro-enterprise-ai';
const KID = 'test-kid-1';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB_PEM = publicKey.export({ type: 'spki', format: 'pem' });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeToken(payloadOverride, opts) {
  const o = opts || {};
  const now = Math.floor(Date.now() / 1000);
  const header = Object.assign({ alg: 'RS256', kid: KID, typ: 'JWT' }, o.header || {});
  const payload = Object.assign({
    aud: PROJECT_ID, iss: 'https://securetoken.google.com/' + PROJECT_ID,
    sub: 'uidApproved01', iat: now - 10, exp: now + 3600, auth_time: now - 100
  }, payloadOverride || {});
  const input = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(input), o.key || privateKey);
  return input + '.' + b64url(sig);
}

function mockReq(o) {
  const h = Object.assign({ origin: 'https://pro-dashboards.com' }, (o && o.headers) || {});
  return { method: (o && o.method) || 'POST', headers: h };
}
function mockRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.setHeader = function (k, v) { r.headers[k.toLowerCase()] = v; };
  r.status = function (c) { r.statusCode = c; return r; };
  r.json = function (b) { r.body = b; return r; };
  return r;
}

// fetch 스텁: 인증서 URL → {KID: PUB_PEM}, Firestore users/{uid} → 상태별 응답
const STATUS_BY_UID = { uidApproved01: 'approved', uidPending01: 'pending', uidWithdrawn: 'withdrawn' };
let fetchCalls = [];
function stubFetch(url, init) {
  fetchCalls.push({ url: String(url), init: init });
  if (String(url).indexOf('securetoken@system.gserviceaccount.com') !== -1) {
    return Promise.resolve({
      ok: true, status: 200,
      headers: { get: function () { return 'public, max-age=3600'; } },
      json: function () { const d = {}; d[KID] = PUB_PEM; return Promise.resolve(d); }
    });
  }
  const m = /documents\/users\/([^?]+)/.exec(String(url));
  if (m) {
    const uid = decodeURIComponent(m[1]);
    if (uid === 'uidFsDenied') return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) });
    if (uid === 'uidFsError') return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    if (!STATUS_BY_UID[uid]) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ fields: { status: { stringValue: STATUS_BY_UID[uid] } } }) });
  }
  return Promise.reject(new Error('unexpected url ' + url));
}

describe('ceo-access-code: 순수 함수', () => {
  it('isAllowedOrigin — 대시보드·프리뷰만 허용', () => {
    assert.equal(T.isAllowedOrigin({ headers: { origin: 'https://pro-dashboards.com' } }), true);
    assert.equal(T.isAllowedOrigin({ headers: { origin: 'https://pro-main-dashboard-abc123.vercel.app' } }), true);
    assert.equal(T.isAllowedOrigin({ headers: { origin: 'https://proceoconsulting.com' } }), false);
    assert.equal(T.isAllowedOrigin({ headers: { origin: 'https://pro-dashboards.com.evil.io' } }), false);
    assert.equal(T.isAllowedOrigin({ headers: {} }), false);
  });

  it('checkClaims — 정상 토큰은 uid 반환', () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = T.decodeJwt(makeToken());
    assert.equal(T.checkClaims(jwt.payload, now), 'uidApproved01');
  });

  it('checkClaims — aud·iss·만료·미래 발급·sub 형식 오류는 거부', () => {
    const now = Math.floor(Date.now() / 1000);
    const bad = [
      { aud: 'other-project' },
      { iss: 'https://securetoken.google.com/other' },
      { exp: now - 120 },
      { iat: now + 600 },
      { auth_time: now + 600 },
      { sub: '' },
      { sub: '../users/x' },
      { sub: 'a'.repeat(129) },
      { sub: 123 }
    ];
    bad.forEach(function (o) {
      assert.equal(T.checkClaims(T.decodeJwt(makeToken(o)).payload, now), null, JSON.stringify(o));
    });
  });

  it('decodeJwt — 형식 오류는 null', () => {
    assert.equal(T.decodeJwt('abc'), null);
    assert.equal(T.decodeJwt('a.b'), null);
    assert.equal(T.decodeJwt('!!.!!.!!'), null);
    assert.equal(T.decodeJwt('x'.repeat(5000)), null);
    assert.equal(T.decodeJwt(null), null);
  });

  it('verifySignature — 올바른 키만 통과, alg·kid·다른 키 서명은 거부', () => {
    const certs = {}; certs[KID] = PUB_PEM;
    assert.equal(T.verifySignature(T.decodeJwt(makeToken()), certs), true);
    assert.equal(T.verifySignature(T.decodeJwt(makeToken({}, { key: other.privateKey })), certs), false);
    assert.equal(T.verifySignature(T.decodeJwt(makeToken({}, { header: { kid: 'unknown' } })), certs), false);
    assert.equal(T.verifySignature(T.decodeJwt(makeToken({}, { header: { alg: 'none' } })), certs), false);
    // payload 위조(서명 그대로) → 실패
    const t = makeToken().split('.');
    const forged = t[0] + '.' + b64url(JSON.stringify({ sub: 'uidAdmin' })) + '.' + t[2];
    assert.equal(T.verifySignature(T.decodeJwt(forged), certs), false);
  });

  // 운영 형식 = Google이 주는 X.509 인증서 PEM. openssl로 자체 서명 인증서를 만들어 같은 경로 검증(없으면 건너뜀)
  const ossl = spawnSync('openssl', ['version'], { encoding: 'utf8' });
  it('verifySignature — X.509 인증서 PEM(운영 형식)으로도 검증', { skip: ossl.status !== 0 && 'openssl 없음' }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceo-cert-'));
    const keyPath = path.join(dir, 'k.pem');
    const crtPath = path.join(dir, 'c.pem');
    try {
      const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', crtPath,
        '-days', '1', '-subj', '/CN=ceo-access-test'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const certPem = fs.readFileSync(crtPath, 'utf8');
      const key = crypto.createPrivateKey(fs.readFileSync(keyPath, 'utf8'));
      assert.match(certPem, /BEGIN CERTIFICATE/);
      const certs = {}; certs[KID] = certPem;
      assert.equal(T.verifySignature(T.decodeJwt(makeToken({}, { key: key })), certs), true);
      assert.equal(T.verifySignature(T.decodeJwt(makeToken({}, { key: other.privateKey })), certs), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ceo-access-code: 핸들러 경로', () => {
  let origFetch;
  let origEnv;
  beforeEach(() => {
    origFetch = global.fetch;
    origEnv = process.env.CEO_ACCESS_CODE;
    global.fetch = stubFetch;
    fetchCalls = [];
    T.resetCertCache();
    process.env.CEO_ACCESS_CODE = 'TEST-CODE-1234';
  });
  afterEach(() => {
    global.fetch = origFetch;
    if (origEnv === undefined) delete process.env.CEO_ACCESS_CODE; else process.env.CEO_ACCESS_CODE = origEnv;
  });

  async function call(req) { const res = mockRes(); await handler(req, res); return res; }

  it('승인자 → 200 + 코드, no-store', async () => {
    const res = await call(mockReq({ headers: { authorization: 'Bearer ' + makeToken() } }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, code: 'TEST-CODE-1234' });
    assert.match(res.headers['cache-control'], /no-store/);
    // Firestore 조회는 사용자 본인 토큰으로, 본인 uid 문서만
    const fs = fetchCalls.find(c => c.url.indexOf('firestore.googleapis.com') !== -1);
    assert.ok(fs.url.indexOf('/users/uidApproved01?') !== -1);
    assert.match(fs.init.headers.Authorization, /^Bearer /);
  });

  it('승인 대기·탈퇴·문서 없음 → 403 NOT_APPROVED (코드 미포함)', async () => {
    for (const sub of ['uidPending01', 'uidWithdrawn', 'uidNoDoc']) {
      const res = await call(mockReq({ headers: { authorization: 'Bearer ' + makeToken({ sub: sub }) } }));
      assert.equal(res.statusCode, 403, sub);
      assert.equal(res.body.code, 'NOT_APPROVED');
      assert.equal(JSON.stringify(res.body).indexOf('TEST-CODE'), -1);
    }
  });

  it('env 미설정 → 503 NOT_CONFIGURED', async () => {
    delete process.env.CEO_ACCESS_CODE;
    const res = await call(mockReq({ headers: { authorization: 'Bearer ' + makeToken() } }));
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'NOT_CONFIGURED');
  });

  it('토큰 없음 401 · 서명 위조 401 · Firestore 거부 401 · Firestore 오류 503', async () => {
    let res = await call(mockReq());
    assert.equal(res.statusCode, 401); assert.equal(res.body.code, 'AUTH_REQUIRED');
    res = await call(mockReq({ headers: { authorization: 'Bearer ' + makeToken({}, { key: other.privateKey }) } }));
    assert.equal(res.statusCode, 401); assert.equal(res.body.code, 'AUTH_INVALID');
    res = await call(mockReq({ headers: { authorization: 'Bearer ' + makeToken({ sub: 'uidFsDenied' }) } }));
    assert.equal(res.statusCode, 401); assert.equal(res.body.code, 'AUTH_INVALID');
    res = await call(mockReq({ headers: { authorization: 'Bearer ' + makeToken({ sub: 'uidFsError' }) } }));
    assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'UNAVAILABLE');
  });

  it('공개 인증서 조회 실패 → 503 UNAVAILABLE (코드 미포함)', async () => {
    global.fetch = function (url) {
      if (String(url).indexOf('securetoken@system.gserviceaccount.com') !== -1) {
        return Promise.resolve({ ok: false, status: 500, headers: { get: () => '' }, json: () => Promise.resolve({}) });
      }
      return stubFetch(url);
    };
    const res = await call(mockReq({ headers: { authorization: 'Bearer ' + makeToken() } }));
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'UNAVAILABLE');
    assert.equal(JSON.stringify(res.body).indexOf('TEST-CODE'), -1);
  });

  it('GET 405 · 다른 출처 403 (토큰 검사 전에 차단)', async () => {
    let res = await call(mockReq({ method: 'GET' }));
    assert.equal(res.statusCode, 405);
    res = await call(mockReq({ headers: { origin: 'https://evil.example', authorization: 'Bearer ' + makeToken() } }));
    assert.equal(res.statusCode, 403); assert.equal(res.body.code, 'FORBIDDEN_ORIGIN');
    assert.equal(fetchCalls.length, 0);
  });
});
