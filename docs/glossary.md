# Go terminology glossary (zh / en / ko / ja)

The reference for every Go term used in `src/web/js/messages.js` and
`src/web/js/content/course.js`. When you add or change a string, use the term
in this table. Usage targets:

- **zh**: mainland Simplified Chinese, as in 中国围棋协会 teaching material.
- **en**: plain English as in common English Go literature (Sensei's Library,
  AGA/BGA beginner material). Spelling follows the app: British/Oxford
  (centre, colour, practise as a verb, -ize).
- **ko**: Korean as used by the Korea Baduk Association (한국기원) and Korean
  Go media.
- **ja**: Japanese as used by the Nihon Ki-in (日本棋院).

"v2/v3 used" notes the old string where it was replaced in this review.

## Basics

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| Go (the game) | 围棋 | Go | 바둑 | 囲碁 / 碁 | |
| board | 棋盘 | board | 바둑판 / 판 | 碁盤 / 盤 | |
| 9×9 / 19×19 board | 9 路 / 19 路 | 9×9 / 19×19 | 9줄 / 19줄 | 9路 / 19路 | ko 9줄 바둑 is standard spoken usage |
| stone | 棋子 / 子 | stone | 돌 | 石 | counter: zh 颗/子, ko 점, ja 子 (黒二子) |
| group (of stones) | 一块棋 / 一串子 | group | 덩어리 / 돌 | 一団 / 石 | |
| Black / White | 黑 / 白 | Black / White | 흑 / 백 | 黒 / 白 | |
| move; to play a stone | 落子 / 下 | move / play | 수 / 두다, 착수 | 手 / 打つ, 着手 | |
| turn to play | 轮到…下 | … to play | … 차례 | …番 | |
| X to play (problem) | 黑先 | Black to play | 흑선 | 黒先 | ko/ja problem goals now use 흑선 / 黒先 (v3: `{0} 차례`, `{0}番`) |
| liberty | 气 | liberty | 활로 | 呼吸点（ダメ） | ja: 呼吸点 is the Nihon Ki-in beginner term; ダメ in races |
| atari | 打吃 | atari | 단수 | アタリ | |
| capture | 提子 / 吃 | capture | 따내기 / 잡기 | 取る | 따내다 = remove from board; 잡다 = win the group |
| prisoners (captured stones) | 提子 | prisoners / captures | 따낸 돌 / 사석 | アゲハマ | ko 사석 also covers dead stones at counting |
| suicide point / illegal move | 禁着点 | suicide (forbidden move) | 착수 금지 | 着手禁止（点） | |
| ko | 劫 / 打劫 | ko | 패 | コウ | |
| ko threat | 劫材 | ko threat | 팻감 | コウダテ | |
| retake the ko | 提回 | retake | 되따내다 | 取り返す | |
| connect at the ko | 粘劫 | connect | 패를 잇다 | コウを継ぐ / 解消 | |
| pass | 停一手（虚着） | pass | 패스 | パス | |
| resign | 认输 / 中盘胜 (result) | resign / by resignation | 기권 / 불계승 | 投了 / 中押し勝ち | |
| win on time | 超时胜 | wins on time | 시간승 | 時間切れ勝ち | ja v3 used 時間勝ち |
| draw (jigo) | 和棋 | draw | 무승부 | 持碁 | |
| undo (take back) | 悔棋 | undo | 무르기 | 待った | |

## Capturing techniques

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| ladder | 征子 | ladder | 축 | シチョウ | |
| ladder breaker | 引征 | ladder breaker | 축머리 | シチョウアタリ | ja: the stone itself is called シチョウアタリ (v3: シチョウアタリの石) |
| net | 枷吃 / 枷 | net | 장문 | ゲタ | zh theme label v3 used 枪口 (wrong term) |
| throw-in | 扑 | throw-in | 먹여치기 | ホウリコミ | |
| snapback | 倒扑 | snapback | 환격 | ウッテガエシ | |
| double atari | 双打吃 | double atari | 양단수 | 両アタリ | |
| shortage of liberties | 气紧 | shortage of liberties | 자충 | ダメヅマリ | zh v3 used 紧气 (that is the act of filling liberties); ko v3 used 수 부족 / 수 줄이기 |
| connect-and-die | 接不归 | connect and die | 촉촉수 | オイオトシ | ko v3 used 자충으로 잡힘 |
| squeeze | 挤 / 滚打包收 | squeeze | 조이기 | シボリ | |
| counter-atari | 反打吃 | counter-atari | 역단수 | 逆アタリ | |
| capture to escape | 反吃 | capture back | 되잡기 | 取り返す | |
| capture to save (theme) | 吃子解围 / 提子解围 | capture to save | 따내서 살리기 | 取って助ける | problem theme `capture-to-save`; ko title v3 따내서 구하기 → 따내서 살리기 |
| escape (theme) | 逃子 | running away / escape | 도망가기 | 逃げ出し | problem theme `escape` |
| atari (theme) | 打吃 | atari | 단수 | アタリ | problem theme `atari` |
| extend | 长 | extend | 뻗기 | 伸び（ノビ） | ko v3 messages used 늘기, course used 뻗기 → unified to 뻗기; ja v3 延び → 伸び |
| tesuji | 手筋 | tesuji / technique | 맥 | 手筋 | |

