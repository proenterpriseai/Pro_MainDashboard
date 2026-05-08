/**
 * 이메일로 사용자 비밀번호 즉시 초기화 스크립트
 * PowerShell에서 실행:
 *   - 임시 비밀번호 자동 생성: node _reset-user-pw-by-email.js ap5104@naver.com
 *   - 사용자 지정 비밀번호:    node _reset-user-pw-by-email.js ap5104@naver.com MyPassword!
 *
 * firebase login이 되어있어야 함
 *
 * 동일 사원번호로 중복 가입되어 _reset-user-pw.js가 잘못된 계정을 가리키거나
 * employee_lookup이 stale인 경우 이메일을 직접 지정해서 정확한 계정의
 * 비밀번호를 변경할 때 사용
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const EMAIL = process.argv[2];
const CUSTOM_PW = process.argv[3]; // 선택: 사용자 지정 비밀번호 (없으면 자동 생성)
if (!EMAIL) { console.error('이메일을 인수로 전달하세요: node _reset-user-pw-by-email.js user@example.com [원하는비밀번호]'); process.exit(1); }
if (CUSTOM_PW && CUSTOM_PW.length < 6) { console.error('비밀번호는 6자 이상이어야 합니다.'); process.exit(1); }

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

// Identity Toolkit Admin API로 이메일로 사용자 조회
async function lookupUserByEmail(accessToken, email) {
  const body = JSON.stringify({ email: [email] });
  const resp = await request('https://identitytoolkit.googleapis.com/v1/projects/pro-enterprise-ai/accounts:lookup', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }, body);
  if (resp.status !== 200) throw new Error('이메일 조회 실패: ' + JSON.stringify(resp.data));
  const users = resp.data.users || [];
  if (users.length === 0) throw new Error(`이메일 ${email}로 등록된 Firebase Auth 사용자가 없습니다.`);
  return {
    uid: users[0].localId,
    email: users[0].email,
    displayName: users[0].displayName || ''
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

// 임시 비밀번호 생성 (8자리, 대문자+소문자+숫자, 시각 혼동 문자 제외)
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
    console.log(`\n이메일 ${EMAIL} 비밀번호 초기화 중...\n`);

    const refreshToken = getRefreshToken();
    const accessToken = await getAccessToken(refreshToken);
    console.log('✅ Firebase 인증 완료');

    const user = await lookupUserByEmail(accessToken, EMAIL);
    if (!user.uid) throw new Error('사용자 UID를 찾을 수 없습니다.');
    console.log(`✅ 사용자 확인: ${user.displayName || '(이름 없음)'} (${user.email})`);
    console.log(`   UID: ${user.uid}`);

    const newPw = CUSTOM_PW || generateTempPassword();
    const isCustom = !!CUSTOM_PW;
    await updatePassword(accessToken, user.uid, newPw);
    console.log('✅ 비밀번호 변경 완료');

    console.log('\n══════════════════════════════════');
    console.log(`  이름: ${user.displayName || '(이름 없음)'}`);
    console.log(`  이메일: ${user.email}`);
    console.log(`  ${isCustom ? '설정된 비밀번호' : '임시 비밀번호'}: ${newPw}`);
    console.log('══════════════════════════════════');
    if (isCustom) {
      console.log('\n👉 사용자가 요청한 비밀번호로 설정 완료.');
      console.log('👉 사용자에게 설정 완료 알림만 보내시면 됩니다.\n');
    } else {
      console.log('\n👉 이 비밀번호를 본인에게 전달하세요.');
      console.log('👉 로그인 후 비밀번호 변경을 안내해 주세요.\n');
    }
  } catch (err) {
    console.error('❌ 오류:', err.message);
  }
})();
