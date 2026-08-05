# Pro Enterprise AI 메인 대시보드

## 🟢 현재 LIVE (이 줄을 배포마다 갱신)
| 항목 | 값 |
|---|---|
| **버전** | **v=20260805b** (카드 설명 줄바꿈) |
| **코드 커밋** | `5698e80` (카드 설명) / `cbccf17` (모바일 히어로) / `825753d` (사번 fix) / `331a5f6` (change-email 도구) — 이후 docs 커밋은 LIVE 동작 무변경 |
| **SW 캐시** | `pro-ai-v15` (sw.js) |
| **배포** | GitHub `proenterpriseai/Pro_MainDashboard` → Vercel `pro-dashboards.com` (push 시 자동, ~30초) |
| **활성 Flag** | `FEATURE_SMS_PW_RESET=true`(700명 공개) / `FEATURE_TEMP_PASSWORD=false`(미배포·조직정책 차단) |
| **사용자 규모** | users 156건 / employee_lookup 151건 (2026-07-28 실측) |

- 2026-08-05 `v=20260805b` — **카드 설명 어절 경계 줄바꿈** 5개(보장분석·DB영업·계산기·코치·민원). `.card-desc-br`(모바일 전용 `<br>`) + `.card-desc-keep{word-break:keep-all}`. ⛔**'예상 보험금 산출 전문가'·'건강검진' 2개는 현행 유지가 실장님 지시** → `keep-all`을 `.card-desc` 전체에 걸지 말 것. CACHE v14→v15.
- 2026-08-05 `v=20260805a` (commit `cbccf17`) — 모바일 히어로 2건: ①**4구간 행간 균등화**(버튼블록→배지→타이틀→서브→카드 전부 시각 15.5~16px, `margin-top:16px`/`badge 11px`/`title 5px`/`sub 10px` **4개 세트**) ②서브 문장 줄바꿈 고정(`.hero-sub-br` 모바일 전용 `<br>` + `word-break:keep-all`). `sw.js` CACHE `pro-ai-v13→v14`. LIVE `pro-dashboards.com` 실측 확인(16/16/15.6/15.5), 데스크톱·가로모드 무변경.
- 2026-07-28 `v=20260728` — **사번 정합성 fix**: doLogin 사번 덮어쓰기 제거 + doSignup 7자리 검증 + 신규생성 seed 보완 + CACHE v13. ⛔되돌림 금지 → 아래 "사원번호 정책" 참조.
- 2026-06-10 `FEATURE_SMS_PW_RESET=true` 700명 공개 (commit `2f6169e`).
- 2026-05-23 `v=20260523a` 모바일 헤더 2x2 grid (commit `c89f738`).
- 2026-05-08 `v=20260508` 시스템 결함 4건 영구 fix (사원번호 중복검증 등).

## 프로젝트 개요
7대 핵심 AI 시스템의 통합 허브. Firebase Auth 기반 로그인 + PWA 지원.
700명+ 보험설계사 사용 중인 프로덕션 시스템.

## 기술 스택
- **Frontend**: Vanilla JS + Tailwind CSS + Three.js (3D 배경)
- **Auth**: Firebase Auth (Email/Password) + Firestore (사용자 메타데이터)
- **PWA**: manifest.json + sw.js (Service Worker)
- **배포**: GitHub `proenterpriseai/Pro_MainDashboard` → Vercel `pro-dashboards.com`

## 파일 구조
| 파일 | 역할 |
|------|------|
| `index.html` | 메인 UI + Firebase Auth + 시스템 카드 |
| `manifest.json` | PWA 설치 정의 ("Pro Enterprise AI") |
| `sw.js` | Service Worker (캐시 전략) |
| `icon-192.png` / `icon-512.png` | PWA 아이콘 (파란 원 + PRO) |

