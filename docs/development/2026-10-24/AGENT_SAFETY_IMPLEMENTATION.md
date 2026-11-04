# 안전 보완 구현 보고 및 독립 재검증 요청

작성일: 2026-10-24  
상태: **단일 실행부 구현·자체 확인 완료, 독립 재검증 요청**  
기준: PRECONTEST_BASELINE.md V-001~V-007, REVIEW_TASKS.md 개정 2, 총괄자의 코드 수정 승인

## 1. 작업 기준

V-001·V-002를 우선 막는 구조로 불확실 쓰기·결과 검사·문맥·오류 복구를 연결했다. 실제 모델 API·카카오·Durable Objects는 연결하지 않았다. 외부 호출·배포·결제·키 설정도 수행하지 않았다.

변경 전 기준은 검증 보고와 작업 시작 때 일치한 다음 해시다.

|파일|변경 전 SHA-256|
|---|---|
|src/agent.mjs|8BF14CF343DD8D5E630EA3285514B9ECC8F68CCB83813C0E9DF792AF44F6320D|
|src/action-client.mjs|4BBB171BF82A30E97D583F1B9534D9C1863D4105D1F49EA020F8A2C7D7CC0D58|
|tests/agent.test.mjs|E8870FDF495838DB6A1F07E5DE8EFD828D9B17D5460C81C60F09D2EE3DA34C32|

Git 작성자 설정이 없어 기준 커밋은 만들지 못했다. 작성자 이름·메일을 임의로 설정하지 않고 파일 해시로 기준을 남겼다. 원격 연결·업로드·커밋은 없으며, REVIEW_TASKS의 기준 커밋 요구와 다른 점으로 보고한다.

## 2. 문제 7건과 변경 대응

|문제 ID|변경 파일|구현 및 자체 확인|남은 독립 확인|
|---|---|---|---|
|V-001|src/agent.mjs, tests/agent-safety.test.mjs|검증·권한 함수 await 후 엄격 true 판정. 예외·누락·잘못된 참 값이면 실행 0회|비동기 false·throw·잘못된 값·정상 true 재확인|
|V-002|src/agent.mjs, src/data.mjs|인자 검사·복사·깊은 동결, 안정적 JSON으로 동일 쓰기 1회 제한|키 순서·비동기 인자 변경·다른 인자 확인|
|V-003|src/errors.mjs, src/agent.mjs|안전한 오류 history·MODEL_ERROR·userMessageFor·긴 답변 절단|코어 재검증. 실제 사용자 답장은 서버 통합 대기|
|V-004|src/agent.mjs|불확실 쓰기 이후 쓰기 잠금·조회 허용·시간 예산·전용 timeout·결과 플래그|늦은 완료·부분 성공·후속 예외 재확인. 메시지 간 차단 미구현|
|V-005|src/data.mjs, src/agent.mjs|pick·값/구조 검사·JSON 이스케이프와 메타데이터 포함 상한·절단 표시|잘못된 값·순환·getter·큰 결과·쓰기 결과 검사 실패 재확인|
|V-006|src/data.mjs, src/agent.mjs|평탄한 context를 검사·복사·동결해 세 함수에 전달, 모델에 자동 삽입하지 않음|위조 ID·동일 context·잘못된 문맥의 모델 호출 0회 확인|
|V-007|src/action-client.mjs|HTTP 오류에 status 제공, 본문 미포함·자동 재시도 없음|500 status·호출 1회·본문 비노출 확인|

위는 개발 담당의 자체 확인이다. 검증 AI의 판정을 대신 기록한 것이 아니다.

## 3. REVIEW_TASKS 항목 및 문서 대응

