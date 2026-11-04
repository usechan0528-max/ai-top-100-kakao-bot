# OpenAPI 선택 조회 스키마 검수

작업일 2026-10-31. 시나리오 2037-06-30, 현재 시각 미확정. 로컬 Downloads에서 보존된 [actions.json 원본](actions.json)을 파싱하여 검수했다. 부모 작업에서 보존한 원본을 수정하지 않았다. 전체 명세 전수 검수나 실제 API 호출 결과가 아니다.

## 원본·인벤토리

- 파일: `actions.json`, 278,031바이트, OpenAPI 3.1.0, `info.version` 빈 문자열. 문서 개정일은 미표시.
- SHA-256: `20082B8F76E41F5D6F8E2A66BE927F80E12540883E36198587FF93F64278911E`
- 원본 `paths` 키 41개·operation 41개: API-01~40 및 `resetMyActionData`. GET 23개, POST 18개. 검색 조건을 포함한 원본 키 개수이며 정규화한 독립 URL 경로 수가 아니다.
- components.schemas 50개. 이번 필드 대조 범위는 Orders·Members·Payments·Error 4개와 선택 GET 6개다. 나머지 35 operation/46 schema는 목록 존재 확인이며 상세 검수 완료로 세지 않는다.
- 서버 `https://gyodong-mall-action.aitop100.org`, 보안 `action-token` HTTP Bearer. 이는 참가자 액션 인증으로, 고객 로그인 인증과 동일하지 않다.

## 선택 GET 6개

모두 `X-Aitop100-Test-Case-Id` 필수 문자열, 1~100자, `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`. 아래 path/query 값도 필수 string이나 추가 패턴·최소길이는 스키마에 없다. 예시 값은 실제 고객 식별값이 아니다.

|operation|메서드·요청|200 응답|범위|
|---|---|---|---|
|API-07|GET `/api/orders/{order_no}`|Orders 객체|주문번호 단건|
|API-08|GET `/api/orders?member_id=<값>`|Orders 배열|회원 ID 정확 일치|
|API-12|GET `/api/members/{member_id}`|Members 객체|회원 ID 단건|
|API-13|GET `/api/members?name=<값>`|Members 배열|이름 정확 일치, 동명이인 가능|
|API-17|GET `/api/payments/{approval_no}`|Payments 객체|승인번호 단건|
|API-18|GET `/api/payments?order_no=<값>`|Payments 배열|주문번호 정확 일치|

검색 API는 지원하는 검색 파라미터 하나·값 하나만 받는다. API-13에 phone 파라미터를 추가하거나 API-08에 이름·승인번호를 넣는 동작은 명세에 없다. 문자열은 URL 경로/쿼리 규칙에 맞게 인코딩한다. 단건은 query 파라미터를 받지 않는다.

## 선택 응답 필드 전수 대조

아래 각 객체는 `additionalProperties:false`이며 나열한 모든 필드가 required다. nullable도 필드 자체는 생략 가능을 뜻하지 않는다. 정수 필드의 minimum/maximum·금액 단위·반올림 규칙은 이 스키마에서 정의하지 않는다.

Orders(15필드): order_no:string, member_id:string, status:enum(PAID/CONFIRMED/CANCEL_REQUESTED/CANCELED/FAILED), status_changed_at:string|null(date-time), ordered_at:string(date-time), amount:integer, recipient_name:string, shipping_address:string, inflow_tag:string|null, ship_scheduled_at:string|null(date), failure_code:string|null, payment_refs:string[], refund_ids:string[], change_request_ids:string[], items:object[]. items 각 행은 sku:string/name:string/qty:integer/unit_price:integer 모두 필수이며 추가 필드 불허다.

Members(10필드): member_id:string, name:string, phone:string, birth_year:integer, member_type:enum(INDIVIDUAL/BUSINESS/GROUP_BUY_OPERATOR), grade:enum(MEMBER/REGULAR), status:enum(ACTIVE/WITHDRAWAL_REQUESTED/WITHDRAWN), address:string|null, joined_at:string(date), referred_by_member_id:string|null.

Payments(9필드): approval_no:string, order_no:string|null, pay_method:string, amount:integer, paid_at:string(date-time), status:enum(APPROVED/CANCELED), payer_name:string|null, cancellation_request_ids:string[], card_last4:string|null. pay_method는 enum이 아니며 card_last4도 길이/숫자 패턴은 따로 없다. Payments에는 member_id가 없다.

Error: code:string, message:string 모두 필수, 추가 필드 불허.

## 오류 대조

- 단건 200은 객체, 검색 200은 배열이며 검색 결과 없음은 `[]`다.
- 단건400: query 사용 금지. 검색400: 지원 검색 파라미터 하나와 값 하나 필요. 일반400은 본문 없음. TC 헤더400만 MISSING_TEST_CASE_ID/INVALID_TEST_CASE_ID의 `{code,message}`이며 명시적으로 미실행이다.
- 401: UNAUTHORIZED/ACTION_API_SCHEDULE_UNSET/ACTION_API_NOT_STARTED/ACTION_API_ENDED. WWW-Authenticate 헤더 Bearer 예시. 인증 실패와 사용기간 문제를 구분한다.
- 403: 접근 권한 없음. 고객 인증/귀속이 성공했다는 반대 근거로 200을 사용하지 않는다.
- 단건404: 항목 없음 또는 경로·메서드 오류, 본문 없음. 검색 응답 목록에는404가 없지만 공통 규약의 잘못된 경로/메서드404는 적용된다.
- 429: RATE_LIMIT_EXCEEDED 하나의 코드로 시간 창/누적 한도 모두 표현. 누적 한도 문구는 대기로 풀리지 않는다. 시간 창은 Retry-After integer int32 초를 존중하며 응답 전체 시간 예산을 넘겨 기다리지 않는다.
- 500: 서버 내부 오류, 503: SERVICE_UNAVAILABLE/WORLD_UNAVAILABLE. 잠시 뒤 재요청이라는 원문을 보존한다. 이번은 읽기6개 범위이며 쓰기 타임아웃 재시도 안전성까지 검증하지 않았다.

