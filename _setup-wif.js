/**
 * Workload Identity Federation 1회 설정 스크립트 — Pro Enterprise AI 메인 대시보드
 *
 * 목적: Vercel OIDC → GCP 서비스 계정 연동을 생성해 서버 토큰(invalid_rapt) 만료 문제를 영구 제거.
 *       (대표님 승인 2026-09-18, 실행 주체=전략실장 owner 계정)
 *
 * PowerShell 사용법:
 *   node _setup-wif.js                      # 기본 (Vercel 프로젝트명 pro-main-dashboard)
 *   node _setup-wif.js --project <이름>     # Vercel 프로젝트명이 다를 때
 *   node _setup-wif.js --verify             # 생성 없이 현재 상태만 점검
 *
 * 알려진 한계: Pool/Provider가 삭제(DELETED, 30일 보존) 상태면 생성이 409로 실패 — 콘솔에서 undelete 후 재실행.
 *
 * 하는 일 (전부 멱등 — 이미 있으면 건너뜀):
 *   1. API 활성화: iam / iamcredentials / sts
 *   2. Workload Identity Pool `vercel` + OIDC 공급자 `vercel` 생성
 *      (issuer=https://oidc.vercel.com/pro-enterprise-team, aud=https://vercel.com/pro-enterprise-team)
 *   3. 서비스 계정 vercel-sms-reset@pro-enterprise-ai.iam.gserviceaccount.com 생성
 *   4. 프로젝트 IAM: 서비스 계정에 roles/datastore.user + roles/firebaseauth.admin 부여
 *      (기존 정책 읽기 → 백업 저장 → append-only → etag 조건부 쓰기)
 *   5. 서비스 계정 IAM: Vercel production/preview 주체에 roles/iam.workloadIdentityUser 부여
 *
 * 사전 조건: firebase login 완료 (owner 계정). 서비스 계정 "키"는 만들지 않음 — 조직 정책 준수.
 * 의존: 표준 노드 모듈만 사용 (npm 의존 0)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_ID = 'pro-enterprise-ai';
const PROJECT_NUMBER = '13144153545';
const VERCEL_TEAM_SLUG = 'pro-enterprise-team'; // vercel.com/pro-enterprise-team/pro-main-dashboard (2026-09-18 실측)
const POOL_ID = 'vercel';
const PROVIDER_ID = 'vercel';
const SA_ID = 'vercel-sms-reset';
const SA_EMAIL = SA_ID + '@' + PROJECT_ID + '.iam.gserviceaccount.com';
const PROJECT_ROLES = ['roles/datastore.user', 'roles/firebaseauth.admin'];

const args = process.argv.slice(2);
const VERIFY_ONLY = args.includes('--verify');
const pIdx = args.indexOf('--project');
if (pIdx !== -1 && (!args[pIdx + 1] || args[pIdx + 1].startsWith('--'))) {
  console.error('❌ --project 뒤에 Vercel 프로젝트명이 필요합니다.');
  process.exit(1);
}
const VERCEL_PROJECT = pIdx !== -1 ? args[pIdx + 1] : 'pro-main-dashboard';

const POOL_NAME = 'projects/' + PROJECT_NUMBER + '/locations/global/workloadIdentityPools/' + POOL_ID;
const PROVIDER_NAME = POOL_NAME + '/providers/' + PROVIDER_ID;
const SUBJECT = function (env) {
  return 'owner:' + VERCEL_TEAM_SLUG + ':project:' + VERCEL_PROJECT + ':environment:' + env;
};
const PRINCIPAL = function (env) {
  return 'principal://iam.googleapis.com/' + POOL_NAME + '/subject/' + SUBJECT(env);
};

// ── firebase-tools 토큰 로딩 (_user-admin.js와 동일 패턴) ──
function getRefreshToken() {
  const paths = [
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json')
  ];
  for (const p of paths) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const token = data.tokens && data.tokens.refresh_token;
      if (token) return token;
    } catch (_) { /* skip */ }
  }
  throw new Error('Firebase CLI 인증 토큰을 찾을 수 없습니다. firebase login을 먼저 실행하세요.');
}

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken(refreshToken) {
  const body = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
    + '&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
    + '&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi';
  const resp = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, body);
  if (!resp.data.access_token) throw new Error('Access token 획득 실패: ' + JSON.stringify(resp.data));
  return resp.data.access_token;
}