- 1~5장: 코어 4개 파일에서 구현.
- 6장: tests/agent-safety.test.mjs에 신규 테스트 83개.
- 7장: README·개발 문서·CORE_CONTRACT.md에 서버 통합 요청. worker.mjs 미변경.
- 8장: .gitignore의 .dev.vars/.dev.vars.*, README.md, AI_AGENT_DEVELOPMENT.md, DEBRIEF_TEMPLATE.md, docs/DEVELOPMENT_ENVIRONMENT.md 갱신.
- COMPETITION_CHECKLIST.md의 운영 기간·모델 고정 방침은 앞선 총괄자 결정 반영 때 기재되어 이번에 다시 바꾸지 않음.
- package.json의 직접 node 호출은 유지하고 PATH에 Node가 있는 경우만 사용하도록 문서화하는 선택을 채택.
- 9장: 저장소는 Durable Objects로 결정됐지만 구현·통합은 이번 범위 밖. 여러 메시지 문맥과 중복 차단 한계를 문서화.

기존 10개 중 바꾼 테스트는 **validate and authorize before execution** 1개다. 예외 종료 대신 history로 거부를 모델에 전달하는 새 계약에 맞춰 실행 0회와 오류 알림을 확인하도록 바꿨다. 나머지 9개는 그대로 유지했다. 결함을 숨기기 위한 기대값 완화가 아니다.

새 문서는 CORE_CONTRACT.md와 이 구현 보고서다. 검증 담당의 기준 보고·요구사항표·재현 스크립트·출력·결정 원본 및 dots 보고서는 변경하지 않았다.

## 4. 선택한 세부 계약과 차이

1. context: 20개 키·키 64 UTF-16 단위, 문자열 값 200 단위. 평범한 1단계 객체만 허용. context 기본값은 {}이므로 필요한 신원 필드 존재도 authorize에서 검사해야 한다.
2. 인자·결과 공통 검사: 깊이 8·노드 1,000·문자열/키 총 100만 UTF-16 단위. 인자 JSON은 8,000 단위 이하. getter/toJSON을 호출하거나 지원하지 않는 값을 조용히 변환하지 않는다.
3. 결과 상한은 **성공 history 항목 전체 JSON 길이**다. 기본 4,000, 설정 범위 256~16,000. preview는 완전한 JSON 데이터가 아닌 잘린 참고 문자열이다.
4. kind 미지정/잘못된 값은 write다. 잠금 코드는 중복 코드보다 우선한다. 단, 검증·권한은 요청마다 먼저 재검사한다.
5. 확정 미실행이어도 같은 도구·인자를 이미 시도했다면 재시도하지 않는다. 다른 쓰기는 허용한다. HTTP 상태만으로 미실행을 확정하지 않는다.
6. execute뿐 아니라 비동기 pick 중 시간 초과도 보수적으로 TIMEOUT_DURING_WRITE로 처리한다.
7. 결과 불확실 시 플래그뿐 아니라 최종 text도 고정 안내로 바꾼다. 후속 모델 오류·STEP_LIMIT·TIMEOUT에서도 불확실 플래그를 보존한다.
8. 반환값·예외에 쓰기별 success/rejected/unknown 요약을 남긴다. 인자·API 원문은 넣지 않는다. 부분 성공의 구체적인 사용자 안내는 서버 통합에서 적용한다.
9. 외부 패키지·실제 API 호출·키 재사용 없음.
10. 기준 커밋 미작성은 작성자 설정 부족 때문이다. 전역 설정을 바꾸거나 작성자 신원을 임의 생성하지 않았다.

## 5. 검증 AI에게 요청하는 재검증

최신 코드와 아래 해시를 기준으로 원래 7건을 독립 재검증해 주세요. 과거 기준 보고는 덮어쓰지 말고 새 결과로 남겨 주세요.

기존 repro-baseline.mjs와 .output.txt는 검증 담당 산출물이므로 변경·재실행하지 않았습니다. 옛 스크립트의 기대 예외·반환값은 새 계약과 달라 DEFECT 표시 개수를 그대로 현재 실패 수로 해석하면 안 됩니다.

