# 에이전트 실행 계약과 카카오 서버 변경 요청

2026-10-24, 단일 실행부 보완 후 기준. 실제 모델·대회 API 규격은 별도 확인한다.

## 호출과 결과

```javascript
import { runAgent, userMessageFor } from './src/agent.mjs';

// context is built by the authenticated server, never from model arguments.
const result = await runAgent({ text, model, actions, context });
// result: { text, steps, outcomeUnknown, writes: [{ name, outcome }] }
```

context는 평범한 객체 1단계, 키 20개(키 64자), 값은 200자 이하 문자열·유한 숫자·불리언·null로 제한한다. 복사·동결한 동일 문맥을 validate·authorize·execute에 전달한다. 모델에는 자동 전달하지 않는다. 모델이 사용자 정보를 필요로 하면 신뢰 경계에서 최소 필드만 명시적으로 선택한다. context의 기본값은 {}이므로 액션이 필요한 신원 필드의 존재와 권한을 반드시 검사해야 한다.

모델 입력은 `{ system, user, tools, history, signal }`이며 실제 API 어댑터는 아직 없다. 시스템 정책은 임시 문구이며 당일 구체적 지침으로 교체한다. 입력 문장은 8,000 UTF-16 단위, 답변은 1,000 단위 이내다. 답변 절단은 가능한 경우 자소 단위로 처리하며 말줄임을 포함한다.

인자는 순수 JSON 데이터인지 검사하고 깊은 복사·동결한다. JSON 직렬화 8,000 UTF-16 단위 이하로 제한한다. validate·authorize는 await 후 정확히 true일 때만 통과한다. 예외·누락·그 외 값은 각각 INVALID_ARGUMENTS·FORBIDDEN으로 history에 기록한다. 함수가 인자를 직접 정규화·변경하는 방식은 지원하지 않는다. 필요하면 모델 어댑터나 별도의 준비 단계에서 명시적으로 변환하고 같은 인자를 검증·실행한다.

## 액션 계약

- 도구 이름: 영문자로 시작하는 영숫자·밑줄·하이픈, 64자 이내.
- `kind: 'read' | 'write'`를 반드시 명시. 그 외 값·누락은 write 취급.
- `validate(args, context)`와 `authorize(args, context)`는 true만 허용.
- `execute(args, { signal, context })`에 실제 실행을 구현.
- 선택적 `pick(result)`은 필요한 필드만 반환. 비동기 함수도 지원.
- 설명·파라미터 스키마는 신뢰된 서버 설정이며, 스키마 검증의 실제 로직은 validate의 책임.

`createActionClient`의 POST/Bearer 방식은 예비 구조다. HTTP 오류는 AgentError('ACTION_HTTP_ERROR')와 status만 전달하며 본문은 포함하지 않는다. 외부 상태가 변하지 않았음이 공식 사양으로 확인되는 경우만 액션에서 AgentError('ACTION_NOT_EXECUTED')로 변환한다. 다른 오류·5xx·일반 타임아웃은 미실행의 증거가 아니다.

## 쓰기 상태와 오류 계약

|상황|history 또는 예외|그 뒤의 쓰기|
|---|---|---|
|검증·권한 거부|INVALID_ARGUMENTS / FORBIDDEN|실행 전이므로 잠금 없음, 이후에도 매번 재검사|
|남은 예산 부족|INSUFFICIENT_TIME|실행 안 함, 잠금 없음|
|확정 미실행 신호|WRITE_REJECTED|다른 쓰기 가능, 이미 시도한 동일 쓰기는 다시 시도하지 않음|
|성공한 쓰기와 동일한 도구·인자|DUPLICATE_WRITE|중복 execute 없이 거부|
|쓰기 예외·결과 검사 실패|WRITE_OUTCOME_UNKNOWN|이 실행의 모든 이후 쓰기는 WRITE_LOCKED|
|쓰기 실행 또는 결과 선택 중 시간 초과|TIMEOUT_DURING_WRITE 예외|실행 종료. 결과는 불확실|
|모델·조회 중 시간 초과|TIMEOUT 예외|실행 종료|

조회는 불확실 쓰기 뒤에도 허용한다. 같은 인자는 JSON 객체의 키 순서가 달라도 동일하게 비교한다. 모든 검증과 권한 확인을 먼저 수행한 뒤 잠금을 적용하며, 불확실 잠금이 중복 코드보다 우선한다.

