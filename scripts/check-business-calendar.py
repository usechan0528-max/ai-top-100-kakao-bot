"""Verify transcription and scenario-calendar arithmetic against provided dates."""
import json, pathlib, collections, datetime, zipfile, xml.etree.ElementTree as ET
import openpyxl
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/sources/business-calendar'
path=next((OUT/'originals').glob('*.xlsx'))
wb=openpyxl.load_workbook(path)
saved=json.loads((OUT/'cells.json').read_text(encoding='utf-8'))
expected={(s.title,c.coordinate):c.value for s in wb for row in s for c in row if c.value is not None}
assert {(c['sheet'],c['cell']):c['value'] for c in saved}==expected
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(path) as z:
    xml_counts=[]
    for name in sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')):
        root=ET.fromstring(z.read(name))
        xml_counts.append(sum(c.find('x:v',ns) is not None or c.find('x:is',ns) is not None for c in root.findall('.//x:sheetData/x:row/x:c',ns)))
    assert sum(xml_counts)==len(saved)
    extra=[n for n in z.namelist() if any(t in n for t in ['media/','drawings/','comments','vbaProject','externalLinks/'])]
s=wb['8. 날짜별 영업·출고 달력']
rows=[list(r)[:4] for r in s.iter_rows(min_row=6,values_only=True)]
bydate={r[0]:r for r in rows}
assert len(bydate)==len(rows)==305
dates=[datetime.date.fromisoformat(r[0]) for r in rows]
assert dates[0].isoformat()=='2037-03-02' and dates[-1].isoformat()=='2037-12-31'
assert all((b-a).days==1 for a,b in zip(dates,dates[1:]))
holidays={'2037-'+x for x in ['05-06','05-25','06-06','08-15','08-17','09-23','09-24','09-25','10-03','10-05','10-09','12-25']}
week=['월','화','수','목','금','토','일']
issues=[]
monthly=collections.defaultdict(lambda:[0,0])
for i,(d,w,b,ship) in enumerate(rows):
    if w!=week[i%7]: issues.append(['weekday-cycle',d,w])
    business=w not in ['토','일'] and d not in holidays
    shipping=business and w in ['월','수','금']
    if (b=='영업')!=business or (ship=='출고일')!=shipping: issues.append(['rule',d,w,b,ship])
    monthly[d[5:7]][0]+=b=='영업'; monthly[d[5:7]][1]+=ship=='출고일'
summary=wb['6. 2037년 달력 (개장 이후)']
for r in range(4,14):
    m=f'{int(summary.cell(r,1).value[:-1]):02}'
    target=[summary.cell(r,2).value,int(summary.cell(r,4).value[:-1])]
    if monthly[m]!=target: issues.append(['monthly',m,monthly[m],target])
business=[r[0] for r in rows if r[2]=='영업']
def forward(md,n=3):
    d='2037-'+md
    base=next(x for x in business if x>=d)
    return base,business[business.index(base)+n]
def backward(md,n=3):
    return [d for d in business if d<'2037-'+md][-n]
forward_results=[]
for start,end in [('07-20','07-23'),('07-24','07-29'),('08-14','08-20'),('09-22','09-30'),('07-25','07-30'),('09-24','10-01')]:
    base,actual=forward(start)
    assert actual=='2037-'+end
    forward_results.append({'received':start,'base':base,'deadline':actual+' 24:00'})
backward_results=[]
for pay,end in [('07-29','07-24'),('08-19','08-13'),('09-30','09-22'),('10-07','10-01'),('12-28','12-22')]:
    actual=backward(pay); assert actual=='2037-'+end
    backward_results.append({'payment':pay,'cutoff':actual+' 24:00'})
# Gregorian weekday disagreement is recorded, never used to replace scenario data.
gregorian_mismatch=sum(week[d.weekday()]!=r[1] for d,r in zip(dates,rows))
result={'transcription_cells_equal':len(saved),'independent_xml_cells':xml_counts,'formula_count':sum(c['type']=='f' for c in saved),'extra_parts':extra,'daily_rows':len(rows),'coverage':[rows[0][0],rows[-1][0]],'monthly_business_shipping':dict(monthly),'rule_or_monthly_issues':issues,'forward_examples':forward_results,'cutoff_examples':backward_results,'gregorian_weekday_disagreements':gregorian_mismatch,'notice':'Use supplied scenario weekdays; do not use real 2037 weekdays. Derived holiday-receipt examples are verification calculations, not quotations.'}
(OUT/'CHECKS.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
assert not issues