## 연결된 시스템 (하드코딩 URL)
| 시스템 | URL |
|--------|-----|
| 보장분석 | `https://pro-insuranceanalysis.com` |
| DB영업관리 | `https://pro-salessystem.com` |
| 통합금융계산기 | `https://pro-financecalculator.vercel.app` |
| 건강검진 AI 전문가 | `https://gemini.google.com/gem/1fAoSklWuFuuvrnNkojfuo7t-ltPL00VX?usp=sharing` |
| AI 활용 헬프 데스크 | `https://gemini.google.com/gem/1ujGMGS3M6CdPOxkFOiWdwplpgAduUXOy?usp=sharing` |
| 예상 보험금 산출 전문가 | `https://gemini.google.com/gem/15CfHW2qR7KKsa2KvSoJutvykQ3Rr_RjT?usp=sharing` |
| 민원 분쟁조정 전문가 | `https://gemini.google.com/gem/1jcmQ743PuN10BT_N88nAuPnESu4mWH_D?usp=sharing` |
| 금융 & 보험 코치 | `https://gemini.google.com/gem/1vUjZNt7m7jLAxJ3ICOv5tI4WIqssmX0H?usp=sharing` |

## ⚠️ 도메인 규칙
- 보장분석/DB영업관리: 반드시 `.com` 도메인 사용 (`.vercel.app` 금지)
- 계산기: `vercel.app` (커스텀 도메인 미구매)

## 인증 시스템
- Firebase Auth: Email + Password
- ADMIN_EMAILS: 프론트엔드 하드코딩 (line ~719) — **향후 Firestore 이전 예정**
- 기기 제한: deviceLimitScreen (디바이스 핑거프린팅)
- Firebase 다운 시: 오프라인 대응 없음 (Auth 실패 → 접근 불가)

## Service Worker 캐시 (sw.js)
- `CACHE_NAME` — 수동 버전 관리 (수정 시 이 값도 함께 갱신). **현재 값은 최상단 LIVE 표 참조** (여기에 숫자를 적으면 드리프트 반복)
- Firebase/Google API: 네트워크 전용 (캐시 안 함)
- 기타: 네트워크 우선 + 캐시 fallback
- **캐시 갱신**: `CACHE_NAME` 버전 올려야 기존 사용자에게 반영

## ⚠️ 전수 검증 결과 (v=20260325)
- Firebase Auth: 1,000명 동시접속 안전 (Google 인프라 자동 스케일링)
- ADMIN_EMAILS 프론트엔드 노출: P2 개선 대상
- Firebase API 키 프론트엔드 노출: Firestore 보안규칙으로 보호 (정상)
- SW 캐시 수동 관리: P2 개선 대상

## ⚠️ AI 활용 헬프 데스크 (v=20260325)
- 상단 관리자/로그아웃 버튼 **아래**에 초록색 버튼
- 클릭 시 Gemini GEMS 헬프데스크 새 탭 열기
- 로그인한 **모든 사용자**에게 표시 (관리자 전용 아님)
- `showLandingButtons()` + `showScreen()` 두 곳에서 display 제어

## 비밀번호 변경/분실 기능 (v=20260416)
- 로그인 화면 하단에 "비밀번호 변경 | 비밀번호 분실" 링크 (`.auth-sublinks`)
- **비밀번호 변경**: employee_lookup/{empNo} → email 조회 → `reauthenticateWithCredential()` → updatePassword → signOut
  - ⚠️ `signInWithEmailAndPassword` 아님! `reauthenticateWithCredential` 패턴 사용 (v=20260416 변경)
- **비밀번호 분실**: employee_lookup/{empNo} + displayName 일치 확인 → sendPasswordResetEmail (링크 1시간 유효)
- **비밀번호 최소 길이**: 6자 (Firebase Auth 기준 통일, v=20260416)
- `employee_lookup` 컬렉션: { uid, email, displayName } — 비로그인 상태 공개 읽기 (PII 최소화)
- 회원가입(doSignup) 시 batch.set으로 users + employee_lookup 동시 생성
- 기존 사용자 백필: `_backfill-employee-lookup.js` (관리자 Console에서 1회 실행 완료)
- **기존 함수 최소 수정 이력**: toggleAuthForm, doLogout 등은 원본 그대로. doLogin/doSignup은 2026-07-28 사번 정합성 fix에서 사전승인 하에 수정됨(아래 "사원번호 정책" 참조)

