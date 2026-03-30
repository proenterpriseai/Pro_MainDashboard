/**
 * _loader.js — vm 샌드박스 기반 함수 로더
 * 기존 코드를 1바이트도 수정하지 않고, Node.js vm 모듈로 전역 함수를 호출할 수 있게 한다.
 */
'use strict';

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

/**
 * 최소 브라우저 환경 스텁이 포함된 vm 샌드박스를 생성한다.
 * @param {Object} extras - 추가로 주입할 전역 객체 (예: { navigator: { userAgent: '...' } })
 * @returns {Object} vm.createContext()에 전달할 sandbox 객체
 */
function createSandbox(extras = {}) {
  const _store = new Map();

  const sandbox = {
    // 기본 JS 내장 객체
    Math, JSON, Date, Map, Set, Promise, URL,
    TextEncoder, TextDecoder,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    encodeURI, decodeURI, Array, Object, String, Number, Boolean, RegExp, Error,
    TypeError, RangeError, SyntaxError, Symbol, WeakMap, WeakSet, Proxy, Reflect,

    // 타이머
    setTimeout, clearTimeout, setInterval, clearInterval,

    // 콘솔
    console,

    // crypto (Node 20+ Web Crypto API)
    crypto: globalThis.crypto,

    // navigator 스텁 (테스트에서 오버라이드 가능)
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      language: 'ko-KR',
      platform: 'Win32',
      ...((extras && extras.navigator) || {})
    },

    // screen 스텁
    screen: { width: 1920, height: 1080, colorDepth: 24 },

    // localStorage 스텁 (인메모리 Map 기반)
    localStorage: {
      getItem(key) { return _store.get(key) || null; },
      setItem(key, val) { _store.set(key, String(val)); },
      removeItem(key) { _store.delete(key); },
      clear() { _store.clear(); },
    },

    // sessionStorage 스텁
    sessionStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {},
      clear() {},
    },

    // document 스텁 (no-op, null 반환)
    document: {
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          style: {},
          className: '',
          textContent: '',
          innerHTML: '',
          setAttribute() {},
          getAttribute() { return null; },
          appendChild() {},
          removeChild() {},
          addEventListener() {},
          removeEventListener() {},
          children: [],
          childNodes: [],
        };
      },
      createTextNode(text) { return { textContent: text }; },
      body: { appendChild() {}, removeChild() {}, style: {} },
      head: { appendChild() {} },
      addEventListener() {},
      removeEventListener() {},
      createDocumentFragment() { return { appendChild() {}, children: [] }; },
    },

    // window 스텁 (sandbox 자신을 참조)
    // vm.createContext 후에 self-reference 설정
    window: null,
    self: null,
    globalThis: null,

    // fetch 스텁
    fetch() { return Promise.resolve({ ok: true, json() { return Promise.resolve({}); } }); },

    // alert/confirm 스텁
    alert() {},
    confirm() { return true; },
    prompt() { return ''; },

    // location 스텁
    location: { href: 'http://localhost', hostname: 'localhost', pathname: '/', search: '', hash: '' },

    // history 스텁
    history: { pushState() {}, replaceState() {}, back() {}, forward() {} },

    // 추가 주입
    ...extras,
  };

  // self-reference 설정
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  // navigator extras 병합 (extras에서 navigator를 직접 전달한 경우 재설정)
  if (extras && extras.navigator) {
    sandbox.navigator = { ...sandbox.navigator, ...extras.navigator };
  }

  vm.createContext(sandbox);
  return sandbox;
}

/**
 * .js 파일 전체를 sandbox에서 실행한다.
 * 파일 내의 전역 함수/변수가 sandbox의 프로퍼티가 된다.
 */
function loadJsFile(filePath, sandbox) {
  const code = fs.readFileSync(filePath, 'utf-8');
  vm.runInContext(code, sandbox, { filename: path.basename(filePath) });
  return sandbox;
}

/**
 * HTML 파일에서 `function funcName(` 패턴을 찾아 중괄호 매칭으로 함수 전체를 추출한다.
 * 추출된 함수를 sandbox에서 실행하여 호출 가능하게 만든다.
 *
 * @param {string} htmlPath - HTML 파일 경로
 * @param {string} funcName - 추출할 함수 이름
 * @param {Object} sandbox - vm sandbox
 * @param {Object} [options] - 추가 옵션
 * @param {number} [options.prefixLines] - 함수 선언 앞에서 추가로 포함할 줄 수 (상수 등)
 * @returns {Function} 추출된 함수
 */
function extractFunction(htmlPath, funcName, sandbox, options = {}) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const lines = html.split('\n');

  // function funcName( 또는 async function funcName( 패턴 찾기
  const pattern = new RegExp(`^\\s*(?:async\\s+)?function\\s+${funcName}\\s*\\(`);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    throw new Error(`Function "${funcName}" not found in ${htmlPath}`);
  }

  // prefixLines: 함수 앞의 상수/변수도 함께 포함
  const actualStart = Math.max(0, startIdx - (options.prefixLines || 0));

  // 중괄호 매칭으로 함수 끝 찾기
  let braceCount = 0;
  let endIdx = -1;
  let started = false;
  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { braceCount++; started = true; }
      if (ch === '}') { braceCount--; }
      if (started && braceCount === 0) { endIdx = i; break; }
    }
    if (endIdx !== -1) break;
  }

  if (endIdx === -1) {
    throw new Error(`Could not find closing brace for function "${funcName}" in ${htmlPath}`);
  }

  const funcCode = lines.slice(actualStart, endIdx + 1).join('\n');
  vm.runInContext(funcCode, sandbox, { filename: `extracted:${funcName}` });
  return sandbox[funcName];
}

/**
 * HTML 파일의 특정 줄 범위를 추출하여 sandbox에서 실행한다.
 * 함수와 그 의존 상수가 함께 있을 때 사용.
 *
 * @param {string} htmlPath - HTML 파일 경로
 * @param {number} startLine - 시작 줄 번호 (1-based)
 * @param {number} endLine - 끝 줄 번호 (1-based, 포함)
 * @param {Object} sandbox - vm sandbox
 */
function loadHtmlScriptBlock(htmlPath, startLine, endLine, sandbox, options = {}) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const lines = html.split('\n');
  let code = lines.slice(startLine - 1, endLine).join('\n');

  // vm에서 const/let 선언은 sandbox 프로퍼티가 되지 않음.
  // exposeAsVar=true 시 const/let → var 변환하여 sandbox에서 접근 가능하게 함.
  if (options.exposeAsVar) {
    code = code.replace(/\b(const|let)\s+/g, 'var ');
  }

  vm.runInContext(code, sandbox, { filename: `block:L${startLine}-L${endLine}` });
  return sandbox;
}

module.exports = {
  createSandbox,
  loadJsFile,
  extractFunction,
  loadHtmlScriptBlock,
};
