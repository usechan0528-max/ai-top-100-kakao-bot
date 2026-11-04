# 사진·음성 인입 규격 조사

조사일2026-10-31. 시나리오일2037-06-30과 구분. RULES/BC와 기존 자료를 먼저 대조했다. 코드/배포/실업무API/CUA 변경·호출 없음. 공개 문서 열람과 공개 미디어HEAD만 실행했으며 새비밀/쿠키/인증정보를 사용하지 않았다.

## 확정 근거와 미확정

1. [기존 공식 명세 열람 기록](../../sources/member-link-research/OTHER_GUIDES.md):16은 카카오 게이트웨이 MESSAGE_CREATE 필드표7행을 `id`, `content`, `timestamp`, `isChannelChatroom`, `botGroupKey`, `botUserKey`, `callbackToken`으로 기록한다. 이 조사 기록에는 별도 attachment/image/audio필드가 없다. 현재 소스는 `op=0`, `t=MESSAGE_CREATE`, `d.content`문자열을 처리한다(worker:31~38,90). 소스가 받는 구조를 새로운 공식 멀티모달 명세로 취급하지 않는다.
2. [L-11 원문](../../sources/public-tcs/originals/L-11.md):11에는 `image: https://t1.kakaocdn.net/aitop100/aitop100/dist/yQbPeyvr5OIfWZ83WRNraw.jpg`, [Y-07-b 원문](../../sources/public-tcs/originals/Y-07-b.md):11에는 `audio: https://t1.kakaocdn.net/aitop100/aitop100/dist/IhTu8IcHwTNWOIZtWlr_vQ.m4a`가 있다. 이는 공개 TC 문서의 미디어 표기이며 MESSAGE_CREATE의JSON키/type/첨부스키마가 아니다. 고객문장에 URL을 전송하는지, 실제 사진/음성메시지로 보내는지, 서버가 어떻게 변환하는지는 미확인이다.
3. 아래 두 공개파일HEAD는HTTP200,리다이렉트없음,인증헤더없이성공했다. 이 사실을 실제사용자첨부의허용호스트/인증/URL수명규칙으로일반화하지않는다.

|TC|공개파일/호스트|Content-Type|Content-Length|기타 확인|
|---|---|---|---|---|
|L-11|위공식jpg / t1.kakaocdn.net|image/jpeg|201007|Accept-Ranges:bytes,Cache-Control:max-age=21600|
|Y-07-b|위공식m4a / t1.kakaocdn.net|audio/mp4|191937|Accept-Ranges:bytes,Cache-Control:max-age=21600|

Cache-Control은캐시유효기간이며첨부URL만료기한/다운로드권한이아니다. Last-Modified도시나리오상촬영/발화일이아니다. 확장자m4a와MIMEaudio/mp4차이를유지한다.

## 공식 웹 열람 결과

- [카카오 게이트웨이](https://developers.kakao.com/docs/ko/bot/gateway#message-create), [웹훅](https://developers.kakao.com/docs/ko/bot/webhook), [대회 docs](https://aitop100.org/contest/docs):web open은모두Internal Error. 비로그인HTTP열람은카카오2개404,대회403. 인증우회·브라우저/CUA재개는하지않았다. 따라서이번에공식사진/음성이벤트필드타입표를새로확보했다고표현하지않는다.
- 공식사이트대상검색은동일Bot인입규격을찾지못했다. 검색에나오는카카오공유/메시지템플릿의image_url이나광고이미지업로드규격은다른API이므로차용하지않는다. 제3자패키지검색결과도공식첨부근거로채택하지않았다.
- 기존문서의‘카카오서버발신검증용CUSTOM_HEADER’는인입발신자검증근거다. 그것이첨부URL다운로드용Authorization이라는근거는없다. callbackToken은응답콜백용이며미디어다운로드토큰으로전용하지않는다.

## 개발 구분과 다음 확인

공개TC의 `image:`/`audio:` 또는 고객이제공한공개URL텍스트를인식하는자체어댑터는구현할수있다. 문서명은‘공개URL미디어입력지원’으로표시하고공식사진/음성메시지수신완료와구분한다. 임의 attachments/type/url필드를공식규격이라고만들지않는다. URL/MIME/바이트상한/리다이렉트/시간예산검증은자체방침으로명시한다. 허용호스트는현재확인한CDN과나중에확정된실인입범위로좁혀검증한다. 공개자료라는이유로명령/업무증거신뢰수준을승격하지않는다.

미확정: 실제 event첨부키와자료형·사진묶음/캡션/음성전사제공여부·URLhost/인증/만료·파일/픽셀/음성길이한도·타입별실메시지전달방식. 직접메시지전송이나운영검증은사용자중단범위를침범하지않고별도조율한다.

질문 대상: 대회 플랫폼/봇 연동 공식 기술 담당(운영진). 이민준 등 시나리오 등장인물에게 묻지 않는다.

복사할 질문: “사진·음성 MESSAGE_CREATE의 민감값을 가린 실제 JSON 예시와 공식 명세 위치를 부탁드립니다. 첨부 필드·자료형·URL 호스트, 다운로드 인증·유효기간, 파일 제한, 음성 전사 제공 여부와 TC의 image/audio URL 전달 방식을 확인하고 싶습니다.”

현재 완료: 기존자료/공식웹접근대조·공개미디어2개헤더확인·미확정분리. 공식첨부스키마확보·실사진/음성인입·모델판독/전사·종단검증완료아님.
