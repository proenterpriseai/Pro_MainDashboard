/**
 * 법인 CEO 컨설팅 접속 코드 조회 API — Pro Enterprise AI 메인 대시보드 (2026-11-04, FEATURE_CEO_CARD)
 *
 * POST /api/ceo-access-code   (본문 없음, 헤더 Authorization: Bearer <Firebase ID 토큰>)
 *   → 200 { ok: true, code }          대시보드 승인자(users/{uid}.status == 'approved')
 *   → 401 { ok: false, code: 'AUTH_REQUIRED' | 'AUTH_INVALID' }
 *   → 403 { ok: false, code: 'NOT_APPROVED' | 'FORBIDDEN_ORIGIN' }
 *   → 503 { ok: false, code: 'NOT_CONFIGURED' | 'UNAVAILABLE' }
 *
 * 환경변수 (Vercel Sensitive): CEO_ACCESS_CODE — 법인 CEO 컨설팅 프로젝트의 ACCESS_CODE와 같은 값.
 *   미설정이면 503 NOT_CONFIGURED (코드 노출 0). 코드를 바꿀 때는 두 프로젝트 env를 함께 바꿀 것.
 *
 * 설계 (독립 블록 — 기존 api/sms-pw-reset.js 무수정, 서비스 계정·WIF 미사용):
 *   1) ID 토큰 서명 검증: Google securetoken 공개 인증서(RS256) + aud/iss/exp/iat/sub 확인
 *   2) 승인 확인: 사용자 본인 토큰으로 Firestore REST users/{uid} 읽기 → 보안 규칙이 그대로 적용
 *      (본인 문서만 읽힘). status 위변조 방지는 콘솔 users 규칙(본인 status 변경 불가)이 담당.
 *   3) 응답 Cache-Control: no-store. 토큰·코드는 로그에 남기지 않음.
 */
'use strict';

const crypto = require('crypto');

const PROJECT_ID = 'pro-enterprise-ai';
const ISSUER = 'https://securetoken.google.com/' + PROJECT_ID;
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_SEC = 60;

function isAllowedOrigin(req) {
  const src = req.headers.origin || req.headers.referer || '';
  let host = '';
  try { host = new URL(src).hostname; } catch (_) { return false; }
  if (host === 'pro-dashboards.com' || host === 'www.pro-dashboards.com') return true;
  if (/^pro-main-dashboard[a-z0-9.-]*\.vercel\.app$/.test(host)) return true;
  return false;
}

function b64urlToBuffer(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** JWT 문자열 → { header, payload, signingInput, signature } 또는 null (형식 오류) */
function decodeJwt(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  try {
    const header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
    const payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') return null;
    return { header: header, payload: payload, signingInput: parts[0] + '.' + parts[1], signature: b64urlToBuffer(parts[2]) };
  } catch (_) {
    return null;
  }
}

/** Firebase ID 토큰 클레임 검증 (순수). 통과 시 uid 문자열, 실패 시 null */
function checkClaims(payload, nowSec) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.aud !== PROJECT_ID) return null;
  if (payload.iss !== ISSUER) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec - CLOCK_SKEW_SEC) return null;
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + CLOCK_SKEW_SEC) return null;
  if (payload.auth_time !== undefined && (typeof payload.auth_time !== 'number' || payload.auth_time > nowSec + CLOCK_SKEW_SEC)) return null;
  const sub = payload.sub;
  if (typeof sub !== 'string' || !sub || sub.length > 128 || !/^[A-Za-z0-9_-]+$/.test(sub)) return null;
  return sub;
}

// ── 공개 인증서 캐시 (응답 max-age 존중, 최대 6시간) ──
let _certs = null;
let _certsExpire = 0;
async function getCerts() {
  const now = Date.now();
  if (_certs && now < _certsExpire) return _certs;
  const resp = await fetch(CERTS_URL);
  if (!resp.ok) throw new Error('CERTS_HTTP_' + resp.status);
  const data = await resp.json();
  const m = /max-age=(\d+)/.exec(resp.headers.get('cache-control') || '');
  const ttlSec = Math.min(m ? parseInt(m[1], 10) : 3600, 6 * 3600);
  _certs = data;
  _certsExpire = now + ttlSec * 1000;
  return data;
}

/** 서명 검증 (RS256). certs = { kid: PEM 인증서 } */
function verifySignature(jwt, certs) {
  if (!jwt || jwt.header.alg !== 'RS256' || typeof jwt.header.kid !== 'string') return false;
  const pem = certs && Object.prototype.hasOwnProperty.call(certs, jwt.header.kid) ? certs[jwt.header.kid] : null;
  if (!pem) return false;
  try {
    const key = crypto.createPublicKey(pem);
    return crypto.verify('RSA-SHA256', Buffer.from(jwt.signingInput), key, jwt.signature);
  } catch (_) {
    return false;
  }
}

/** 본인 토큰으로 users/{uid}.status 읽기 → 'approved' 등 문자열 / 'FORBIDDEN' / null(문서 없음) */
async function readUserStatus(idToken, uid) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/users/' + encodeURIComponent(uid) + '?mask.fieldPaths=status';
  const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + idToken } });
  if (resp.status === 401 || resp.status === 403) return 'FORBIDDEN';
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('FS_HTTP_' + resp.status);
  const doc = await resp.json();
  const f = doc && doc.fields && doc.fields.status;
  return (f && typeof f.stringValue === 'string') ? f.stringValue : null;
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
    return;
  }
  if (!isAllowedOrigin(req)) {
    send(res, 403, { ok: false, code: 'FORBIDDEN_ORIGIN' });
    return;
  }
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
  if (!m) {
    send(res, 401, { ok: false, code: 'AUTH_REQUIRED' });
    return;
  }
  const idToken = m[1];
  const jwt = decodeJwt(idToken);
  const uid = jwt ? checkClaims(jwt.payload, Math.floor(Date.now() / 1000)) : null;
  if (!uid) {
    send(res, 401, { ok: false, code: 'AUTH_INVALID' });
    return;
  }
  try {
    const certs = await getCerts();
    if (!verifySignature(jwt, certs)) {
      send(res, 401, { ok: false, code: 'AUTH_INVALID' });
      return;
    }
    const status = await readUserStatus(idToken, uid);
    if (status === 'FORBIDDEN') {
      send(res, 401, { ok: false, code: 'AUTH_INVALID' });
      return;
    }
    if (status !== 'approved') {
      send(res, 403, { ok: false, code: 'NOT_APPROVED' });
      return;
    }
    const code = process.env.CEO_ACCESS_CODE;
    if (!code) {
      send(res, 503, { ok: false, code: 'NOT_CONFIGURED' });
      return;
    }
    send(res, 200, { ok: true, code: code });
  } catch (e) {
    console.error('[ceo-access-code] 조회 실패:', e && e.message ? e.message : 'unknown');
    send(res, 503, { ok: false, code: 'UNAVAILABLE' });
  }
};

// 테스트 전용 (순수 함수) — 엔드포인트 동작과 무관
module.exports._test = {
  isAllowedOrigin: isAllowedOrigin, decodeJwt: decodeJwt, checkClaims: checkClaims, verifySignature: verifySignature,
  resetCertCache: function () { _certs = null; _certsExpire = 0; }
};
