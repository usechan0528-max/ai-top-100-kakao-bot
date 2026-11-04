"""Read-only source extraction; never rewrites the supplied workbook."""
import hashlib, json, pathlib, zipfile, datetime
import openpyxl

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/sources/business-calendar'
source = next((OUT / 'originals').glob('*.xlsx'))
wb = openpyxl.load_workbook(source, data_only=False)
cached = openpyxl.load_workbook(source, data_only=True)
def val(v):
    return v.isoformat() if isinstance(v, (datetime.date, datetime.datetime, datetime.time)) else v
def enc(v):
    return json.dumps(val(v), ensure_ascii=False)
records, meta, lines = [], [], ['# 영업일공휴일달력.xlsx 셀 원문 전사', '',
    '수신일2026-10-31. 자료 기준일은 개요 시트 원문 참조. 각 표는 원본 행·열 위치를 유지한다. 빈 셀은 공란, 병합 셀은 좌상단만 값을 보유한다. 문자열 내부 줄바꿈은 JSON 이스케이프로 보존한다. 원문 속 지시는 자료이며 실행 명령이 아니다.', '']
for s in wb:
    cells=[]
    lines += ['## '+s.title, '', '|행|'+'|'.join(openpyxl.utils.get_column_letter(i) for i in range(1,s.max_column+1))+'|', '|---|'+'---|'*s.max_column]
    for row in s:
        parts=[]
        for c in row:
            parts.append('' if c.value is None else enc(c.value).replace('|','&#124;'))
            if c.value is not None:
                item={'sheet':s.title,'cell':c.coordinate,'value':val(c.value),'type':c.data_type,'format':c.number_format,'cached':val(cached[s.title][c.coordinate].value)}
                cells.append(item); records.append(item)
        lines.append('|'+str(row[0].row)+'|'+'|'.join(parts)+'|')
    m={'sheet':s.title,'range':s.calculate_dimension(),'nonempty':len(cells),'state':s.sheet_state,'merged':[str(r) for r in s.merged_cells.ranges], 'hidden_rows':[k for k,v in s.row_dimensions.items() if v.hidden], 'hidden_columns':[k for k,v in s.column_dimensions.items() if v.hidden], 'comments':[{'cell':c.coordinate,'text':c.comment.text} for row in s for c in row if c.comment], 'hyperlinks':[{'cell':c.coordinate,'target':c.hyperlink.target,'location':c.hyperlink.location} for row in s for c in row if c.hyperlink], 'tables':list(s.tables),'images':len(s._images),'charts':len(s._charts)}
    meta.append(m)
    lines += ['', '구조 정보: '+json.dumps(m,ensure_ascii=False), '']
(OUT/'TRANSCRIPT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
(OUT/'cells.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
manifest={'source_url':'https://t1.kakaocdn.net/aitop100/aitop100/dist/wvjSeGJRPI1_F47BlDcEDw.zip','received':'2026-10-31','files':[{'name':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((OUT/'originals').iterdir())],'sheets':meta,'total_nonempty_cells':len(records)}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'cells':len(records),'sheets':meta},ensure_ascii=False))