- 읽기 결과 검증은 kind: 'read'를 명시합니다. 미지정은 쓰기입니다.
- 회복 가능한 오류는 history와 execute 호출 횟수로 판정합니다.
- 쓰기 도중 timeout 검증은 minWriteBudgetMs를 0 또는 충분히 작게 설정합니다. 짧은 timeout에 기본 쓰기 시작 예산 3초를 동시에 적용하면 작업이 시작되지 않는 것이 정상입니다.
- 쓰기 결과가 잘못되면 INVALID_TOOL_RESULT 대신 WRITE_OUTCOME_UNKNOWN입니다.
- 불확실 쓰기 뒤 정상 반환도 outcomeUnknown:true·고정 안내를 검사합니다.
- V-003의 실제 카카오톡 오류 답장은 코어 변경만으로 완료 판정하지 않습니다.

정식 테스트 93개는 개발 담당이 작성·유지한 것입니다. 독립 검증의 설계와 판정은 검증 담당의 몫입니다. 다른 대화에 자동 메시지는 보내지 않았습니다.

## 6. 미완료와 남은 위험

- Durable Objects, 메시지·이벤트·다중 인스턴스의 중복 방지, 여러 메시지 대화 문맥은 미구현.
- 실제 모델 어댑터·모델 결제·당일 액션 API·실제 카카오 전체 흐름은 미검증.
- 별도 서버에서 context·outcomeUnknown·writes·userMessageFor와 콜백 경계를 반영해야 함. 변경 요청은 CORE_CONTRACT.md 끝부분.
- 외부 쓰기는 timeout 이후 완료될 수 있음. 로컬 중단은 롤백이나 외부 정확히 1회 실행의 보장이 아님.
- 실제 액션의 kind·validate·authorize·pick에 대한 업무적 정확성은 별도 구현·검증 필요.
- 모의 테스트로 실제 모델의 프롬프트 인젝션 방어를 증명하지 않음.
- 11월 3일 24:00 KST까지 운영·변경 금지라는 총괄자 결정 유지.

## 7. 전체 실행 출력

실행 명령: START_DEV.cmd check  
종료 코드: 0  
문법 7개 파일·테스트 93개 통과·오프라인 데모 정상. 실제 전체 출력은 다음과 같습니다. 별도 보관: artifacts/development/2026-10-24/safety-check.output.txt