## Caps Lock 감지 + 대소문자 경고 (v=20260416)
- 비밀번호 필드 3곳에 Caps Lock 실시간 경고: `#loginPw`, `#pwCurrentInput`, `#pwNewInput`
- `.caps-lock-warning` CSS 클래스, `setupCapsLockDetection()` 유틸 함수
- 로그인 실패 시(`auth/invalid-credential`, `auth/wrong-password`) 노란색 대소문자 힌트 표시
- `e.getModifierState('CapsLock')` 사용 (keydown/keyup 이벤트)

## Feature Flag (v=20260416)
- `FEATURE_TEMP_PASSWORD = false` — 임시비밀번호 시스템 (미활성)
  - `true` 전환 시: `doPwReset()`이 Cloud Function 호출, 로그인 후 `mustChangePassword` 체크
  - **현재 미배포**: Google Cloud 조직 정책이 Cloud Functions 배포/서비스 계정 키 생성 차단
  - `functions/` 디렉토리에 코드 준비 완료, 조직 정책 완화 시 배포 가능

## SMS 인증 비밀번호 재설정 (v=20260610, **FEATURE_SMS_PW_RESET=true 700명 공개** — 대표님 승인 2026-06-10, commit 2f6169e)
- **목적**: 이메일 링크 방식의 두 약점(스팸함 분류 + 1시간/1회용 링크 실패 시 전체 반복) 제거 — 로그인 화면에서 완결
- **플로우**: 재설정 클릭 → 사원번호+이름 → 등록 휴대폰으로 인증번호 SMS → 같은 모달에서 OTP+새 비번 입력 → 즉시 변경
- **서버**: `api/sms-pw-reset.js` (Vercel Serverless, action=request/confirm)
  - 본인확인: employee_lookup displayName 매칭 + **lookup uid 정확 매칭만** (중복계정 오변경 차단)
  - OTP: 6자리, sha256 해시 저장(pepper=SOLAPI_SECRET), 5분 만료, 검증 5회(낙관적 잠금 직렬화), 발송 일 5회+60초 쿨다운
  - 방어: Origin 화이트리스트(pro-dashboards.com + pro-main-dashboard*.vercel.app) / 발송대상=users.phone만
  - OTP 문서 `pw_reset_otps/{empNo}` — Firestore 엄격 규칙 catch-all(if false)로 클라 차단, 서버만 접근
- **환경변수** (전부 Sensitive): `SOLAPI_API_KEY`/`SOLAPI_API_SECRET`/`SMS_SENDER_PHONE`(01047337148)/`FIREBASE_ADMIN_REFRESH_TOKEN`
- **⚠️ 토큰 수명 이슈**: 회사 계정 토큰은 조직 재인증 정책으로 주기 만료(`invalid_rapt`) → 만료 시 서버가 `SMS_UNAVAILABLE` 응답 → **클라이언트가 기존 이메일 방식으로 자동 전환**(무중단). 복구=`npx firebase-tools login --reauth` 후 새 토큰 Vercel 재등록. 영구 해결(서비스계정) 검토 중 — 조직 도메인 제한이 외부 주체 추가 차단(gmail 직접 추가 실패 확인)
- **클라이언트**: `openPwResetModal()` Flag 게이트 + 독립 `smsPwModal`/`_smsPw*` 블록. 휴대폰 미등록(`NO_PHONE`)도 이메일 자동 fallback. 기존 doPwReset 무수정
- **검증(2026-06-10)**: Preview 실측 — 문자 수신→OTP→변경→pro-dashboards.com 새 비번 로그인 성공. 129명 전원 phone+lookup 보유(이메일 fallback 대상 0명). 솔라피 발신번호 010-4733-7148(개인 명의, **인증 만료 2026-12-10 — 재인증 필요**)
- **flip 전 체크리스트**: ① Vercel Firewall `/api/*` 레이트리밋 ② 토큰 영구화 또는 재인증 운영 룰 확정 ③ 대표님 명시 승인