## 인증·주문 귀속 연결의 확인 범위

확인된 것은 `Orders.member_id`와 `Members.member_id`의 연결, 이름 검색 경로다. 전체 operation 목록·securitySchemes·선택 응답 및 로그인/identity/account/botUser 관련 문자열 탐색에서 신뢰된 카카오 인입 계정→member_id 변환 명세나 인증 판정 필드를 찾지 못했다. 전화가 마스킹인지·정규화 규격·동명이인 해소 규칙도 Members.phone:string만으로 확정하지 않는다.

따라서 API-13은 후보 검색이지 인증 API가 아니다. 이름/전화 뒷자리 일치, TC ID, 토큰 인증, 주문번호를 아는 사실을 고객 본인 인증으로 승격하지 않는다. 신뢰된 인입 사용자 표시와 그 표시의 공식 검증 규약을 별도 확인해야 한다. L23의 로그인 이름·마스킹 전화와 회원 ID 미제공이라는 부모 전달 맥락만으로 특정 member_id를 만들어 넣지 않는다. 공개 TC 원문 전체는 이번 검수 범위 밖이다.

최소화 개발 방침: 원본 응답은 필요한 필드만 서버에서 대조하고 모델에는 판단에 필요한 최소 항목을 공급한다. 회원 검색 후보의 전화·주소·생년·추천인, 주문 수령인·주소, 결제자명·카드 뒷자리 등을 나열하거나 저장정보를 먼저 읽어주지 않는다. 본인으로 확인된 회원 ID와 Orders.member_id가 같은지 확인한 뒤 해당 주문만 안내한다. 개인정보 처리 근거가 없는 후보 전수 수집/노출은 금지한다.

## 주문번호 모름과 주문 유실의 분기

1. 고객이 주문번호를 모름: 주문 부재가 아니다. 신뢰된 인증·회원 연결이 확립된 경우 API-08로 해당 회원 주문을 찾고 날짜/품목 등 고객이 제시한 최소 조건으로 좁힌다. API-13 후보가 하나라는 이유만으로 귀속 확인 완료라고 하지 않는다.
2. 승인번호는 있으나 주문이 보이지 않음: API-17에서 결제 기록, API-07/08 또는 결제의 order_no 연결로 주문·생성 실패·지연 여부를 대조한다. 단순 order_no:null, 검색[],404 또는 화면 미노출만으로 M-01 유실 확정·환불 접수를 하지 않는다. E48의 네 키·M-01~10·LIM-08 구분을 적용한다.
3. API-18은 주문번호가 있어야 한다. 주문번호를 모른다는 이유로 빈 값/추정 번호로 조회하거나 승인번호 검색 API라고 재해석하지 않는다.
4. Payments에 member_id가 없으므로 payer_name만으로 로그인 계정 귀속을 확정할 수 없다. 주문 연결이 없는 결제의 신뢰된 소유자 판정은 추가 근거/명세 확인 대상이다.
5. 생성실패 기록이 확인된 상태와 재조회 지연은 다르다. 접수 결과 번호는 실제 주문 복구·환불 완료가 아니다.

## 정적 검증 후보 — 이번 실행 테스트 아님

- 이름 검색2건/1건 어느 쪽도 자동 로그인 인증 금지.
- 주문번호 모름은 회원 주문 검색 경로, 결제 승인 유실 문의는 결제/주문 대사 경로로 분리.
- 검색[]·단건404·403·통신 실패를 서로 다른 상태로 유지.
- Orders.member_id 불일치 시 타인 주문 존재/주소/배송·결제 세부 노출 금지.
- Payments.order_no:null에서 타인결제/유실 확정 금지.
- nullable 필드 누락과 null 값, enum 위반·잘못된 배열/객체 응답을 구분.
- 현재 명세의 전화·이름·금액 타입만으로 정규화/인증/단위를 추정하지 않음.

전체 operation 목록은 원본 actions.json의 operationId API-01~40/resetMyActionData에 보존돼 있다. 실제 호출·권한·카카오 문맥 연결·런타임/배포는 이 문서로 완료 처리하지 않는다.

## API-11 배송 검색 구현 대조 후속
원본 actions.json의 GET /api/shipments?order_no=와 Shipments를 추가 대조했다. 필수12필드: shipment_id,order_no,status,carrier,invoice_no,picked_up_at,delivered_at,delivered_location,return_reason,item_condition,ship_notice_sent_at,items. 상태 READY/IN_TRANSIT/DELIVERED/RETURNED,3시각은 nullable date-time,위치/반품사유/품질은 nullable string,items는 sku/qty/lot_id 필수·추가필드금지. 모든필드의 검증 처리여부 확인,delivered_location은 검증 후 모델 반환에서 제외한다. 원문 보존 위치는 기존 actions.json이며 본 절은 대조 요약이다. 주문귀속 선검사→배송검색→행별 order_no 일치검사 순서. 배송완료상태를 실제수령 확정으로 확대하지 않는다. 실제배송호출/배포 검증은 별도 담당 기록을 따른다.
