// 비밀번호 분실(초기화) API
// 입력: { empNo, name }
// 절차:
//   1) Firestore Admin으로 employeeNo 조회
//   2) displayName 일치 확인 (본인 확인)
//   3) Identity Toolkit REST로 PASSWORD_RESET oobCode 발송
// 이메일은 클라이언트에 절대 반환하지 않음

const { getAdmin, FIREBASE_WEB_API_KEY } = require('./_firebaseAdmin');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { empNo, name } = req.body || {};
    if (!empNo || !name) {
      return res.status(400).json({ error: '사원번호와 이름을 모두 입력해 주세요.' });
    }

    const admin = getAdmin();
    const db = admin.firestore();

    const snap = await db.collection('users')
      .where('employeeNo', '==', String(empNo).trim())
      .limit(1)
      .get();

    // 사용자 열거 공격 방지를 위해 "사번 없음"과 "이름 불일치"를 동일 메시지로 처리
    const mismatchMsg = '등록된 정보와 일치하지 않습니다. 사원번호와 이름을 다시 확인해 주세요.';
    if (snap.empty) {
      return res.status(404).json({ error: mismatchMsg });
    }
    const data = snap.docs[0].data() || {};
    const storedName = String(data.displayName || '').trim();
    if (storedName !== String(name).trim()) {
      return res.status(404).json({ error: mismatchMsg });
    }
    const email = data.email;
    if (!email) {
      return res.status(500).json({ error: '사용자 정보가 올바르지 않습니다. 관리자에게 문의해 주세요.' });
    }

    // 비밀번호 재설정 메일 발송 (Firebase Auth REST)
    const sendRes = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + FIREBASE_WEB_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email })
      }
    );
    if (!sendRes.ok) {
      const txt = await sendRes.text().catch(() => '');
      console.error('[pw-reset] sendOobCode failed:', sendRes.status, txt);
      return res.status(500).json({ error: '재설정 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[pw-reset] error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
};
