// ═══════════════════════════════════════════════════════════════
// 기존 사용자 employee_lookup 백필 스크립트 (1회만 실행)
// ═══════════════════════════════════════════════════════════════
// 실행 방법:
//   1. https://pro-dashboards.com 에 관리자 계정으로 로그인
//      (proenterpriseai@ / proenterprise@ / youra9ol2l8@ / prolimrm@ 중 하나)
//   2. F12 (개발자 도구) → Console 탭
//   3. 이 파일 전체 내용 복사 → Console에 붙여넣기 → Enter
//   4. "✅ 백필 완료: N건" 메시지 확인
//
// 안전장치:
//   - 이미 lookup 문서가 존재하는 사용자는 스킵
//   - 사원번호(employeeNo)가 없는 users 문서는 스킵
//   - 에러 발생 시 해당 사용자만 스킵하고 계속 진행
//
// ⚠️ 이 스크립트는 관리자만 실행 가능 (Firestore 보안규칙의 isAdmin() 체크)
// ⚠️ .vercelignore에 _*.js 패턴으로 제외되므로 프로덕션 배포에 포함되지 않음

(async function backfillEmployeeLookup() {
  if (!window.firebase || !window.db) {
    console.error('❌ Firebase가 초기화되지 않았습니다. 로그인 후 다시 시도하세요.');
    return;
  }
  const currentUser = firebase.auth().currentUser;
  if (!currentUser) {
    console.error('❌ 로그인 상태가 아닙니다.');
    return;
  }
  console.log('🔄 백필 시작 — 실행자:', currentUser.email);

  let total = 0, added = 0, skipped = 0, failed = 0;
  try {
    const snap = await db.collection('users').get();
    total = snap.size;
    console.log(`📊 users 컬렉션 총 ${total}건 조회됨`);

    for (const doc of snap.docs) {
      const data = doc.data();
      const empNo = (data.employeeNo || '').trim();
      const email = (data.email || '').trim();
      const displayName = (data.displayName || '').trim();

      if (!empNo) {
        console.warn(`⏭️  사원번호 없음 — uid=${doc.id} skip`);
        skipped++;
        continue;
      }
      if (!email) {
        console.warn(`⏭️  이메일 없음 — empNo=${empNo} skip`);
        skipped++;
        continue;
      }

      try {
        const lookupRef = db.collection('employee_lookup').doc(empNo);
        const exists = await lookupRef.get();
        if (exists.exists) {
          skipped++;
          continue;
        }
        await lookupRef.set({
          uid: doc.id,
          email: email.toLowerCase(),
          displayName: displayName
        });
        added++;
        if (added % 50 === 0) console.log(`   ...진행 중 (${added}건 추가)`);
      } catch (e) {
        console.error(`❌ 실패 — empNo=${empNo}:`, e.message);
        failed++;
      }
    }

    console.log('═══════════════════════════════════════');
    console.log(`✅ 백필 완료`);
    console.log(`   총 사용자: ${total}`);
    console.log(`   신규 추가: ${added}`);
    console.log(`   이미 존재(스킵): ${skipped}`);
    console.log(`   실패: ${failed}`);
    console.log('═══════════════════════════════════════');
  } catch (err) {
    console.error('❌ 치명적 오류:', err);
  }
})();
