/**
 * 메인 대시보드 유닛 테스트
 * 기존 코드 수정 0건 — vm 샌드박스로 전역 함수를 로드하여 테스트
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createSandbox, extractFunction } = require('./_loader');

const HTML_PATH = path.join(__dirname, '..', 'index.html');

// ============================================================
// 1. getAuthErrorMsg(code) — Firebase 에러코드 → 한글 매핑
// ============================================================
describe('getAuthErrorMsg', () => {
  let getAuthErrorMsg;

  it('함수 로딩', () => {
    const sandbox = createSandbox();
    getAuthErrorMsg = extractFunction(HTML_PATH, 'getAuthErrorMsg', sandbox);
    assert.ok(typeof getAuthErrorMsg === 'function', 'getAuthErrorMsg must be a function');
  });

  it('auth/email-already-in-use → 이미 가입된 이메일', () => {
    assert.equal(getAuthErrorMsg('auth/email-already-in-use'), '이미 가입된 이메일입니다.');
  });

  it('auth/invalid-email → 올바른 이메일 형식이 아닙니다', () => {
    assert.equal(getAuthErrorMsg('auth/invalid-email'), '올바른 이메일 형식이 아닙니다.');
  });

  it('auth/weak-password → 비밀번호는 6자 이상', () => {
    assert.equal(getAuthErrorMsg('auth/weak-password'), '비밀번호는 6자 이상이어야 합니다.');
  });

  it('auth/user-not-found → 등록되지 않은 이메일', () => {
    assert.equal(getAuthErrorMsg('auth/user-not-found'), '등록되지 않은 이메일입니다.');
  });

  it('auth/wrong-password → 비밀번호가 일치하지 않습니다', () => {
    assert.equal(getAuthErrorMsg('auth/wrong-password'), '비밀번호가 일치하지 않습니다.');
  });

  it('auth/invalid-credential → 이메일 또는 비밀번호가 올바르지 않습니다', () => {
    assert.equal(getAuthErrorMsg('auth/invalid-credential'), '이메일 또는 비밀번호가 올바르지 않습니다.');
  });

  it('auth/too-many-requests → 너무 많은 시도', () => {
    assert.equal(getAuthErrorMsg('auth/too-many-requests'), '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해 주세요.');
  });

  it('auth/network-request-failed → 네트워크 오류', () => {
    assert.equal(getAuthErrorMsg('auth/network-request-failed'), '네트워크 오류가 발생했습니다.');
  });

  it('미지 에러코드 → 폴백 메시지에 코드 포함', () => {
    const result = getAuthErrorMsg('auth/unknown-error');
    assert.ok(result.includes('auth/unknown-error'), 'fallback must include the error code');
    assert.ok(result.includes('오류가 발생했습니다'), 'fallback must include generic error text');
  });
});

// ============================================================
// 2. getDeviceType() — UA 기반 디바이스 타입 판별
// ============================================================
describe('getDeviceType', () => {
  it('iPhone UA → mobile', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' }
    });
    extractFunction(HTML_PATH, 'getDeviceType', sandbox);
    assert.equal(sandbox.getDeviceType(), 'mobile');
  });

  it('Android UA → mobile', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' }
    });
    extractFunction(HTML_PATH, 'getDeviceType', sandbox);
    assert.equal(sandbox.getDeviceType(), 'mobile');
  });

  it('iPad UA → mobile', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' }
    });
    extractFunction(HTML_PATH, 'getDeviceType', sandbox);
    assert.equal(sandbox.getDeviceType(), 'mobile');
  });

  it('Windows Desktop UA → pc', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    extractFunction(HTML_PATH, 'getDeviceType', sandbox);
    assert.equal(sandbox.getDeviceType(), 'pc');
  });

  it('Mac Desktop UA → pc', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    extractFunction(HTML_PATH, 'getDeviceType', sandbox);
    assert.equal(sandbox.getDeviceType(), 'pc');
  });
});

// ============================================================
// 3. getDeviceLabel() — UA 파싱 → 브라우저/OS/디바이스 라벨
// ============================================================
describe('getDeviceLabel', () => {
  it('Chrome + Windows → "Chrome / Windows (PC)"', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    extractFunction(HTML_PATH, 'getDeviceLabel', sandbox);
    assert.equal(sandbox.getDeviceLabel(), 'Chrome / Windows (PC)');
  });

  it('Edge + Windows → "Edge / Windows (PC)"', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' }
    });
    extractFunction(HTML_PATH, 'getDeviceLabel', sandbox);
    assert.equal(sandbox.getDeviceLabel(), 'Edge / Windows (PC)');
  });

  it('Safari + iPhone → "Safari / iOS (모바일)"', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' }
    });
    extractFunction(HTML_PATH, 'getDeviceLabel', sandbox);
    // OS 판별 순서 수정: Windows → iPhone|iPad → Android → Mac
    assert.equal(sandbox.getDeviceLabel(), 'Safari / iOS (모바일)');
  });

  it('Chrome + Android → "Chrome / Android (모바일)"', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' }
    });
    extractFunction(HTML_PATH, 'getDeviceLabel', sandbox);
    assert.equal(sandbox.getDeviceLabel(), 'Chrome / Android (모바일)');
  });

  it('Chrome + Mac → "Chrome / Mac (PC)"', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    extractFunction(HTML_PATH, 'getDeviceLabel', sandbox);
    assert.equal(sandbox.getDeviceLabel(), 'Chrome / Mac (PC)');
  });

  it('Firefox + Windows → "Firefox / Windows (PC)"', () => {
    const sandbox = createSandbox({
      navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0' }
    });
    extractFunction(HTML_PATH, 'getDeviceLabel', sandbox);
    assert.equal(sandbox.getDeviceLabel(), 'Firefox / Windows (PC)');
  });
});
