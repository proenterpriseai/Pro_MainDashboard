/**
 * 개인사업자 컨설팅 카드 테스트 (FEATURE_SOLE_CARD, 2026-11-22)
 * index.html 문자열 가드 — 기본 off · 법인 카드 블록 무수정 · 접속 코드 HTML 기재 금지 · 캐러셀 초기화 전 실행 위치 · 이미지 파일
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');

describe('개인사업자 컨설팅 카드', () => {
  it('Flag 기본값 false — 옵트인은 sessionStorage._flag_sole_card', () => {
    assert.match(html, /var FEATURE_SOLE_CARD = false;/);
    assert.ok(html.includes("sessionStorage.getItem('_flag_sole_card')"));
  });
  it('template 안에만 카드 마크업 — 법인 카드 다음 · 통합 계산기 앞', () => {
    const a = html.indexOf('<template id="ceoCardTpl">'), b = html.indexOf('<template id="soleCardTpl">'), c = html.indexOf('<!-- 카드 3: 통합 계산기 -->');
    assert.ok(a > 0 && b > a && c > b);
    const tpl = html.slice(b, html.indexOf('</template>', b));
    assert.ok(tpl.includes('onclick="openSoleAccessModal()"') && tpl.includes('src="preview-sole.webp"') && tpl.includes('개인사업자 컨설팅'));
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'preview-sole.webp')), '이미지 파일');
    const tags = (tpl.match(/<span>/g) || []).length;
    assert.ok(tags <= 5, '태그 5개 이하 — 6개면 데스크톱 카드 폭이 357px을 넘어 캐러셀 위치가 밀림(리뷰 🔴, 2026-11-22 실측 409px)');
  });
  it('독립 스크립트가 캐러셀 초기화 전(파이어베이스 SDK 앞)에 있고 법인 카드 블록 뒤', () => {
    const s = html.indexOf('var FEATURE_SOLE_CARD'), ceo = html.indexOf('var FEATURE_CEO_CARD'), sdk = html.indexOf('<!-- Firebase SDK (compat) -->');
    assert.ok(ceo > 0 && s > ceo && sdk > s);
  });
  it('접속 주소 = /sole · 코드는 HTML에 없음(서버 API 재사용)', () => {
    assert.ok(html.includes("var SOLE_SITE_URL = 'https://proceoconsulting.com/sole';"));
    const blk = html.slice(html.indexOf('var FEATURE_SOLE_CARD'), html.indexOf('<!-- Firebase SDK (compat) -->'));
    assert.ok(!/ACCESS_CODE\s*=|code\s*:\s*'[A-Za-z0-9]{6,}'/.test(blk), '접속 코드 기재 금지');
    assert.ok(blk.includes('openCeoAccessModal()'), '법인 창·API 재사용');
  });
  it('법인 카드 기존 함수·문구 무수정(법인 카드 off·개인사업자 off 경로 = 종전)', () => {
    assert.ok(html.includes('<div class="tool-card glow-target" onclick="openCeoAccessModal()">'));
    assert.ok(html.includes("function _ceoAccessOpenSite() {\n  _trackOpen('법인 CEO 컨설팅', CEO_SITE_URL);\n}") || html.includes("function _ceoAccessOpenSite() {\r\n  _trackOpen('법인 CEO 컨설팅', CEO_SITE_URL);\r\n}"));
    assert.ok(html.includes("if (t2) t2.textContent = '8대 핵심 AI 시스템';"));
  });
});
