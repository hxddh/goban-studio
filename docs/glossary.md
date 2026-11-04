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
| byo-yomi | 读秒 | byo-yomi | 초읽기 | 秒読み | UI shows "10 min + 3×30 s" in every language |
| main time | 基本用时 | main time | 제한 시간 | 持ち時間 | |
| kyu / dan | 级 / 段 | kyu / dan | 급 / 단 | 級 / 段 | |
| kaya / katsura (board wood) | 榧木 / 桂木 | kaya / katsura | 비자 / 계수나무 | 榧 / 桂 | settings labels |
| strength / rank | 棋力 | strength / level | 기력 | 棋力 | |

## Board areas and opening

| Concept | zh | en | ko | ja | Notes |
|---|---|---|---|---|---|
| tengen | 天元 | tengen (centre point) | 천원 | 天元 | |
| star point | 星位 | star point | 화점 | 星 | not used in v3 strings |
| corner | 角 | corner | 귀 | 隅 | |
| side | 边 | side | 변 | 辺 | |
| centre | 中腹 / 中央 | centre | 중앙 | 中央 | |
| first / second line | 一路 / 二路 | first / second line | 1선 / 2선 | 一線 / 二線 | |
| opening (whole board) | 布局 | opening | 포석 | 布石 | |
| joseki | 定式 | joseki | 정석 | 定石 | not used in v3 strings |
| hane | 扳 | hane | 젖히기 | ハネ | |

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
8. v4: the big-eye race theme — ko **큰 눈 대 작은 눈** and ja
   **大きい眼と小さい眼** are descriptive; an established short name may exist
   (zh 大眼杀小眼 is the standard proverb). Also ko **완생** / ja **完全な生き**
   for independent life, ko **2선의 일곱 점** / ja **二線の七子**, and the
   collection name ko **사활의 기본형** / ja **死活の基本形** / zh **基本死活形**.
