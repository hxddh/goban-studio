/**
 * Forty professional opening positions. Each card is the first eight moves
 * of a real game, replayed through the same rules as free play. They are
 * opening drills, not a claim to a complete joseki dictionary. Source:
 * https://homepages.cwi.nl/~aeb/go/games/ (public-domain collection).
 */
const RAW_OPENINGS = [
  {
    "id": "pro-01-shusaku-126-sgf",
    "title": {
      "zh": "职业布局：安田秀策 对 井上幻庵因硕",
      "en": "Pro opening: Yasuda Shusaku vs Inoue Gennan Inseki",
      "ko": "프로 포석: 야스다 슈사쿠 대 이노우에 겐난 인세키",
      "ja": "プロ布石：安田秀策 対 井上幻庵因碩"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。这盘历史对局，1846-09-11,14,15。你执黑。",
      "en": "Replay the first eight moves from this historic game. 1846-09-11,14,15. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 이 역사적인 대국, 1846-09-11,14,15. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。この歴史的な一局、1846-09-11,14,15。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 13,
        "y": 2
      },
      {
        "c": 1,
        "x": 2,
        "y": 15
      },
      {
        "c": -1,
        "x": 2,
        "y": 5
      },
      {
        "c": 1,
        "x": 4,
        "y": 15
      },
      {
        "c": -1,
        "x": 15,
        "y": 14
      }
    ],
    "source": {
      "event": "",
      "date": "1846-09-11,14,15",
      "black": "Yasuda Shusaku",
      "white": "Inoue Gennan Inseki",
      "result": "B+2",
      "path": "Shusaku/126.sgf"
    }
  },
  {
    "id": "pro-02-hoensha-d19-7-sgf",
    "title": {
      "zh": "职业布局：赤星因彻 对 本因坊丈和",
      "en": "Pro opening: Akaboshi Intetsu vs Honinbo Jowa",
      "ko": "프로 포석: 아카보시 인테쓰 대 혼인보 조와",
      "ja": "プロ布石：赤星因徹 対 本因坊丈和"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。Blood-vomiting game，1835-08-13,15,18,21。你执黑。",
      "en": "Replay the first eight moves from Blood-vomiting game. 1835-08-13,15,18,21. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. Blood-vomiting game, 1835-08-13,15,18,21. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。Blood-vomiting game、1835-08-13,15,18,21。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 2,
        "y": 15
      },
      {
        "c": -1,
        "x": 14,
        "y": 16
      },
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 4,
        "y": 3
      },
      {
        "c": 1,
        "x": 13,
        "y": 2
      },
      {
        "c": -1,
        "x": 4,
        "y": 16
      },
      {
        "c": 1,
        "x": 15,
        "y": 14
      },
      {
        "c": -1,
        "x": 15,
        "y": 10
      }
    ],
    "source": {
      "event": "Blood-vomiting game",
      "date": "1835-08-13,15,18,21",
      "black": "Akaboshi Intetsu",
      "white": "Honinbo Jowa",
      "result": "W+R",
      "path": "Hoensha/D19-7.sgf"
    }
  },
  {
    "id": "pro-03-dosaku-071-sgf",
    "title": {
      "zh": "职业布局：安井知哲 对 本因坊道策",
      "en": "Pro opening: Yasui Chitetsu vs Honinbo Dosaku",
      "ko": "프로 포석: 야스이 지테쓰 대 혼인보 도사쿠",
      "ja": "プロ布石：安井知哲 対 本因坊道策"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。这盘历史对局，1674-08-30。你执黑。",
      "en": "Replay the first eight moves from this historic game. 1674-08-30. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 이 역사적인 대국, 1674-08-30. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。この歴史的な一局、1674-08-30。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 2,
        "y": 15
      },
      {
        "c": -1,
        "x": 4,
        "y": 16
      },
      {
        "c": 1,
        "x": 7,
        "y": 16
      },
      {
        "c": -1,
        "x": 15,
        "y": 14
      },
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 13,
        "y": 2
      },
      {
        "c": 1,
        "x": 3,
        "y": 2
      },
      {
        "c": -1,
        "x": 2,
        "y": 4
      }
    ],
    "source": {
      "event": "",
      "date": "1674-08-30",
      "black": "Yasui Chitetsu",
      "white": "Honinbo Dosaku",
      "result": "W+5",
      "path": "Dosaku/071.sgf"
    }
  },
  {
    "id": "pro-04-shusai-shusai-681-sgf",
    "title": {
      "zh": "职业布局：吴清源 对 本因坊秀哉",
      "en": "Pro opening: Go Seigen vs Honinbo Shusai",
      "ko": "프로 포석: 오청원 대 혼인보 슈사이",
      "ja": "プロ布石：呉清源 対 本因坊秀哉"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。这盘历史对局，1933-10-16..1934-01-29。你执黑。",
      "en": "Replay the first eight moves from this historic game. 1933-10-16..1934-01-29. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 이 역사적인 대국, 1933-10-16..1934-01-29. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。この歴史的な一局、1933-10-16..1934-01-29。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 2
      },
      {
        "c": -1,
        "x": 2,
        "y": 3
      },
      {
        "c": 1,
        "x": 3,
        "y": 15
      },
      {
        "c": -1,
        "x": 14,
        "y": 16
      },
      {
        "c": 1,
        "x": 8,
        "y": 9
      },
      {
        "c": -1,
        "x": 14,
        "y": 3
      },
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 14,
        "y": 4
      }
    ],
    "source": {
      "event": "",
      "date": "1933-10-16..1934-01-29",
      "black": "Go Seigen",
      "white": "Honinbo Shusai",
      "result": "W+2",
      "path": "Shusai/Shusai-681.sgf"
    }
  },
  {
    "id": "pro-05-go-seigen-1953-03-11-sgf",
    "title": {
      "zh": "职业布局：吴清源 对 藤泽库之助",
      "en": "Pro opening: Go Seigen vs Fujisawa Kuranosuke",
      "ko": "프로 포석: 오청원 대 후지사와 구라노스케",
      "ja": "プロ布石：呉清源 対 藤沢庫之助"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。Third 10-game match Go versus Fujisawa，1953-03-11..13。你执黑。",
      "en": "Replay the first eight moves from Third 10-game match Go versus Fujisawa. 1953-03-11..13. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. Third 10-game match Go versus Fujisawa, 1953-03-11..13. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。Third 10-game match Go versus Fujisawa、1953-03-11..13。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 2,
        "y": 3
      },
      {
        "c": 1,
        "x": 14,
        "y": 15
      },
      {
        "c": -1,
        "x": 2,
        "y": 15
      },
      {
        "c": 1,
        "x": 4,
        "y": 15
      },
      {
        "c": -1,
        "x": 4,
        "y": 16
      },
      {
        "c": 1,
        "x": 5,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      }
    ],
    "source": {
      "event": "Third 10-game match Go versus Fujisawa",
      "date": "1953-03-11..13",
      "black": "Go Seigen",
      "white": "Fujisawa Kuranosuke",
      "result": "B+R",
      "path": "Go_Seigen/1953-03-11.sgf"
    }
  },
  {
    "id": "pro-06-probest10-05-5-sgf",
    "title": {
      "zh": "职业布局：坂田荣男 对 吴清源",
      "en": "Pro opening: Sakata Eio vs Go Seigen",
      "ko": "프로 포석: 사카타 에이오 대 오청원",
      "ja": "プロ布石：坂田栄男 対 呉清源"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。5th Pro Best Ten，1968-02-29。你执黑。",
      "en": "Replay the first eight moves from 5th Pro Best Ten. 1968-02-29. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 5th Pro Best Ten, 1968-02-29. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。5th Pro Best Ten、1968-02-29。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 2,
        "y": 16
      },
      {
        "c": 1,
        "x": 13,
        "y": 2
      },
      {
        "c": -1,
        "x": 14,
        "y": 14
      },
      {
        "c": 1,
        "x": 15,
        "y": 14
      },
      {
        "c": -1,
        "x": 15,
        "y": 13
      }
    ],
    "source": {
      "event": "5th Pro Best Ten",
      "date": "1968-02-29",
      "black": "Sakata Eio",
      "white": "Go Seigen",
      "result": "B+5.5",
      "path": "ProBest10/05/5.sgf"
    }
  },
  {
    "id": "pro-07-hayago-meijin-03-10-sgf",
    "title": {
      "zh": "职业布局：高川格 对 藤泽秀行",
      "en": "Pro opening: Takagawa Shukaku vs Fujisawa Shuko",
      "ko": "프로 포석: 다카가와 슈카쿠 대 후지사와 슈코",
      "ja": "プロ布石：高川格 対 藤沢秀行"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。3rd Hayago Meijin，1958-09-25。你执黑。",
      "en": "Replay the first eight moves from 3rd Hayago Meijin. 1958-09-25. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 3rd Hayago Meijin, 1958-09-25. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。3rd Hayago Meijin、1958-09-25。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 16
      },
      {
        "c": 1,
        "x": 3,
        "y": 3
      },
      {
        "c": -1,
        "x": 15,
        "y": 15
      },
      {
        "c": 1,
        "x": 3,
        "y": 14
      },
      {
        "c": -1,
        "x": 2,
        "y": 14
      },
      {
        "c": 1,
        "x": 2,
        "y": 13
      },
      {
        "c": -1,
        "x": 2,
        "y": 15
      }
    ],
    "source": {
      "event": "3rd Hayago Meijin",
      "date": "1958-09-25",
      "black": "Takagawa Shukaku",
      "white": "Fujisawa Shuko",
      "result": "B+0.5",
      "path": "Hayago_Meijin/03/10.sgf"
    }
  },
  {
    "id": "pro-08-jaa-02-1-sgf",
    "title": {
      "zh": "职业布局：赵治勋 对 小林光一",
      "en": "Pro opening: Cho Chikun vs Kobayashi Koichi",
      "ko": "프로 포석: 조치훈 대 고바야시 고이치",
      "ja": "プロ布石：趙治勲 対 小林光一"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。2nd JAA Cup，1979-08-25。你执黑。",
      "en": "Replay the first eight moves from 2nd JAA Cup. 1979-08-25. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 2nd JAA Cup, 1979-08-25. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。2nd JAA Cup、1979-08-25。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 2
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 15,
        "y": 15
      },
      {
        "c": -1,
        "x": 13,
        "y": 16
      },
      {
        "c": 1,
        "x": 2,
        "y": 3
      },
      {
        "c": -1,
        "x": 14,
        "y": 14
      },
      {
        "c": 1,
        "x": 15,
        "y": 14
      },
      {
        "c": -1,
        "x": 14,
        "y": 13
      }
    ],
    "source": {
      "event": "2nd JAA Cup",
      "date": "1979-08-25",
      "black": "Cho Chikun",
      "white": "Kobayashi Koichi",
      "result": "W+2.5",
      "path": "JAA/02/1.sgf"
    }
  },
  {
    "id": "pro-09-fujitsu-09-23-sgf",
    "title": {
      "zh": "职业布局：李昌镐 对 马晓春",
      "en": "Pro opening: Lee Changho vs Ma Xiaochun",
      "ko": "프로 포석: 이창호 대 마샤오춘",
      "ja": "プロ布石：李昌鎬 対 馬暁春"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。9th Fujitsu Cup，1996-08-03。你执黑。",
      "en": "Replay the first eight moves from 9th Fujitsu Cup. 1996-08-03. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 9th Fujitsu Cup, 1996-08-03. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。9th Fujitsu Cup、1996-08-03。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 14,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 5,
        "y": 16
      },
      {
        "c": -1,
        "x": 7,
        "y": 16
      },
      {
        "c": 1,
        "x": 5,
        "y": 14
      },
      {
        "c": -1,
        "x": 2,
        "y": 13
      }
    ],
    "source": {
      "event": "9th Fujitsu Cup",
      "date": "1996-08-03",
      "black": "Lee Changho",
      "white": "Ma Xiaochun",
      "result": "B+R",
      "path": "Fujitsu/09/23.sgf"
    }
  },
  {
    "id": "pro-10-bc-03-f3-sgf",
    "title": {
      "zh": "职业布局：李世石 对 古力",
      "en": "Pro opening: Lee Sedol vs Gu Li",
      "ko": "프로 포석: 이세돌 대 구리",
      "ja": "プロ布石：李世石 対 古力"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。3rd BC Card Cup Final，2011-04-26。你执黑。",
      "en": "Replay the first eight moves from 3rd BC Card Cup Final. 2011-04-26. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 3rd BC Card Cup Final, 2011-04-26. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。3rd BC Card Cup Final、2011-04-26。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 14,
        "y": 15
      },
      {
        "c": 1,
        "x": 3,
        "y": 2
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 2,
        "y": 13
      },
      {
        "c": -1,
        "x": 5,
        "y": 15
      },
      {
        "c": 1,
        "x": 2,
        "y": 9
      },
      {
        "c": -1,
        "x": 3,
        "y": 4
      }
    ],
    "source": {
      "event": "3rd BC Card Cup Final",
      "date": "2011-04-26",
      "black": "Lee Sedol",
      "white": "Gu Li",
      "result": "B+0.5",
      "path": "BC/03/F3.sgf"
    }
  },
  {
    "id": "pro-11-alphago-leesedol-4-sgf",
    "title": {
      "zh": "职业布局：阿尔法围棋 对 李世石",
      "en": "Pro opening: AlphaGo vs Lee Sedol",
      "ko": "프로 포석: 알파고 대 이세돌",
      "ja": "プロ布石：AlphaGo 対 李世石"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。Google DeepMind Challenge Match，2016-03-13。你执黑。",
      "en": "Replay the first eight moves from Google DeepMind Challenge Match. 2016-03-13. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. Google DeepMind Challenge Match, 2016-03-13. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。Google DeepMind Challenge Match、2016-03-13。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 2,
        "y": 3
      },
      {
        "c": -1,
        "x": 15,
        "y": 15
      },
      {
        "c": 1,
        "x": 13,
        "y": 15
      },
      {
        "c": -1,
        "x": 13,
        "y": 16
      },
      {
        "c": 1,
        "x": 12,
        "y": 16
      },
      {
        "c": -1,
        "x": 14,
        "y": 16
      }
    ],
    "source": {
      "event": "Google DeepMind Challenge Match",
      "date": "2016-03-13",
      "black": "AlphaGo",
      "white": "Lee Sedol",
      "result": "W+R",
      "path": "AlphaGo/LeeSedol/4.sgf"
    }
  },
  {
    "id": "pro-12-alphago-may2017-1-sgf",
    "title": {
      "zh": "职业布局：柯洁 对 阿尔法围棋",
      "en": "Pro opening: Ke Jie vs AlphaGo",
      "ko": "프로 포석: 커제 대 알파고",
      "ja": "プロ布石：柯潔 対 AlphaGo"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。Future of Go Summit，2017-05-23。你执黑。",
      "en": "Replay the first eight moves from Future of Go Summit. 2017-05-23. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. Future of Go Summit, 2017-05-23. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。Future of Go Summit、2017-05-23。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 14,
        "y": 15
      },
      {
        "c": 1,
        "x": 2,
        "y": 2
      },
      {
        "c": -1,
        "x": 2,
        "y": 15
      },
      {
        "c": 1,
        "x": 12,
        "y": 2
      },
      {
        "c": -1,
        "x": 5,
        "y": 15
      },
      {
        "c": 1,
        "x": 15,
        "y": 16
      },
      {
        "c": -1,
        "x": 14,
        "y": 16
      }
    ],
    "source": {
      "event": "Future of Go Summit",
      "date": "2017-05-23",
      "black": "Ke Jie",
      "white": "AlphaGo",
      "result": "W+0.5",
      "path": "AlphaGo/May2017/1.sgf"
    }
  },
  {
    "id": "pro-13-samsung-26-f3-sgf",
    "title": {
      "zh": "职业布局：申真谞 对 朴廷桓",
      "en": "Pro opening: Shin Jinseo vs Park Junghwan",
      "ko": "프로 포석: 신진서 대 박정환",
      "ja": "プロ布石：申眞諝 対 朴廷桓"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。26th Samsung Cup Final，2021-11-03。你执黑。",
      "en": "Replay the first eight moves from 26th Samsung Cup Final. 2021-11-03. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 26th Samsung Cup Final, 2021-11-03. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。26th Samsung Cup Final、2021-11-03。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 14,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 2,
        "y": 16
      },
      {
        "c": -1,
        "x": 3,
        "y": 16
      },
      {
        "c": 1,
        "x": 2,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 14
      }
    ],
    "source": {
      "event": "26th Samsung Cup Final",
      "date": "2021-11-03",
      "black": "Shin Jinseo",
      "white": "Park Junghwan",
      "result": "W+R",
      "path": "Samsung/26/F3.sgf"
    }
  },
  {
    "id": "pro-14-ryusei-18-t15-sgf",
    "title": {
      "zh": "职业布局：井山裕太 对 张栩",
      "en": "Pro opening: Iyama Yuta vs Cho U",
      "ko": "프로 포석: 이야마 유타 대 장쉬",
      "ja": "プロ布石：井山裕太 対 張栩"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。18th Ryusei，2009-08-20。你执黑。",
      "en": "Replay the first eight moves from 18th Ryusei. 2009-08-20. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 18th Ryusei, 2009-08-20. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。18th Ryusei、2009-08-20。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 14,
        "y": 15
      },
      {
        "c": 1,
        "x": 3,
        "y": 2
      },
      {
        "c": -1,
        "x": 2,
        "y": 15
      },
      {
        "c": 1,
        "x": 4,
        "y": 16
      },
      {
        "c": -1,
        "x": 13,
        "y": 3
      },
      {
        "c": 1,
        "x": 13,
        "y": 2
      },
      {
        "c": -1,
        "x": 14,
        "y": 3
      }
    ],
    "source": {
      "event": "18th Ryusei",
      "date": "2009-08-20",
      "black": "Iyama Yuta",
      "white": "Cho U",
      "result": "B+3.5",
      "path": "Ryusei/18/T15.sgf"
    }
  },
  {
    "id": "pro-15-fujitsu-01-9-sgf",
    "title": {
      "zh": "职业布局：赵治勋 对 林海峰",
      "en": "Pro opening: Cho Chikun vs Rin Kaiho",
      "ko": "프로 포석: 조치훈 대 린카이호",
      "ja": "プロ布石：趙治勲 対 林海峰"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。1st Fujitsu Cup，1988-06-04。你执黑。",
      "en": "Replay the first eight moves from 1st Fujitsu Cup. 1988-06-04. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 1st Fujitsu Cup, 1988-06-04. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。1st Fujitsu Cup、1988-06-04。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 2,
        "y": 15
      },
      {
        "c": 1,
        "x": 4,
        "y": 16
      },
      {
        "c": -1,
        "x": 15,
        "y": 14
      },
      {
        "c": 1,
        "x": 14,
        "y": 11
      },
      {
        "c": -1,
        "x": 10,
        "y": 16
      }
    ],
    "source": {
      "event": "1st Fujitsu Cup",
      "date": "1988-06-04",
      "black": "Cho Chikun",
      "white": "Rin Kaiho",
      "result": "W+R",
      "path": "Fujitsu/01/9.sgf"
    }
  },
  {
    "id": "pro-16-judan-title-jud-1969-3-sgf",
    "title": {
      "zh": "职业布局：坂田荣男 对 大竹英雄",
      "en": "Pro opening: Sakata Eio vs Otake Hideo",
      "ko": "프로 포석: 사카타 에이오 대 오타케 히데오",
      "ja": "プロ布石：坂田栄男 対 大竹英雄"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。8th Judan Title，1969-12-24,25。你执黑。",
      "en": "Replay the first eight moves from 8th Judan Title. 1969-12-24,25. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 8th Judan Title, 1969-12-24,25. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。8th Judan Title、1969-12-24,25。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 4
      },
      {
        "c": 1,
        "x": 14,
        "y": 15
      },
      {
        "c": -1,
        "x": 4,
        "y": 16
      },
      {
        "c": 1,
        "x": 13,
        "y": 3
      },
      {
        "c": -1,
        "x": 15,
        "y": 9
      },
      {
        "c": 1,
        "x": 2,
        "y": 15
      },
      {
        "c": -1,
        "x": 8,
        "y": 16
      }
    ],
    "source": {
      "event": "8th Judan Title",
      "date": "1969-12-24,25",
      "black": "Sakata Eio",
      "white": "Otake Hideo",
      "result": "W+R",
      "path": "Judan/Title/Jud-1969-3.sgf"
    }
  },
  {
    "id": "pro-17-ing-01-14-sgf",
    "title": {
      "zh": "职业布局：聂卫平 对 藤泽秀行",
      "en": "Pro opening: Nie Weiping vs Fujisawa Hideyuki",
      "ko": "프로 포석: 녜웨이핑 대 후지사와 히데유키",
      "ja": "プロ布石：聶衛平 対 藤沢秀行"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。1st Ing Cup，1988-11-20。你执黑。",
      "en": "Replay the first eight moves from 1st Ing Cup. 1988-11-20. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 1st Ing Cup, 1988-11-20. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。1st Ing Cup、1988-11-20。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 15,
        "y": 14
      },
      {
        "c": -1,
        "x": 3,
        "y": 9
      },
      {
        "c": 1,
        "x": 5,
        "y": 16
      },
      {
        "c": -1,
        "x": 3,
        "y": 13
      }
    ],
    "source": {
      "event": "1st Ing Cup",
      "date": "1988-11-20",
      "black": "Nie Weiping",
      "white": "Fujisawa Hideyuki",
      "result": "B+1",
      "path": "Ing/01/14.sgf"
    }
  },
  {
    "id": "pro-18-people-cho-hunhyun-1982-11-19-sgf",
    "title": {
      "zh": "职业布局：曹薰铉 对 徐奉洙",
      "en": "Pro opening: Cho Hunhyun vs Seo Bongsoo",
      "ko": "프로 포석: 조훈현 대 서봉수",
      "ja": "プロ布石：曹薫鉉 対 徐奉洙"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。26th Kuksu Title，1982-11-19。你执黑。",
      "en": "Replay the first eight moves from 26th Kuksu Title. 1982-11-19. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 26th Kuksu Title, 1982-11-19. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。26th Kuksu Title、1982-11-19。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 13,
        "y": 2
      },
      {
        "c": 1,
        "x": 2,
        "y": 15
      },
      {
        "c": -1,
        "x": 14,
        "y": 14
      },
      {
        "c": 1,
        "x": 2,
        "y": 4
      },
      {
        "c": -1,
        "x": 3,
        "y": 6
      }
    ],
    "source": {
      "event": "26th Kuksu Title",
      "date": "1982-11-19",
      "black": "Cho Hunhyun",
      "white": "Seo Bongsoo",
      "result": "B+R",
      "path": "people/Cho_Hunhyun/1982-11-19.sgf"
    }
  },
  {
    "id": "pro-19-asiantv-08-f-sgf",
    "title": {
      "zh": "职业布局：李昌镐 对 刘昌赫",
      "en": "Pro opening: Lee Changho vs Yoo Changhyuk",
      "ko": "프로 포석: 이창호 대 유창혁",
      "ja": "プロ布石：李昌鎬 対 劉昌赫"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。8th Asian TV Cup，1996-05-04。你执黑。",
      "en": "Replay the first eight moves from 8th Asian TV Cup. 1996-05-04. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 8th Asian TV Cup, 1996-05-04. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。8th Asian TV Cup、1996-05-04。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 3,
        "y": 2
      },
      {
        "c": -1,
        "x": 2,
        "y": 4
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 13,
        "y": 3
      },
      {
        "c": 1,
        "x": 3,
        "y": 7
      },
      {
        "c": -1,
        "x": 4,
        "y": 6
      }
    ],
    "source": {
      "event": "8th Asian TV Cup",
      "date": "1996-05-04",
      "black": "Lee Changho",
      "white": "Yoo Changhyuk",
      "result": "B+R",
      "path": "AsianTV/08/F.sgf"
    }
  },
  {
    "id": "pro-20-bailing-02-61-sgf",
    "title": {
      "zh": "职业布局：柯洁 对 朴廷桓",
      "en": "Pro opening: Ke Jie vs Park Junghwan",
      "ko": "프로 포석: 커제 대 박정환",
      "ja": "プロ布石：柯潔 対 朴廷桓"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。2nd Bailing Cup，2014-09-18。你执黑。",
      "en": "Replay the first eight moves from 2nd Bailing Cup. 2014-09-18. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 2nd Bailing Cup, 2014-09-18. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。2nd Bailing Cup、2014-09-18。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 3,
        "y": 16
      },
      {
        "c": 1,
        "x": 13,
        "y": 2
      },
      {
        "c": -1,
        "x": 14,
        "y": 14
      },
      {
        "c": 1,
        "x": 15,
        "y": 14
      },
      {
        "c": -1,
        "x": 15,
        "y": 13
      }
    ],
    "source": {
      "event": "2nd Bailing Cup",
      "date": "2014-09-18",
      "black": "Ke Jie",
      "white": "Park Junghwan",
      "result": "B+R",
      "path": "Bailing/02/61.sgf"
    }
  },
  {
    "id": "pro-21-gosei-title-gos-2012-1-sgf",
    "title": {
      "zh": "职业布局：井山裕太 对 Hane Naoki",
      "en": "Pro opening: Iyama Yuta vs Hane Naoki",
      "ko": "프로 포석: 이야마 유타 대 Hane Naoki",
      "ja": "プロ布石：井山裕太 対 Hane Naoki"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。37th Gosei Title，2012-06-28。你执黑。",
      "en": "Replay the first eight moves from 37th Gosei Title. 2012-06-28. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 37th Gosei Title, 2012-06-28. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。37th Gosei Title、2012-06-28。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 2,
        "y": 15
      },
      {
        "c": 1,
        "x": 4,
        "y": 15
      },
      {
        "c": -1,
        "x": 14,
        "y": 14
      },
      {
        "c": 1,
        "x": 13,
        "y": 14
      },
      {
        "c": -1,
        "x": 15,
        "y": 16
      }
    ],
    "source": {
      "event": "37th Gosei Title",
      "date": "2012-06-28",
      "black": "Iyama Yuta",
      "white": "Hane Naoki",
      "result": "B+R",
      "path": "Gosei/Title/Gos-2012-1.sgf"
    }
  },
  {
    "id": "pro-22-judan-title-jud-2011-5-sgf",
    "title": {
      "zh": "职业布局：井山裕太 对 张栩",
      "en": "Pro opening: Iyama Yuta vs Cho U",
      "ko": "프로 포석: 이야마 유타 대 장쉬",
      "ja": "プロ布石：井山裕太 対 張栩"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。49th Judan Title，2011-04-29。你执黑。",
      "en": "Replay the first eight moves from 49th Judan Title. 2011-04-29. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 49th Judan Title, 2011-04-29. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。49th Judan Title、2011-04-29。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 13,
        "y": 2
      },
      {
        "c": -1,
        "x": 14,
        "y": 14
      },
      {
        "c": 1,
        "x": 15,
        "y": 14
      },
      {
        "c": -1,
        "x": 14,
        "y": 15
      }
    ],
    "source": {
      "event": "49th Judan Title",
      "date": "2011-04-29",
      "black": "Iyama Yuta",
      "white": "Cho U",
      "result": "B+R",
      "path": "Judan/Title/Jud-2011-5.sgf"
    }
  },
  {
    "id": "pro-23-asiantv-27-f-sgf",
    "title": {
      "zh": "职业布局：李世石 对 朴廷桓",
      "en": "Pro opening: Lee Sedol vs Park Junghwan",
      "ko": "프로 포석: 이세돌 대 박정환",
      "ja": "プロ布石：李世石 対 朴廷桓"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。27th Asian TV Cup，2015-08-28。你执黑。",
      "en": "Replay the first eight moves from 27th Asian TV Cup. 2015-08-28. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 27th Asian TV Cup, 2015-08-28. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。27th Asian TV Cup、2015-08-28。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 5,
        "y": 16
      },
      {
        "c": -1,
        "x": 2,
        "y": 13
      },
      {
        "c": 1,
        "x": 14,
        "y": 10
      },
      {
        "c": -1,
        "x": 12,
        "y": 2
      }
    ],
    "source": {
      "event": "27th Asian TV Cup",
      "date": "2015-08-28",
      "black": "Lee Sedol",
      "white": "Park Junghwan",
      "result": "B+R",
      "path": "AsianTV/27/F.sgf"
    }
  },
  {
    "id": "pro-24-bailing-03-f3-sgf",
    "title": {
      "zh": "职业布局：Chen Yaoye 对 柯洁",
      "en": "Pro opening: Chen Yaoye vs Ke Jie",
      "ko": "프로 포석: Chen Yaoye 대 커제",
      "ja": "プロ布石：Chen Yaoye 対 柯潔"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。3rd Bailing Cup，2016-12-14。你执黑。",
      "en": "Replay the first eight moves from 3rd Bailing Cup. 2016-12-14. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 3rd Bailing Cup, 2016-12-14. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。3rd Bailing Cup、2016-12-14。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 15,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 16
      },
      {
        "c": 1,
        "x": 2,
        "y": 14
      },
      {
        "c": -1,
        "x": 13,
        "y": 16
      },
      {
        "c": 1,
        "x": 11,
        "y": 15
      },
      {
        "c": -1,
        "x": 2,
        "y": 10
      }
    ],
    "source": {
      "event": "3rd Bailing Cup",
      "date": "2016-12-14",
      "black": "Chen Yaoye",
      "white": "Ke Jie",
      "result": "W+R",
      "path": "Bailing/03/F3.sgf"
    }
  },
  {
    "id": "pro-25-omeijin-01-10-sgf",
    "title": {
      "zh": "职业布局：Hashimoto Utaro 对 吴清源",
      "en": "Pro opening: Hashimoto Utaro vs Go Seigen",
      "ko": "프로 포석: Hashimoto Utaro 대 오청원",
      "ja": "プロ布石：Hashimoto Utaro 対 呉清源"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。1st Meijin Tournament，1962-06-27,28。你执黑。",
      "en": "Replay the first eight moves from 1st Meijin Tournament. 1962-06-27,28. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 1st Meijin Tournament, 1962-06-27,28. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。1st Meijin Tournament、1962-06-27,28。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 8,
        "y": 9
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 4
      },
      {
        "c": 1,
        "x": 14,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 14,
        "y": 9
      },
      {
        "c": -1,
        "x": 12,
        "y": 16
      }
    ],
    "source": {
      "event": "1st Meijin Tournament",
      "date": "1962-06-27,28",
      "black": "Hashimoto Utaro",
      "white": "Go Seigen",
      "result": "W+7",
      "path": "OMeijin/01/10.sgf"
    }
  },
  {
    "id": "pro-26-honinbo-01-t09-sgf",
    "title": {
      "zh": "职业布局：Hashimoto Utaro 对 吴清源",
      "en": "Pro opening: Hashimoto Utaro vs Go Seigen",
      "ko": "프로 포석: Hashimoto Utaro 대 오청원",
      "ja": "プロ布石：Hashimoto Utaro 対 呉清源"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。1st Honinbo，1939-07-16,17。你执黑。",
      "en": "Replay the first eight moves from 1st Honinbo. 1939-07-16,17. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 1st Honinbo, 1939-07-16,17. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。1st Honinbo、1939-07-16,17。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 14,
        "y": 15
      },
      {
        "c": 1,
        "x": 4,
        "y": 16
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 2,
        "y": 15
      },
      {
        "c": -1,
        "x": 12,
        "y": 3
      },
      {
        "c": 1,
        "x": 14,
        "y": 5
      },
      {
        "c": -1,
        "x": 2,
        "y": 5
      }
    ],
    "source": {
      "event": "1st Honinbo",
      "date": "1939-07-16,17",
      "black": "Hashimoto Utaro",
      "white": "Go Seigen",
      "result": "W+4.5",
      "path": "Honinbo/01/T09.sgf"
    }
  },
  {
    "id": "pro-27-kirin-05-f1-sgf",
    "title": {
      "zh": "职业布局：Takemiya Masaki 对 赵治勋",
      "en": "Pro opening: Takemiya Masaki vs Cho Chikun",
      "ko": "프로 포석: Takemiya Masaki 대 조치훈",
      "ja": "プロ布石：Takemiya Masaki 対 趙治勲"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。5th Kirin Cup，1992-12-14。你执黑。",
      "en": "Replay the first eight moves from 5th Kirin Cup. 1992-12-14. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 5th Kirin Cup, 1992-12-14. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。5th Kirin Cup、1992-12-14。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 14,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 14,
        "y": 9
      },
      {
        "c": -1,
        "x": 3,
        "y": 9
      },
      {
        "c": 1,
        "x": 8,
        "y": 15
      },
      {
        "c": -1,
        "x": 8,
        "y": 3
      }
    ],
    "source": {
      "event": "5th Kirin Cup",
      "date": "1992-12-14",
      "black": "Takemiya Masaki",
      "white": "Cho Chikun",
      "result": "W+0.5",
      "path": "Kirin/05/F1.sgf"
    }
  },
  {
    "id": "pro-28-nec-04-9-sgf",
    "title": {
      "zh": "职业布局：赵治勋 对 小林光一",
      "en": "Pro opening: Cho Chikun vs Kobayashi Koichi",
      "ko": "프로 포석: 조치훈 대 고바야시 고이치",
      "ja": "プロ布石：趙治勲 対 小林光一"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。4th NEC Cup，1985-03-09。你执黑。",
      "en": "Replay the first eight moves from 4th NEC Cup. 1985-03-09. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 4th NEC Cup, 1985-03-09. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。4th NEC Cup、1985-03-09。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 3,
        "y": 4
      },
      {
        "c": -1,
        "x": 2,
        "y": 4
      },
      {
        "c": 1,
        "x": 3,
        "y": 3
      },
      {
        "c": -1,
        "x": 2,
        "y": 3
      }
    ],
    "source": {
      "event": "4th NEC Cup",
      "date": "1985-03-09",
      "black": "Cho Chikun",
      "white": "Kobayashi Koichi",
      "result": "B+0.5",
      "path": "NEC/04/9.sgf"
    }
  },
  {
    "id": "pro-29-kirin-09-f1-sgf",
    "title": {
      "zh": "职业布局：Kato Masao 对 赵治勋",
      "en": "Pro opening: Kato Masao vs Cho Chikun",
      "ko": "프로 포석: Kato Masao 대 조치훈",
      "ja": "プロ布石：Kato Masao 対 趙治勲"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。9th Kirin Cup，1996-11-11。你执黑。",
      "en": "Replay the first eight moves from 9th Kirin Cup. 1996-11-11. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 9th Kirin Cup, 1996-11-11. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。9th Kirin Cup、1996-11-11。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 2,
        "y": 3
      },
      {
        "c": -1,
        "x": 14,
        "y": 15
      },
      {
        "c": 1,
        "x": 12,
        "y": 2
      },
      {
        "c": -1,
        "x": 5,
        "y": 3
      },
      {
        "c": 1,
        "x": 4,
        "y": 2
      },
      {
        "c": -1,
        "x": 8,
        "y": 15
      }
    ],
    "source": {
      "event": "9th Kirin Cup",
      "date": "1996-11-11",
      "black": "Kato Masao",
      "white": "Cho Chikun",
      "result": "B+1.5",
      "path": "Kirin/09/F1.sgf"
    }
  },
  {
    "id": "pro-30-nec-17-12-sgf",
    "title": {
      "zh": "职业布局：赵治勋 对 Yoda Norimoto",
      "en": "Pro opening: Cho Chikun vs Yoda Norimoto",
      "ko": "프로 포석: 조치훈 대 Yoda Norimoto",
      "ja": "プロ布石：趙治勲 対 Yoda Norimoto"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。17th NEC Cup，1998-03-07。你执黑。",
      "en": "Replay the first eight moves from 17th NEC Cup. 1998-03-07. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 17th NEC Cup, 1998-03-07. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。17th NEC Cup、1998-03-07。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 5,
        "y": 2
      },
      {
        "c": -1,
        "x": 2,
        "y": 5
      },
      {
        "c": 1,
        "x": 14,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 16
      },
      {
        "c": 1,
        "x": 3,
        "y": 14
      },
      {
        "c": -1,
        "x": 3,
        "y": 12
      }
    ],
    "source": {
      "event": "17th NEC Cup",
      "date": "1998-03-07",
      "black": "Cho Chikun",
      "white": "Yoda Norimoto",
      "result": "W+4.5",
      "path": "NEC/17/12.sgf"
    }
  },
  {
    "id": "pro-31-omeijin-04-04-sgf",
    "title": {
      "zh": "职业布局：林海峰 对 藤泽秀行",
      "en": "Pro opening: Rin Kaiho vs Fujisawa Shuko",
      "ko": "프로 포석: 린카이호 대 후지사와 슈코",
      "ja": "プロ布石：林海峰 対 藤沢秀行"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。4th Old Meijin，1965-01-13,14。你执黑。",
      "en": "Replay the first eight moves from 4th Old Meijin. 1965-01-13,14. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 4th Old Meijin, 1965-01-13,14. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。4th Old Meijin、1965-01-13,14。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 3,
        "y": 16
      },
      {
        "c": 1,
        "x": 13,
        "y": 2
      },
      {
        "c": -1,
        "x": 15,
        "y": 14
      },
      {
        "c": 1,
        "x": 14,
        "y": 12
      },
      {
        "c": -1,
        "x": 13,
        "y": 13
      }
    ],
    "source": {
      "event": "4th Old Meijin",
      "date": "1965-01-13,14",
      "black": "Rin Kaiho",
      "white": "Fujisawa Shuko",
      "result": "B+3",
      "path": "OMeijin/04/04.sgf"
    }
  },
  {
    "id": "pro-32-people-takagawa-tak-0388-sgf",
    "title": {
      "zh": "职业布局：吴清源 对 高川格",
      "en": "Pro opening: Go Seigen vs Takagawa Shukaku",
      "ko": "프로 포석: 오청원 대 다카가와 슈카쿠",
      "ja": "プロ布石：呉清源 対 高川格"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。3-game match \"Go Seigen vs. the Honinbo\" sponsored by Mainichi Shinbun，1955-08-30。你执黑。",
      "en": "Replay the first eight moves from 3-game match \"Go Seigen vs. the Honinbo\" sponsored by Mainichi Shinbun. 1955-08-30. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 3-game match \"Go Seigen vs. the Honinbo\" sponsored by Mainichi Shinbun, 1955-08-30. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。3-game match \"Go Seigen vs. the Honinbo\" sponsored by Mainichi Shinbun、1955-08-30。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 13,
        "y": 2
      },
      {
        "c": 1,
        "x": 2,
        "y": 15
      },
      {
        "c": -1,
        "x": 15,
        "y": 14
      },
      {
        "c": 1,
        "x": 14,
        "y": 5
      },
      {
        "c": -1,
        "x": 15,
        "y": 10
      }
    ],
    "source": {
      "event": "3-game match \"Go Seigen vs. the Honinbo\" sponsored by Mainichi Shinbun",
      "date": "1955-08-30",
      "black": "Go Seigen",
      "white": "Takagawa Shukaku",
      "result": "B+0.5",
      "path": "people/Takagawa/Tak-0388.sgf"
    }
  },
  {
    "id": "pro-33-shusaku-001-sgf",
    "title": {
      "zh": "职业布局：Yasuda Eisai 对 Itagaki Chuzo",
      "en": "Pro opening: Yasuda Eisai vs Itagaki Chuzo",
      "ko": "프로 포석: Yasuda Eisai 대 Itagaki Chuzo",
      "ja": "プロ布石：Yasuda Eisai 対 Itagaki Chuzo"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。这盘历史对局，1839-12-14。你执黑。",
      "en": "Replay the first eight moves from this historic game. 1839-12-14. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 이 역사적인 대국, 1839-12-14. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。この歴史的な一局、1839-12-14。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 13,
        "y": 2
      },
      {
        "c": -1,
        "x": 15,
        "y": 15
      },
      {
        "c": 1,
        "x": 2,
        "y": 4
      },
      {
        "c": -1,
        "x": 2,
        "y": 8
      },
      {
        "c": 1,
        "x": 2,
        "y": 15
      },
      {
        "c": -1,
        "x": 4,
        "y": 15
      }
    ],
    "source": {
      "event": "",
      "date": "1839-12-14",
      "black": "Yasuda Eisai",
      "white": "Itagaki Chuzo",
      "result": "B+2",
      "path": "Shusaku/001.sgf"
    }
  },
  {
    "id": "pro-34-shusai-shusai-065-sgf",
    "title": {
      "zh": "职业布局：Tamura Hoju (later Shusai) 对 Sugioka Eijiro",
      "en": "Pro opening: Tamura Hoju (later Shusai) vs Sugioka Eijiro",
      "ko": "프로 포석: Tamura Hoju (later Shusai) 대 Sugioka Eijiro",
      "ja": "プロ布石：Tamura Hoju (later Shusai) 対 Sugioka Eijiro"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。这盘历史对局，1887-07-10。你执黑。",
      "en": "Replay the first eight moves from this historic game. 1887-07-10. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 이 역사적인 대국, 1887-07-10. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。この歴史的な一局、1887-07-10。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 4,
        "y": 2
      },
      {
        "c": 1,
        "x": 2,
        "y": 14
      },
      {
        "c": -1,
        "x": 13,
        "y": 16
      },
      {
        "c": 1,
        "x": 3,
        "y": 16
      },
      {
        "c": -1,
        "x": 13,
        "y": 2
      },
      {
        "c": 1,
        "x": 15,
        "y": 15
      },
      {
        "c": -1,
        "x": 14,
        "y": 4
      }
    ],
    "source": {
      "event": "",
      "date": "1887-07-10",
      "black": "Tamura Hoju (later Shusai)",
      "white": "Sugioka Eijiro",
      "result": "B+2",
      "path": "Shusai/Shusai-065.sgf"
    }
  },
  {
    "id": "pro-35-go-seigen-1953-02-05-sgf",
    "title": {
      "zh": "职业布局：藤泽库之助 对 吴清源",
      "en": "Pro opening: Fujisawa Kuranosuke vs Go Seigen",
      "ko": "프로 포석: 후지사와 구라노스케 대 오청원",
      "ja": "プロ布石：藤沢庫之助 対 呉清源"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。Third 10-game match Go versus Fujisawa，1953-02-05..07。你执黑。",
      "en": "Replay the first eight moves from Third 10-game match Go versus Fujisawa. 1953-02-05..07. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. Third 10-game match Go versus Fujisawa, 1953-02-05..07. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。Third 10-game match Go versus Fujisawa、1953-02-05..07。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 4
      },
      {
        "c": -1,
        "x": 15,
        "y": 15
      },
      {
        "c": 1,
        "x": 14,
        "y": 2
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 3,
        "y": 14
      },
      {
        "c": -1,
        "x": 3,
        "y": 16
      },
      {
        "c": 1,
        "x": 5,
        "y": 15
      },
      {
        "c": -1,
        "x": 2,
        "y": 5
      }
    ],
    "source": {
      "event": "Third 10-game match Go versus Fujisawa",
      "date": "1953-02-05..07",
      "black": "Fujisawa Kuranosuke",
      "white": "Go Seigen",
      "result": "W+5",
      "path": "Go_Seigen/1953-02-05.sgf"
    }
  },
  {
    "id": "pro-36-alphago-may2017-5-sgf",
    "title": {
      "zh": "职业布局：阿尔法围棋 对 柯洁",
      "en": "Pro opening: AlphaGo vs Ke Jie",
      "ko": "프로 포석: 알파고 대 커제",
      "ja": "プロ布石：AlphaGo 対 柯潔"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。Future of Go Summit，2017-05-27。你执黑。",
      "en": "Replay the first eight moves from Future of Go Summit. 2017-05-27. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. Future of Go Summit, 2017-05-27. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。Future of Go Summit、2017-05-27。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 14,
        "y": 2
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 5,
        "y": 16
      },
      {
        "c": -1,
        "x": 2,
        "y": 13
      },
      {
        "c": 1,
        "x": 15,
        "y": 7
      },
      {
        "c": -1,
        "x": 15,
        "y": 13
      }
    ],
    "source": {
      "event": "Future of Go Summit",
      "date": "2017-05-27",
      "black": "AlphaGo",
      "white": "Ke Jie",
      "result": "B+R",
      "path": "AlphaGo/May2017/5.sgf"
    }
  },
  {
    "id": "pro-37-alphago-leesedol-2-sgf",
    "title": {
      "zh": "职业布局：阿尔法围棋 对 李世石",
      "en": "Pro opening: AlphaGo vs Lee Sedol",
      "ko": "프로 포석: 알파고 대 이세돌",
      "ja": "プロ布石：AlphaGo 対 李世石"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。Google DeepMind Challenge Match，2016-03-09。你执黑。",
      "en": "Replay the first eight moves from Google DeepMind Challenge Match. 2016-03-09. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. Google DeepMind Challenge Match, 2016-03-09. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。Google DeepMind Challenge Match、2016-03-09。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 2,
        "y": 3
      },
      {
        "c": -1,
        "x": 15,
        "y": 15
      },
      {
        "c": 1,
        "x": 14,
        "y": 15
      },
      {
        "c": -1,
        "x": 14,
        "y": 16
      },
      {
        "c": 1,
        "x": 13,
        "y": 16
      },
      {
        "c": -1,
        "x": 15,
        "y": 16
      }
    ],
    "source": {
      "event": "Google DeepMind Challenge Match",
      "date": "2016-03-09",
      "black": "AlphaGo",
      "white": "Lee Sedol",
      "result": "W+R",
      "path": "AlphaGo/LeeSedol/1.sgf"
    }
  },
  {
    "id": "pro-38-samsung-27-25-sgf",
    "title": {
      "zh": "职业布局：朴廷桓 对 申真谞",
      "en": "Pro opening: Park Junghwan vs Shin Jinseo",
      "ko": "프로 포석: 박정환 대 신진서",
      "ja": "プロ布石：朴廷桓 対 申眞諝"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。27th Samsung Cup，2022-11-02。你执黑。",
      "en": "Replay the first eight moves from 27th Samsung Cup. 2022-11-02. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 27th Samsung Cup, 2022-11-02. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。27th Samsung Cup、2022-11-02。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 15,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 13,
        "y": 15
      },
      {
        "c": -1,
        "x": 12,
        "y": 2
      },
      {
        "c": 1,
        "x": 5,
        "y": 16
      },
      {
        "c": -1,
        "x": 15,
        "y": 5
      }
    ],
    "source": {
      "event": "27th Samsung Cup",
      "date": "2022-11-02",
      "black": "Park Junghwan",
      "white": "Shin Jinseo",
      "result": "W+R",
      "path": "Samsung/27/25.sgf"
    }
  },
  {
    "id": "pro-39-wc-2019-5-sgf",
    "title": {
      "zh": "职业布局：申真谞 对 朴廷桓",
      "en": "Pro opening: Shin Jinseo vs Park Junghwan",
      "ko": "프로 포석: 신진서 대 박정환",
      "ja": "プロ布石：申眞諝 対 朴廷桓"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。World Go Championship 2019，2019-03-19。你执黑。",
      "en": "Replay the first eight moves from World Go Championship 2019. 2019-03-19. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. World Go Championship 2019, 2019-03-19. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。World Go Championship 2019、2019-03-19。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 14,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 14,
        "y": 15
      },
      {
        "c": -1,
        "x": 3,
        "y": 3
      },
      {
        "c": 1,
        "x": 5,
        "y": 16
      },
      {
        "c": -1,
        "x": 12,
        "y": 2
      },
      {
        "c": 1,
        "x": 10,
        "y": 2
      },
      {
        "c": -1,
        "x": 2,
        "y": 13
      }
    ],
    "source": {
      "event": "World Go Championship 2019",
      "date": "2019-03-19",
      "black": "Shin Jinseo",
      "white": "Park Junghwan",
      "result": "W+R",
      "path": "WC/2019/5.sgf"
    }
  },
  {
    "id": "pro-40-ing-08-26-sgf",
    "title": {
      "zh": "职业布局：柯洁 对 朴廷桓",
      "en": "Pro opening: Ke Jie vs Park Junghwan",
      "ko": "프로 포석: 커제 대 박정환",
      "ja": "プロ布石：柯潔 対 朴廷桓"
    },
    "text": {
      "zh": "按黑棋的顺序，重演这盘职业对局的前八手。8th Ing Cup，2016-04-24。你执黑。",
      "en": "Replay the first eight moves from 8th Ing Cup. 2016-04-24. You play Black.",
      "ko": "이 프로 대국의 첫 여덟 수를 따라 두세요. 8th Ing Cup, 2016-04-24. 당신은 흑입니다.",
      "ja": "このプロ棋戦の最初の八手を並べます。8th Ing Cup、2016-04-24。あなたは黒番です。"
    },
    "hint": {
      "zh": "轮到你时，下在黑棋的下一手。",
      "en": "On your turn, play the next black move.",
      "ko": "당신 차례에는 다음 흑수를 두세요.",
      "ja": "自分の番では次の黒の一手を打ちます。"
    },
    "size": 19,
    "setup": [],
    "toMove": 1,
    "line": [
      {
        "c": 1,
        "x": 15,
        "y": 3
      },
      {
        "c": -1,
        "x": 3,
        "y": 2
      },
      {
        "c": 1,
        "x": 14,
        "y": 16
      },
      {
        "c": -1,
        "x": 3,
        "y": 15
      },
      {
        "c": 1,
        "x": 13,
        "y": 2
      },
      {
        "c": -1,
        "x": 14,
        "y": 14
      },
      {
        "c": 1,
        "x": 15,
        "y": 14
      },
      {
        "c": -1,
        "x": 14,
        "y": 15
      }
    ],
    "source": {
      "event": "8th Ing Cup",
      "date": "2016-04-24",
      "black": "Ke Jie",
      "white": "Park Junghwan",
      "result": "W+1",
      "path": "Ing/08/26.sgf"
    }
  }
];

/**
 * A card title names the players; two games between the same pair are still
 * two different games. Keep the short title when it is already unique and
 * append the source date only to the repeated ones, so the library never
 * shows two cards that look identical.
 */
const titleCounts = new Map();
for (const opening of RAW_OPENINGS) {
  titleCounts.set(opening.title.en, (titleCounts.get(opening.title.en) || 0) + 1);
}

export const OPENINGS = RAW_OPENINGS.map((opening) => {
  if (titleCounts.get(opening.title.en) === 1) return opening;
  const suffix = ` · ${opening.source.date}`;
  const title = Object.fromEntries(
    Object.entries(opening.title).map(([lang, text]) => [lang, text + suffix]),
  );
  return { ...opening, title };
});

export function openingById(id) {
  return OPENINGS.find((opening) => opening.id === id) || null;
}