function authHeaders(token) {
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

async function gget(token, url) {
  return request(url, { method: 'GET', headers: authHeaders(token) });
}
async function gpost(token, url, bodyObj) {
  return request(url, { method: 'POST', headers: authHeaders(token) }, JSON.stringify(bodyObj || {}));
}

// 장기 실행 작업(operation) 폴링 — pool/provider 생성용
async function waitOperation(token, opName, apiBase) {
  for (let i = 0; i < 30; i++) {
    const r = await gget(token, apiBase + '/v1/' + opName);
    if (r.data && r.data.done) {
      if (r.data.error) throw new Error('작업 실패: ' + JSON.stringify(r.data.error));
      return;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error('작업 시간 초과: ' + opName);
}

// ── 단계 1: API 활성화 ──
const REQUIRED_APIS = ['iam.googleapis.com', 'iamcredentials.googleapis.com', 'sts.googleapis.com'];

async function enableApis(token) {
  if (VERIFY_ONLY) {
    // 조회 전용 — 어떤 쓰기도 수행하지 않음
    for (const svc of REQUIRED_APIS) {
      const r = await gget(token, 'https://serviceusage.googleapis.com/v1/projects/' + PROJECT_NUMBER + '/services/' + svc);
      const state = (r.data && r.data.state) || ('HTTP ' + r.status);
      console.log((state === 'ENABLED' ? '✅' : '❌') + ' 1. ' + svc + ' = ' + state);
    }
    return;
  }
  const r = await gpost(token,
    'https://serviceusage.googleapis.com/v1/projects/' + PROJECT_NUMBER + '/services:batchEnable',
    { serviceIds: REQUIRED_APIS });
  if (r.status !== 200) throw new Error('API 활성화 실패: ' + JSON.stringify(r.data));
  if (r.data.name) {
    try { await waitOperation(token, r.data.name, 'https://serviceusage.googleapis.com'); }
    catch (e) { console.warn('⚠️ 1. API 활성화 작업 확인 실패(계속 진행, 후속 단계에서 드러남): ' + e.message); }
  }
  console.log('✅ 1. API 활성화 (iam / iamcredentials / sts)');
}

// ── 단계 2a: Workload Identity Pool ──
async function ensurePool(token) {
  const base = 'https://iam.googleapis.com/v1/';
  const existing = await gget(token, base + POOL_NAME);
  if (existing.status === 200 && existing.data.state === 'ACTIVE') {
    console.log('✅ 2a. Pool 이미 존재: ' + POOL_NAME);
    return;
  }
  if (VERIFY_ONLY) { console.log('❌ 2a. Pool 없음'); return; }
  const r = await gpost(token,
    base + 'projects/' + PROJECT_NUMBER + '/locations/global/workloadIdentityPools?workloadIdentityPoolId=' + POOL_ID,
    { displayName: 'Vercel OIDC', description: 'Vercel 배포가 서비스 계정을 키 없이 사용 (SMS 비번 재설정)' });
  if (r.status !== 200) throw new Error('Pool 생성 실패: ' + JSON.stringify(r.data));
  await waitOperation(token, r.data.name, 'https://iam.googleapis.com');
  console.log('✅ 2a. Pool 생성: ' + POOL_NAME);
}

// ── 단계 2b: OIDC 공급자 ──
async function ensureProvider(token) {
  const base = 'https://iam.googleapis.com/v1/';
  const existing = await gget(token, base + PROVIDER_NAME);
  if (existing.status === 200 && existing.data.state === 'ACTIVE') {
    console.log('✅ 2b. Provider 이미 존재: ' + PROVIDER_NAME);
    return;
  }
  if (VERIFY_ONLY) { console.log('❌ 2b. Provider 없음'); return; }
  const r = await gpost(token,
    base + POOL_NAME + '/providers?workloadIdentityPoolProviderId=' + PROVIDER_ID,
    {
      displayName: 'Vercel',
      attributeMapping: { 'google.subject': 'assertion.sub' },
      oidc: {
        issuerUri: 'https://oidc.vercel.com/' + VERCEL_TEAM_SLUG,
        allowedAudiences: ['https://vercel.com/' + VERCEL_TEAM_SLUG]
      }
    });
  if (r.status !== 200) throw new Error('Provider 생성 실패 (조직 정책 workloadIdentityPoolProviders 제한 가능성): ' + JSON.stringify(r.data));
  await waitOperation(token, r.data.name, 'https://iam.googleapis.com');
  console.log('✅ 2b. Provider 생성: ' + PROVIDER_NAME);
}

// ── 단계 3: 서비스 계정 ──
async function ensureServiceAccount(token) {
  const base = 'https://iam.googleapis.com/v1/projects/' + PROJECT_ID + '/serviceAccounts';
  const existing = await gget(token, base + '/' + SA_EMAIL);
  if (existing.status === 200) {
    console.log('✅ 3. 서비스 계정 이미 존재: ' + SA_EMAIL);
    return;
  }
  if (VERIFY_ONLY) { console.log('❌ 3. 서비스 계정 없음'); return; }
  const r = await gpost(token, base, {
    accountId: SA_ID,
    serviceAccount: { displayName: 'Vercel SMS PW Reset', description: '대시보드 SMS 비번 재설정 서버 전용 (WIF, 키 없음)' }
  });
  if (r.status !== 200) throw new Error('서비스 계정 생성 실패: ' + JSON.stringify(r.data));
  console.log('✅ 3. 서비스 계정 생성: ' + SA_EMAIL);
}

// ── 단계 4: 프로젝트 IAM 역할 부여 (append-only + etag + version 3) ──
async function ensureProjectRoles(token) {
  const url = 'https://cloudresourcemanager.googleapis.com/v1/projects/' + PROJECT_ID;
  const member = 'serviceAccount:' + SA_EMAIL;
  // requestedPolicyVersion:3 — 조건부 바인딩까지 온전히 받아야 되쓸 때 훼손이 없음
  const cur = await gpost(token, url + ':getIamPolicy', { options: { requestedPolicyVersion: 3 } });
  if (cur.status !== 200) throw new Error('프로젝트 정책 조회 실패: ' + JSON.stringify(cur.data));
  const policy = cur.data;

  // 멤버십 검사·append 모두 "조건 없는" 바인딩만 대상 (조건부 바인딩에 오추가 방지)
  const findPlain = function (role) {
    return (policy.bindings || []).find(function (x) { return x.role === role && !x.condition; });
  };
  const missing = [];
  for (const role of PROJECT_ROLES) {
    const b = findPlain(role);
    if (b && b.members && b.members.includes(member)) continue;
    missing.push(role);
  }
  if (missing.length === 0) {
    console.log('✅ 4. 프로젝트 역할 이미 부여됨: ' + PROJECT_ROLES.join(', '));
    return;
  }
  if (VERIFY_ONLY) { console.log('❌ 4. 프로젝트 역할 누락: ' + missing.join(', ')); return; }

  // 변경 전 백업 (v3 전체 뷰 — 사고 시 원복용)
  const backupPath = path.join(__dirname, '_iam-policy-backup-' + Date.now() + '.json');
  fs.writeFileSync(backupPath, JSON.stringify(policy, null, 2));
  policy.bindings = policy.bindings || [];
  for (const role of missing) {
    let b = findPlain(role);
    if (!b) { b = { role: role, members: [] }; policy.bindings.push(b); }
    b.members.push(member);
  }
  policy.version = 3;
  const r = await gpost(token, url + ':setIamPolicy', { policy: policy }); // etag 포함 → 동시 변경 시 409
  if (r.status !== 200) throw new Error('프로젝트 정책 쓰기 실패 (백업=' + backupPath + '): ' + JSON.stringify(r.data));
  console.log('✅ 4. 프로젝트 역할 부여: ' + missing.join(', ') + ' (백업=' + path.basename(backupPath) + ')');
}

// ── 단계 5: 서비스 계정에 workloadIdentityUser 바인딩 ──
async function ensureSaBinding(token) {
  const base = 'https://iam.googleapis.com/v1/projects/' + PROJECT_ID + '/serviceAccounts/' + SA_EMAIL;
  const role = 'roles/iam.workloadIdentityUser';
  const wanted = [PRINCIPAL('production'), PRINCIPAL('preview')];
  let cur = await gpost(token, base + ':getIamPolicy', {});
  if (cur.status === 404 && VERIFY_ONLY) { console.log('❌ 5. SA 없음 → 바인딩 점검 불가'); return; }
  // 직전 단계에서 갓 생성된 SA는 IAM 전파 지연으로 잠시 404 가능 → 재시도
  for (let i = 0; cur.status === 404 && i < 5; i++) {
    await new Promise(function (res) { setTimeout(res, 3000); });
    cur = await gpost(token, base + ':getIamPolicy', {});
  }
  if (cur.status !== 200) throw new Error('SA 정책 조회 실패: ' + JSON.stringify(cur.data));
  const policy = cur.data || {};
  policy.bindings = policy.bindings || [];
  let b = policy.bindings.find(function (x) { return x.role === role; });
  const have = (b && b.members) || [];
  const missing = wanted.filter(function (m) { return !have.includes(m); });
  if (missing.length === 0) {
    console.log('✅ 5. SA 바인딩 이미 존재 (production/preview)');
    return;
  }
  if (VERIFY_ONLY) { console.log('❌ 5. SA 바인딩 누락: ' + missing.length + '건'); return; }
  if (!b) { b = { role: role, members: [] }; policy.bindings.push(b); }
  for (const m of missing) b.members.push(m);
  const r = await gpost(token, base + ':setIamPolicy', { policy: policy });
  if (r.status !== 200) throw new Error('SA 정책 쓰기 실패: ' + JSON.stringify(r.data));
  console.log('✅ 5. SA 바인딩 부여: production + preview');
}

(async function main() {
  console.log((VERIFY_ONLY ? '🔍 WIF 상태 점검' : '🚀 WIF 설정 시작') + ' — Vercel 프로젝트: ' + VERCEL_PROJECT);
  console.log('   subject 예시: ' + SUBJECT('production') + '\n');
  const token = await getAccessToken(getRefreshToken());
  await enableApis(token);
  await ensurePool(token);
  await ensureProvider(token);
  await ensureServiceAccount(token);
  await ensureProjectRoles(token);
  await ensureSaBinding(token);
  console.log('\n🏁 완료. 서버 코드의 WIF 상수와 일치 여부:');
  console.log('   WIF_AUDIENCE = //iam.googleapis.com/' + PROVIDER_NAME);
  console.log('   WIF_SA_EMAIL = ' + SA_EMAIL);
})().catch(function (e) {
  console.error('❌ 오류: ' + e.message);
  process.exit(1);
});
