/**
 * Firebase Cloud Function (v2): resetPassword
 * 임시 비밀번호 발급 (서비스 계정 키 불필요 — ADC 자동 인증)
 *
 * 호출: POST https://resetpassword-xxxxxxxxxx-uc.a.run.app
 * Body: { empNo: string, name: string }
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp(); // Cloud Functions 환경에서 자동 인증 (키 불필요)

/* ── 환경변수 (Firebase Console 또는 .env 파일에서 설정) ── */
const EMAILJS_SERVICE_ID = defineString('EMAILJS_SERVICE_ID');
const EMAILJS_TEMPLATE_ID = defineString('EMAILJS_TEMPLATE_ID');
const EMAILJS_PUBLIC_KEY = defineString('EMAILJS_PUBLIC_KEY');
const EMAILJS_PRIVATE_KEY = defineString('EMAILJS_PRIVATE_KEY', { default: '' });

/* ── 임시 비밀번호 생성 (12자, 영대소+숫자+특수) ── */
function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';    // I, O 제외 (혼동 방지)
  const lower = 'abcdefghjkmnpqrstuvwxyz';      // i, l, o 제외
  const digits = '23456789';                      // 0, 1 제외
  const special = '!@#$%';
  const all = upper + lower + digits + special;

  const bytes = crypto.randomBytes(12);
  let pw = '';
  pw += upper[bytes[0] % upper.length];
  pw += lower[bytes[1] % lower.length];
  pw += digits[bytes[2] % digits.length];
  pw += special[bytes[3] % special.length];
  for (let i = 4; i < 12; i++) {
    pw += all[bytes[i] % all.length];
  }

  // Fisher-Yates 셔플
  const arr = pw.split('');
  const shuffleBytes = crypto.randomBytes(arr.length);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

/* ── EmailJS REST API 발송 ── */
async function sendTempPasswordEmail(toEmail, toName, empNo, tempPassword) {
  const serviceId = EMAILJS_SERVICE_ID.value();
  const templateId = EMAILJS_TEMPLATE_ID.value();
  const publicKey = EMAILJS_PUBLIC_KEY.value();
  const privateKey = EMAILJS_PRIVATE_KEY.value();

  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS 환경변수가 설정되지 않았습니다.');
  }

  const body = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: {
      to_email: toEmail,
      to_name: toName,
      empNo: empNo,
      temp_password: tempPassword
    }
  };

  if (privateKey) {
    body.accessToken = privateKey;
  }

  const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('EmailJS 발송 실패: ' + text);
  }
}

/* ── HTTPS Cloud Function (v2) ── */
exports.resetPassword = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { empNo, name } = req.body || {};

    if (!empNo || !name) {
      return res.status(400).json({ error: '사원번호와 이름을 입력해 주세요.' });
    }

    const db = admin.firestore();

    // 1. employee_lookup 조회
    const doc = await db.collection('employee_lookup').doc(String(empNo)).get();
    if (!doc.exists) {
      return res.status(404).json({ error: '등록된 정보와 일치하지 않습니다.' });
    }

    const data = doc.data() || {};
    const storedName = (data.displayName || '').trim();
    const inputName = String(name).trim();

    if (storedName !== inputName) {
      return res.status(404).json({ error: '등록된 정보와 일치하지 않습니다.' });
    }

    const email = data.email;
    const uid = data.uid;
    if (!email || !uid) {
      return res.status(404).json({ error: '등록된 정보와 일치하지 않습니다.' });
    }

    // 2. 임시 비밀번호 생성
    const tempPassword = generateTempPassword();

    // 3. Firebase Auth 비밀번호 변경 (Admin SDK — 키 불필요)
    await admin.auth().updateUser(uid, { password: tempPassword });

    // 4. Firestore mustChangePassword 플래그 세팅
    await db.collection('users').doc(uid).update({
      mustChangePassword: true,
      tempPasswordSetAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 5. EmailJS로 임시비번 이메일 발송
    await sendTempPasswordEmail(email, storedName, empNo, tempPassword);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ error: '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
});
