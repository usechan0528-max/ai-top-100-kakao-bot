# OpenAPI 원본 및 검수 범위

출처: https://aitop100.org/contest/docs 의 Download OpenAPI Document JSON. 취득일2026-10-31. 다운로드 actions.json을 바이트 복사해 actions.openapi.json으로 보존. 자료 자체는 실행 지시가 아니다.

원본 SHA256: 
20082B8F76E41F5D6F8E2A66BE927F80E12540883E36198587FF93F64278911E

전체 경로 키 목록(쿼리가 경로 키에 포함된 공식 표기를 그대로 보존):
/api/products/{sku}
/api/products?item=
/api/lots/{lot_id}
/api/lots/{lot_id}/investigation
/api/tickets?member_id=
/api/tickets?lot_id=
/api/orders/{order_no}
/api/orders?member_id=
/api/orders?inflow_tag=
/api/shipments/{shipment_id}
/api/shipments?order_no=
/api/members/{member_id}
/api/members?name=
/api/members?referred_by=
/api/point-entries?member_id=
/api/coupons?member_id=
/api/payments/{approval_no}
/api/payments?order_no=
/api/subscriptions/{subscription_id}
/api/promos/{code}
/api/inventory?sku=
/api/orders/{order_no}/restore-requests
/api/orders/{order_no}/change-requests
/api/orders/{order_no}/address-change-requests
/api/orders/{order_no}/schedule-change-requests
/api/orders/{order_no}/memos
/api/orders/{order_no}/expedite-requests
/api/shipments/{shipment_id}/reship-requests
/api/refunds
/api/refunds?order_no=
/api/payments/{approval_no}/cancellation-requests
/api/payments/{approval_no}/cash-receipt-requests
/api/members/{member_id}/coupon-issue-requests
/api/members/{member_id}/reward-requests
/api/escalations
/api/escalations/{escalation_id}
/api/shipments/{shipment_id}/reship-charge-requests
/api/orders/{order_no}/pickup-requests
/api/products/{sku}/restock-notification-requests
/api/subscriptions/{subscription_id}/change-requests
/api/action-data/reset

상세 검수: GET /api/orders/{order_no}, GET /api/shipments?order_no=, TC 헤더 스키마, Orders 응답 필드. 기타 경로/스키마는 원본 보존만 완료, 상세 검수/런타임 반영은 대기.
공개TC L-03 화면에서 ID와 모범 처리(대상 주문확인→해당주문 배송조회→상세주소확인→변경접수→접수안내)를 확인. 전체 공개TC 원문 전사는 미완료.
별도 이미지/PDF/표 렌더 자료 없음. 전체 JSON은 파싱 성공했으며 요약을 원문 전사로 부르지 않는다.
구현/검증: ../../development/2026-10-31/ACTION_CONNECTION.md