## 관리자 비밀번호 초기화 도구 (v=20260508 통합 도구 추가)
- **`_user-admin.js` (권장 — 통합 도구)**: 사원번호 신고 3분 처리
  - `node _user-admin.js find <사원번호>` — 모든 등록 계정 검색 (중복 즉시 발견)
  - `node _user-admin.js reset <사원번호> --auto` — 최근 접속 계정 자동 임시 비번
  - `node _user-admin.js reset <사원번호> --email <이메일> --pw "<비번>"` — 명시 이메일/비번
  - `node _user-admin.js cleanup <사원번호> --keep <메인이메일>` — 중복 계정 영구 정리
  - `node _user-admin.js fix-lookup <사원번호> --to <이메일>` — employee_lookup 정정
  - `node _user-admin.js change-email <사원번호> --to <새이메일> [--from <기존이메일>]` — 이메일 교정(Auth+users+lookup 3곳 동시, 삭제/재가입 없이 uid·승인·이력 보존)
- **`_reset-user-pw.js` (응급 fallback)**: 사원번호 기반
- **`_reset-user-pw-by-email.js` (응급 fallback)**: 이메일 기반 + 사용자 지정 비번 옵션
- **운영 매뉴얼**: [ADMIN-SOP.md](./ADMIN-SOP.md) — 신고 접수 → 처리 → SMS 표준 절차
- **사전 조건**: `firebase login` 완료 (만료 시 `firebase login --reauth`)
- 모두 `.vercelignore`의 `_*.js` 패턴으로 프로덕션 배포 제외

## 🔑 사원번호(employeeNo) 정책 — 사번 정합성 fix (v=20260728)
> **⛔ 이 정책을 되돌리지 말 것.** 되돌리면 비밀번호 재설정이 조용히 영구 실패하는 사고가 재발합니다.

- **사번은 7자리 숫자**(사내 규칙). 회사 전 계정 156명 실측 100% 7자리 — 검증 도입 시 회귀 0 확인.
- **사번은 가입 시 확정값. 로그인 입력으로 절대 갱신하지 않는다.**
  - 구 코드(`doLogin`)는 로그인 성공 후 `users.employeeNo`를 **입력값으로 무검증 덮어쓰기** → 인증은 email+password로만 하므로 사번 오타도 로그인 성공 → `employee_lookup` 문서 ID와 불일치 → **비밀번호 재설정 영구 실패**. 실제 피해 2건(이준훈 2630008, 오선준 2635669).
  - `saved_emp_no`(사번 저장 체크박스, 기본 ON)가 오타를 localStorage에 고착시켜 재발을 가속.
  - → **덮어쓰기 제거**. 사번 정정은 관리자가 Firestore/스크립트로 처리.
- **`doSignup` 7자리 검증**: `if (!/^\d{7}$/.test(empNo))` → "사원번호는 7자리 숫자입니다". 가입 폼 입력창도 `inputmode="numeric" maxlength="7"` + 숫자만 필터(핸드폰 필드와 동일 패턴).
- **users 문서 신규 생성 fallback**(`onAuthStateChanged`, 문서 미존재 시): 로그인 입력 사번을 **7자리일 때만** 초기값으로 채움. 덮어쓰기가 아니라 생성이므로 오염 위험 없음. (구 코드는 `''` 고정 → 덮어쓰기 제거 후 `''` 영구 고착 위험이 생겨 함께 보완. `''`이면 `_user-admin.js find`가 계정을 찾지 못함.)
- ⚠️ **자릿수 검증만으로는 7자리끼리의 자리 전치 오타를 못 잡는다**(오선준 2635699↔2635669). 그건 덮어쓰기 제거로만 방어됨 → 둘은 세트.
- ℹ️ 서버(`api/sms-pw-reset.js`)의 입력 sanitize는 `^[0-9]{4,10}$`로 더 관대함(차단 아님, 무해). 통일은 별도 P2.
- **잔여 P2**: ①사번 변경 전용 관리자 명령(`change-empno`) 미구현 — 정당한 사번 변경 시 lookup 문서 ID 이관 필요(현재 수동) ②`employeeNo` 빈 값/불일치 정기 감사 ③사번 검증을 순수 함수로 분리해 `tests/unit-tests.js`에 회귀 테스트 추가.

