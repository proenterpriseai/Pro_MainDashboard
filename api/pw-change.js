// 비밀번호 변경 API
// 입력: { empNo, currentPassword, newPassword }
// 절차:
//   1) Firestore Admin으로 employeeNo → email/uid 조회
//   2) Identity Toolkit REST로 현재 비밀번호 검증 (signInWithPassword)
//   3) Admin SDK로 비밀번호 업데이트
// 이메일은 클라이언트에 절대 반환하지 않음

const { getAdmin, FIREBASE_WEB_API_KEY } = require('./_firebaseAdmin');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { empNo, currentPassword, newPassword } = req.body || {};
    if (!empNo || !currentPassword || !newPassword) {
      return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
    }
    if (String(newPassword).length < 4) {
      return res.status(400).json({ error: '새 비밀번호는 4자리 이상이어야 합니다.' });
    }

    const admin = getAdmin();
    const db = admin.firestore();

    // 1) 사원번호로 사용자 조회
    const snap = await db.collection('users')
      .where('employeeNo', '==', String(empNo).trim())
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ error: '등록된 사원번호를 찾을 수 없습니다.' });
    }
    const userDoc = snap.docs[0];
    const data = userDoc.data() || {};
    const email = data.email;
    const uid = userDoc.id;
    if (!email || !uid) {
      return res.status(500).json({ error: '사용자 정보가 올바르지 않습니다. 관리자에게 문의해 주세요.' });
    }

    // 2) 현재 비밀번호 검증 (Firebase Auth REST)
    const verifyRes = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_WEB_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: currentPassword, returnSecureToken: false })
      }
    );
    if (!verifyRes.ok) {
      return res.status(401).json({ error: '현재 비밀번호가 일치하지 않습니다.' });
    }

    // 3) 비밀번호 업데이트
    await admin.auth().updateUser(uid, { password: String(newPassword) });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[pw-change] error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
};
