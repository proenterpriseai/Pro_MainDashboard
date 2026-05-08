# 비밀번호 분실 신고 처리 SOP (관리자 매뉴얼)

> Pro Enterprise AI 메인 대시보드 (`pro-dashboards.com`) 관리자 전용 절차.
> 신고 받자마자 **5분 안에** 처리 가능하도록 표준화한 매뉴얼.

---

## 사전 1회 준비 (최초 1회만)

```powershell
firebase login
# 또는 토큰 만료 시 (invalid_rapt 에러)
firebase login --reauth
```

이후 PowerShell에서 `node _user-admin.js ...` 명령이 즉시 작동.

---

## A. 신고 접수 — 정보 수집 (1분)

사용자에게 **카톡/문자**로 다음 항목 받기:

- [ ] **사원번호** (필수)
- [ ] **등록된 이메일** (모르면 B-1에서 검색 후 확인)
- [ ] **원하는 새 비밀번호** (모르면 자동 임시 발급으로 진행)

---

## B. PowerShell 처리 (2분)

### B-1. 사원번호로 등록 계정 검색 (필수 첫 단계)

```powershell
cd "C:\Users\SAMSUNG\OneDrive\바탕 화면\Pro_MainDashboard"
node _user-admin.js find <사원번호>
```

출력 예시:
```
📊 사원번호 2536085 — 등록된 계정 2개 발견
[1] ap5104@naver.com [⭐ 메인 계정 — 최근 사용]
    UID: B2dT1...
    이름: 최은주 / 핸드폰: 01091853557 / 권한: user / 상태: approved
    가입: 2026.3.31 14:23 / 최근접속: 2026.5.6 09:11
    기기: 2/2
[2] ap5104@kakao.com [⚠️ 미사용 — 정리 권장]
    UID: xxxxx
    가입: 2026.4.22 / 최근접속: (미기록)
    기기: 0/2
```

**이 단계에서 확인할 것**:
- 등록 계정 1개 → 케이스 1
- 등록 계정 2개 이상 → 케이스 2 (중복 가입)
- ⚠️ lookup 미반영 경고 → 케이스 3 (employee_lookup 정정 필요)

### B-2. 케이스별 처리

#### 케이스 1: 단일 계정 + 자동 임시 비밀번호
```powershell
node _user-admin.js reset <사원번호> --auto
```

#### 케이스 2: 단일 계정 + 사용자 지정 비밀번호
```powershell
node _user-admin.js reset <사원번호> --email <이메일> --pw "<원하는비밀번호>"
```

#### 케이스 3: 중복 가입 (다중 계정) — 메인 계정 명시
```powershell
node _user-admin.js reset <사원번호> --email <메인이메일> --pw "<비밀번호>"
```
→ 끝나면 D 단계(중복 정리) 진행 권장.

#### 케이스 4: employee_lookup 정정만 필요
```powershell
node _user-admin.js fix-lookup <사원번호> --to <이메일>
```

---

## C. 사용자 SMS 발송 (1분)

### 표준 템플릿
```
[Pro Enterprise AI]
[이름]님, 비밀번호 설정 완료했습니다.

비밀번호: [비밀번호]

▶ 로그인:
- pro-dashboards.com 접속
- 사원번호: [사원번호]
- 이메일: [이메일]
- 비밀번호: [비밀번호]

이용 중 불편하신 점 있으시면 연락 주세요.
```

### 자동 임시 비번 발급 시 추가 안내
```
※ 임시 비밀번호이니 로그인 후
   마이페이지 > 비밀번호 변경에서 본인이 원하는
   비밀번호로 바꿔 주시기 바랍니다.
```

---

## D. (선택) 중복 계정 정리 (1분)

`find`에서 다중 계정이 발견된 경우:

```powershell
node _user-admin.js cleanup <사원번호> --keep <메인이메일>
```

- Firebase Auth + Firestore `users` 문서에서 메인 외 계정 영구 삭제
- `employee_lookup`도 메인 계정 가리키도록 자동 갱신
- ⚠️ 영구 삭제이므로 `yes` 확인 프롬프트 1회 통과 필요