## 시스템 결함 4건 영구 fix (v=20260508)
- **결함 1**: 회원가입 시 사원번호 중복 검증 추가 (`employee_lookup.exists` 차단)
- **결함 2**: `doPwChange`가 `auth.currentUser.email` 직접 사용 (lookup 의존 제거)
- **결함 3**: `doPwReset` 3-way 매칭 (사원번호 + 이름 + 이메일) — 잘못된 계정 발송 차단
- **결함 4**: 로그인 화면 "변경" 링크 제거 + "재설정" 단일 라벨 / 로그인 후 헤더에 "변경" 버튼 / 모달 안내 부제 강화
- **배경**: 2026-05-07 최은주(2536085) 케이스에서 시스템 결함 4건 발견 → 트리플 체크 A+B 통과 후 영구 fix
- **잔여 P2**: Firestore 보안규칙 race condition 방지 (별도 작업) / FEATURE_TEMP_PASSWORD 분기 정리 (Flag 비활성 상태)

## ⚠️ Google Cloud 조직 정책 제약 (v=20260416)
- 조직 정책 `iam.disableServiceAccountKeyCreation` 적용 중
- **서비스 계정 키 생성 불가** (Firebase Console, Google Cloud Console 모두)
- **Cloud Functions 배포 불가** (Cloud Build 권한 없음)
- Firebase Blaze(종량제) 플랜 업그레이드 완료 (2026-04-16)
- Firebase 이메일 템플릿 수정 불가 (조직 정책 또는 Spark→Blaze 전환 직후 제한)

## 배포 순서 (반드시 준수)
1. `.com` (pro-dashboards.com) 먼저 → git push → 배포 확인
2. 코드 수정 시 반드시 push/배포까지 완료
- **커밋 시**: Co-Authored-By 태그 필수

## 모바일 최적화 규칙 (v=20260418a/b/c → v=20260523a 헤더 2x2 grid 보강)
- **격리 전략**: 모든 모바일 스타일은 `@media(max-width:640px)` 블록에 격리. 데스크톱 UX 불변 필수
- **터치 영역**: 버튼/링크 최소 `min-height: 36~44px` (Apple HIG / Google Material 가이드)
- **iOS Safari 16px 룰**: 입력창 `font-size:16px` 미만이면 포커스 시 자동 줌 발동 → 모든 input 16px 고정
- **safe-area**: `env(safe-area-inset-*)` 적용 대상 = body, auth-overlay, admin-overlay (PWA standalone 대응)
- **카드폭 공식**: `calc(100vw - 142px)` = hero margin(20) + content padding(32) + wrapper padding(88) + border(2)
- **캐러셀 getCardWidth**: DOM 기반 측정(`getBoundingClientRect().width + 18`) — CSS 폭 변경 시 JS 수정 불필요
- **landscape 전용**: `@media(max-height:500px) and (orientation:landscape)` 별도 블록 — `body{align-items:flex-start}` 필수 (hero 상단 클립 방지)
- **관리자 테이블 → 카드형**: `data-label` 속성 + `td::before{content:attr(data-label)}` 패턴. thead는 `position:absolute;top:-9999px`
- **접근성**: Three.js Aurora는 `prefers-reduced-motion` 존중 — reduce 설정 시 정적 프레임 1회만 렌더
- **SW 캐시 bump**: 모바일 CSS 수정 시 반드시 `CACHE_NAME` 버전업 (**현재 값은 최상단 LIVE 표 참조** — 여기에 숫자를 적으면 드리프트가 반복됨)
- **히어로 4구간 행간 균등 (v=20260805a)** — 모바일 히어로는 **버튼블록→배지→타이틀→서브→카드** 네 구간이 모두 **시각 15.5~16px**로 맞춰져 있음. 4개 값이 **한 세트**이며, 하나만 바꾸면 리듬이 깨진다:
  | 구간 | 제어 선언 | 잉크 보정 | 시각 |
  |---|---|---|---|
  | 버튼블록↔배지 | `.hero-content{margin-top:16px}` | 0 (박스=시각) | 16.0 |
  | 배지↔타이틀 | `.hero-badge{margin-bottom:11px}` | +5 (32px Pretendard 상단) | 16.0 |
  | 타이틀↔서브 | `.hero-title{margin-bottom:5px}` | +10.6 (타이틀 하단+서브 상단) | 15.6 |
  | 서브↔카드 | `.hero-sub{margin-bottom:10px}` | +5.6 (서브 하단) | 15.5 |
  - ⚠️ **박스값(margin)과 시각값이 다르다** — 폰트 잉크 여백 때문. margin 숫자만 보고 "안 맞았네" 판단 금지, 반드시 잉크 기준 실측.
  - 작업 전 실측: 16 / 21 / 26.6 / **5.5**(박스 0 — `carousel-wrapper`는 margin·padding 0이라 서브 문구가 카드에 붙어 있었음).
  - 카드·푸터 위치는 거의 불변(카드 상단 377.9→377.4px) — 총합을 유지하며 재분배했기 때문.
