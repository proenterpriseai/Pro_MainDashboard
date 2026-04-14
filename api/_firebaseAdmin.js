// Firebase Admin SDK 공유 초기화
// Vercel 환경변수 FIREBASE_SERVICE_ACCOUNT(JSON 전체 문자열) 필요
const admin = require('firebase-admin');

function getAdmin() {
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  }
  let sa;
  try {
    sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON: ' + e.message);
  }
  // Vercel의 환경변수에 붙여넣을 때 private_key의 \n이 실제 개행으로 변환되지 않는 경우 대응
  if (sa.private_key && sa.private_key.includes('\\n')) {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  admin.initializeApp({
    credential: admin.credential.cert(sa)
  });
  return admin;
}

// Firebase Web API Key (클라이언트에도 노출된 값 — 서버에서 REST API 호출용)
const FIREBASE_WEB_API_KEY = 'AIzaSyCuc3x0mF6yfdvVvGrs4J2-rJBo2qB8_sk';

module.exports = { getAdmin, FIREBASE_WEB_API_KEY };