## Connecting and cutting

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| cut | 切断 | cut | 끊기 | 切り | |
| cutting point | 断点 | cutting point | 끊는 점 | 切りの点 / 切れ目 | |
| connection | 连接 | connection | 연결 / 잇기 | つなぎ（ツギ） | problem theme `connect`: ja v3 ツギ → つなぎ, to match the topic label; ja unit title v3 継ぎと切り vs topic つなぎと切り → both つなぎと切り |
| solid connection | 实连 | solid connection | 꽉 잇기 | カタツギ | |
| hanging connection | 虎口 | hanging connection (tiger's mouth) | 호구 | カケツギ（虎の口） | |
| bamboo joint | 双 | bamboo joint | 쌍립 | 竹ふし | not used in v3 strings |

## Life and death

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| life and death (problems) | 死活 | life and death | 사활 | 死活 / 詰碁 | |
| live / living | 做活 / 活棋 | live | 살다 / 삶 | 生きる / 生き | |
| kill | 杀棋 | kill | 잡다 / 잡기 | 殺す / 殺し | |
| eye | 眼 | eye | 눈 | 眼 | ko: 집 for an eye (두 집) is idiomatic but collides with 집 = territory; the course and the problem bank use 눈 (problem hints v3 used 집 → 눈) |
| capture to make an eye | 吃子做眼 | capture for an eye | 따내서 눈 만들기 | 取って眼を作る | problem theme `capture-eye` |
| false eye | 假眼 | false eye | 옥집 | 欠け眼 | |
| two eyes | 两眼 / 两只眼 | two eyes | 두 눈 | 二眼 | |
| eye space | 眼位 | eye space | 궁도 | 眼形 | ko course v3 used 공간 / 눈 공간 → 궁도 |
| vital point | 要点 / 急所 | vital point | 급소 | 急所 | ko v3 once used 요점 → 급소 |
| placement (nakade-style) | 点眼 / 点 | placement | 치중 | 置き（オキ） | problem theme `placement` |
| straight three | 直三 | straight three | 직삼 | 直三 | see decisions below |
| bent three | 曲三 | bent three | 곡삼 | 曲がり三 | |
| T-four / pyramid four | 丁四 | pyramid four | 삿갓 사궁 | 丁四 | see decisions below; en v3 "T-four" → "pyramid four" |
| bulky five | 刀把五 | bulky five | 뭉친 오궁 | 刀五 | see decisions below; ja v3 かたまった五目 → 刀五 |
| crossed five | 梅花五 | crossed five | 오궁도화 | 花五 | |
| flower six (rabbity six) | 梅花六 / 葡萄六 | flower six / rabbity six | 매화육궁 | 花六 | |
| rectangular six | 板六 | rectangular six | 판육궁 | 板六 | |
| rabbity six (shape name) | 梅花六 | rabbity six | 매화육궁 | 花六 | v4 `shape.rabbity-six`: the same shape as flower six above; the English shape list uses the other common name |
| seven stones on the second line ("six die, eight live") | 二路七子（六死八活） | seven stones on the second line (six die, eight live) | 2선의 일곱 점 (육사팔활) | 二線の七子（六死八活） | v4 `shape.second-line-seven` |
| independent life (two eyes, as opposed to seki) | 净活 | independent life | 완생 | 完全な生き | used in docs and code comments; the UI says "live" / "seki" |
| classic shapes (collection) | 基本死活形 | classic shapes | 사활의 기본형 | 死活の基本形 | v4 `practice.shapes` |
| 2-1 point (corner: first line, next to the 2-2 point) | 二一路 | the 2-1 point | 2·1의 급소 / 2의 1 | 二の一 | v5 `problem.twoOne.title`: problem title for corner kills whose answer is the 2-1 point; see review list |

## Capturing races

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| capturing race | 对杀 | capturing race | 수상전 | 攻め合い | |
| count liberties | 数气 | count liberties | 활로 세기 | 呼吸点を数える / ダメを数える | |
| fill a liberty | 紧气 | fill a liberty | (활로를) 메우다 | （ダメを）詰める | |
| outside liberty | 外气 | outside liberty | 바깥 공배 | 外ダメ | |
| shared liberty | 公气 | shared liberty | 공동 공배 | 内ダメ | see decisions below; ja course v3 used 共通のダメ → 内ダメ |
| neutral point (dame) | 单官 | neutral point | 공배 | ダメ | |
| eye versus no eye | 有眼杀无眼 | eye versus no eye | 유가무가 | 眼あり眼なし | problem theme `race-eye` |
| seki | 双活 | seki | 빅 | セキ | problem theme `seki` and goal `seki` (v4): "live in seki" = zh 做成双活, ko 빅으로 살다, ja セキで生きる |
| semeai (= capturing race) | 对杀 | capturing race | 수상전 | 攻め合い | problem theme `race`; "semeai" is not used in UI strings |
| big eye versus small eye | 大眼杀小眼 | big eye versus small eye | 큰 눈 대 작은 눈 | 大きい眼と小さい眼 | problem theme `race-big-eye` (v4); see review list |
| liberties of a big eye (3 / 5 / 8 / 12) | 三目三气、四目五气、五目八气、六目十二气 | a big eye of 3, 4, 5, 6 points gives 3, 5, 8, 12 liberties | 3궁 3수, 4궁 5수, 5궁 8수, 6궁 12수 | 三目三手、四目五手、五目八手、六目十二手 | problem hint `bigEye` |

## Scoring and rules

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| territory | 地 / 目 | territory | 집 | 地 | |
| point (of territory) | 目 | point | 집 | 目 | |
| counting / scoring | 数目 | counting | 계가 | 整地 | |
| dead stones | 死子 | dead stones | 사석 | 死に石 | |
| komi | 贴目 | komi | 덤 | コミ | |
| handicap | 让子 | handicap | 접바둑 / 치석 | 置き石 / 置き碁 | |
| handicap game, N stones | 让 N 子 | N handicap stones | N점 접바둑 | N子局 | |
| even game | 分先 | even game | 호선 | 互先 | |
| Japanese rules | 日本规则 | Japanese rules | 일본 규칙 | 日本ルール | |
| Chinese rules | 中国规则 | Chinese rules | 중국 규칙 | 中国ルール | v5 `rules.chinese` |
| Korean rules | 韩国规则 | Korean rules | 한국 규칙 | 韓国ルール | v5 `rules.korean` |
| rules (ruleset) | 规则 | rules | 규칙 | ルール | v5 `rules.title` |
| territory scoring | 数目（数目法） | territory scoring | 계지 | 計地 | v5 `rules.territory`; Japanese and Korean rules. zh 数目 is also "counting" in general (`score.title`) |
| area scoring | 数子（数子法） | area scoring | 계자 | 計子 | v5 `rules.area`; Chinese rules. See review list |
| counting under area scoring | 数子 | counting | 계가 | 計算 | v5 `score.titleArea`; ja 整地 is the Japanese-rules procedure, so the area card says 計算 |
| stones (in an area count) | 棋子 | stones | 돌 | 石 | v5 `score.detailArea*` |
| handicap compensation (Chinese rules) | 让子补偿（还子） | handicap (points White receives) | 치석 보상 | 置き石の補正 | v5: White receives N points for N handicap stones (Black returns half a stone per handicap stone) |
| shared liberties of a seki | 公气 | shared liberties | 공동 공배 | 内ダメ | v5 `score.sekiArea`; same terms as in capturing races |
| byo-yomi | 读秒 | byo-yomi | 초읽기 | 秒読み | UI shows "10 min + 3×30 s" in every language |
| main time | 基本用时 | main time | 제한 시간 | 持ち時間 | |
| kyu / dan | 级 / 段 | kyu / dan | 급 / 단 | 級 / 段 | |
| kaya / katsura (board wood) | 榧木 / 桂木 | kaya / katsura | 비자 / 계수나무 | 榧 / 桂 | settings labels |
| strength / rank | 棋力 | strength / level | 기력 | 棋力 | |

## Board areas and opening

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| tengen | 天元 | tengen (centre point) | 천원 | 天元 | |
| star point (4-4 point) | 星位 | star point (4-4) | 화점 | 星 | v5 course: "star point (4-4)" on first use |
| corner | 角 | corner | 귀 | 隅 | |
| side | 边 | side | 변 | 辺 | |
| centre | 中腹 / 中央 | centre | 중앙 | 中央 | |
| first / second line | 一路 / 二路 | first / second line | 1선 / 2선 | 一線 / 二線 | |
| opening (whole board) | 布局 | opening | 포석 | 布石 | |
| joseki | 定式 | joseki | 정석 | 定石 | v5 unit `joseki` |
| hane | 扳 | hane | 젖히기 | ハネ | |
| 3-4 point | 小目 | 3-4 point | 소목 | 小目 | |
| 3-3 point | 三三 | 3-3 point | 삼삼 | 三々 | |
| enclosure | 守角 | enclosure | 굳힘 | シマリ | small knight's / one-space / large knight's: zh 小飞 / 单关 / 大飞守角, ko 날일자 / 한 칸 / 눈목자 굳힘, ja 小ゲイマ / 一間 / 大ゲイマジマリ |
| approach | 挂角 | approach | 걸침 | カカリ | small knight's approach: zh 小飞挂, ko 날일자 걸침, ja 小ゲイマガカリ; one-space high approach: 高一路的单关挂 / one-space high approach / 한 칸 높은 걸침 / 一間高ガカリ |
| small / large knight's move | 小飞 / 大飞 | small / large knight's move | 날일자 / 눈목자 | 小ゲイマ / 大ゲイマ | |
| one-space jump | 单关（一间跳） | one-space jump | 한 칸 뜀 | 一間トビ | |
| extension | 拆（拆二、拆三） | extension (two-space extension) | 벌림 (두 칸 벌림) | ヒラキ（二間ビラキ） | |
| stand two, extend three | 立二拆三 / 立三拆四 | stand two, extend three | 입이전삼 / 입삼전사 | 二立三析 / 三立四析 | proverb; see review list |
| base (of a group) | 根据地 | base | 근거 | 根拠 | |
| pincer | 夹击 | pincer | 협공 | ハサミ | |
| big point | 大场 | big point | 큰 곳 | 大場 | |
| urgent point | 急所 | urgent point | 급한 곳 | 急場 | proverb: 大场不如急所 / urgent points before big points / 큰 곳보다 급한 곳 / 大場より急場 |
| splitting move (on a side) | 分投 | split | 갈라치기 | 割り打ち | |
| 3-3 invasion | 点三三 | 3-3 invasion | 삼삼 침입 | 三々入り | |
| block | 挡 | block | 막기 | オサエ | |
| crawl | 爬 | crawl | 기기 | ハイ | |
| attach (contact play) | 托 / 碰 | attach | 붙이기 | ツケ | 托 for the attachment on the corner side in 托退 |
| draw back | 退 | draw back | 물러서기 | ヒキ | |
| attach and draw back (3-4 joseki) | 托退 | attach and draw back | 붙여 물러서기 | ツケヒキ | ko is descriptive; see review list |
| thickness / outside strength | 厚势 / 外势 | thickness / strength facing outward | 두터움 / 세력 | 厚み / 外勢 | |

## Shape

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| good shape / bad shape | 好形 / 愚形 | good shape / bad shape | 좋은 모양 / 나쁜 모양 (우형) | 好形 / 愚形 | |
| empty triangle | 空三角 | empty triangle | 빈삼각 | 空き三角 | |
| peep | 觑 | peep | 들여다보기 | ノゾキ | |
| head of two stones | 二子头 | head of two stones | 두 점 머리 | 二目の頭 | proverbs: 二子头必扳 / 두 점 머리는 두드려라 / 二目の頭は見ずハネよ |
| ponnuki | 开花 | ponnuki | 빵따냄 | ポン抜き | proverb: 开花三十目 / ponnuki is worth thirty points / 빵따냄 30집 / ポン抜き三十目 |
| one-space jump is never bad (proverb) | 单关无恶手 | the one-space jump is never a bad move | 한 칸 뜀에 악수 없다 | 一間トビに悪手なし | |

## Endgame

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| endgame | 官子 | endgame | 끝내기 | ヨセ | |
| sente / gote | 先手 / 后手 | sente / gote | 선수 / 후수 | 先手 / 後手 | |
| double sente | 双先 | double sente | 양선수 | 両先手 | |
| reverse sente | 逆收 | reverse sente | 역끝내기 | 逆ヨセ | |
| first-line hane and connection | 一路扳粘 | first-line hane and connect | 1선 젖혀 잇기 | 一線のハネツギ | |
| push (along the first line) | 冲 | push | 밀고 들어가기 | 押し込む | descriptive in ko / ja |
| value as a swing ("the difference is N points") | 相差 N 目 | the difference is N points | N집 차이 | N目の差 | the course states values as the difference between Black and White playing first (出入り); it does not use miai counting |
| defensive move inside own territory | 补棋 / 补一手 | defensive move (inside your territory) | 손질 | 手入れ | |
| filling neutral points | 收单官 / 填单官 | filling neutral points | 공배 메우기 | ダメ詰め | |

## Middle game

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| middle game | 中盘 | middle game | 중반 | 中盤 | |
| cutting stones | 断子 | cutting stones | 끊은 돌 | 切り石 | proverb: capture the cutting stones |
| invade / invasion | 打入 | invade | 침입 | 打ち込み | |
| cap | 镇 | cap | 모자 | ボウシ | |
| splitting attack | 分开攻击 | splitting attack | 갈라서 공격하기 | 分断して攻める | descriptive in zh / ko / ja |
| attack from a distance | 从远处攻击 | attack from a distance | 멀리서 공격하기 | 離れて攻める | descriptive |

## Advanced course (v6)

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| advanced (course level) | 高级 | Advanced | 고급 | 上級 | v6 `course.advanced`, the course map heading |
| whole-board judgement | 全局判断 | whole-board judgement | 전체 판단 | 大局観 | v6 unit `adv-judgement`; ko 대세관 is also used |
| drive toward your thickness | 往厚势上赶 | drive it toward your thickness | 두터움 쪽으로 몰기 | 厚みに追い込む | descriptive |
| keep away from thickness | 远离厚势 | keep away from thickness | 두터움에서 떨어지기 | 厚みに近づかない | proverb ja 厚みに近寄るな; the course says it plainly |
| reduction / reduce | 侵消 / 消 | reduction / reduce | 삭감 | 消し / 消す | v6 unit `adv-invasion` |
| shoulder hit | 肩冲 | shoulder hit | 어깨짚기 | カタツキ | |
| cap | 镇 | cap | 모자 | ボウシ | as in the middle-game table |
| make a ko (problem goal) | 打成劫 | make a ko | 패로 만들기 (흑선 패) | コウにする（黒先コウ） | |
| live in seki | 做成双活 | live in seki | 빅으로 살다 | セキで生きる | as in the race table |
| under the stones | 倒脱靴 | under the stones | 석하 | 石の下 | v6 lesson `adv-tesuji-under-stones`; see review list |
| tesuji in combination | 组合手筋 | tesuji in combination | 맥의 조합 | 手筋の組み合わせ | descriptive |
| sacrifice (stones) | 弃子 | sacrifice / give away | 사석 (버리기) | 捨て石 | ko 사석 also means dead stones at counting; the lessons say 돌을 버리다 |
| an extension that also attacks | 拆兼逼 | an extension that is also an attack | 벌림이자 공격 | 開きであり攻め | descriptive |

## Review and analysis

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| game record | 棋谱 | game record | 기보 | 棋譜 | |
| review | 复盘 | review | 복기 | 検討 | |
| move order / sequence | 手顺 | moves / line | 수순 | 手順 | |
| variation | 变化 | variation | 변화 | 変化 | |
| as played (game move) | 实战 | as played | 실전 | 実戦 | |
| mistake | 失误 | mistake | 실수 | 悪手 | |
| good move | 好棋 | good move | 좋은 수 | 好手 | |
| best move | 最好的一手 | best move | 최선의 수 | 最善手 | |
| candidate move | 候选点 | candidate | 후보 수 | 候補手 | |
| win rate | 胜率 | win rate | 승률 | 勝率 | |
| score lead | 领先 N 目 | ahead by N | N집 앞섬 | N目リード | |
| balance / position evaluation | 形势 | balance | 형세 | 形勢 | |
| ownership / territory estimate | 形势判断 | territory estimate | 형세 판단 | 形勢判断 | |
| teaching game mode | 指导棋 | teaching mode | 지도 모드 | 指導碁モード | |
| opening (phase of a game) | 布局 | opening | 포석 | 布石 | v5 `phase.opening`: the same term as the whole-board opening above |
| middle game | 中盘 | middle game | 중반 | 中盤 | v5 `phase.middle` |
| endgame (yose) | 官子 | endgame | 끝내기 | ヨセ | v5 `phase.endgame` |
| blunder (a move losing > 6 points) | 大失误 | blunder | 큰 실수 | 大悪手 | v5; "mistake" (> 2 points) keeps 失误 / 실수 / 悪手 |
| accuracy (moves within 1 point of the best) | 准确率 | accuracy | 정확도 | 正確さ | v5 summary |
| comment (on a move, SGF C[]) | 注释 | comment | 코멘트 | コメント | v5 |
| mark (triangle, square, circle, cross, letter) | 标记（三角、方块、圆圈、叉、字母） | mark (triangle, square, circle, cross, letter) | 표시 (세모, 네모, 동그라미, 가위표, 글자) | マーク（三角、四角、丸、バツ、文字） | v5 SGF markup |
| main line (of a record) | 主线 | main line | 본선 | 本線 | v5; ja 本譜 means the game as played, which a promoted variation is not |
| variation tree | 变化树 | variation tree | 변화도 | 変化図 | v5 |

## Decisions on doubtful terms

- **Bulky five** — zh 刀把五, ja **刀五**, ko **뭉친 오궁**, en bulky five.
  Japanese 中手 lists name the five-point shapes 刀五 and 花五, and 刀五 is the
  bulky five (the same "knife handle" image as Chinese 刀把五). かたまった五目
  was a description, not a term. I know of no Korean name for this shape that
  I am sure of. 오궁도화 is another five-point shape (I believe the crossed
  five), so it must not be used here. 뭉친 오궁 follows the Korean ○궁 pattern
  for eye-space sizes (삼궁, 사궁, 오궁, 육궁) and says plainly what the shape
  is. The course text also describes the shape, so the name never stands
  alone.
- **T-four / pyramid four** — zh 丁四, ja 丁四, ko **삿갓 사궁**, en
  **pyramid four**. 丁四 is standard in both Chinese and Japanese. In English,
  "pyramid four" is the usual name (Sensei's Library); "T-four" is rare, so
  the course now says "four points in a T shape: a pyramid four". For Korean,
  I chose 삿갓 사궁 (the "bamboo hat" shape) over a descriptive T자 사궁 or
  T자 넷, because I believe it is the traditional Korean name. The course
  introduces it as "T자 모양의 네 점, 삿갓 사궁", so it reads correctly even
  for a reader who does not know the term. **A native reviewer should check
  this one.**
- **Straight / bent three (Korean)** — **직삼 / 곡삼** (kept). These are the
  Sino-Korean short forms, the same pattern as the established 직사 / 곡사 /
  귀곡사. 일자 삼궁 and 굽은 삼궁 are descriptive forms that also appear in
  beginner material, and they would be acceptable alternatives.
- **Shared liberties (Korean)** — **공동 공배** (v3 used 함께 쓰는 공배; the
  theme label used bare 공배). The Korean rule of thumb is "수상전은 바깥
  공배부터", so outside liberties are 바깥 공배. Bare 공배 also means a neutral
  point at the end of the game (the course uses it that way in Unit 8), so the
  shared liberties in a race need a qualifier. 공동 공배 is short, and the
  course defines it once. 안 공배 would be a possible alternative.
- **Shared liberties (Japanese)** — **内ダメ** with 外ダメ, the standard pair.
  共通のダメ was understandable but was not the term.
- **Shortage of liberties** — zh **气紧** (紧气 is the act of filling
  liberties, and the course uses it that way), ko **자충**, ja ダメヅマリ.
- **Connect-and-die (Korean)** — **촉촉수**, the established term. v3 used a
  description (자충으로 잡힘).
- **Net (Chinese)** — **枷吃**. The theme label read 枪口 ("muzzle"), which is
  not the name of this technique. The course already used 枷吃.
- **Problem prompts** — ko **흑선 / 백선** and ja **黒先 / 白先**, matching the
  way problem books label problems. zh already used 黑先.

## Review status

The terminology and every string in `messages.js` and `course.js` were reviewed
by a language model (Claude), not by native speakers. It checked them against
published terminology as it knows it (Nihon Ki-in usage, Korean Go media,
mainland Chinese teaching material, and English Go references). It did not
consult sources live during the review. **A human native-speaker review for
each language is still recommended before release**, especially for Korean.

The items I am least sure about:

1. ko **삿갓 사궁** (pyramid four). If it is not current usage, use
   **T자 사궁**.
2. ko **뭉친 오궁** (bulky five). It is descriptive, and an established name
   may exist.
3. ko **공동 공배** (shared liberties). 안 공배, or bare 공배 in context, may be
   more usual.
4. zh **气紧** as the theme name for shortage of liberties. 紧气 is also seen
   used loosely in this sense.
5. ko greetings on the Today screen (좋은 아침입니다 / 안녕하세요 / 좋은 저녁
   되세요). They are natural, but a Korean UI writer may prefer other wording.
6. ja: the course keeps 呼吸点 (beginner style) for liberty and uses ダメ
   inside capturing races; the problem bank uses ダメ throughout. A Japanese
   reviewer may prefer ダメ everywhere.
7. ko 오궁도화 (crossed five) and 판육궁 (rectangular six) in the problem
   bank. I kept them as the author wrote them, but I have not confirmed them.
8. v5 intermediate course (all model-written, none reviewed by a native
   speaker): ko **입이전삼 / 입삼전사** as the Korean form of the
   extension proverb; ko **붙여 물러서기** for 托退 / ツケヒキ (descriptive;
   an established Korean name may exist); ko **두 점 머리는 두드려라** and
   **빵따냄 30집** as proverbs; zh **单关无恶手**; zh **分开攻击** and the
   descriptive ko / ja names for the splitting attack; ja **押し込む** and ko
   **밀고 들어가기** for the first-line push.
9. v4: the big-eye race theme — ko **큰 눈 대 작은 눈** and ja
   **大きい眼と小さい眼** are descriptive; an established short name may exist
   (zh 大眼杀小眼 is the standard proverb). Also ko **완생** / ja **完全な生き**
   for independent life, ko **2선의 일곱 점** / ja **二線の七子**, and the
   collection name ko **사활의 기본형** / ja **死活の基本形** / zh **基本死活形**.
9. v5 rules: ko **계자 / 계지** and ja **計子 / 計地** for area / territory
   scoring. zh 数子 / 数目 are standard; the ko and ja pairs are the
   Sino-Korean / Sino-Japanese readings of the same idea and appear in rules
   discussions, but everyday writing more often says "중국식 계산 / 일본식
   계산" or "中国ルールの数え方 / 日本ルールの数え方". The ruleset notes
   (`rules.*Note`) describe the method in plain words, so the label never
   stands alone. Also ja **計算** as the title of an area count, ja
   **置き石の補正** and ko **치석 보상** for the Chinese handicap
   compensation, and zh **让子补偿**.
10. v5: ko **본선** / ja **本線** for the main line of a record (Go software
   varies; ko 주 변화 / ja 本譜 are possible), ko **변화도** / ja **変化図**
   for the variation tree, ja **大悪手** and ko **큰 실수** for blunder, and
   ja **正確さ** for accuracy (一致率 is used for "agrees with the AI", which
   is a different measure).
11. v5: the 2-1 point — ja **二の一** is the usual name (二の一の急所); zh
   **二一路** and ko **2·1의 급소** (also written 2의 1) follow the same pattern,
   but a native reviewer should confirm them.
12. v6 advanced course (model-written, not reviewed by a native speaker):
   ko **석하** for under the stones (석하의 맥 is also seen; a Korean
   reviewer should confirm 석하 is current usage); zh **倒脱靴** is the
   usual name of the shape where two (or four) stones are given up, which is
   what both lessons show; ko **어깨짚기** / ja **カタツキ** for the shoulder
   hit; ja **大局観** and ko **전체 판단** for whole-board judgement; zh
   **拆兼逼**; ko **고급** / ja **上級** as the level name.