- **카드 설명 줄바꿈 (v=20260805b)**: 5개 카드만 `<br class="card-desc-br">`(모바일 전용) + `.card-desc-keep{word-break:keep-all}`. ⛔예상보험금·건강검진 카드는 **현행 유지 지시** → `keep-all`을 `.card-desc` 전체에 걸면 지시 위반. ⚠️새 규칙은 **`@media(max-width:640px)` 블록**에 넣을 것 — 파일 뒤쪽 `landscape` 블록(`max-height:500px and orientation:landscape`)에 넣으면 **세로 모드에서 전혀 적용되지 않음**(2026-08-05 실제 실수)
- **히어로 서브 문장 줄바꿈 (v=20260805a)**: `<br class="hero-sub-br">`가 모바일에서만 `display:inline` → "…통합 금융 계산기, / 전문 비서 챗봇까지." 2줄 고정. 데스크톱은 `display:none`으로 1줄 유지. ⚠️`<br>` **뒤에 공백 1칸 필수**(앞에 두면 데스크톱에서 "계산기,전문"으로 붙음). `word-break:keep-all`로 어절 중간 절단 방지 — 280px에서도 overflow 0 실측
- **헤더 4버튼 2x2 grid (v=20260523a, commit c89f738)**: 모바일에서 `.logo-actions` grid 2x2 + `.logo-actions-row{display:contents}` 트릭으로 HTML 구조 보존 + 라벨 단축(비밀번호 변경→비번변경, AI 활용 헬프 데스크→헬프데스크). 360px viewport overflow -5px → safety +16px 검증 완료

## Open Graph 링크 미리보기 (v=20260418)
- `og-image.png` (1200×630, 배경 `#28398C`, `logo.png` 중앙 합성 — Python PIL로 생성)
- **og:title**: "프로사업단총괄 AI 시스템"
- **og:description**: "보장 분석부터 DB 영업관리, 통합 금융 계산기, 전문 비서 챗봇까지"
- 이미지 URL에 `?v=YYYYMMDD` 쿼리 파라미터 붙여서 CDN 캐시 우회
- **OG 수정 후 반드시 캐시 초기화**:
  - 카카오: https://developers.kakao.com/tool/clear/og → URL 입력 → "캐시 초기화"
  - 페이스북: https://developers.facebook.com/tools/debug/ → "Scrape Again"
- 카카오 링크 캐시 수명 약 7일 — 초기화 안 하면 사용자에게 이전 이미지 노출