---

## E. 자주 묻는 질문 (FAQ)

### Q1. 사용자가 "메일이 안 와요"라고 함
**A.** 이메일 도메인이 네이버면 **광고메일함** 확인 안내. 그래도 안 오면 SOP B-2 그대로 진행 (관리자 직접 비밀번호 설정). Firebase 재설정 메일은 1시간 만료 + 1회용이라 발송보다 직접 처리가 안정적.

### Q2. 사용자가 "비밀번호 변경 메뉴를 사용했는데 에러가 나요"라고 함
**A.** v=20260508 fix 이전 버전에서 `employee_lookup`의 email과 currentUser email mismatch가 있으면 영구 작동 불가. fix 배포 후 재시도 권장. 그래도 안 되면 SOP B-2로 직접 처리.

### Q3. "5번 틀려서 잠겼나요?"
**A.** Firebase Auth는 5회로 잠그지 않음. 사용자가 비밀번호를 잘못 알고 있을 가능성 → SOP B-2로 직접 재설정.

### Q4. 사용자가 알려준 이메일과 등록된 이메일이 다름
**A.** `find`로 모든 계정 확인. 사용자가 어느 계정으로 가입했는지 SMS로 재확인 후 처리.

### Q5. 동일 사원번호 중복 가입이 발견됨 — 누구를 메인으로?
**A.** `find` 출력에서 **🕐 최근 접속** 또는 **기기: N/2 (N>0)** 인 계정이 메인. 사용자에게 한 번 더 확인 후 결정.

### Q6. v=20260508 이후 신규 회원가입이 "이미 등록된 사원번호" 에러를 띄움
**A.** 사원번호 중복 검증이 활성화된 정상 동작. 해당 사원번호로 이미 가입된 계정이 있으니 사용자에게 [비밀번호 분실] 메뉴 사용 안내. 또는 SOP B-2로 관리자 직접 처리.

---

## F. 응급 케이스 — 기존 도구 호환

새 통합 도구(`_user-admin.js`)가 작동 안 할 경우 fallback:

```powershell
# 사원번호 기반 (lookup이 정확할 때만)
node _reset-user-pw.js <사원번호>

# 이메일 기반 (lookup이 stale일 때)
node _reset-user-pw-by-email.js <이메일> [원하는비밀번호]
```

---

## G. 처리 시간 기준

| 단계 | 시간 |
|---|---|
| A. 정보 수집 (카톡/문자 왕복) | 1분 |
| B-1. find 실행 | 5초 |
| B-2. reset 실행 | 5초 |
| C. SMS 발송 | 1분 |
| **합계** | **약 2~3분** |
| D. 중복 정리 (선택) | 추가 1분 |

---

## H. 시스템 결함 대응 이력

### 2026-05-07 최은주(2536085) 케이스 — 시스템 결함 4건 발견
- 동일 사원번호 중복 가입 (네이버 + 카카오)
- doPwChange/doPwReset이 lookup email 의존 → mismatch 시 영구 실패
- 로그인 화면 "비밀번호 변경" 링크가 currentUser 필요해서 무용지물

### 2026-05-08 v=20260508 영구 fix 배포
- 회원가입 사원번호 중복 검증
- doPwChange가 currentUser.email 직접 사용
- doPwReset이 사원번호+이름+이메일 3-way 매칭
- 로그인 화면 라벨 정리 ("재설정"으로 단일화) + 모달 안내 강화

---

## I. 관리자 도구 파일

| 파일 | 역할 |
|---|---|
| `_user-admin.js` | **권장** — 통합 도구 (find/reset/cleanup/fix-lookup) |
| `_reset-user-pw.js` | 응급 fallback (사원번호 기반) |
| `_reset-user-pw-by-email.js` | 응급 fallback (이메일 기반) |
| `_backfill-employee-lookup.js` | 1회성 백필 (실행 완료) |

모두 `.vercelignore`의 `_*.js` 패턴으로 프로덕션 배포 제외됨.