```text
Project: C:\Users\dldyd\OneDrive\문서\ChatGPT\AI_TOP_100[이용찬]
Node: C:\Users\dldyd\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
v24.19.0
Syntax checks passed: 7 files.
✔ V-001 validate: async false never executes (2.837ms)
✔ V-001 validate: object never executes (0.275ms)
✔ V-001 validate: string never executes (0.1929ms)
✔ V-001 validate: async number never executes (0.2071ms)
✔ V-001 validate: throw never executes (0.2362ms)
✔ V-001 validate: async throw never executes (0.2234ms)
✔ V-001 validate: missing never executes (0.161ms)
✔ V-001 authorize: async false never executes (0.1956ms)
✔ V-001 authorize: object never executes (0.2129ms)
✔ V-001 authorize: string never executes (0.2689ms)
✔ V-001 authorize: async number never executes (0.1542ms)
✔ V-001 authorize: throw never executes (0.1263ms)
✔ V-001 authorize: async throw never executes (0.1558ms)
✔ V-001 authorize: missing never executes (0.148ms)
✔ V-001 async true validation and authorization execute once (0.3285ms)
✔ V-006 forged identity cannot replace trusted context (0.3901ms)
✔ V-006 immutable context and argument snapshot reach execution (0.5169ms)
✔ V-006 invalid context nested blocks model (0.2232ms)
✔ V-006 invalid context function blocks model (0.0938ms)
✔ V-006 invalid context array blocks model (0.1352ms)
✔ V-006 invalid context array value blocks model (0.108ms)
✔ V-006 invalid context null blocks model (0.0757ms)
✔ V-006 invalid context nonfinite blocks model (0.0781ms)
✔ V-006 invalid context long string blocks model (0.0946ms)
✔ V-006 invalid context too many keys blocks model (0.091ms)
✔ V-006 invalid context getter blocks model (0.0857ms)
✔ V-006 invalid context symbol blocks model (0.0702ms)
✔ V-003 repeated denial reauthorizes every time and reaches STEP_LIMIT (0.2469ms)
✔ V-003 long answer preserves grapheme boundary (1200 units) (1.0087ms)
✔ V-003 long answer preserves grapheme boundary (1003 units) (0.4299ms)
✔ V-003 long answer preserves grapheme boundary (1002 units) (0.4519ms)
✔ V-003 long answer preserves grapheme boundary (1034 units) (0.4007ms)
✔ V-003 invalid answer "" (0.1381ms)
✔ V-003 invalid answer "   " (0.0891ms)
✔ V-003 invalid answer 123 (0.1157ms)
✔ V-003 model exception is normalized and guidance never leaks arbitrary text (0.2826ms)
✔ V-002 canonical duplicate writes execute once; different arguments remain allowed (0.7904ms)
✔ V-004 uncertain write locks all writes but permits reads (0.3456ms)
✔ V-004 uncertain undefined locks all writes but permits reads (0.346ms)
✔ V-004 uncertain invalid locks all writes but permits reads (0.2379ms)
✔ V-004 explicit not-executed does not lock other writes; duplicate attempt still blocked (0.2677ms)
✔ V-004 HTTP status alone never proves a write was not executed (0.1859ms)
✔ V-004 deadline during model (45.8717ms)
✔ V-004 deadline during read (44.9339ms)
✔ V-004 deadline during write (46.9135ms)
✔ V-004 deadline during write result selection (45.2435ms)
✔ V-004 insufficient time blocks before write execution (0.3829ms)
✔ V-004 timed-out writes may finish; no later action or success record is produced (201.142ms)
✔ V-004 uncertainty survives later model errors and STEP_LIMIT (0.7666ms)
✔ partial successful writes remain identifiable if a later model call fails (0.3655ms)
✔ V-005 invalid read result: function (0.1883ms)
✔ V-005 invalid read result: undefined property (0.153ms)
✔ V-005 invalid read result: undefined element (0.1766ms)
✔ V-005 invalid read result: sparse array (0.1159ms)
✔ V-005 invalid read result: symbol value (0.1507ms)
✔ V-005 invalid read result: symbol key (0.1331ms)
✔ V-005 invalid read result: BigInt (0.1093ms)
✔ V-005 invalid read result: NaN (0.1021ms)
✔ V-005 invalid read result: Infinity (0.1003ms)
✔ V-005 invalid read result: Date (0.1117ms)
✔ V-005 invalid read result: Map (0.0971ms)
✔ V-005 invalid read result: Set (0.1249ms)
✔ V-005 invalid read result: RegExp (0.0971ms)
✔ V-005 invalid read result: Error (0.0985ms)
✔ V-005 invalid read result: Promise value (0.1045ms)
✔ V-005 invalid read result: instance (0.093ms)
✔ V-005 invalid read result: cycle (0.1277ms)
✔ V-005 invalid read result: getter (0.1021ms)
✔ V-005 invalid read result: hidden value (0.1246ms)
✔ V-005 invalid read result: deep nesting (0.1296ms)
✔ V-005 invalid read result: node count (0.0975ms)
✔ V-005 getter is rejected without invoking it (0.1871ms)
✔ V-005 failed write result validation locks writes (0.2381ms)
✔ V-005 pick explicitly excludes fields before data inspection (0.2204ms)
✔ V-005 entire history entry is capped at 256 including escaped data (1.5443ms)
✔ V-005 entire history entry is capped at 4000 including escaped data (2.7277ms)
✔ V-005 unsupported argument getters never run or reach validators (0.184ms)
✔ V-007 HTTP error exposes status only and makes one request (16.2667ms)
✔ V-005 pick exceptions are safe for read (0.3441ms)
✔ V-005 pick exceptions are safe for write (0.1361ms)
✔ unexpected decision accessor errors do not expose arbitrary AgentError codes (0.1901ms)
✔ V-004 read failure normalizes error and does not lock a later write (0.2529ms)
✔ V-002 asynchronous validation never allows later mutation to change a write (0.2151ms)
✔ normal answer (1.8538ms)
✔ reject empty input (0.3985ms)
✔ reject invented tools (0.2266ms)
✔ reject inherited tool names (0.2001ms)
✔ validate and authorize before execution (0.732ms)
✔ tool data stays separate from system policy (0.4463ms)
✔ limit runaway tool loops (0.3968ms)
✔ deadline blocks late model decision from triggering actions (64.4221ms)
✔ API destination is pinned and redirects disallowed (20.6666ms)
✔ failed mutations are not retried and response body is not leaked (0.375ms)
ℹ tests 93
ℹ suites 0
ℹ pass 93
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 545.0903
기본 실행 구조가 준비되었습니다. 실제 모델·대회 API·카카오톡 연결 검증은 남아 있습니다.
Development environment check completed.
```

