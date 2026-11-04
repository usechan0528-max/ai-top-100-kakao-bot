# 검토 결과 작업 지시서

작성일: 2026-10-24 (개정 1: 구현 담당 검토 의견 반영 / 개정 2: 개발 환경 구성 후 검토 반영)  
작성: 검토 담당 에이전트 → 구현 담당 에이전트  
기준: 현재 `src/agent.mjs`, `src/action-client.mjs`, `tests/agent.test.mjs`, 카카오 연결 서버 `worker.mjs`

## 0. 작업 범위

- 수정 대상: `src/`, `tests/`, `README.md`, `AI_AGENT_DEVELOPMENT.md`, `COMPETITION_CHECKLIST.md`, `DEBRIEF_TEMPLATE.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `.gitignore`
- **수정 금지**: `C:/Users/dldyd/Documents/Codex/2026-10-24/1-ai-11-1-1-api/outputs/kakao-worker/worker.mjs` (별도 대화 소관). 필요한 변경은 7장에 요청으로만 정리되어 있음
- 외부 패키지 추가 금지. 기존 코드 스타일(짧은 ESM, 영문 주석, 한국어 문서)을 유지
- 기존 테스트 10개는 의미가 바뀌는 경우에만 수정하고, 바꿨다면 이유를 보고
- 우선순위: 사전 작업 → 2 → 4 → 1 → 3 → 5 → 6 → 7 → 8

### 사전 작업: 구현 시작 전 기준 커밋

- 현재 저장소는 초기화만 되어 있고 커밋이 없다. **코드를 수정하기 전에** 현재 상태 전체를 첫 커밋으로 기록한다(예: `chore: baseline before review tasks`)
- 커밋 전에 `.gitignore`에 `.dev.vars`와 `.dev.vars.*`를 추가한다(8장). 비밀값 파일이 커밋에 들어가지 않았는지 `git status`로 확인한다
- 이후 구현은 항목 단위로 나눠 커밋하는 것을 권장한다. 검토 담당은 기준 커밋과의 차이로 검토한다
- 원격 저장소 연결·업로드는 하지 않는다

### 공통 원칙: 쓰기 작업은 한 번 시도하면 재시도하지 않는다

이 문서의 모든 항목은 아래 원칙을 따른다.

1. 쓰기(`write`) 작업의 `execute`가 **시작된 뒤**에는 정상 결과를 확인한 경우를 제외하고 결과를 "불확실"로 간주한다. 실행되지 않았다는 명확한 신호가 있을 때만 예외로 둔다(4장).
2. 결과가 불확실한 쓰기가 생기면 같은 실행 안에서 **모든 쓰기 작업**을 막는다. 조회(`read`)는 상태 확인 용도로 계속 허용한다.
3. 재시도 방지는 모델 지시문이 아니라 **코드로** 강제한다. 모델에게 알리는 것은 설명용이며 방어 수단이 아니다.
4. 여러 메시지에 걸친 재실행 방지(사용자가 "다시 해줘"라고 보내는 경우)는 대화 상태·멱등 키가 필요하므로 이 문서 범위 밖이다. 남은 위험으로 문서에 적는다.

## 1. [필수] 사용자 문맥의 명시적 전달 통로 추가

**문제**: `authorize(decision.arguments)`는 모델이 만든 인자만 받는다. 요청마다 클로저로 사용자 정보를 감싸는 우회는 가능하지만, 명시적인 전달 통로가 없어 당일 구현에서 누락·오용하기 쉽다. (`src/agent.mjs:13`, `:38-42`)

**요구사항**
- `runAgent({ ..., context })` 추가. `context`는 서버가 만든 값(예: `{ userId, channelId, eventId }`)이며 모델 출력에서 오지 않는다
- 얕은 동결은 중첩 객체를 보호하지 못하므로 **구조를 제한**한다
  - 일반 객체 1단계만 허용. 값은 문자열·유한한 숫자·불리언·`null`만 허용
  - 키 수와 문자열 길이에 상한을 둔다(예: 키 20개, 값 200자)
  - 조건 위반 시 모델 호출 전에 `INVALID_CONTEXT`로 거부
  - 검사 통과 후 복사본을 만들어 `Object.freeze`
- `validate(args, context)`, `authorize(args, context)`, `execute(args, { signal, context })`로 전달
- `context`를 모델 입력(`system`/`user`/`history`)에 자동으로 넣지 않는다. 모델에 사용자 정보가 필요하면 어댑터가 명시적으로 선택해 넣도록 문서화

**완료 조건(테스트)**
- 모델이 `arguments.userId = '타인'`을 넣어도 `authorize`는 `context.userId`로 판단하며, 타인 리소스 접근이 거부된다
- `execute`가 동일한 `context`를 받고, `execute` 안에서 `context` 값을 바꾸려 해도 바뀌지 않는다
- 중첩 객체·함수·배열이 들어간 `context` → `INVALID_CONTEXT`, 모델 호출 0회

## 2. [최우선] 검증·권한 함수의 엄격 판정

**문제**: `!action.validate(...)`에 `await`가 없어 `async validate`가 Promise(참 값)를 반환하면 검증이 통과된다. `authorize`도 `{}` 같은 참 값을 반환하면 통과된다. (`src/agent.mjs:38`, `:40`)

**요구사항**
- 두 함수 모두 `await` 후 결과가 정확히 `true`일 때만 통과
- 두 함수가 예외를 던지면 실행하지 않고 각각 `INVALID_ARGUMENTS`/`FORBIDDEN`과 동일하게 처리

**완료 조건(테스트)**
- `validate: async () => false` → `execute` 호출 0회
- `authorize: () => ({})`, `() => 'yes'`, `async () => 1` → 모두 거부
- `validate`·`authorize`가 throw → `execute` 호출 0회

## 3. [필수] 실패를 사용자 무응답으로 만들지 않기

**문제**: 권한 거부·인자 오류·API 오류·1,000자 초과 답변이 모두 실행 전체를 중단시키고, 연결 서버는 오류 시 콜백을 보내지 않아 사용자는 아무 답도 받지 못한다. 1,000자 초과 답변은 `INVALID_DECISION`으로 잘못 분류된다. (`src/agent.mjs:33-42`)

**요구사항**
- 복구 가능한 실패는 예외 대신 `history`에 기록하고, 모델이 다음 단계에서 사용자에게 설명하게 한다
  - 인자 오류: `{ source: 'tool-error', name, error: 'INVALID_ARGUMENTS' }`
  - 권한 거부: `{ source: 'tool-error', name, error: 'FORBIDDEN' }`
  - 조회 실행 실패: `{ source: 'tool-error', name, error: <코드> }`
  - 쓰기 실행 실패·불확실: 4장 규칙을 따름
  - 기록에는 내부 메시지·스택·응답 원문을 넣지 않는다
- **권한 거부를 모델에 알려도 권한 제한은 그대로 유지한다.** 모델이 같은 요청을 다시 보내도 매번 `validate`·`authorize`를 새로 실행하며, 이전 거부 이력이 이후 허용 판단에 영향을 주지 않는다
- `type === 'answer'`이면 답변 경로로 처리한다
  - 빈 문자열이나 문자열이 아닌 값은 `INVALID_DECISION`
  - 1,000자 초과는 오류 대신 잘라서 반환한다
  - **자르는 단위는 문자 경계**다. 최소한 유니코드 코드 포인트 단위로 자르고(서로게이트 쌍 분리 금지), `Intl.Segmenter`를 쓸 수 있으면 자소 단위(이모지·결합 문자 보존)로 자른다. 말줄임 표시를 포함한 결과가 상한 이하여야 한다
- 복구 불가능한 실패(`TIMEOUT`, `STEP_LIMIT`, `MODEL_NOT_CONFIGURED`, 모델 예외, `INVALID_DECISION`, `INVALID_CONTEXT`)를 위해 오류 → 사용자 안내 문구 변환 함수를 export한다. 예: `export function userMessageFor(error)`
  - 내부 코드명·스택·키를 노출하지 않는다
  - `AgentError`가 아닌 임의 예외도 일반 안내로 변환한다
  - 4장의 결과 불확실 코드는 "실패"라고 단정하지 않는 별도 문구를 쓴다

**완료 조건(테스트)**
- `authorize`가 false → 모델이 두 번째 호출에서 `history`의 `FORBIDDEN`을 보고 답변 반환, `execute` 0회
- 모델이 권한 거부된 같은 도구를 `maxSteps`까지 반복 요청 → `execute` 0회, `authorize`는 매번 호출됨, 결과는 `STEP_LIMIT`
- 1,200자 답변 → 1,000자 이하로 잘린 답변 반환(오류 아님)
- 경계에 이모지(`'가'.repeat(999) + '😀😀'`)나 결합 문자가 걸린 답변 → 잘린 결과에 깨진 서로게이트(`\uD800-\uDFFF` 단독)가 없다
- `userMessageFor(new Error('secret-key-123'))` 결과에 `secret`이 포함되지 않는다

## 4. [필수] 조회·쓰기 구분과 결과 불확실 쓰기의 재실행 차단

**문제**: 조회와 쓰기를 구분하지 않아, 쓰기 도중 오류·시간 초과가 나도 일반 실패와 같이 처리된다. 3장대로 오류를 모델에 돌려주면 모델이 같은 쓰기를 다시 요청해 **중복 실행**할 수 있다.

**요구사항**

*도구 종류 선언*
- 각 액션에 `kind: 'read' | 'write'`를 선언한다
- `kind`가 없거나 잘못된 값이면 **쓰기로 간주한다**(안전 쪽 기본값). 문서에는 반드시 명시적으로 선언하라고 적는다

*쓰기 실행 결과 분류*
- `validate`·`authorize` 거부는 실행 전이므로 3장대로 일반 `tool-error`
- `execute`가 정상 반환하고 결과 검사(5장)를 통과한 경우 → 성공
- `execute`가 **실행되지 않았음이 확실한 신호**를 던진 경우 → 확정 실패, `WRITE_REJECTED`
  - 신호는 `AgentError('ACTION_NOT_EXECUTED')` 하나로 한정한다
  - 어떤 HTTP 상태를 "실행 안 됨"으로 볼지는 당일 API 문서를 확인한 뒤 액션별로 정한다. 기본값으로 정하지 않는다
- 그 밖의 모든 경우 → 결과 불확실, `WRITE_OUTCOME_UNKNOWN`
  - 예외, 네트워크 오류, 5xx, 시간 초과·중단, 결과 검사 실패(5장)가 모두 해당한다

*재실행 차단(코드로 강제)*
- `WRITE_OUTCOME_UNKNOWN`이 한 번이라도 발생하면 같은 `runAgent` 실행 안에서 이후 모든 `write` 요청을 `execute` 없이 `WRITE_LOCKED`로 거부하고 `history`에 기록한다
- 결과 불확실 여부와 관계없이, 같은 실행 안에서 **같은 도구 + 같은 인자**(안정적 직렬화로 비교)의 쓰기가 다시 요청되면 `DUPLICATE_WRITE`로 거부한다
- `read`는 잠금 이후에도 허용한다(상태 확인용)
- 모델이 마지막 답변에서 성공을 주장하더라도, 실행 결과에 불확실 쓰기가 있으면 반환값에 `outcomeUnknown: true`를 포함해 연결 서버가 알 수 있게 한다

*시간 초과*
- 시간 초과 시점에 **쓰기 `execute`가 진행 중**이면 `TIMEOUT_DURING_WRITE`로 종료한다. 사용자 안내는 "요청이 접수됐을 수 있으나 결과를 확인하지 못했다. 다시 요청하기 전에 상태를 확인해 달라" 취지이며, 실패로 단정하지 않는다
- 조회 진행 중이거나 모델 단계에서의 시간 초과는 기존 `TIMEOUT`
- 남은 시간이 설정값(예: `minWriteBudgetMs`, 기본 3초) 미만이면 쓰기를 시작하지 않고 `INSUFFICIENT_TIME`(`tool-error`)으로 기록한다. 이 경우는 실행 전이므로 불확실이 아니다

*액션 클라이언트*
- `createActionClient`의 HTTP 오류는 응답 본문 없이 상태 코드만 담는다(`error.status`). 실행 여부 판단은 액션이 4장 규칙에 따라 한다
- 자동 재시도 금지를 유지한다

**완료 조건(테스트)**
- 쓰기 `execute`가 throw → `history`에 `WRITE_OUTCOME_UNKNOWN`. 모델이 같은 쓰기를 다시 요청 → `execute` 총 1회, `WRITE_LOCKED` 기록
- 위 상황에서 **다른** 쓰기 도구 요청 → `execute` 0회, `WRITE_LOCKED`
- 위 상황에서 조회 도구 요청 → 정상 실행
- `execute`가 `AgentError('ACTION_NOT_EXECUTED')` → `WRITE_REJECTED`, 잠금 없음, 다른 쓰기는 실행 가능
- 쓰기 성공 후 같은 도구·같은 인자 재요청 → `execute` 총 1회, `DUPLICATE_WRITE`. 인자 키 순서만 다른 경우도 같은 요청으로 판정
- `kind` 미선언 도구가 throw → 쓰기로 취급되어 잠금 발생
- 느린 쓰기 + 짧은 `timeoutMs` → `TIMEOUT_DURING_WRITE`. 느린 조회 + 짧은 `timeoutMs` → `TIMEOUT`
- 남은 시간이 `minWriteBudgetMs` 미만일 때 쓰기 요청 → `execute` 0회, `INSUFFICIENT_TIME`
- 불확실 쓰기 후 모델이 답변 → 반환값 `outcomeUnknown === true`
- 액션 클라이언트 500 응답 → `error.status === 500`, 오류 메시지·속성에 응답 본문 없음, 호출 1회

## 5. [필수] 도구 결과 정리·검사·크기 제한

**문제**: `execute` 결과를 그대로 `history`에 넣는다. 크기 제한이 없다. 복제 불가능한 값(함수 등)이 섞이면 `structuredClone`에서 `AgentError`가 아닌 예외가 난다. 반대로 일반 `JSON.stringify`는 함수·`undefined`·심볼을 **오류 없이 누락**하고 `NaN`을 `null`로 바꿔 결과를 조용히 왜곡한다. (`src/agent.mjs:31`, `:43`)

**요구사항**
- 액션에 선택적 `pick(result)`(모델에 보낼 필드만 반환)를 지원한다. 없으면 결과 그대로 쓴다
- `pick` 이후 결과에 대해 **직렬화 전에 명시적 검사**를 한다. JSON 직렬화 결과로 판단하지 않는다
  - 허용: `null`, 불리언, 유한한 숫자, 문자열, 배열, 일반 객체(프로토타입이 `Object.prototype` 또는 `null`)
  - 거부: `undefined`(객체 속성·배열 요소 포함), 함수, 심볼, `BigInt`, `NaN`·`Infinity`, `Date`·`Map`·`Set`·`RegExp`·`Error`·Promise·클래스 인스턴스, 순환 참조, 심볼 키, 접근자(getter) 속성
  - 깊이·전체 노드 수 상한(예: 깊이 8, 노드 1,000개)
- 검사 실패 처리
  - 조회: `tool-error`(`INVALID_TOOL_RESULT`)
  - 쓰기: `execute`는 이미 끝났으므로 실패가 아니라 `WRITE_OUTCOME_UNKNOWN`(4장 잠금 적용)
- 크기 제한: 검사를 통과한 결과를 직렬화해 상한(예: 4,000자, `runAgent` 옵션)을 넘으면, 잘린 JSON 문자열을 그대로 넣지 않는다. `{ truncated: true, preview: <문자 경계로 자른 문자열> }` 형태로 기록한다
- `history`에 들어간 뒤에는 `structuredClone`이 실패할 수 없어야 한다

**완료 조건(테스트)**
- 조회 결과에 함수·`undefined`·심볼·`BigInt`·`NaN`·`Date`·`Map`·클래스 인스턴스가 각각 섞인 경우 → 모두 `INVALID_TOOL_RESULT`, 예외로 중단되지 않음
- 순환 참조 결과 → `INVALID_TOOL_RESULT`(무한 루프나 스택 오버플로 없음)
- 쓰기 결과에 함수가 섞인 경우 → `WRITE_OUTCOME_UNKNOWN`, 이후 쓰기 잠금
- 10만 자 결과 → `history`의 해당 항목이 `truncated: true`이고 크기가 상한 이하
- `pick`이 필드를 걸러 내면 걸러진 필드가 `history`에 없다

## 6. [필수] 테스트 보강 요약

1~5장의 완료 조건을 모두 개별 테스트로 작성한다. 시간에 의존하는 테스트는 여유를 충분히 둬서 느린 PC에서 간헐적으로 실패하지 않게 한다.

## 7. 연결 서버 변경 요청 (구현하지 말고 README·개발 문서에 "통합 시 필요 변경"으로 명시)

카카오 연결 서버 대화에 전달할 내용이다.

1. `ctx.waitUntil` 안의 오류 처리에서 콜백을 생략하지 말고 `userMessageFor(error)` 문구로 콜백을 보낸다
2. **콜백 실패는 에이전트 실패와 구분한다**
   - 콜백 전송이 실패하거나 시간 초과돼도 에이전트(모델·액션)를 다시 실행하지 않는다
   - 콜백 시간 초과는 전달 여부가 불확실하므로 답변을 다시 보내지 않는다
   - 오류 안내 콜백은 이벤트당 최대 1회. 정상 답변 콜백을 이미 시도했다면, 그 실패 후에 오류 안내를 추가로 보내지 않는다
   - 콜백 실패는 로그만 남긴다(토큰·메시지 원문 제외)
3. 이벤트에서 사용자 식별자를 추출해 `runAgent({ context })`로 전달한다. 필드명은 카카오 공식 이벤트 규격으로 확인
4. 이벤트 ID 기준 중복 처리 방지(최소한 짧은 기간의 처리 기록)
5. 사용자별 요청량 제한(모델 비용 보호)
6. 시간 예산: 에이전트 `timeoutMs` + 콜백 타임아웃 합이 Cloudflare `waitUntil` 허용 시간과 카카오 콜백 토큰 유효 시간 안에 들어가는지 공식 문서로 확인 후 값 조정. 현재 12초 + 15초 = 27초로 여유가 거의 없다
7. 웹훅 비밀값 비교를 상수 시간 비교로 교체(위험도 낮음)

## 8. 문서 갱신

- `AI_AGENT_DEVELOPMENT.md` 4·5·6·8·9장: 위 변경을 반영하고, 테스트 개수와 범위를 실제와 일치시킨다. 4장 규칙(쓰기 재실행 차단은 한 번의 실행 안에서만 보장)을 남은 위험으로 적는다
- `AI_AGENT_DEVELOPMENT.md`의 개발 환경 구성 이전 내용을 정리한다
  - 3장 파일 목록에 `REVIEW_TASKS.md`, `START_DEV.cmd`, `scripts/dev.ps1`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `.vscode/`, `.node-version`, `.editorconfig`, `.gitattributes`를 추가한다
  - 9장 실행 방법은 `START_DEV.cmd`(또는 `.\START_DEV.cmd test`)를 기본으로 안내하고, 자세한 내용은 `docs/DEVELOPMENT_ENVIRONMENT.md`를 참조하게 한다. `node --test`는 PATH에 Node가 있을 때만 쓸 수 있다고 적는다
- `.gitignore`: Cloudflare wrangler의 로컬 비밀 파일 `.dev.vars`, `.dev.vars.*`를 추가한다. 이 작업은 모델 API 키를 넣기 전, 사전 작업의 기준 커밋 전에 끝낸다
- `docs/DEVELOPMENT_ENVIRONMENT.md`
  - "변경 기록과 비밀정보"에 다음 위험을 적는다: `.git`과 비밀값 파일이 OneDrive 동기화 폴더 안에 있다. Git 제외 대상이어도 비밀값 파일은 클라우드에 동기화된다. 동기화 중 `.git` 내부 파일이 충돌할 수 있으므로, 제출 직전 최종본은 OneDrive 밖에도 사본을 둔다
  - 이 PC의 일반 PowerShell에서는 `git` 명령도 찾지 못했음(2026-10-24 확인)을 Node와 같은 방식으로 기록한다
  - "다음 작업의 범위"의 REVIEW_TASKS 미구현 문구를 구현 결과에 맞게 갱신한다
- `package.json`: `test`·`test:watch`·`demo` 스크립트는 PATH의 `node`를 직접 호출하므로 이 PC에서는 실패한다. 실행 방법을 `START_DEV.cmd`로 통일하는 방향으로 스크립트를 `scripts/dev.ps1` 호출로 바꾸거나, 문서에 "PATH에 Node가 있을 때만 동작"이라고 명시한다(둘 중 선택 후 보고)
- `COMPETITION_CHECKLIST.md`: **규정상 의무와 운영 방침을 구분해서** 적는다
  - 규정상 의무(제공받은 안내 기준): 제출 후 시나리오·프롬프트·배포 상태 등 변경·삭제 금지
  - 운영 방침(규정 문구 아님, 위 의무를 지키기 위한 자체 조치): 날짜가 고정된 모델 버전 ID 사용(`latest` 계열 별칭 금지), `temperature` 등 생성 설정 고정, 자동 배포 중지
- 실행 환경 문구는 `docs/DEVELOPMENT_ENVIRONMENT.md` 한 곳을 기준으로 삼고, `README.md`는 요약과 참조만 둔다. 내용은 **확인된 사실과 확인이 필요한 사항을 구분**한다
  - 확인됨(2026-10-24): `START_DEV.cmd check`가 Codex 내장 Node v24.19.0을 찾아 문법 검사 4개 파일, 테스트 10개, 데모를 통과(검토 담당 재현)
  - 확인됨(2026-10-24): 사용자 PC의 일반 PowerShell에서는 `node`·`git` 명령을 찾지 못함(PATH에 등록되지 않음)
  - 확인 필요: 배포 도구(wrangler 등)는 Node와 npm 패키지 설치가 필요하다. Codex 내장 Node로 충분한지, 별도 Node 설치가 필요한지는 배포 단계에서 확인
- 시스템 정책의 "당일 공개된 대회 문제와 운영 가이드를 최우선으로 수행한다"는 모델이 볼 수 없는 문서를 가리키므로, 당일 구체적 업무 지침으로 교체해야 한다는 주석을 남긴다(문구 자체는 당일 교체)

## 9. 보류: 총괄자 결정 대기

**여러 메시지에 걸친 대화 상태**: 정책은 "정보가 부족하면 다시 묻는다"인데 다음 메시지에서 맥락이 사라진다. 저장소(Durable Objects / KV / 기타)와 요금제 결정 전까지 구현하지 않는다.

- 1장의 `context`와 `runAgent` 입력에 이전 대화를 넣을 자리(`conversation` 등)를 막지 않는 형태로 설계한다
- 그 전까지 `README.md`·`AI_AGENT_DEVELOPMENT.md`·`DEBRIEF_TEMPLATE.md`의 알려진 한계에 다음을 명시한다: **"여러 메시지에 걸친 추가 질문·답변 기능은 미완성. 에이전트가 정보를 되물어도 사용자의 다음 메시지는 새 요청으로 처리된다."**
- 여러 메시지에 걸친 쓰기 재실행 방지도 이 결정에 의존한다

## 10. 완료 보고 형식

검토 담당 에이전트가 확인할 수 있도록 아래를 보고한다.

1. 기준 커밋 해시와 이후 커밋 목록, 변경 파일 목록과 항목(사전 작업, 1~9) 대응
2. `START_DEV.cmd check` 전체 출력(테스트 이름 포함, 사용한 Node 경로·버전이 함께 출력됨)
3. 요구사항과 다르게 구현한 부분과 이유
4. 구현하지 못한 항목과 남은 위험
