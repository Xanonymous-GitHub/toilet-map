"""Normalize public snapshots and optionally refresh official sources over HTTPS.

Use --refresh to download Tokyo/Seoul via their ordinary public download workflows.
No API credentials are used. Validate first; replace the published dataset atomically.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse, csv, io, json, math, os, urllib.parse, urllib.request, http.cookiejar, hashlib

ROOT = Path(__file__).resolve().parent.parent
RESEARCH = Path('/workspace/toilet-map-pwa')
RAW = ROOT / 'data' / 'raw'
TOKYO_URL = 'https://www.opendata.metro.tokyo.lg.jp/koto/131083_013_public_toilet.csv'
SEOUL_CATALOG = 'https://data.seoul.go.kr/dataList/OA-22586/S/1/datasetView.do'
SEOUL_URL = 'https://datafile.seoul.go.kr/bigfile/iot/sheet/json/download.do'
NOW = datetime.now(timezone.utc).isoformat()

def download(url, body=None, opener=None, referer=None):
    headers={'User-Agent':'Relief-Toilet-Map/1.0 public-data import', 'Accept':'*/*'}
    if referer: headers['Referer']=referer
    if body is not None: headers['Content-Type']='application/x-www-form-urlencoded'
    request=urllib.request.Request(url,data=urllib.parse.urlencode(body).encode() if body is not None else None,headers=headers)
    with (opener or urllib.request.build_opener()).open(request,timeout=30) as r:
        data=r.read(10*1024*1024+1)
        if len(data)>10*1024*1024: raise ValueError('Source exceeds bounded importer size')
        return data

def known(value):
    value=str(value or '').strip().lower()
    return 'yes' if value in ('yes','有','1','true') else 'no' if value in ('no','無','0','false') else 'limited' if value=='limited' else 'unknown'

def base(id, region,source,name,address,lat,lon,fetched,updated=None):
    lat=float(lat);lon=float(lon)
    if not math.isfinite(lat) or not math.isfinite(lon):raise ValueError('Invalid coordinate')
    if not name:raise ValueError('Missing name')
    if region=='seoul' and not (37.3<lat<37.8 and 126.7<lon<127.3):raise ValueError('Coordinates outside Seoul')
    if region=='tokyo' and not (35<lat<36.5 and 139<lon<141):raise ValueError('Coordinates outside Tokyo')
    return dict(id=id,region=region,country='KR' if region=='seoul' else 'JP',sourceId=source,name=name,address=address,lat=lat,lon=lon,access='public',fee='unknown',wheelchair='unknown',changingTable='unknown',infantEquipment='unknown',male=None,female=None,unisex=None,entranceNote='',hoursRaw='',timezone='Asia/Seoul' if region=='seoul' else 'Asia/Tokyo',sourceUpdatedAt=updated,fetchedAt=fetched,coordinateQuality='source_position')

def normalize(tokyo_bytes,seoul_bytes,osm_data,tokyo_fetched,seoul_fetched):
    records=[]
    tokyo_rows=list(csv.DictReader(io.StringIO(tokyo_bytes.decode('utf-8-sig'))))
    for r in tokyo_rows:
        t=base('jp:koto:'+r['ID'],'tokyo','koto',r['名称'],r['所在地_連結表記'],r['緯度'],r['経度'],tokyo_fetched,'2026-01-27')
        t.update(nameEn=r.get('名称_英語',''),wheelchair=known(r.get('車椅子使用者用トイレ有無')),infantEquipment=known(r.get('乳幼児用設備設置トイレ有無')),entranceNote=r.get('設置位置',''),hoursRaw=r.get('利用開始時間','')+'–'+r.get('利用終了時間','')+(' '+r['利用可能時間特記事項'] if r.get('利用可能時間特記事項') else ''),male=int(r.get('男性トイレ総数') or 0)>0,female=int(r.get('女性トイレ総数') or 0)>0,unisex=int(r.get('男女共用トイレ総数') or 0)>0)
        records.append(t)
    seoul_rows=json.loads(seoul_bytes)['DATA']
    for r in seoul_rows:
        t=base('kr:seoul:'+str(int(r['objectid'])),'seoul','seoul',str(r['conts_name']).strip(),str(r.get('addr_new') or r.get('addr_old') or '').strip(),r['coord_y'],r['coord_x'],seoul_fetched)
        category=str(r.get('value_01') or '').strip()
        facilities=str(r.get('value_06') or '').strip()
        accessible=str(r.get('value_05') or '').strip()
        genders=str(r.get('value_04') or '').strip()
        t.update(access='public_by_agreement' if '민간개방' in category else 'public' if '공공개방' in category else 'unknown',wheelchair='yes' if accessible else 'unknown',changingTable='yes' if '기저귀' in facilities else 'unknown',hoursRaw=str(r.get('value_02') or '').strip(),male='남자' in genders if genders else None,female='여자' in genders if genders else None,unisex='공용' in genders if genders else None)
        records.append(t)
    for r in osm_data['elements']:
        tags=r.get('tags',{});center=r.get('center',r)
        t=base(f"osm:{r['type']}:{r['id']}",'tokyo','osm-shinjuku',tags.get('name') or '新宿周邊廁所',tags.get('addr:full') or '新宿周邊 · 詳細地址未提供',center['lat'],center['lon'],osm_data['osm3s']['timestamp_osm_base'])
        access=tags.get('access','unknown')
        t.update(access='public' if access in ('yes','public','permissive') else 'private' if access in ('private','no') else 'customers' if access=='customers' else 'permit' if access=='permit' else 'unknown',fee=known(tags.get('fee')),wheelchair=known(tags.get('wheelchair')),changingTable=known(tags.get('changing_table')),hoursRaw=tags.get('opening_hours',''),entranceNote=tags.get('description',''),coordinateQuality='source_position' if r['type']=='node' else 'osm_center')
        records.append(t)
    if len(tokyo_rows)<100 or len(seoul_rows)<4000:raise ValueError('Unexpected source row-count loss; refusing to overwrite')
    ids=[r['id'] for r in records]
    if len(ids)!=len(set(ids)):raise ValueError('Duplicate source IDs')
    sources=[
      dict(id='koto',name='江東區官方資料',url='https://spec.api.metro.tokyo.lg.jp/spec/t131083d0000000019-871f7df0e40ce50322a382fdb88c1de2-0',license='CC BY · 江東區／東京都',licenseUrl='https://spec.api.metro.tokyo.lg.jp/spec/t131083d0000000019-871f7df0e40ce50322a382fdb88c1de2-0',fetchedAt=tokyo_fetched,sourceUpdatedAt='2026-01-27',count=len(tokyo_rows),note='官方座標與設施資訊。全部資料填寫 00:00–23:59；不是現場全天開放的保證。嬰幼兒設備不直接等同尿布台。'),
      dict(id='seoul',name='首爾官方資料',url=SEOUL_CATALOG,license='KOGL 第 1 類 · 首爾特別市',licenseUrl=SEOUL_CATALOG,fetchedAt=seoul_fetched,sourceUpdatedAt=None,count=len(seoul_rows),note='출처: 서울특별시 「서울시 공중화장실 위치정보」。官方完整下載，包含公共設施與民間開放；資料未提供每間廁所的現場查核日期。'),
      dict(id='osm-shinjuku',name='OpenStreetMap',url='https://www.openstreetmap.org/copyright',license='ODbL 1.0 · © OpenStreetMap contributors',licenseUrl='https://opendatacommons.org/licenses/odbl/1-0/',fetchedAt=osm_data['osm3s']['timestamp_osm_base'],sourceUpdatedAt=None,count=len(osm_data['elements']),note='僅涵蓋新宿車站約 1 公里內的探勘快照。未標記使用資格的物件會註明未知；非公開與限顧客物件不列入推薦。'),
    ]
    return dict(dataVersion='v'+hashlib.sha256(json.dumps(records,ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:12],fetchedAt=NOW,records=records,sources=sources)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--refresh',action='store_true');args=parser.parse_args()
    RAW.mkdir(parents=True,exist_ok=True)
    if args.refresh:
        tokyo=download(TOKYO_URL)
        opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        download(SEOUL_CATALOG,opener=opener)
        download('https://data.seoul.go.kr/dataList/sheetView.do?infId=OA-22586&srvType=S',dict(isLogin='',srvType='S',infId='OA-22586',serviceKind='1',ssUserId='',infNm='서울시 공중화장실 위치정보',stcRow=''),opener,SEOUL_CATALOG)
        seoul=download(SEOUL_URL,dict(srvType='S',infId='OA-22586',serviceKind='1',pageNo='1',gridTotalCnt='4455',ssUserId='SAMPLE_VIEW',strWhere='',strOrderby='',filterCol='',txtFilter=''),opener,SEOUL_CATALOG)
        tokyo_fetched=seoul_fetched=NOW
    else:
        tokyo=(RAW/'tokyo.csv').read_bytes() if (RAW/'tokyo.csv').exists() else (RESEARCH/'research/samples/tokyo-koto-csv.csv').read_bytes()
        seoul=(RAW/'seoul.json').read_bytes() if (RAW/'seoul.json').exists() else (RESEARCH/'data/seoul/raw-official.json').read_bytes()
        tokyo_fetched='2026-10-11T08:28:50Z';seoul_fetched='2026-10-11T08:49:32Z'
    osm_path=RAW/'osm-shinjuku.json'
    osm=json.loads((osm_path if osm_path.exists() else ROOT/'data/osm-shinjuku.json').read_text())
    dataset=normalize(tokyo,seoul,osm,tokyo_fetched,seoul_fetched)
    for name,blob in [('tokyo.csv',tokyo),('seoul.json',seoul),('osm-shinjuku.json',json.dumps(osm,ensure_ascii=False).encode())]:(RAW/name).write_bytes(blob)
    output=ROOT/'data/dataset.json';temp=output.with_suffix('.tmp')
    (ROOT/'data/osm-shinjuku.json').write_text(json.dumps(osm,ensure_ascii=False,separators=(',',':'))+'\n')
    temp.write_text(json.dumps(dataset,ensure_ascii=False,separators=(',',':'))+'\n');os.replace(temp,output)
    print(json.dumps({'records':len(dataset['records']),'sources':{s['id']:s['count'] for s in dataset['sources']},'dataVersion':dataset['dataVersion']},ensure_ascii=False))