## 8. 변경 후 SHA-256

최종 자체 확인 후 수집한 기준입니다. 이후 파일이 변경되면 새 기준으로 재검증해야 합니다.

```json
[
  {
    "File": "src/agent.mjs",
    "SHA256": "0C3D594FC670B9954DFDDA61EF05D84F8E75A8A5A83C4F56A80F280511A2AB11"
  },
  {
    "File": "src/action-client.mjs",
    "SHA256": "1D61953DD317CEFFBA06D4DD67FB242A3A419AC1EA9D2D98A7875A72FBD60529"
  },
  {
    "File": "src/errors.mjs",
    "SHA256": "83A951F28779F6592AD3ADA575D71E6FBF7E85C2A87631665C8217052FCF2D5A"
  },
  {
    "File": "src/data.mjs",
    "SHA256": "CC6D35332EC6C594EE3D5952F6530ECF52E028A4C070060F68F5756A42C4B653"
  },
  {
    "File": "tests/agent.test.mjs",
    "SHA256": "07D078804B8DC14BC80AFB36B07D07FF6C05CA652E80129E03B50E1FDBF36C47"
  },
  {
    "File": "tests/agent-safety.test.mjs",
    "SHA256": "379B65680B394DD61562D8DBD29222DE1B1CFAA1D1D8E28C1E6731D4475E3F52"
  },
  {
    "File": ".gitignore",
    "SHA256": "58E67A71121841B4DF09BEDEE748B462B2720AA866AA2215F26326899D29724D"
  },
  {
    "File": "README.md",
    "SHA256": "0F3FF9E30507E38BE8E52360B199B475201C1EEFD3D00FAF7F85CE891FAF568C"
  },
  {
    "File": "AI_AGENT_DEVELOPMENT.md",
    "SHA256": "ECA7BA9AEEE814F3E46AB3653C728BF81884AB177F8A407DED3C2D84BC0E6819"
  },
  {
    "File": "DEBRIEF_TEMPLATE.md",
    "SHA256": "2E3FD7C3DA9A65A0B83661D7DEB80DD85F3AE8844412863462CC78877A514191"
  },
  {
    "File": "docs/DEVELOPMENT_ENVIRONMENT.md",
    "SHA256": "177476FDF245648948290BF9D1D057251825E316BE3F08C37F3549A1033DA29E"
  },
  {
    "File": "docs/development/2026-10-24/CORE_CONTRACT.md",
    "SHA256": "D19B599F07B94FFAE81DC8F661FD8D849D8AF2A10FF5948EDCBA88DDC4611D66"
  }
]
```