정상 결과에 `outcomeUnknown: true`가 있으면 text는 모델 성공 문구 대신 고정된 불확실 안내다. 예외에도 outcomeUnknown과 writes 요약을 남긴다. 한 번의 실행 안에서 일부 성공한 뒤 실패하면 writes의 success 항목을 보고 부분 성공을 구분할 수 있다. 요약은 도구 이름과 상태뿐이며 사용자별 인자·API 원문은 없다.

`userMessageFor(error)`는 원본 메시지를 포함하지 않는 사용자 안내를 반환한다. 임의 Error나 모르는 코드도 고정 안내로 처리한다. 결과 불확실 플래그가 있으면 이후 MODEL_ERROR·STEP_LIMIT·TIMEOUT에서도 일반 실패보다 불확실 안내를 우선한다.

타임아웃은 외부 작업 취소를 보장하지 않는다. 늦게 완료되는 액션을 다시 실행하지 않으며 그 결과를 나중에 성공 기록으로 바꾸지 않는다. 이 기능은 단일 runAgent 실행의 방어다. 메시지·이벤트·인스턴스 사이 차단은 아직 없다.

## 결과 검사·상한

pick 이후 null·불리언·유한 숫자·문자열·배열·일반 객체만 허용한다. undefined·함수·심볼·BigInt·비유한 숫자·클래스 인스턴스·순환 참조·접근자·비열거 속성·희소 배열은 거부한다. getter나 toJSON을 실행하지 않고 속성 서술자를 검사한다.

현재 내부 상한은 깊이 8, 값 노드 1,000개, 전체 문자열/키 100만 UTF-16 단위다. 인자와 결과에 같은 구조 검사를 적용한다. 검사 실패는 읽기면 INVALID_TOOL_RESULT, 쓰기면 WRITE_OUTCOME_UNKNOWN이다.

`maxToolResultChars`는 metadata를 포함한 각 성공 history 항목의 JSON 직렬화 길이 상한이다. 기본 4,000, 허용 범위 256~16,000 UTF-16 단위. 넘으면 result를 `{ truncated: true, preview }`로 바꾸고 JSON 이스케이프 길이까지 포함해 제한한다. 잘린 preview는 JSON 객체가 아닌 참고 문자열이며 모델이 완전한 결과로 해석하면 안 된다. 필수 결과를 잃지 않도록 액션별 pick을 구현해야 한다.

`timeoutMs` 기본 12,000(최대 25,000), `maxSteps` 기본 5(최대 10), `minWriteBudgetMs` 기본 3,000(0~25,000). 짧은 타임아웃으로 쓰기 도중 중단을 시험하려면 minWriteBudgetMs를 0 또는 충분히 작게 설정해야 한다. 상한은 개발 내부 설정이며 공식 플랫폼 제한이 아니다.

## 통합 시 필요 변경 — 별도 서버 담당 요청

카카오 연결 서버 worker.mjs는 이번에 수정하지 않았다. 다음을 해당 담당이 반영해야 한다.

1. 정상 처리에서 result.text·outcomeUnknown·writes를 사용한다. 실패 시 raw error.message 대신 userMessageFor(error)를 사용자 안내로 사용한다. 이전 성공 쓰기 요약이 있으면 전체 실패로 오인시키지 않도록 안내한다.
2. 에이전트 처리와 콜백 전송의 catch 경계를 분리한다. 정상 콜백을 시도한 뒤 실패했다고 오류 콜백을 더 보내거나 모델·액션을 다시 실행하지 않는다. 에이전트 오류 안내 콜백도 이벤트당 최대 한 번만 시도한다. 콜백 실패는 민감정보 없는 상태 코드 수준으로 기록한다.
3. 인증된 카카오 이벤트의 사용자·채널·이벤트 ID를 추출해 context로 전달한다. 실제 필드명은 공식 이벤트 문서 확인이 필요하다.
4. 이벤트 ID 중복 처리와 사용자별 요청량 제한을 적용한다. Durable Objects를 통한 원자적 처리 기록·보존·회복 절차는 다음 구현 범위다.
5. 에이전트 처리와 콜백을 합친 시간이 실제 카카오 콜백 토큰·Cloudflare 실행 수명 안에 들어가도록 공식 규격과 측정값으로 확인한다. 기존 12초+15초는 산술 합계일 뿐 제한 준수의 증거가 아니다.
6. 웹훅 비밀 비교를 상수 시간 방식으로 검토한다. 인증·콜백·재전달 필드와 전송 제한은 최신 공식 문서에 맞춘다.

여러 메시지에 걸친 추가 질문·답변 기능은 미완성이다. 정보를 되물어도 다음 메시지는 새 요청이다. Durable Objects의 선택·무료 플랜 사용 가능 확인은 끝났지만 구현·배포·동시성 검증은 별도 단계다.
