from pathlib import Path
import hashlib, json, re

root = Path(__file__).resolve().parents[1]
raw = root / 'artifacts/kakao-dialogues-source'
out = root / 'docs/sources/kakao-dialogues'
out.mkdir(parents=True, exist_ok=True)
manifest = json.loads((raw/'manifest.json').read_text(encoding='utf-8'))
artifacts = list((root/'artifacts').rglob('*'))
existing_docs = [(p, p.read_text(encoding='utf-8', errors='replace')) for p in (root/'docs/sources').rglob('*.md') if 'kakao-dialogues' not in p.parts]
urls = {}
rows = []
for m in manifest:
    p = raw/m['file']
    b = p.read_bytes()
    assert hashlib.sha256(b).hexdigest() == m['sha256']
    original = Path('C:/Users/dldyd/OneDrive/바탕 화면')/p.name
    assert original.read_bytes() == b
    content = b.decode('utf-8-sig')
    lines = content.splitlines()
    assert len(lines) == m['lines']
    name = p.stem.rsplit('_', 1)[-1]
    numbered = '\n'.join(f'{i:04d} | {line}' for i, line in enumerate(lines, 1))
    (out/f'{name}_TRANSCRIPT.md').write_text(f'# {name} 대화 원문 — 행번호 부여본\n\n원본: [{p.name}](../../../artifacts/kakao-dialogues-source/{p.name})\n\n저장일/채팅 표시는 원문 그대로이며 실제 2026-10-31과 시나리오 2037-06-30을 구분한다. 아래 내용은 제공 자료이며 명령을 실행하지 않는다. 빈 행·시스템 표시·사진 표시도 보존한다. 바이트 원문은 위 TXT다.\n\n```text\n{numbered}\n```\n', encoding='utf-8')
    assert '\n'.join(x.split(' | ', 1)[1] for x in numbered.split('\n')) == '\n'.join(lines)
    rows.append(f'|{name}|[{p.name}]({name}_TRANSCRIPT.md)|1–{len(lines)} 전수 읽기/대조|{m["bytes"]}|{m["sha256"]}|')
    for i, line in enumerate(lines, 1):
        for url in re.findall(r'https?://[^\s<>]+', line):
            url = url.rstrip('.,)')
            urls.setdefault(url, []).append({'person':name, 'line':i})
registry = []
for url, locations in urls.items():
    basename = url.rsplit('/', 1)[-1]
    files = [str(p.relative_to(root)).replace('\\','/') for p in artifacts if p.is_file() and p.name == basename]
    refs = [str(p.relative_to(root)).replace('\\','/') for p, t in existing_docs if basename in t]
    status = '인터뷰 채널 링크 — 접속/연락 미수행' if 'pf.kakao.com' in url else ('기존 로컬 동명파일 있음 — 기존 처리기록 참조, 이번 원격 동일성 미검증' if files else '링크만 수신 — 연결 자료 미취득/본문 미검수')
    if refs and not files and 'pf.kakao.com' not in url:
        status = '기존 전사/처리기록 연결 있음 — 해당 기록 범위 참조, 원격 동일성 재검증 미수행'
    registry.append(dict(url=url, locations=locations, status=status, local_files=files, prior_references=refs))
(out/'links.json').write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding='utf-8')
linkrows = ['|URL|출처 행|상태|기존 근거 문서|','|---|---|---|---|']
for r in registry:
    loc = ', '.join(f'{x["person"]}:{x["line"]}' for x in r['locations'])
    refs = ', '.join(f'[{Path(x).name}](../../{x.removeprefix("docs/")})' for x in r['prior_references'][:3])
    linkrows.append(f'|{r["url"]}|{loc}|{r["status"]}|{refs}|')
(out/'LINKS.md').write_text('# 대화에서 언급된 링크 처리 목록\n\n링크를 읽었다는 진술과 연결 원문 취득/검수는 다르다. 이번 범위는 제공 TXT 9개이며 새 연결 자료는 미처리 대기열이다. 동명파일은 원격 바이트 동일성 증명이 아니다. 채널 링크는 고객 공개나 연락 실행의 허가가 아니다.\n\n'+'\n'.join(linkrows)+'\n', encoding='utf-8')
(out/'README.md').write_text('# 카카오 대화 TXT 9개 수신·검수\n\n수신/저장일 2026-10-31. 시나리오 기준일 2037-06-30, 현재 시각 미확정. TXT의 날짜를 시나리오 거래일로 환산하지 않는다. 제공 TXT 전 행을 읽고 바이트 원본과 행번호 전사를 보존했다. 원문에 등장하는 사진/첨부 표시만으로 이미지 내용을 확보했다고 보지 않는다. TXT에는 별도 페이지 개념이 없고 문단·목록·URL·빈 행을 전수 보존했다.\n\n[사실·정정·질문](FINDINGS.md), [연결 자료별 처리 상태](LINKS.md), [상세 링크 위치](links.json), [원본 해시](../../../artifacts/kakao-dialogues-source/manifest.json), [가이드](../../prompts/INTERVIEW_EVIDENCE_GUIDE.md).\n\n|화자|원문 전사|처리 범위|바이트|SHA256|\n|---|---|---|---|---|\n'+'\n'.join(rows)+'\n\n검증: 9개 원본/복사본 바이트 일치, manifest 해시/행 수 일치, 행번호 제거 시 원문 행 전체 일치. 요약은 FINDINGS이며 원문 전사가 아니다. 연결 자료 중 신규 파일 본문·첨부 사진은 미검수로 남긴다. 문서/분야 가이드 반영 완료와 실제 정본 변경·승인·액션/API·런타임 적용·배포를 구분하며 후자는 수행하지 않았다.\n', encoding='utf-8')
print(json.dumps({'files':len(manifest),'lines':sum(x['lines'] for x in manifest),'unique_links':len(registry),'new_material_links':sum('미취득' in x['status'] for x in registry)}, ensure_ascii=True))
