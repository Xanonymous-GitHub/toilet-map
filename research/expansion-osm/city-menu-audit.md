# Bounded city-menu audit

Checked against `data/regions.json` on 2026-10-11. The initial review started
with 120 cities (JP 74 / KR 46). During the review, the main implementation
expanded the registry to 181 cities (JP 114 / KR 67). The final checked snapshot
and exact menu checksum are recorded in `city-menu-audit.json`. This is a shortcut-menu
review, not a claim that nationwide OSM data is missing for these locations.
No further toilet data or Overpass query was downloaded, and the original city
registry was not edited by the researcher. This is intentionally not a complete
population ranking.

**Result at the final check:** all 20 Japanese designated cities are present,
and all first-priority Japan/Korea candidates below have been added. Of the
secondary Japanese candidates listed below, only Yao / 八尾 remained absent.
A wider check of the association's core-city list also found Neyagawa / 寢屋川
and Kure / 吳 absent. These are optional additions rather than obvious
major-city blockers. The
following findings describe the initial 120-city menu and document why the
implementation expanded it.

## Japan

The initial menu omitted **Sagamihara / 相模原** from the official list of 20
ordinance-designated cities. The other 19 were already listed. Sagamihara was
subsequently added, completing the set of 20.
Source: [Chiba City, designated-city system and complete list](https://www.city.chiba.jp/sogoseisaku/sogoseisaku/chosei/bunken-seireisiteitosi.html).

Beyond that correction, the obvious larger-city shortcuts identified were
Funabashi / 船橋, Kawaguchi / 川口, Hachioji / 八王子, Higashiosaka / 東大阪,
Kurashiki / 倉敷, Nishinomiya / 西宮, Amagasaki / 尼崎, Toyota / 豐田,
Toyonaka / 豐中, Kashiwa / 柏 and Yokosuka / 橫須賀. These are named in the
[Core Cities Mayors Association's current primary city list](https://www.chuukakushi.gr.jp/link.html).

Three larger non-core cities also stood out: Matsudo / 松戶, Ichikawa / 市川 and
Machida / 町田. Matsudo's official population page reports roughly 500,000 people,
and Ichikawa's city introduction reports 498,531 as of 2026-01-31; no current
cross-city ranking is inferred from those dates. Machida is a named candidate
city in the association's primary list.
Sources: [Matsudo population](https://www.city.matsudo.chiba.jp/profile/jinkoutoukei/jinkou/joujoujinkou.html),
[Ichikawa city introduction](https://www.city.ichikawa.lg.jp/page/4647.html),
[association city list](https://www.chuukakushi.gr.jp/link.html).

A useful second group, all listed by the core-city association, is Suita / 吹田,
Hirakata / 枚方, Ichinomiya / 一宮, Okazaki / 岡崎, Toyohashi / 豐橋,
Takatsuki / 高槻, Kawagoe / 川越, Koshigaya / 越谷, Takasaki / 高崎,
Koriyama / 郡山, Iwaki / 磐城, Kurume / 久留米, Akashi / 明石, Yao / 八尾 and
Sasebo / 佐世保. These are practical additions if the goal is broad city-menu
coverage; their omission does not block geolocation or nationwide map browsing.

## South Korea

The most obvious larger-city shortcuts missing from the initial menu were **Siheung / 始興,
Gimpo / 金浦, Gwangju in Gyeonggi / 京畿廣州, Gumi / 龜尾 and Asan / 牙山**,
followed by Hanam / 河南, Yangju / 楊州 and Gwangmyeong / 光明.

Gwangju in Gyeonggi is different from the existing southwest `gwangju` shortcut;
give it a distinct ID and a label including 京畿. The Gyeonggi government lists
the municipalities by name in its current local-currency contacts and its
municipal program list.
Sources: [Gyeonggi government municipal contact list](https://www.gg.go.kr/contents/contents.do?ciIdx=987138&menuId=2141),
[Gyeonggi government municipal list in its program notice](https://gnews.gg.go.kr/news/news_detail.do?number=202506241405071757C109&s_code=C109).

City primary pages support adding the industrial cities outside the existing
metro shortcuts: Gumi's July 2026 population is 402,691; Asan's June 2026 total,
including foreign residents, is 405,839. The figures have different population
definitions and dates, so they are evidence of scale rather than a ranking.
Sources: [Gumi official statistics](https://www.gumi.go.kr/portal/contents.do?mid=0306030500),
[Asan official population statistics](https://www.asan.go.kr/stat/main/index.php?PageNo=1&m_cd=50&m_mode=view&pds_no=2026070310535172356).

Further primary references for the candidate shortcuts:
[Gimpo August 2026 statistics](https://www.gimpo.go.kr/portal/selectBbsNttView.do?bbsNo=236&deleteAt=N&key=1145&nttNo=990682&pageIndex=1&pageUnit=10&searchCnd=all),
[Siheung city data portal](https://zoom.siheung.go.kr/smart/main/main.do),
[Gyeonggi Gwangju city population](https://www.gjcity.go.kr/portal/population/view.do?mId=0102060000).

For each addition, calculate source counts using the application's actual city
bbox. Do not reuse 25 km radius counts as municipal population or coverage counts.
