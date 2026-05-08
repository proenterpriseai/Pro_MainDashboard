/**
 * 사용자 통합 관리 도구 — Pro Enterprise AI 메인 대시보드
 *
 * PowerShell 사용법:
 *   node _user-admin.js find <사원번호>
 *   node _user-admin.js reset <사원번호> --auto
 *   node _user-admin.js reset <사원번호> --email <이메일> --pw "<비밀번호>"
 *   node _user-admin.js reset <사원번호> --email <이메일> --auto
 *   node _user-admin.js cleanup <사원번호> --keep <메인이메일>
 *   node _user-admin.js fix-lookup <사원번호> --to <이메일>
 *
 * 사전 조건: firebase login 완료 상태
 * 의존: 표준 노드 모듈만 사용 (npm 의존 0)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const readline = require('readline');

const PROJECT_ID = 'pro-enterprise-ai';
const MAX_DEVICES = 2;

// ═══════════════════════════════════════════════════════════════
// 공통 유틸
// ═══════════════════════════════════════════════════════════════

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
  const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi`;
  const resp = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, body);
  if (!resp.data.access_token) throw new Error('Access token 획득 실패: ' + JSON.stringify(resp.data));
  return resp.data.access_token;
}

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

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

function fmtDate(ms) {
  if (!ms) return '(미기록)';
  const d = new Date(Number(ms));
  if (isNaN(d.getTime())) return '(미기록)';
  return d.getFullYear() + '.' + (d.getMonth()+1) + '.' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

// ═══════════════════════════════════════════════════════════════
// API wrappers
// ═══════════════════════════════════════════════════════════════

// Firestore: employee_lookup/{empNo} 조회
async function getEmployeeLookup(accessToken, empNo) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/employee_lookup/${encodeURIComponent(empNo)}`;
  const resp = await request(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (resp.status === 404) return null;
  if (resp.status !== 200) throw new Error('employee_lookup 조회 실패: ' + JSON.stringify(resp.data));
  const fields = resp.data.fields || {};
  return {
    uid: fields.uid && fields.uid.stringValue,
    email: fields.email && fields.email.stringValue,
    displayName: fields.displayName && fields.displayName.stringValue
  };
}

// Firestore: employee_lookup/{empNo} 갱신
async function updateEmployeeLookup(accessToken, empNo, lookup) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/employee_lookup/${encodeURIComponent(empNo)}?updateMask.fieldPaths=uid&updateMask.fieldPaths=email&updateMask.fieldPaths=displayName`;
  const body = JSON.stringify({
    fields: {
      uid: { stringValue: lookup.uid },
      email: { stringValue: lookup.email },
      displayName: { stringValue: lookup.displayName || '' }
    }
  });
  const resp = await request(url, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }, body);
  if (resp.status !== 200) throw new Error('employee_lookup 갱신 실패: ' + JSON.stringify(resp.data));
}

// Firestore: employee_lookup/{empNo} 삭제
async function deleteEmployeeLookup(accessToken, empNo) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/employee_lookup/${encodeURIComponent(empNo)}`;
  const resp = await request(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (resp.status !== 200 && resp.status !== 204) throw new Error('employee_lookup 삭제 실패: ' + JSON.stringify(resp.data));
}

// Firestore runQuery: users where employeeNo == X
async function findUsersByEmpNo(accessToken, empNo) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'employeeNo' },
          op: 'EQUAL',
          value: { stringValue: empNo }
        }
      }
    }
  });
  const resp = await request(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }, body);
  if (resp.status !== 200) throw new Error('users runQuery 실패: ' + JSON.stringify(resp.data));
  const rows = Array.isArray(resp.data) ? resp.data : [];
  const users = [];
  for (const row of rows) {
    if (!row.document) continue;
    const f = row.document.fields || {};
    const docName = row.document.name || ''; // projects/.../documents/users/{uid}
    const uid = docName.split('/').pop();
    const devices = (f.devices && f.devices.arrayValue && f.devices.arrayValue.values) || [];
    users.push({
      uid: uid,
      email: (f.email && f.email.stringValue) || '',
      displayName: (f.displayName && f.displayName.stringValue) || '',
      employeeNo: (f.employeeNo && f.employeeNo.stringValue) || '',
      phone: (f.phone && f.phone.stringValue) || '',
      role: (f.role && f.role.stringValue) || 'user',
      status: (f.status && f.status.stringValue) || '',
      deviceCount: devices.length,
      createdAt: f.createdAt && f.createdAt.timestampValue,
      lastLoginAt: f.lastLoginAt && f.lastLoginAt.timestampValue
    });
  }
  return users;
}

// Firestore: users/{uid} 삭제
async function deleteUserDoc(accessToken, uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const resp = await request(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (resp.status !== 200 && resp.status !== 204) throw new Error('users 문서 삭제 실패: ' + JSON.stringify(resp.data));
}

// Identity Toolkit: 이메일로 사용자 조회
async function lookupUserByEmail(accessToken, email) {
  const body = JSON.stringify({ email: [email] });
  const resp = await request(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }, body);
  if (resp.status !== 200) throw new Error('이메일 조회 실패: ' + JSON.stringify(resp.data));
  const users = resp.data.users || [];
  if (users.length === 0) return null;
  return {
    uid: users[0].localId,
    email: users[0].email,
    displayName: users[0].displayName || '',
    lastLoginAt: users[0].lastLoginAt,
    createdAt: users[0].createdAt
  };
}

// Identity Toolkit: UID 배열로 사용자 조회 (메타데이터 enrich)
async function lookupUsersByUids(accessToken, uids) {
  if (uids.length === 0) return [];
  const body = JSON.stringify({ localId: uids });
  const resp = await request(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }, body);
  if (resp.status !== 200) throw new Error('UID 조회 실패: ' + JSON.stringify(resp.data));
  return resp.data.users || [];
}

// Identity Toolkit: 비밀번호 변경
async function updateAuthPassword(accessToken, uid, newPassword) {
  const body = JSON.stringify({ localId: uid, password: newPassword });
  const resp = await request(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }, body);
  if (resp.status !== 200) throw new Error('비밀번호 변경 실패: ' + JSON.stringify(resp.data));
}

// Identity Toolkit: 계정 삭제
async function deleteAuthUser(accessToken, uid) {
  const body = JSON.stringify({ localId: uid });
  const resp = await request(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }, body);
  if (resp.status !== 200) throw new Error('Firebase Auth 계정 삭제 실패: ' + JSON.stringify(resp.data));
}

// ═══════════════════════════════════════════════════════════════
// 명령: find
// ═══════════════════════════════════════════════════════════════

async function cmdFind(empNo) {
  const refreshToken = getRefreshToken();
  const accessToken = await getAccessToken(refreshToken);

  console.log(`\n🔍 사원번호 ${empNo} 등록 계정 검색 중...\n`);

  const users = await findUsersByEmpNo(accessToken, empNo);
  if (users.length === 0) {
    console.log('❌ 등록된 계정이 없습니다.');
    return;
  }

  // Identity Toolkit lastLoginAt enrich
  const authUsers = await lookupUsersByUids(accessToken, users.map(u => u.uid));
  const authMap = {};
  authUsers.forEach(u => { authMap[u.localId] = u; });

  // employee_lookup 현재 가리키는 uid
  const lookup = await getEmployeeLookup(accessToken, empNo);
  const lookupUid = lookup && lookup.uid;

  // 정렬: lastLoginAt 내림차순 (최근 사용 우선)
  users.forEach(u => {
    const a = authMap[u.uid];
    u._lastLogin = (a && (a.lastLoginAt || a.lastRefreshAt)) || (u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0);
  });
  users.sort((a, b) => Number(b._lastLogin || 0) - Number(a._lastLogin || 0));

  console.log(`📊 사원번호 ${empNo} — 등록된 계정 ${users.length}개 발견`);
  console.log('━'.repeat(70));
  users.forEach((u, i) => {
    const isMain = u.uid === lookupUid;
    const isMostRecent = i === 0;
    let badge = '';
    if (isMain && isMostRecent) badge = ' [⭐ 메인 계정 — 최근 사용]';
    else if (isMain) badge = ' [📌 lookup 메인 계정]';
    else if (isMostRecent) badge = ' [🕐 최근 사용 — lookup 미반영]';
    else if (u.deviceCount === 0) badge = ' [⚠️ 미사용 — 정리 권장]';

    console.log(`[${i+1}] ${u.email}${badge}`);
    console.log(`    UID: ${u.uid}`);
    console.log(`    이름: ${u.displayName || '(미입력)'} / 핸드폰: ${u.phone || '(미입력)'} / 권한: ${u.role}${u.status ? ' / 상태: ' + u.status : ''}`);
    console.log(`    가입: ${fmtDate(authMap[u.uid] && authMap[u.uid].createdAt)} / 최근접속: ${fmtDate(u._lastLogin)}`);
    console.log(`    기기: ${u.deviceCount}/${MAX_DEVICES}`);
    console.log('');
  });
  console.log('━'.repeat(70));

  if (users.length > 1) {
    console.log('⚠️  중복 가입 감지 — cleanup 명령으로 미사용 계정 정리 권장:');
    console.log(`   node _user-admin.js cleanup ${empNo} --keep <메인이메일>`);
  }
  if (lookup && !users.find(u => u.uid === lookupUid)) {
    console.log(`⚠️  employee_lookup이 존재하지 않는 uid를 가리킴 (${lookupUid})`);
    console.log(`   node _user-admin.js fix-lookup ${empNo} --to <메인이메일>`);
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════
// 명령: reset
// ═══════════════════════════════════════════════════════════════

async function cmdReset(empNo, opts) {
  const refreshToken = getRefreshToken();
  const accessToken = await getAccessToken(refreshToken);

  console.log(`\n🔑 사원번호 ${empNo} 비밀번호 재설정 중...\n`);

  const users = await findUsersByEmpNo(accessToken, empNo);
  if (users.length === 0) throw new Error('해당 사원번호로 등록된 계정이 없습니다.');

  // 대상 계정 결정
  let target;
  if (opts.email) {
    target = users.find(u => u.email.toLowerCase() === opts.email.toLowerCase());
    if (!target) throw new Error(`사원번호 ${empNo} 계정 중 이메일 ${opts.email}을 찾을 수 없습니다. find 명령으로 확인하세요.`);
  } else if (opts.auto) {
    if (users.length > 1) {
      // 자동 = lastLoginAt 가장 최근
      const authUsers = await lookupUsersByUids(accessToken, users.map(u => u.uid));
      const authMap = {};
      authUsers.forEach(u => { authMap[u.localId] = u; });
      users.forEach(u => {
        const a = authMap[u.uid];
        u._lastLogin = (a && (a.lastLoginAt || a.lastRefreshAt)) || 0;
      });
      users.sort((a, b) => Number(b._lastLogin || 0) - Number(a._lastLogin || 0));
      console.log(`⚠️  ${users.length}개 계정 발견 — 가장 최근 접속 계정 자동 선택: ${users[0].email}`);
    }
    target = users[0];
  } else {
    throw new Error('--auto 또는 --email <이메일> 중 하나를 지정하세요.');
  }

  const newPw = opts.pw || generateTempPassword();
  const isCustom = !!opts.pw;

  await updateAuthPassword(accessToken, target.uid, newPw);

  console.log('✅ 비밀번호 변경 완료');
  console.log('═'.repeat(50));
  console.log(`  이름:    ${target.displayName || '(미입력)'}`);
  console.log(`  이메일:  ${target.email}`);
  console.log(`  사원번호: ${empNo}`);
  console.log(`  ${isCustom ? '설정된 비밀번호' : '임시 비밀번호'}: ${newPw}`);
  console.log('═'.repeat(50));
  console.log('\n👉 SMS 템플릿 (ADMIN-SOP.md C 항목 참고)으로 사용자에게 전달하세요.\n');
}

// ═══════════════════════════════════════════════════════════════
// 명령: cleanup
// ═══════════════════════════════════════════════════════════════

async function cmdCleanup(empNo, opts) {
  if (!opts.keep) throw new Error('--keep <메인이메일>을 지정하세요.');
  const refreshToken = getRefreshToken();
  const accessToken = await getAccessToken(refreshToken);

  console.log(`\n🧹 사원번호 ${empNo} 중복 계정 정리 중...\n`);

  const users = await findUsersByEmpNo(accessToken, empNo);
  if (users.length === 0) throw new Error('해당 사원번호로 등록된 계정이 없습니다.');

  const keep = users.find(u => u.email.toLowerCase() === opts.keep.toLowerCase());
  if (!keep) throw new Error(`유지할 이메일 ${opts.keep}이 사원번호 ${empNo}의 계정 목록에 없습니다.`);

  const toDelete = users.filter(u => u.uid !== keep.uid);
  if (toDelete.length === 0) {
    console.log('ℹ️  중복 계정이 없습니다. 정리할 항목 없음.');
    return;
  }

  console.log(`유지: ${keep.email} (UID: ${keep.uid})`);
  console.log(`\n삭제 대상 ${toDelete.length}개:`);
  toDelete.forEach(u => {
    console.log(`  - ${u.email} (UID: ${u.uid}, 기기: ${u.deviceCount}/${MAX_DEVICES})`);
  });

  const ans = await prompt('\n⚠️  Firebase Auth + users 문서를 영구 삭제합니다. 진행하시겠습니까? (yes/no): ');
  if (ans.trim().toLowerCase() !== 'yes') {
    console.log('취소되었습니다.');
    return;
  }

  for (const u of toDelete) {
    console.log(`\n[${u.email}] 삭제 중...`);
    try { await deleteAuthUser(accessToken, u.uid); console.log('  ✅ Firebase Auth 삭제 완료'); }
    catch (e) { console.log('  ⚠️  Firebase Auth 삭제 실패:', e.message); }
    try { await deleteUserDoc(accessToken, u.uid); console.log('  ✅ users 문서 삭제 완료'); }
    catch (e) { console.log('  ⚠️  users 문서 삭제 실패:', e.message); }
  }

  // employee_lookup 정정 (keep 계정 가리키도록)
  console.log('\nemployee_lookup 정정 중...');
  await updateEmployeeLookup(accessToken, empNo, {
    uid: keep.uid,
    email: keep.email.toLowerCase(),
    displayName: keep.displayName || ''
  });
  console.log('✅ employee_lookup → ' + keep.email + ' 가리키도록 갱신');

  console.log('\n✅ 정리 완료');
}

// ═══════════════════════════════════════════════════════════════
// 명령: fix-lookup
// ═══════════════════════════════════════════════════════════════

async function cmdFixLookup(empNo, opts) {
  if (!opts.to) throw new Error('--to <이메일>을 지정하세요.');
  const refreshToken = getRefreshToken();
  const accessToken = await getAccessToken(refreshToken);

  console.log(`\n🔧 사원번호 ${empNo} employee_lookup 정정 중...\n`);

  const users = await findUsersByEmpNo(accessToken, empNo);
  const target = users.find(u => u.email.toLowerCase() === opts.to.toLowerCase());
  if (!target) throw new Error(`사원번호 ${empNo} 계정 중 ${opts.to}을 찾을 수 없습니다.`);

  const before = await getEmployeeLookup(accessToken, empNo);
  if (before) {
    console.log(`현재 lookup: uid=${before.uid} / email=${before.email}`);
  } else {
    console.log('현재 lookup: (없음 — 신규 생성)');
  }
  console.log(`갱신 대상:   uid=${target.uid} / email=${target.email}`);

  await updateEmployeeLookup(accessToken, empNo, {
    uid: target.uid,
    email: target.email.toLowerCase(),
    displayName: target.displayName || ''
  });
  console.log('\n✅ employee_lookup 갱신 완료');
}

// ═══════════════════════════════════════════════════════════════
// CLI 디스패처
// ═══════════════════════════════════════════════════════════════

function parseFlags(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--auto') opts.auto = true;
    else if (a === '--email') opts.email = argv[++i];
    else if (a === '--pw') opts.pw = argv[++i];
    else if (a === '--keep') opts.keep = argv[++i];
    else if (a === '--to') opts.to = argv[++i];
  }
  return opts;
}

function printHelp() {
  console.log(`사용자 통합 관리 도구

명령:
  node _user-admin.js find <사원번호>
      사원번호로 등록된 모든 계정 검색 (중복 가입 즉시 발견)

  node _user-admin.js reset <사원번호> --auto
      가장 최근 접속 계정에 자동 임시 비밀번호 발급

  node _user-admin.js reset <사원번호> --email <이메일> --pw "<비밀번호>"
      특정 이메일 계정에 사용자 지정 비밀번호 설정

  node _user-admin.js reset <사원번호> --email <이메일> --auto
      특정 이메일 계정에 자동 임시 비밀번호 발급

  node _user-admin.js cleanup <사원번호> --keep <메인이메일>
      메인 외 중복 계정을 Firebase Auth + Firestore에서 영구 삭제
      employee_lookup도 자동으로 메인 계정 가리키도록 갱신

  node _user-admin.js fix-lookup <사원번호> --to <이메일>
      employee_lookup이 잘못된 계정을 가리킬 때 정정

사전 조건: firebase login 완료 상태`);
}

(async () => {
  const cmd = process.argv[2];
  const empNo = process.argv[3];
  const opts = parseFlags(process.argv.slice(4));

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (!empNo) {
    console.error('❌ 사원번호를 지정하세요.');
    printHelp();
    process.exit(1);
  }

  try {
    if (cmd === 'find') await cmdFind(empNo);
    else if (cmd === 'reset') await cmdReset(empNo, opts);
    else if (cmd === 'cleanup') await cmdCleanup(empNo, opts);
    else if (cmd === 'fix-lookup') await cmdFixLookup(empNo, opts);
    else {
      console.error(`❌ 알 수 없는 명령: ${cmd}`);
      printHelp();
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ 오류:', err.message);
    process.exit(1);
  }
})();
