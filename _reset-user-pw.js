/**
 * 사용자 비밀번호 즉시 초기화 스크립트
 * PowerShell에서 실행: node _reset-user-pw.js 2535366
 * firebase login이 되어있어야 함
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const EMP_NO = process.argv[2];
if (!EMP_NO) { console.error('사원번호를 인수로 전달하세요: node _reset-user-pw.js 2535366'); process.exit(1); }

// Firebase CLI 저장된 인증 토큰 읽기
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

// HTTP 요청 유틸
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

// Refresh token → Access token
async function getAccessToken(refreshToken) {
  const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi`;
  const resp = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, body);
  if (!resp.data.access_token) throw new Error('Access token 획득 실패: ' + JSON.stringify(resp.data));
  return resp.data.access_token;
}

// Firestore에서 employee_lookup 조회
async function lookupEmployee(accessToken, empNo) {
  const url = `https://firestore.googleapis.com/v1/projects/pro-enterprise-ai/databases/(default)/documents/employee_lookup/${empNo}`;
  const resp = await request(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (resp.status !== 200) throw new Error('사원번호 조회 실패: ' + JSON.stringify(resp.data));
  const fields = resp.data.fields || {};
  return {
    uid: fields.uid && fields.uid.stringValue,
    email: fields.email && fields.email.stringValue,
    displayName: fields.displayName && fields.displayName.stringValue
  };
}

// Firebase Auth 비밀번호 변경 (Identity Toolkit Admin API)
async function updatePassword(accessToken, uid, newPassword) {
  const body = JSON.stringify({ localId: uid, password: newPassword });
  const resp = await request('https://identitytoolkit.googleapis.com/v1/projects/pro-enterprise-ai/accounts:update', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }, body);
  if (resp.status !== 200) throw new Error('비밀번호 변경 실패: ' + JSON.stringify(resp.data));
  return true;
}

// 임시 비밀번호 생성
function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const bytes = crypto.randomBytes(8);
  let pw = '';
  pw += upper[bytes[0] % upper.length];
  pw += lower[bytes[1] % lower.length];
  pw += digits[bytes[2] % digits.length];
  for (let i = 3; i < 8; i++) pw += all[bytes[i] % all.length];
  return pw;
}

// 실행
(async () => {
  try {
    console.log(`\n사원번호 ${EMP_NO} 비밀번호 초기화 중...\n`);

    const refreshToken = getRefreshToken();
    const accessToken = await getAccessToken(refreshToken);
    console.log('✅ Firebase 인증 완료');

    const emp = await lookupEmployee(accessToken, EMP_NO);
    if (!emp.uid || !emp.email) throw new Error('사원번호에 해당하는 사용자를 찾을 수 없습니다.');
    console.log(`✅ 사용자 확인: ${emp.displayName} (${emp.email})`);

    const tempPw = generateTempPassword();
    await updatePassword(accessToken, emp.uid, tempPw);
    console.log('✅ 비밀번호 변경 완료');

    console.log('\n══════════════════════════════════');
    console.log(`  이름: ${emp.displayName}`);
    console.log(`  이메일: ${emp.email}`);
    console.log(`  임시 비밀번호: ${tempPw}`);
    console.log('══════════════════════════════════');
    console.log('\n👉 이 비밀번호를 본인에게 전달하세요.');
    console.log('👉 로그인 후 비밀번호 변경을 안내해 주세요.\n');
  } catch (err) {
    console.error('❌ 오류:', err.message);
  }
})();
