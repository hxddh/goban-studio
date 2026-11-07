/**
 * Twenty classic games, stored as SGF so the same reader, board and review
 * path is used for study and for imported records. Metadata is side by side
 * in the four launch languages. SGF source: the public-domain collection at
 * https://homepages.cwi.nl/~aeb/go/games/, which states it claims no rights.
 */
export const CLASSICS = [
  {
    "id": "ear-reddening",
    "title": {
      "zh": "耳赤之局",
      "en": "The Ear-Reddening Game",
      "ko": "귀가 붉어진 대국",
      "ja": "耳赤の局"
    },
    "black": "Yasuda Shusaku",
    "white": "Inoue Gennan Inseki",
    "blackName": {
      "zh": "安田秀策",
      "en": "Yasuda Shusaku",
      "ko": "야스다 슈사쿠",
      "ja": "安田秀策"
    },
    "whiteName": {
      "zh": "井上幻庵因硕",
      "en": "Inoue Gennan Inseki",
      "ko": "이노우에 겐난 인세키",
      "ja": "井上幻庵因碩"
    },
    "event": "",
    "date": "1846-09-11,14,15",
    "result": "B+2",
    "moment": 127,
    "note": {
      "zh": "1846 年秀策对幻庵因硕。第 127 手的“耳赤之妙手”是围棋史上最著名的读秒名场面之一。",
      "en": "Shusaku vs Gennan Inseki, 1846. The move now called the ear-reddening move is one of the most famous acts of reading in Go history.",
      "ko": "1846년 슈사쿠 대 겐난 인세키. 127수의 \"귀가 붉어진 묘수\"는 바둑사에서 가장 유명한 수읽기 장면 중 하나입니다.",
      "ja": "1846年、秀策対幻庵因碩。127手の「耳赤の妙手」は囲碁史上最も有名な読みの場面の一つです。"
    },
    "sgf": "(;\nPB[Yasuda Shusaku]\nBR[4d]\nPW[Inoue Gennan Inseki]\nWR[8d]\nRE[B+2]\nJD[Koka 3-7-21,24,25]\nDT[1846-09-11,14,15]\n\n;B[qd];W[dc];B[pq];W[oc];B[cp];W[cf];B[ep];W[qo];B[pe];W[np]\n;B[po];W[pp];B[op];W[qp];B[oq];W[oo];B[pn];W[qq];B[nq];W[on]\n;B[pm];W[om];B[pl];W[mp];B[mq];W[ol];B[pk];W[lq];B[lr];W[kr]\n;B[lp];W[kq];B[qr];W[rr];B[rs];W[mr];B[nr];W[pr];B[ps];W[qs]\n;B[no];W[mo];B[qr];W[rm];B[rl];W[qs];B[lo];W[mn];B[qr];W[qm]\n;B[or];W[ql];B[qj];W[rj];B[ri];W[rk];B[ln];W[mm];B[qi];W[rq]\n;B[jn];W[ls];B[ns];W[gq];B[go];W[ck];B[kc];W[ic];B[pc];W[nj]\n;B[ke];W[og];B[oh];W[pb];B[qb];W[ng];B[mi];W[mj];B[nd];W[ph]\n;B[qg];W[pg];B[hq];W[hr];B[ir];W[iq];B[hp];W[jr];B[fc];W[lc]\n;B[ld];W[mc];B[lb];W[mb];B[md];W[qf];B[pf];W[qh];B[rg];W[rh]\n;B[sh];W[rf];B[sg];W[pj];B[pi];W[oi];B[oj];W[ni];B[qk];W[ok]\n;B[qe];W[kb];B[jb];W[ka];B[jc];W[ob];B[ja];W[la];B[db];W[cc]\n;B[fe];W[cn];B[gr];W[is];B[fq];W[io];B[ji];W[eb];B[fb];W[eg]\n;B[dj];W[dk];B[ej];W[cj];B[dh];W[ij];B[hm];W[gj];B[eh];W[fl]\n;B[fg];W[er];B[dm];W[fn];B[dn];W[gn];B[jj];W[jk];B[kk];W[ii]\n;B[ik];W[jl];B[kl];W[il];B[jh];W[co];B[do];W[ih];B[hn];W[hl]\n;B[bl];W[dg];B[gh];W[ch];B[ig];W[ec];B[cr];W[fd];B[gd];W[ed]\n;B[gc];W[bk];B[cm];W[gs];B[gp];W[li];B[kg];W[in];B[lj];W[lg]\n;B[gm];W[jf];B[jg];W[im];B[fm];W[kf];B[lf];W[mf];B[le];W[gf]\n;B[hf];W[ff];B[gg];W[lk];B[kj];W[km];B[lm];W[ll];B[jm];W[ge]\n;B[he];W[ef];B[ea];W[cb];B[fr];W[fs];B[dr];W[qa];B[ra];W[pa]\n;B[rb];W[da];B[gi];W[fj];B[fi];W[fa];B[ga];W[gl];B[ek];W[em]\n;B[ho];W[el];B[en];W[jo];B[kn];W[ci];B[lh];W[mh];B[mg];W[di]\n;B[ei];W[lg];B[qn];W[rn];B[re];W[sl];B[mg];W[bm];B[am];W[lg]\n;B[eq];W[es];B[mg];W[ha];B[gb];W[lg];B[ds];W[hs];B[mg];W[sj]\n;B[si];W[lg];B[sr];W[sq];B[mg];W[hd];B[hb];W[lg];B[ro];W[so]\n;B[mg];W[ss];B[qs];W[lg];B[sn];W[rp];B[mg];W[cl];B[bn];W[lg]\n;B[ml];W[mk];B[mg];W[pj];B[sf];W[lg];B[nn];W[nl];B[mg];W[ib]\n;B[ia];W[lg];B[nc];W[nb];B[mg];W[jd];B[kd];W[lg];B[ma];W[na]\n;B[mg];W[qc];B[rc];W[lg];B[js];W[ks];B[mg];W[hc];B[id];W[lg]\n;B[fk];W[hj];B[mg];W[hh];B[hg];W[lg];B[gk];W[hk];B[mg];W[ak]\n;B[lg];W[al];B[bm];W[nf];B[od];W[ki];B[ms];W[kp];B[ip];W[jp]\n;B[lr];W[oj];B[mr];W[ea];B[sr])"
  },
  {
    "id": "blood-vomiting",
    "title": {
      "zh": "吐血之局",
      "en": "The Blood-Vomiting Game",
      "ko": "토혈의 대국",
      "ja": "吐血の局"
    },
    "black": "Akaboshi Intetsu",
    "white": "Honinbo Jowa",
    "blackName": {
      "zh": "赤星因彻",
      "en": "Akaboshi Intetsu",
      "ko": "아카보시 인테쓰",
      "ja": "赤星因徹"
    },
    "whiteName": {
      "zh": "本因坊丈和",
      "en": "Honinbo Jowa",
      "ko": "혼인보 조와",
      "ja": "本因坊丈和"
    },
    "event": "Blood-vomiting game",
    "date": "1835-08-13,15,18,21",
    "result": "W+R",
    "note": {
      "zh": "1835 年本因坊丈和对赤星因彻。因彻局后吐血，这局因此得名，丈和的妙手至今被传颂。",
      "en": "Jowa vs Akaboshi Intetsu, 1835. Known as the blood-vomiting game; Jowa’s reading produced a famous tesuji.",
      "ko": "1835년 혼인보 조와 대 아카보시 인테쓰. 대국 후 인테쓰가 피를 토해 \"토혈의 대국\"이라 불리며, 조와의 묘수가 전해집니다.",
      "ja": "1835年、本因坊丈和対赤星因徹。対局後に因徹が吐血したことから「吐血の局」と呼ばれ、丈和の妙手が語り継がれています。"
    },
    "sgf": "(;\nEV[Blood-vomiting game]\nPB[Akaboshi Intetsu]\nBR[7d]\nPW[Honinbo Jowa]\nWR[Meijin]\nKM[0]\nRE[W+R]\nDT[1835-08-13,15,18,21]\nJD[Tenpō 6-7-19,21,24,27]\nPC[Home of Lord Matsudaira of Suo]\nGC[Last move played: day 1: 59, day 2: 99, day 3: 172, day 4: 246]\n\n;B[cp];W[pq];B[qd];W[ed];B[oc];W[eq];B[qo];W[qk];B[qi];W[op]\n;B[iq];W[dn];B[ep];W[dp];B[do];W[dq];B[co];W[eo];B[fp];W[cq]\n;B[bq];W[br];B[cm];W[gr];B[hp];W[en];B[bp];W[ck];B[dl];W[dk]\n;B[el];W[gn];B[cr];W[dr];B[bs];W[fq];B[go];W[ar];B[hn];W[gm]\n;B[hm];W[gl];B[ek];W[hl];B[di];W[io];B[ho];W[fo];B[ch];W[cd]\n;B[lq];W[pn];B[gc];W[qn];B[dc];W[cc];B[ec];W[cf];B[il];W[gp]\n;B[nq];W[ic];B[fd];W[lc];B[bg];W[bf];B[af];W[bi];B[dj];W[eh]\n;B[fj];W[qg];B[oi];W[qe];B[pd];W[nf];B[ok];W[pk];B[ol];W[pj]\n;B[rn];W[rm];B[qq];W[qr];B[rr];W[qp];B[rq];W[pr];B[rp];W[po]\n;B[pp];W[mp];B[qm];W[pm];B[np];W[mq];B[mo];W[lp];B[lo];W[kp]\n;B[no];W[nr];B[or];W[qp];B[mr];W[ro];B[pi];W[lr];B[ns];W[ip]\n;B[jr];W[hq];B[jn];W[ko];B[kq];W[kn];B[jm];W[km];B[ik];W[mk]\n;B[mm];W[ir];B[jq];W[kk];B[mi];W[nm];B[ml];W[ki];B[lj];W[lk]\n;B[kj];W[jj];B[kl];W[ll];B[lm];W[oj];B[mg];W[jl];B[jk];W[nj]\n;B[ni];W[im];B[in];W[jo];B[kl];W[js];B[ks];W[jl];B[im];W[is]\n;B[kl];W[ei];B[ej];W[jl];B[hr];W[hs];B[kl];W[cn];B[bn];W[jl]\n;B[gs];W[fs];B[kl];W[hi];B[ij];W[jl];B[ls];W[ji];B[hj];W[oe]\n;B[kg];W[jg];B[gi];W[nc];B[jf];W[nb];B[re];W[if];B[je];W[hd]\n;B[fe];W[gf];B[ff];W[fg];B[gg];W[gh];B[hg];W[fi];B[gj];W[ig]\n;B[hh];W[hf];B[ii];W[rf];B[pe];W[pf];B[le];W[kd];B[ad];W[kh]\n;B[qf];W[ef];B[de];W[qe];B[ld];W[lg];B[kc];W[jd];B[qf];W[db]\n;B[eb];W[qe];B[jb];W[od];B[ib];W[mf];B[qf];W[jp];B[kr];W[qe]\n;B[lf];W[kf];B[qf];W[hc];B[qe];W[hb];B[pg];W[og];B[of];W[cg]\n;B[bh];W[pf];B[ph];W[bb];B[da];W[cb];B[fh];W[ac];B[eg];W[bd]\n;B[ob];W[oa];B[of];W[mh];B[rj];W[kl])"
  },
  {
    "id": "dosaku-1674",
    "title": {
      "zh": "道策名局",
      "en": "Dosaku’s Masterpiece",
      "ko": "도사쿠의 명국",
      "ja": "道策の名局"
    },
    "black": "Yasui Chitetsu",
    "white": "Honinbo Dosaku",
    "blackName": {
      "zh": "安井知哲",
      "en": "Yasui Chitetsu",
      "ko": "야스이 지테쓰",
      "ja": "安井知哲"
    },
    "whiteName": {
      "zh": "本因坊道策",
      "en": "Honinbo Dosaku",
      "ko": "혼인보 도사쿠",
      "ja": "本因坊道策"
    },
    "event": "",
    "date": "1674-08-30",
    "result": "W+5",
    "note": {
      "zh": "1674 年道策对安井知哲。道策是围棋史上第一位系统性的全局理论家，这局展示了他轻灵而重视全局的风格。",
      "en": "Dosaku vs Yasui Chitetsu, 1674. Dosaku was Go’s first systematic whole-board theorist; this game shows his light, global style.",
      "ko": "1674년 도사쿠 대 야스이 지테쓰. 도사쿠는 바둑 최초의 전반적 이론가였고, 이 대국은 가볍고 전체를 중시하는 스타일을 보여 줍니다.",
      "ja": "1674年、道策対安井知哲。道策は囲碁最初の全局理論家であり、この局は軽く全体を見る棋風を示しています。"
    },
    "sgf": "(;\nPB[Yasui Chitetsu]\nBR[7p]\nPW[Honinbo Dosaku]\nKM[0]\nRE[W+5]\nDT[1674-08-30]\nJD[Enpō 2-7-29]\nPC[Residence of Lord Kagatsume of Kai]\n\n;B[cp];W[eq];B[hq];W[qo];B[qd];W[oc];B[dc];W[ce];B[mc];W[md]\n;B[ld];W[ed];B[ec];W[fd];B[gc];W[gd];B[hc];W[fc];B[fb];W[gb]\n;B[hb];W[eb];B[ga];W[cc];B[db];W[qg];B[pe];W[nd];B[of];W[lc]\n;B[kc];W[lb];B[kb];W[le];B[kd];W[qb];B[mf];W[qj];B[ph];W[qh]\n;B[mb];W[rc];B[op];W[pq];B[oq];W[pr];B[lq];W[cm];B[do];W[cj]\n;B[fp];W[pi];B[on];W[or];B[nr];W[po];B[oo];W[cr];B[qc];W[rb]\n;B[fq];W[bq];B[cn];W[bm];B[dr];W[bo];B[bp];W[ap];B[di];W[dj]\n;B[fi];W[ej];B[fg];W[oe];B[pc];W[pf];B[ob];W[qe];B[nc];W[od]\n;B[pb];W[rd];B[me];W[og];B[fj];W[fl];B[fk];W[gl];B[cb];W[cg]\n;B[dg];W[bh];B[dd];W[ef];B[ff];W[ee];B[if];W[gh];B[ch];W[cf]\n;B[bi];W[ci];B[dh];W[bj];B[fh];W[ko];B[km];W[kq];B[lp];W[io]\n;B[im];W[iq];B[hp];W[lm];B[ln];W[lr];B[mr];W[jr];B[mm];W[hr]\n;B[gr];W[lo];B[ls];W[hm];B[in];W[ho];B[hn];W[go];B[gn];W[fo]\n;B[er];W[cq];B[hs];W[ir];B[dq];W[eo];B[ep];W[em];B[hk];W[mh]\n;B[qm];W[mn];B[ll];W[mp];B[mq];W[jn];B[nn];W[mo];B[rn];W[ro]\n;B[pp];W[qp];B[rq];W[rr];B[ki];W[nl];B[ol];W[nk];B[nm];W[kh]\n;B[lh];W[lg];B[li];W[mg];B[kg];W[lf];B[bn];W[an];B[dn];W[jm]\n;B[jl];W[gk];B[hj];W[rl];B[ql];W[rk];B[gm];W[fm];B[dm];W[dl]\n;B[ek];W[el];B[dk];W[ck];B[cd];W[jf];B[jg];W[hf];B[ie];W[gf]\n;B[ge];W[he];B[hd];W[fe];B[hg];W[gg];B[hh];W[gi];B[gj];W[rm]\n;B[qn];W[sn];B[bg];W[ai];B[bd];W[ae];B[hi];W[ge];B[ad];W[bf]\n;B[mi];W[ni];B[nj];W[oj];B[mj];W[ok];B[nh];W[ng];B[pd];W[nf]\n;B[pa];W[je];B[jd];W[hl];B[il];W[gp];B[gq];W[kr];B[jp];W[jo]\n;B[kp];W[ip];B[qq];W[qr];B[oi];W[oh];B[ni];W[mk];B[lk];W[kn]\n;B[lm];W[pn];B[om];W[is];B[gs];W[ks];B[os];W[ps];B[be];W[af]\n;B[qa];W[ra];B[cs];W[bs];B[ds];W[ns];B[ms];W[os];B[eg];W[ag]\n;B[ei])"
  },
  {
    "id": "game-century",
    "title": {
      "zh": "世纪之局",
      "en": "The Game of the Century",
      "ko": "세기의 대국",
      "ja": "世紀の対局"
    },
    "black": "Go Seigen",
    "white": "Honinbo Shusai",
    "blackName": {
      "zh": "吴清源",
      "en": "Go Seigen",
      "ko": "오청원",
      "ja": "呉清源"
    },
    "whiteName": {
      "zh": "本因坊秀哉",
      "en": "Honinbo Shusai",
      "ko": "혼인보 슈사이",
      "ja": "本因坊秀哉"
    },
    "event": "",
    "date": "1933-10-16..1934-01-29",
    "result": "W+2",
    "note": {
      "zh": "1933–34 年吴清源对本因坊秀哉。这局因“封手”争议和秀哉的名人身份成为传奇。",
      "en": "Go Seigen vs Honinbo Shusai, 1933–34. The sealed-move controversy and Shusai’s Meijin status made this the Game of the Century.",
      "ko": "1933–34년 오청원 대 혼인보 슈사이. 봉수 논란과 슈사이 명인의 지위 때문에 세기의 대국이 되었습니다.",
      "ja": "1933–34年、呉清源対本因坊秀哉。封じ手論争と秀哉名人の立場から「世紀の対局」と呼ばれます。"
    },
    "sgf": "(;\nPB[Go Seigen]\nBR[5d]\nPW[Honinbo Shusai]\nWR[Meijin]\nRE[W+2]\nDT[1933-10-16..1934-01-29]\nSZ[19]\nSO[Kido 38#13]\n\n;B[qc];W[cd];B[dp];W[pq];B[jj];W[pd];B[qd];W[pe];B[ob];W[qn]\n;B[jp];W[lq];B[dj];W[ed];B[lo];W[nq];B[kq];W[lp];B[ko];W[ch]\n;B[gj];W[fq];B[fo];W[iq];B[gp];W[cq];B[cp];W[dq];B[nd];W[ph]\n;B[pj];W[ne];B[me];W[mf];B[nf];W[ng];B[oe];W[of];B[ne];W[nj]\n;B[om];W[mg];B[ke];W[hc];B[qm];W[rm];B[rn];W[rl];B[ro];W[pm]\n;B[ql];W[qk];B[pl];W[pn];B[pk];W[qj];B[nl];W[pi];B[qp];W[on]\n;B[nn];W[no];B[mo];W[op];B[qr];W[qq];B[rq];W[pr];B[rr];W[mn]\n;B[nm];W[lm];B[ll];W[kp];B[mp];W[mq];B[ip];W[jq];B[kk];W[cn]\n;B[ep];W[cj];B[ck];W[dk];B[cl];W[dl];B[ci];W[bj];B[bi];W[di]\n;B[ej];W[bh];B[dm];W[ei];B[fj];W[cm];B[ak];W[ai];B[el];W[bp]\n;B[rf];W[co];B[qg];W[rh];B[jc];W[gq];B[eq];W[en];B[fn];W[er]\n;B[fr];W[dr];B[hq];W[hr];B[hp];W[gr];B[fc];W[ic];B[dc];W[cc]\n;B[gd];W[he];B[ge];W[je];B[hd];W[id];B[hf];W[kd];B[le];W[kc]\n;B[og];W[oh];B[pg];W[em];B[ek];W[fm];B[gm];W[mb];B[cb];W[ec]\n;B[eb];W[dd];B[db];W[gb];B[bc];W[bd];B[bb];W[nb];B[oa];W[fb]\n;B[ea];W[gh];B[jf];W[ie];B[ff];W[hi];B[hg];W[eo];B[fp];W[hl]\n;B[il];W[jh];B[fh];W[fi];B[hj];W[if];B[ih];W[ii];B[ig];W[jg]\n;B[ji];W[fg];B[kf];W[ij];B[ik];W[hh];B[gf];W[mk];B[df];W[ml]\n;B[sm];W[sk];B[mm];W[dg];B[li];W[ol];B[ln];W[nk];B[km];W[fl]\n;B[gl];W[oj];B[qh];W[ri];B[cf];W[ef];B[gi];W[eh];B[ee];W[eg]\n;B[de];W[bf];B[bq];W[br];B[ps];W[os];B[qs];W[oq];B[bo];W[aq]\n;B[an];W[bn];B[am];W[ao];B[rg];W[mi];B[qi];W[lh];B[kh];W[lj]\n;B[rj];W[rk];B[sh];W[sj];B[bg];W[ae];B[cg];W[ag];B[fe];W[gc]\n;B[fd];W[ce];B[kg];W[mc];B[ki];W[fk];B[ld];W[lc];B[gk];W[bk]\n;B[bl];W[na];B[nc];W[gg];B[fa];W[ga];B[ac];W[ad];B[lg];W[mh]\n;B[qo];W[lk])"
  },
  {
    "id": "go-fujisawa-1953",
    "title": {
      "zh": "吴清源十番棋",
      "en": "Go Seigen’s Ten-Game Match",
      "ko": "오청원 십번기",
      "ja": "呉清源十番碁"
    },
    "black": "Go Seigen",
    "white": "Fujisawa Kuranosuke",
    "blackName": {
      "zh": "吴清源",
      "en": "Go Seigen",
      "ko": "오청원",
      "ja": "呉清源"
    },
    "whiteName": {
      "zh": "藤泽库之助",
      "en": "Fujisawa Kuranosuke",
      "ko": "후지사와 구라노스케",
      "ja": "藤沢庫之助"
    },
    "event": "Third 10-game match Go versus Fujisawa",
    "date": "1953-03-11..13",
    "result": "B+R",
    "note": {
      "zh": "1953 年吴清源对藤泽库之助十番棋第六局。十番棋重新定义了现代围棋的竞争强度。",
      "en": "Go Seigen vs Fujisawa Kuranosuke, 1953, game 6 of their third ten-game match. These matches redefined the intensity of modern Go.",
      "ko": "1953년 오청원 대 후지사와 구라노스케, 세 번째 십번기 6국. 이 십번기는 현대 바둑의 경쟁 강도를 다시 정의했습니다.",
      "ja": "1953年、呉清源対藤沢庫之助、第三期十番碁第6局。十番碁は近代囲碁の競争強度を塗り替えました。"
    },
    "sgf": "(;\nEV[Third 10-game match Go versus Fujisawa]\nEVX[Sponsored by Yomiuri Shinbun]\nRO[Game 6 (last game played)]\nPB[Go Seigen]\nBR[9d]\nPW[Fujisawa Kuranosuke]\nWR[9d]\nTM[13h]\nKM[0]\nRE[B+R]\nDT[1953-03-11..13]\nPC[Atami]\nOH[B-B-(W)]\nRU[Uchikomi]\nUS[GoGoD95]\n\n;B[pd];W[cd];B[pp];W[cp];B[ep];W[eq];B[fp];W[dp];B[fq];W[er]\n;B[ed];W[ec];B[fc];W[dc];B[fd];W[cf];B[jc];W[nq];B[pn];W[kq]\n;B[qi];W[dm];B[eg];W[kf];B[nd];W[kd];B[kc];W[jd];B[ic];W[mg]\n;B[oq];W[hp];B[nr];W[gm];B[mq];W[oj];B[nh];W[qj];B[pi];W[pj]\n;B[mh];W[kh];B[ri];W[qm];B[qn];W[mk];B[ki];W[ji];B[kj];W[ll]\n;B[mj];W[jl];B[ik];W[ih];B[hi];W[gg];B[hm];W[gn];B[dl];W[el]\n;B[dk];W[cm];B[de];W[bg];B[hf];W[jj];B[kk];W[jk];B[kl];W[pm]\n;B[km];W[on];B[nl];W[nk];B[ol];W[om];B[lm];W[rn];B[ro];W[rl]\n;B[sn];W[mm];B[ml];W[mn];B[lk];W[lp];B[jm];W[mp];B[il];W[if]\n;B[fl];W[ek];B[fm];W[fn];B[em];W[en];B[dj];W[gl];B[fk];W[ej]\n;B[ei];W[fj];B[gk];W[gi];B[hh];W[hk];B[hg];W[md];B[le];W[nc]\n;B[ld];W[od];B[ne];W[oe];B[nf];W[pc];B[qc];W[qd];B[rd];W[pe]\n;B[rb];W[qb];B[rc];W[di];B[ch];W[ci];B[bh];W[re];B[qf];W[qg]\n;B[og];W[pg];B[pb];W[ob];B[qa];W[oi];B[oh];W[rf];B[ph];W[bi]\n;B[cg];W[bf];B[ai];W[aj];B[ah];W[bk];B[np];W[eb];B[ho];W[io]\n;B[ip];W[iq];B[jp];W[jq];B[go];W[hn];B[ko];W[in];B[lo];W[ij]\n;B[mo];W[hq];B[hj];W[im];B[gj];W[sm];B[rm];W[eh];B[fi];W[rn]\n;B[so];W[dg];B[ce];W[be];B[dd];W[cc];B[fh];W[dh];B[lr];W[lh]\n;B[li];W[kr];B[lf];W[lg];B[ie];W[jf];B[ig];W[jg];B[mb];W[mc]\n;B[lc];W[of];B[ng];W[ef];B[fg];W[rh];B[si];W[qo];B[po];W[gb]\n;B[fb];W[fa];B[df];W[hd];B[hc];W[id];B[he];W[gd];B[gc];W[ge]\n;B[hb];W[gf];B[ks];W[js];B[ls];W[kp];B[jo];W[ga];B[is];W[jr]\n;B[fr])"
  },
  {
    "id": "sakata-go-1968",
    "title": {
      "zh": "坂田对吴清源",
      "en": "Sakata vs Go Seigen",
      "ko": "사카타 대 오청원",
      "ja": "坂田対呉清源"
    },
    "black": "Sakata Eio",
    "white": "Go Seigen",
    "blackName": {
      "zh": "坂田荣男",
      "en": "Sakata Eio",
      "ko": "사카타 에이오",
      "ja": "坂田栄男"
    },
    "whiteName": {
      "zh": "吴清源",
      "en": "Go Seigen",
      "ko": "오청원",
      "ja": "呉清源"
    },
    "event": "5th Pro Best Ten",
    "date": "1968-02-29",
    "result": "B+5.5",
    "note": {
      "zh": "1968 年坂田荣男对吴清源，第五届专业十杰战。两位巨人在吴清源职业生涯后期相遇。",
      "en": "Sakata Eio vs Go Seigen, 1968 Pro Best Ten. Two giants met late in Go Seigen’s career.",
      "ko": "1968년 사카타 에이오 대 오청원, 제5기 프로 베스트 텐. 오청원 말년의 두 거장 대결입니다.",
      "ja": "1968年、坂田栄男対呉清源、第5期プロ十傑戦。呉清源の晩年の両雄対決です。"
    },
    "sgf": "(;\nEV[5th Pro Best Ten]\nRO[3]\nPB[Sakata Eio]\nBR[9p]\nPW[Go Seigen]\nWR[9p]\nTM[6h]\nKM[5.5]\nRE[B+5.5]\nDT[1968-02-29]\n\n;B[qd];W[dc];B[pq];W[cq];B[oc];W[po];B[qo];W[qn];B[qp];W[pm]\n;B[nq];W[qi];B[ce];W[dg];B[ee];W[fd];B[di];W[cd];B[be];W[ck]\n;B[hd];W[fe];B[ef];W[gf];B[ci];W[eg];B[cg];W[kd];B[ie];W[jf]\n;B[if];W[ig];B[hg];W[jg];B[hf];W[ff];B[fh];W[ch];B[dh];W[cf]\n;B[bg];W[de];B[bf];W[hh];B[gg];W[qf];B[oe];W[fp];B[pg];W[rd]\n;B[qc];W[qh];B[co];W[ek];B[ii];W[ed];B[ih];W[kh];B[dl];W[cj]\n;B[cl];W[bi];B[bh];W[fj];B[ei];W[ej];B[fm];W[hj];B[hi];W[gi]\n;B[gh];W[ij];B[ji];W[eo];B[do];W[dp];B[en];W[hm];B[fo];W[ep]\n;B[go];W[hq];B[ip];W[hp];B[ho];W[bl];B[bm];W[ak];B[ai];W[bj]\n;B[iq];W[fi];B[bc];W[eh];B[cc];W[cb];B[bb];W[ic];B[hc];W[hb]\n;B[gk];W[jb];B[il];W[hl];B[gl];W[gm];B[fl];W[gj];B[jj];W[jk]\n;B[ik];W[hk];B[kk];W[in];B[im];W[hn];B[io];W[jm];B[jl];W[kl]\n;B[jk];W[kn];B[ll];W[mm];B[db];W[eb];B[ca];W[gb];B[ml];W[mp]\n;B[nm];W[mn];B[nn];W[kp];B[mo];W[lo];B[no];W[np];B[op];W[mq]\n;B[nr];W[jn];B[hr];W[nl];B[oo];W[nk];B[km];W[ln];B[lj];W[jr]\n;B[fr];W[er];B[kq];W[jq];B[lr];W[mr];B[ms];W[kr];B[lq];W[lp]\n;B[ls];W[jp];B[gp];W[fq];B[gq];W[fs];B[am];W[is];B[gs];W[gr]\n;B[gc];W[fc];B[fr];W[gn];B[fn];W[gr];B[ol];W[hs];B[ql];W[pl]\n;B[rn];W[qk];B[rm];W[ok];B[oi];W[oh];B[nh];W[re];B[lc];W[ni]\n;B[mk];W[bp];B[nj];W[mi];B[oj];W[pk];B[mh];W[bo];B[bn];W[li]\n;B[ph];W[mf];B[og];W[md];B[mb];W[lg];B[rk];W[rj];B[kc];W[jd]\n;B[rc];W[sk];B[rl];W[ki];B[mj];W[sc];B[kb];W[rb];B[qb];W[mc]\n;B[nb];W[ka];B[la];W[ja];B[om];W[sb];B[ra];W[sd];B[sl];W[sj]\n;B[nf];W[bd];B[ad];W[dd];B[ah];W[ir];B[hq];W[ks];B[ns];W[el]\n;B[dn];W[ld];B[pf];W[qe];B[mg];W[nd];B[me];W[lf];B[ne];W[pn]\n;B[pp];W[df];B[qg];W[rg];B[ke];W[le];B[je];W[od];B[pd];W[nc]\n;B[ob];W[ea];B[da];W[kf];B[ao];W[lm];B[cp];W[bq];B[ap];W[aq]\n;B[an];W[kl];B[kj];W[jo];B[dm];W[km])"
  },
  {
    "id": "takagawa-fujisawa-1958",
    "title": {
      "zh": "高川对藤泽",
      "en": "Takagawa vs Fujisawa",
      "ko": "다카가와 대 후지사와",
      "ja": "高川対藤沢"
    },
    "black": "Takagawa Shukaku",
    "white": "Fujisawa Shuko",
    "blackName": {
      "zh": "高川格",
      "en": "Takagawa Shukaku",
      "ko": "다카가와 슈카쿠",
      "ja": "高川格"
    },
    "whiteName": {
      "zh": "藤泽秀行",
      "en": "Fujisawa Shuko",
      "ko": "후지사와 슈코",
      "ja": "藤沢秀行"
    },
    "event": "3rd Hayago Meijin",
    "date": "1958-09-25",
    "result": "B+0.5",
    "note": {
      "zh": "1958 年高川格对藤泽秀行，第三届快棋名人战。高川以半目取胜。",
      "en": "Takagawa Shukaku vs Fujisawa Shuko, 1958 Hayago Meijin. Takagawa won by half a point.",
      "ko": "1958년 다카가와 슈카쿠 대 후지사와 슈코, 제3기 속기 명인전. 다카가와가 반집 차로 이겼습니다.",
      "ja": "1958年、高川格対藤沢秀行、第3期早碁名人戦。高川が半目勝ちしました。"
    },
    "sgf": "(;\nEV[3rd Hayago Meijin]\nRO[5]\nPB[Takagawa Shukaku]\nBR[8p]\nPW[Fujisawa Shuko]\nWR[7p]\nTM[4h]\nKM[4.5]\nRE[B+0.5]\nDT[1958-09-25]\nPC[Nihon Ki-in]\n\n;B[pd];W[dq];B[dd];W[qp];B[do];W[co];B[cn];W[cp];B[dn];W[fq]\n;B[cj];W[jc];B[oq];W[mc];B[qm];W[qn];B[pm];W[op];B[pq];W[qq]\n;B[lq];W[qf];B[nd];W[md];B[qi];W[ne];B[pf];W[pg];B[nf];W[me]\n;B[of];W[pi];B[qh];W[qg];B[ph];W[og];B[oh];W[ng];B[mf];W[nh]\n;B[ni];W[mi];B[mj];W[lh];B[kf];W[nj];B[oi];W[lj];B[mk];W[lk]\n;B[qc];W[ll];B[nk];W[jq];B[np];W[oo];B[gc];W[ob];B[jg];W[cd]\n;B[cc];W[ce];B[bc];W[ef];B[cg];W[ed];B[dc];W[de];B[fe];W[dg]\n;B[ch];W[di];B[ci];W[gg];B[ii];W[gi];B[hf];W[lo];B[kp];W[io]\n;B[no];W[on];B[kn];W[nn];B[in];W[ko];B[jp];W[jo];B[ip];W[hr]\n;B[ir];W[iq];B[hp];W[hq];B[ho];W[hg];B[ig];W[ge];B[fd];W[gf]\n;B[ki];W[li];B[ik];W[jn];B[im];W[jl];B[nl];W[il];B[hl];W[hk]\n;B[gl];W[ij];B[qe];W[gk];B[fk];W[jm];B[fl];W[mr];B[mq];W[lr]\n;B[ep];W[kq];B[lp];W[nr];B[nq];W[fp];B[eq];W[er];B[fr];W[dr]\n;B[fo];W[dp];B[eo];W[qb];B[rb];W[pb];B[hj];W[gj];B[jj];W[ee]\n;B[ec];W[dj];B[dk];W[hb];B[hc];W[ic];B[rm];W[ra];B[sb];W[bo]\n;B[bn];W[an];B[am];W[ao];B[bk];W[gb];B[fb];W[gq];B[ro];W[qo]\n;B[rn];W[nm];B[kd];W[kc];B[rh];W[sf];B[rd];W[fj];B[ga];W[ib]\n;B[cf];W[bd];B[ac];W[bf];B[bg];W[ie];B[if];W[je];B[le];W[oe]\n;B[pe];W[od];B[mo];W[mn];B[or];W[ld];B[ke];W[qr];B[sr];W[os]\n;B[he];W[jk];B[ij];W[ff];B[gd];W[eh];B[ps];W[ns];B[pr];W[kj]\n;B[hh];W[gh];B[kh];W[lg];B[pc];W[sd];B[lf];W[oc];B[om];W[rp]\n;B[sp];W[rr];B[sq];W[gp];B[mg];W[mh];B[ml];W[mm];B[ej];W[ei]\n;B[ek];W[go];B[gn];W[ha];B[fa];W[sg];B[sh];W[ag];B[ah];W[af]\n;B[ad];W[be])"
  },
  {
    "id": "cho-kobayashi-1979",
    "title": {
      "zh": "赵治勋对小林",
      "en": "Cho Chikun vs Kobayashi",
      "ko": "조치훈 대 고바야시",
      "ja": "趙治勲対小林"
    },
    "black": "Cho Chikun",
    "white": "Kobayashi Koichi",
    "blackName": {
      "zh": "赵治勋",
      "en": "Cho Chikun",
      "ko": "조치훈",
      "ja": "趙治勲"
    },
    "whiteName": {
      "zh": "小林光一",
      "en": "Kobayashi Koichi",
      "ko": "고바야시 고이치",
      "ja": "小林光一"
    },
    "event": "2nd JAA Cup",
    "date": "1979-08-25",
    "result": "W+2.5",
    "note": {
      "zh": "1979 年赵治勋对小林光一，第二届 JAA 杯。两位未来的传奇当时都还年轻。",
      "en": "Cho Chikun vs Kobayashi Koichi, 1979 JAA Cup. Two future legends, both still young.",
      "ko": "1979년 조치훈 대 고바야시 고이치, 제2회 JAA배. 두 미래의 전설이 아직 젊었을 때의 대국입니다.",
      "ja": "1979年、趙治勲対小林光一、第2回JAA杯。後の二大レジェンドがまだ若かった頃の一局です。"
    },
    "sgf": "(;\nEV[2nd JAA Cup]\nRO[1]\nPB[Cho Chikun]\nBR[8p, Gosei]\nPW[Kobayashi Koichi]\nWR[8p]\nKM[5.5]\nRE[W+2.5]\nDT[1979-08-25]\n\n;B[qc];W[dp];B[qp];W[oq];B[cd];W[po];B[qo];W[pn];B[qm];W[pm]\n;B[ql];W[pl];B[pk];W[ok];B[oj];W[qn];B[rn];W[ro];B[rm];W[pj]\n;B[qk];W[nk];B[pq];W[pr];B[qr];W[pp];B[qq];W[ed];B[iq];W[df]\n;B[nj];W[mj];B[pi];W[kq];B[fq];W[bf];B[cn];W[fp];B[gp];W[eq]\n;B[fo];W[ep];B[fr];W[go];B[hp];W[fn];B[ho];W[gn];B[cq];W[cp]\n;B[bp];W[bo];B[bq];W[co];B[er];W[dk];B[eb];W[dc];B[hc];W[jc]\n;B[db];W[cc];B[fd];W[fe];B[ec];W[gd];B[dd];W[fc];B[bc];W[od]\n;B[ck];W[cl];B[bn];W[an];B[dl];W[bl];B[am];W[ao];B[cg];W[cf]\n;B[el];W[dj];B[gl];W[fk];B[fl];W[im];B[ek];W[ej];B[fj];W[gk]\n;B[bk];W[bj];B[dn];W[bm];B[il];W[gj];B[en];W[jm];B[hm];W[hn]\n;B[hk];W[gi];B[jl];W[kl];B[kk];W[lk];B[km];W[ll];B[in];W[jn]\n;B[io];W[eo];B[ko];W[kn];B[ln];W[lm];B[jo];W[km];B[ij];W[ji]\n;B[kj];W[ni];B[oi];W[nh];B[ii];W[jh];B[ih];W[jg];B[ig];W[if]\n;B[fb];W[qe];B[ob];W[rc];B[qb];W[rb];B[qd];W[rd];B[mc];W[qg]\n;B[gh];W[fh];B[pe];W[pf];B[oe];W[nd];B[pd];W[ri];B[qi];W[rj]\n;B[qj];W[gg];B[jj];W[nr];B[mo];W[lp];B[lo];W[qs];B[rs];W[ps]\n;B[sr];W[le];B[lc];W[kd];B[np];W[op];B[li];W[nn];B[gc];W[jr]\n;B[hf];W[ie];B[fd];W[ir];B[hr];W[lg];B[ee];W[kb];B[oc];W[lb]\n;B[mb];W[ap];B[cm];W[al];B[aq];W[ne];B[of];W[rk];B[dq];W[cj]\n;B[ff];W[eg];B[ib];W[nf];B[og];W[ad];B[id];W[jd];B[jb];W[kc]\n;B[ng];W[mg];B[mi];W[no];B[mp];W[mq];B[lj];W[mk];B[ac];W[ge]\n;B[gf];W[he];B[mh];W[jq];B[mn];W[mm];B[fm];W[ak];B[ra];W[qh]\n;B[ae];W[be];B[bd];W[ef];B[hg];W[hh];B[re];W[qf];B[sb];W[rf]\n;B[sk];W[ic];B[hd];W[ja];B[ha];W[sl];B[rl];W[sj];B[fg];W[af]\n;B[gh];W[hi];B[hj];W[fi];B[ld];W[ke];B[nc];W[md];B[is];W[js]\n;B[hs];W[ma];B[na];W[ph];B[oh];W[jp];B[ip];W[de];B[ed];W[se]\n;B[sm];W[ka];B[ia];W[sc];B[gg];W[rh];B[ad];W[la];B[nq];W[lq]\n;B[lh];W[kg];B[qa];W[sk];B[sa])"
  },
  {
    "id": "lee-ma-1996",
    "title": {
      "zh": "李昌镐对马晓春",
      "en": "Lee Changho vs Ma Xiaochun",
      "ko": "이창호 대 마샤오춘",
      "ja": "李昌鎬対馬暁春"
    },
    "black": "Lee Changho",
    "white": "Ma Xiaochun",
    "blackName": {
      "zh": "李昌镐",
      "en": "Lee Changho",
      "ko": "이창호",
      "ja": "李昌鎬"
    },
    "whiteName": {
      "zh": "马晓春",
      "en": "Ma Xiaochun",
      "ko": "마샤오춘",
      "ja": "馬暁春"
    },
    "event": "9th Fujitsu Cup",
    "date": "1996-08-03",
    "result": "B+R",
    "note": {
      "zh": "1996 年富士通杯决赛。李昌镐中盘胜马晓春，开启了他的世界大赛统治。",
      "en": "The 1996 Fujitsu Cup final. Lee Changho beat Ma Xiaochun by resignation, opening his run of world titles.",
      "ko": "1996년 후지쓰배 결승. 이창호가 마샤오춘을 불계로 이기며 세계 대회 지배를 시작했습니다.",
      "ja": "1996年富士通杯決勝。李昌鎬が馬暁春を中押しで破り、世界タイトル時代を切り開きました。"
    },
    "sgf": "(;\nEV[9th Fujitsu Cup]\nRO[Final]\nPB[Lee Changho]\nBR[9p]\nPW[Ma Xiaochun]\nWR[9p]\nTM[3h]\nKM[5.5]\nRE[B+R]\nDT[1996-08-03]\nPC[Kudan Kaikan, Tokyo]\n\n;B[pd];W[dd];B[pp];W[dp];B[fq];W[hq];B[fo];W[cn];B[ip];W[eq]\n;B[fr];W[qn];B[np];W[qk];B[iq];W[nc];B[qf];W[pb];B[cf];W[fc]\n;B[qc];W[qh];B[lc];W[ne];B[qb];W[ce];B[cl];W[bf];B[cq];W[dm]\n;B[cp];W[dl];B[cj];W[dk];B[ei];W[ck];B[ic];W[gi];B[bg];W[df]\n;B[cg];W[bj];B[bi];W[ci];B[ch];W[dj];B[be];W[bd];B[af];W[le]\n;B[gb];W[fb];B[gc];W[gd];B[hd];W[ge];B[he];W[gg];B[hf];W[kb]\n;B[kc];W[lb];B[mc];W[mb];B[nd];W[oc];B[od];W[jc];B[jd];W[jb]\n;B[kd];W[lq];B[qo];W[pn];B[or];W[ko];B[mo];W[io];B[hp];W[ai]\n;B[ah];W[bh];B[ee];W[eg];B[bi];W[co];B[er];W[bh];B[ed];W[ec]\n;B[bi];W[ro];B[rp];W[bh];B[na];W[ib];B[bi];W[hb];B[hc];W[ga]\n;B[aj];W[kg];B[pa];W[nb];B[hh];W[gh];B[md];W[rn];B[ef];W[dg]\n;B[de];W[cd];B[ff];W[di];B[dh];W[eh];B[gf];W[ad];B[fg];W[fh]\n;B[hi];W[gj];B[hj];W[gk];B[oh];W[kj];B[kl];W[oo];B[op];W[il]\n;B[jk];W[ji];B[ik];W[ln];B[mn];W[ho];B[go];W[ni];B[lm];W[jn]\n;B[ph];W[qg];B[oj];W[hk];B[hg];W[nh];B[qj];W[rj];B[pk];W[qi]\n;B[pj];W[ql];B[of];W[ml];B[rk];W[si];B[mk];W[lk];B[mj];W[ll]\n;B[lo];W[kp];B[om];W[pf];B[pg]\nC[Time used: B: 2h46m, W: 2h59m]\n)"
  },
  {
    "id": "lee-gu-2011",
    "title": {
      "zh": "李世石对古力",
      "en": "Lee Sedol vs Gu Li",
      "ko": "이세돌 대 구리",
      "ja": "李世石対古力"
    },
    "black": "Lee Sedol",
    "white": "Gu Li",
    "blackName": {
      "zh": "李世石",
      "en": "Lee Sedol",
      "ko": "이세돌",
      "ja": "李世石"
    },
    "whiteName": {
      "zh": "古力",
      "en": "Gu Li",
      "ko": "구리",
      "ja": "古力"
    },
    "event": "3rd BC Card Cup Final",
    "date": "2011-04-26",
    "result": "B+0.5",
    "note": {
      "zh": "2011 年 BC 信用卡杯决赛第三局。李世石半目胜古力，是“李古时代”的代表性对决。",
      "en": "Game 3 of the 2011 BC Card Cup final. Lee Sedol beat Gu Li by half a point in the heart of the Lee–Gu era.",
      "ko": "2011년 BC카드배 결승 3국. 이세돌이 구리를 반집 차로 이기며 \"이구 시대\"를 대표했습니다.",
      "ja": "2011年BCカード杯決勝第3局。李世石が古力を半目差で破った「李古時代」の一局です。"
    },
    "sgf": "(;\nEV[3rd BC Card Cup Final]\nRO[3]\nPB[Lee Sedol]\nBR[9p]\nPW[Gu Li]\nWR[9p]\nKM[6.5]\nRE[B+0.5]\nDT[2011-04-26]\nPC[Seoul]\n\n;B[qd];W[pp];B[dc];W[dp];B[cn];W[fp];B[cj];W[de];B[ce];W[dd]\n;B[cd];W[ec];B[df];W[cc];B[db];W[bc];B[eb];W[fc];B[ef];W[fe]\n;B[bb];W[cf];B[bf];W[cg];B[bd];W[bg];B[ac];W[di];B[ff];W[dj]\n;B[ge];W[ck];B[hc];W[cp];B[oc];W[jp];B[pj];W[qn];B[gj];W[ni]\n;B[nq];W[oq];B[np];W[ok];B[jr];W[kq];B[po];W[qo];B[qq];W[nr]\n;B[oj];W[nj];B[nk];W[ol];B[mk];W[ph];B[pm];W[pn];B[om];W[qk]\n;B[pk];W[pl];B[ql];W[nl];B[rk];W[qm];B[qj];W[nm];B[on];W[oo]\n;B[lj];W[ll];B[nh];W[nd];B[od];W[ne];B[mh];W[oe];B[pe];W[nc]\n;B[ob];W[pf];B[of];W[og];B[nf];W[qe];B[pd];W[ng];B[mf];W[mg]\n;B[lf];W[lg];B[kf];W[lh];B[qf];W[qg];B[pg];W[jh];B[ip];W[pf]\n;B[re];W[kr];B[in];W[jo];B[jj];W[mi];B[rm];W[ig];B[ie];W[gg]\n;B[gn];W[hp];B[eo];W[ep];B[jn];W[rn];B[io];W[iq];B[ln];W[nn]\n;B[rg];W[gf];B[hf];W[hg];B[fd];W[dm];B[jq];W[ir];B[ci];W[dk]\n;B[dh];W[dg];B[fh];W[eh];B[ei];W[ch];B[fg];W[ii];B[kk];W[gi]\n;B[ml];W[mo];B[dn];W[fi];B[fo];W[je];B[jf];W[if];B[he];W[jd]\n;B[kc];W[kd];B[md];W[lc];B[mc];W[ic];B[hb];W[gd];B[ee];W[hd]\n;B[gc];W[rh];B[pg];W[qi];B[qh];W[id];B[fe];W[qg];B[ri];W[si]\n;B[rj];W[pf];B[sm];W[hk];B[bo];W[bp];B[gh];W[hi];B[ap];W[aq]\n;B[lo];W[lp];B[ao];W[bq];B[bl];W[bk];B[cl];W[sg];B[rf];W[em]\n;B[gl];W[il];B[jl];W[hm];B[gm];W[go];B[ho];W[gp];B[fn];W[im]\n;B[ik];W[hl];B[hn];W[jm];B[km];W[gk];B[fk];W[hj];B[kn];W[ae]\n;B[be];W[dl];B[fl];W[mb];B[ld];W[mm];B[lm];W[cm];B[bm];W[al]\n;B[ki];W[jg];B[am];W[kg];B[pg];W[af];B[ed];W[pf];B[nb];W[ak]\n;B[kp];W[js];B[ko];W[bn];B[an];W[co];B[bn];W[jq];B[sn];W[so]\n;B[fj];W[ej];B[mn];W[no];B[sj];W[ij];B[jk];W[mj];B[lk];W[sh]\n;B[sf];W[qh];B[oi];W[oh];B[hh];W[ag];B[ad];W[pg];B[ji];W[ih]\n;B[kl])"
  },
  {
    "id": "alphago-lee-4",
    "title": {
      "zh": "AlphaGo 对李世石",
      "en": "AlphaGo vs Lee Sedol",
      "ko": "알파고 대 이세돌",
      "ja": "AlphaGo対李世石"
    },
    "black": "AlphaGo",
    "white": "Lee Sedol",
    "blackName": {
      "zh": "阿尔法围棋",
      "en": "AlphaGo",
      "ko": "알파고",
      "ja": "AlphaGo"
    },
    "whiteName": {
      "zh": "李世石",
      "en": "Lee Sedol",
      "ko": "이세돌",
      "ja": "李世石"
    },
    "event": "Google DeepMind Challenge Match",
    "date": "2016-03-13",
    "result": "W+R",
    "moment": 78,
    "note": {
      "zh": "2016 年人机大战第四局。李世石执白取胜，第 78 手被称为人类创造力的一手。",
      "en": "Game 4 of the 2016 DeepMind Challenge. Lee Sedol won with White; move 78 is celebrated as a creative human move.",
      "ko": "2016년 딥마인드 대국 4국. 이세돌이 백으로 이겼고, 78수는 인간 창의성의 한 수로 평가됩니다.",
      "ja": "2016年ディープマインド戦第4局。李世石が白番で勝利し、78手は人間の創造性の一手として語られます。"
    },
    "sgf": "(;\nEV[Google DeepMind Challenge Match]\nRO[4]\nPB[AlphaGo]\nPW[Lee Sedol]\nWR[9p]\nTM[2h]\nKM[7.5]\nRE[W+R]\nDT[2016-03-13]\nPC[Four Seasons Hotel, Seoul, South Korea]\nOT[3x60s byo-yomi]\n\n;B[pd];W[dp];B[cd];W[qp];B[op];W[oq];B[nq];W[pq];B[cn];W[fq]\n;B[mp];W[po];B[iq];W[ec];B[hd];W[cg];B[ed];W[cj];B[dc];W[bp]\n;B[nc];W[qi];B[ep];W[eo];B[dk];W[fp];B[ck];W[dj];B[ej];W[ei]\n;B[fi];W[eh];B[fh];W[bj];B[fk];W[fg];B[gg];W[ff];B[gf];W[mc]\n;B[md];W[lc];B[nb];W[id];B[hc];W[jg];B[pj];W[pi];B[oj];W[oi]\n;B[ni];W[nh];B[mh];W[ng];B[mg];W[mi];B[nj];W[mf];B[li];W[ne]\n;B[nd];W[mj];B[lf];W[mk];B[me];W[nf];B[lh];W[qj];B[kk];W[ik]\n;B[ji];W[gh];B[hj];W[ge];B[he];W[fd];B[fc];W[ki];B[jj];W[lj]\n;B[kh];W[jh];B[ml];W[nk];B[ol];W[ok];B[pk];W[pl];B[qk];W[nl]\n;B[kj];W[ii];B[rk];W[om];B[pg];W[ql];B[cp];W[co];B[oe];W[rl]\n;B[sk];W[rj];B[hg];W[ij];B[km];W[gi];B[fj];W[jl];B[kl];W[gl]\n;B[fl];W[gm];B[ch];W[ee];B[eb];W[bg];B[dg];W[eg];B[en];W[fo]\n;B[df];W[dh];B[im];W[hk];B[bn];W[if];B[gd];W[fe];B[hf];W[ih]\n;B[bh];W[ci];B[ho];W[go];B[or];W[rg];B[dn];W[cq];B[pr];W[qr]\n;B[rf];W[qg];B[qf];W[jc];B[gr];W[sf];B[se];W[sg];B[rd];W[bl]\n;B[bk];W[ak];B[cl];W[hn];B[in];W[hp];B[fr];W[er];B[es];W[ds]\n;B[ah];W[ai];B[kd];W[ie];B[kc];W[kb];B[gk];W[ib];B[qh];W[rh]\n;B[qs];W[rs];B[oh];W[sl];B[of];W[sj];B[ni];W[nj];B[oo];W[jp]\nC[Time used: B: 1h59m, W: 2h+2x60s]\n)"
  },
  {
    "id": "ke-alphago-1",
    "title": {
      "zh": "柯洁对 AlphaGo",
      "en": "Ke Jie vs AlphaGo",
      "ko": "커제 대 알파고",
      "ja": "柯潔対AlphaGo"
    },
    "black": "Ke Jie",
    "white": "AlphaGo",
    "blackName": {
      "zh": "柯洁",
      "en": "Ke Jie",
      "ko": "커제",
      "ja": "柯潔"
    },
    "whiteName": {
      "zh": "阿尔法围棋",
      "en": "AlphaGo",
      "ko": "알파고",
      "ja": "AlphaGo"
    },
    "event": "Future of Go Summit",
    "date": "2017-05-23",
    "result": "W+0.5",
    "note": {
      "zh": "2017 年未来围棋峰会第一局。AlphaGo 执白半目胜柯洁，柯洁称这是最接近的一局。",
      "en": "Game 1 of the 2017 Future of Go Summit. AlphaGo beat Ke Jie by half a point with White.",
      "ko": "2017년 미래 바둑 정상회담 1국. 알파고가 백으로 커제를 반집 차로 이겼습니다.",
      "ja": "2017年未来囲碁サミット第1局。AlphaGoが白番で柯潔に半目勝ちしました。"
    },
    "sgf": "(;\nEV[Future of Go Summit]\nRO[1]\nPB[Ke Jie]\nBR[9p]\nPW[AlphaGo]\nWR[9p]\nTM[3h]\nKM[7.5]\nRE[W+0.5]\nDT[2017-05-23]\nPC[Wuzhen, China]\n\n;B[qd];W[pp];B[cc];W[cp];B[nc];W[fp];B[qq];W[pq];B[qp];W[qn]\n;B[qo];W[po];B[rn];W[qr];B[rr];W[rm];B[pr];W[or];B[pn];W[qm]\n;B[qs];W[on];B[dj];W[nk];B[ph];W[ch];B[cf];W[eh];B[ci];W[de]\n;B[df];W[dc];B[cd];W[dd];B[ef];W[di];B[ei];W[dh];B[cj];W[ce]\n;B[be];W[bf];B[bg];W[bd];B[af];W[bc];B[fi];W[cm];B[hq];W[ek]\n;B[fh];W[gq];B[hp];W[ej];B[eq];W[gr];B[cq];W[dp];B[dq];W[ep]\n;B[bp];W[bh];B[ah];W[bo];B[bq];W[fg];B[gg];W[kp];B[ko];W[jo]\n;B[jn];W[in];B[jp];W[io];B[lp];W[kq];B[lq];W[kr];B[lr];W[ir]\n;B[kn];W[il];B[oq];W[pf];B[nh];W[rf];B[od];W[qi];B[qg];W[rd]\n;B[qf];W[qe];B[pe];W[re];B[qc];W[rg];B[kh];W[ic];B[gc];W[kc]\n;B[jd];W[id];B[ge];W[hb];B[gb];W[jf];B[je];W[ie];B[ld];W[hg]\n;B[eg];W[lc];B[le];W[hf];B[qh];W[rh];B[pi];W[qj];B[gk];W[fd]\n;B[gd];W[lf];B[mf];W[lg];B[gm];W[gn];B[fn];W[go];B[dl];W[mo]\n;B[oo];W[pm];B[op];W[mg];B[nf];W[lo];B[nn];W[lm];B[pn];W[dk]\n;B[ck];W[cl];B[el];W[bk];B[bi];W[li];B[ii];W[ds];B[dr];W[hi]\n;B[ik];W[jk];B[ij];W[md];B[mc];W[ke];B[me];W[kd];B[om];W[ls]\n;B[ms];W[ks];B[nr];W[ng];B[og];W[es];B[cs];W[fr];B[er];W[fs]\n;B[bs];W[hl];B[pl];W[ql];B[rc];W[ro];B[rp];W[sn];B[hm];W[im]\n;B[kk];W[kj];B[lk];W[jl];B[mj];W[mi];B[nj];W[pk];B[fm];W[cn]\n;B[ol];W[ok];B[ni];W[ih];B[ji];W[mb];B[nb];W[lb];B[fe];W[cb]\n;B[mp];W[mm];B[eb];W[na];B[oa];W[ma];B[qb];W[bj];B[ai];W[aj]\n;B[ag];W[gl];B[fk];W[bl];B[kg];W[kf];B[ib];W[jb];B[ga];W[ha]\n;B[ed];W[ec];B[fc];W[gf];B[ff];W[gj];B[hk];W[hh];B[fj];W[no]\n;B[fq];W[hr];B[kl];W[km];B[mn];W[ln];B[nl];W[db];B[da];W[ca]\n;B[ea];W[np];B[nq];W[oj];B[oi];W[en];B[em];W[eo];B[dm];W[dn]\n;B[sp];W[so];B[hn];W[ho];B[hc];W[ia];B[ao];W[an];B[ap];W[sc]\n;B[sb];W[sd];B[jg];W[ad];B[gh];W[ae];B[ee];W[ml];B[mk];W[pj]\n;B[bf];W[nm];B[on];W[he];B[ig];W[ki];B[jh];W[fl];B[jj];W[fo]\n;B[hj];W[gi];B[ll];W[jm];B[lh];W[mh];B[lj];W[if];B[hd])"
  },
  {
    "id": "shin-park-2021",
    "title": {
      "zh": "申真谞对朴廷桓",
      "en": "Shin Jinseo vs Park Junghwan",
      "ko": "신진서 대 박정환",
      "ja": "申眞諝対朴廷桓"
    },
    "black": "Shin Jinseo",
    "white": "Park Junghwan",
    "blackName": {
      "zh": "申真谞",
      "en": "Shin Jinseo",
      "ko": "신진서",
      "ja": "申眞諝"
    },
    "whiteName": {
      "zh": "朴廷桓",
      "en": "Park Junghwan",
      "ko": "박정환",
      "ja": "朴廷桓"
    },
    "event": "26th Samsung Cup Final",
    "date": "2021-11-03",
    "result": "W+R",
    "note": {
      "zh": "2021 年第 26 届三星杯决赛第三局。朴廷桓执白胜申真谞。",
      "en": "Game 3 of the 26th Samsung Cup final, 2021. Park Junghwan won with White against Shin Jinseo.",
      "ko": "2021년 제26회 삼성배 결승 3국. 박정환이 백으로 신진서를 이겼습니다.",
      "ja": "2021年第26回三星火災杯決勝第3局。朴廷桓が白番で申眞諝を破りました。"
    },
    "sgf": "(;\nEV[26th Samsung Cup Final]\nRO[3]\nPB[Shin Jinseo]\nBR[9p]\nPW[Park Junghwan]\nWR[9p]\nKM[6.5]\nRE[W+R]\nDT[2021-11-03]\n\n;B[pd];W[dp];B[pp];W[dd];B[cq];W[dq];B[cp];W[do];B[bn];W[qc]\n;B[pc];W[qd];B[pe];W[rf];B[fc];W[hc];B[jc];W[nq];B[fe];W[dg]\n;B[cd];W[cc];B[dc];W[de];B[bd];W[bc];B[bb];W[jd];B[kd];W[db]\n;B[ec];W[cb];B[cf];W[df];B[bg];W[ba];B[ci];W[gd];B[fd];W[id]\n;B[fg];W[di];B[cj];W[gf];B[ge];W[ff];B[he];W[kc];B[hg];W[lc]\n;B[fj];W[fi];B[gj];W[cg];B[bf];W[gg];B[hf];W[ch];B[bh];W[gh]\n;B[hh];W[gi];B[hi];W[ej];B[ek];W[dj];B[dk];W[hq];B[qb];W[rb]\n;B[re];W[qe];B[qf];W[pf];B[qg];W[pb];B[hp];W[cn];B[co];W[dn]\n;B[bm];W[ip];B[of];W[rg];B[qh];W[rh];B[qi];W[qq];B[io];W[ho]\n;B[gp];W[gq];B[fp];W[fq];B[jp];W[iq];B[in];W[qp];B[ke];W[md]\n;B[qa];W[rd];B[ob];W[mf];B[jb];W[kb];B[mb];W[nf];B[ne];W[me]\n;B[po];W[pq];B[mh];W[lg];B[lh];W[jg];B[kf];W[kg];B[gb];W[ib]\n;B[ie];W[ji];B[kj];W[jj];B[kh];W[ig];B[je];W[ii];B[hj];W[jk]\n;B[ll];W[kl];B[lm];W[km];B[kn];W[lk];B[kk];W[il];B[gm];W[ki]\n;B[lj];W[li];B[mj];W[mi];B[oh];W[ni];B[mg];W[lf];B[mk];W[nd]\n;B[od];W[pj];B[qj];W[nj];B[pk];W[pi];B[oi];W[og];B[pg];W[ng]\n;B[nh];W[oj];B[ph];W[nl];B[ol];W[ln])"
  },
  {
    "id": "iyama-cho-2009",
    "title": {
      "zh": "井山对张栩",
      "en": "Iyama vs Cho U",
      "ko": "이야마 대 장쉬",
      "ja": "井山対張栩"
    },
    "black": "Iyama Yuta",
    "white": "Cho U",
    "blackName": {
      "zh": "井山裕太",
      "en": "Iyama Yuta",
      "ko": "이야마 유타",
      "ja": "井山裕太"
    },
    "whiteName": {
      "zh": "张栩",
      "en": "Cho U",
      "ko": "장쉬",
      "ja": "張栩"
    },
    "event": "18th Ryusei",
    "date": "2009-08-20",
    "result": "B+3.5",
    "note": {
      "zh": "2009 年第 18 届龙星战决赛。20 岁的井山裕太执黑 3.5 目胜张栩。",
      "en": "The 2009 Ryusei final. Twenty-year-old Iyama Yuta beat Cho U by 3.5 points with Black.",
      "ko": "2009년 제18회 료세이 결승. 스무 살 이야마 유타가 흑으로 장쉬를 3집 반 차로 이겼습니다.",
      "ja": "2009年第18期竜星戦決勝。20歳の井山裕太が黒番で張栩に3目半勝ちしました。"
    },
    "sgf": "(;\nEV[18th Ryusei]\nRO[Final]\nPB[Iyama Yuta]\nBR[8p]\nPW[Cho U]\nWR[9p, Meijin]\nKM[6.5]\nRE[B+3.5]\nDT[2009-08-20]\nGC[Broadcast 2009-09-25]\n\n;B[qd];W[pp];B[dc];W[cp];B[eq];W[od];B[oc];W[pd];B[pc];W[qe]\n;B[nc];W[ce];B[rd];W[ed];B[ec];W[fd];B[gc];W[gp];B[cl];W[fc]\n;B[fb];W[gb];B[hb];W[gd];B[hc];W[eb];B[ga];W[cc];B[db];W[cj]\n;B[eo];W[dq];B[go];W[er];B[fq];W[dn];B[el];W[ho];B[gn];W[hn]\n;B[en];W[qj];B[fr];W[dm];B[dl];W[bm];B[bl];W[iq];B[nq];W[oq]\n;B[np];W[pn];B[kp];W[kn];B[nn];W[mo];B[mn];W[lo];B[no];W[lq]\n;B[jq];W[mq];B[or];W[pr];B[mr];W[os];B[nr];W[ip];B[jr];W[lr]\n;B[hr];W[kl];B[mk];W[kj];B[pk];W[qk];B[ql];W[om];B[lm];W[km]\n;B[ol];W[nm];B[ll];W[pj];B[oj];W[oi];B[nj];W[ro];B[pm];W[on]\n;B[nl];W[ph];B[dr];W[cr];B[es];W[bn];B[dd];W[de];B[ef];W[dg]\n;B[re];W[mi];B[op];W[pq];B[qn];W[qo];B[ni];W[nh];B[mh];W[mg]\n;B[lh];W[li];B[ng];W[oh];B[rn];W[kh];B[lg];W[mf];B[kg];W[jh]\n;B[ke];W[jg];B[le];W[rl];B[mm];W[po];B[ko];W[ln];B[lk];W[gl]\n;B[so];W[sp];B[sn];W[rp];B[ej];W[di];B[gj];W[hk];B[fh];W[ie]\n;B[ii];W[ir];B[is];W[hh];B[hd];W[gf];B[hj];W[jj];B[eg];W[ei]\n;B[fi];W[fk];B[ee];W[he];B[df];W[cf];B[cg];W[bg];B[dh];W[bh]\n;B[dj];W[ci];B[fl];W[gk];B[fj];W[cb];B[cs];W[br];B[of];W[nf]\n;B[pf];W[og];B[qg];W[qh];B[cd];W[bd];B[ea];W[bc];B[jd];W[id]\n;B[ic];W[nd];B[ne];W[me];B[md];W[ld];B[mc];W[oe];B[lf];W[pg]\n;B[qf];W[fp];B[ep];W[bs];B[dp];W[cq];B[jo];W[jn];B[io];W[in]\n;B[gm];W[hm];B[bf];W[be];B[ih];W[ig];B[hg];W[gg];B[gh];W[hf]\n;B[hi];W[jf];B[rg];W[rh];B[pe];W[bk];B[al];W[ds];B[kk];W[jk]\n;B[cs];W[eh];B[fg];W[ds];B[er];W[gq];B[gr];W[do];B[ak];W[aj]\n;B[ne];W[ng];B[am];W[an];B[cm];W[cn];B[ck];W[bj];B[sh];W[si]\n;B[sg];W[sm];B[qm];W[rj];B[ek];W[ij];B[ca];W[ba];B[da];W[em]\n;B[fm];W[fo];B[fn];W[hg];B[pl];W[rm];B[js];W[ls];B[cs];W[ps]\n;B[ds])"
  },
  {
    "id": "cho-rin-1988",
    "title": {
      "zh": "赵治勋对林海峰",
      "en": "Cho Chikun vs Rin",
      "ko": "조치훈 대 린카이호",
      "ja": "趙治勲対林海峰"
    },
    "black": "Cho Chikun",
    "white": "Rin Kaiho",
    "blackName": {
      "zh": "赵治勋",
      "en": "Cho Chikun",
      "ko": "조치훈",
      "ja": "趙治勲"
    },
    "whiteName": {
      "zh": "林海峰",
      "en": "Rin Kaiho",
      "ko": "린카이호",
      "ja": "林海峰"
    },
    "event": "1st Fujitsu Cup",
    "date": "1988-06-04",
    "result": "W+R",
    "note": {
      "zh": "1988 年首届富士通杯第二轮。林海峰执白胜赵治勋。",
      "en": "Round 2 of the first Fujitsu Cup, 1988. Rin Kaiho won with White against Cho Chikun.",
      "ko": "1988년 제1회 후지쓰배 2회전. 린카이호가 백으로 조치훈을 이겼습니다.",
      "ja": "1988年第1回富士通杯2回戦。林海峰が白番で趙治勲を破りました。"
    },
    "sgf": "(;\nEV[1st Fujitsu Cup]\nRO[2]\nPB[Cho Chikun]\nBR[9p]\nPW[Rin Kaiho]\nWR[9p]\nKM[5.5]\nRE[W+R]\nDT[1988-06-04]\nPC[Nihon Ki-in, Tokyo]\n\n;B[pd];W[dd];B[pq];W[cp];B[eq];W[qo];B[pl];W[lq];B[do];W[co]\n;B[dm];W[dn];B[en];W[cn];B[em];W[op];B[oq];W[np];B[nq];W[mp]\n;B[rq];W[dq];B[er];W[cl];B[jq];W[jo];B[hp];W[qj];B[qm];W[nl]\n;B[nk];W[ml];B[ok];W[qf];B[qh];W[rh];B[ri];W[qi];B[rg];W[ph]\n;B[qg];W[pg];B[pf];W[rf];B[sh];W[sf];B[sg];W[rj];B[qe];W[of]\n;B[pe];W[oi];B[mk];W[lk];B[ro];W[lj];B[rl];W[jc];B[mc];W[dk]\n;B[ll];W[kl];B[lm];W[km];B[ln];W[nn];B[mi];W[mg];B[fd];W[ef]\n;B[kd];W[kh];B[dc];W[cc];B[ec];W[cb];B[ie];W[gf];B[hd];W[ed]\n;B[mj];W[ke];B[lh];W[kg];B[ki];W[kk];B[le];W[me];B[kf];W[lg]\n;B[md];W[gc];B[li];W[ih];B[nh];W[ng];B[hc];W[fc];B[fb];W[gb]\n;B[hb];W[gd];B[ga];W[ge];B[ek];W[ep];B[fp];W[ej];B[dj];W[di]\n;B[cj];W[ck];B[kn];W[jn];B[jm];W[ik];B[im];W[lo];B[jk];W[jl]\n;B[il];W[jj];B[ji];W[hk];B[ei];W[fj];B[eh];W[gh];B[ci];W[ch]\n;B[bh];W[cg];B[bg];W[bf];B[hi];W[hh];B[cr];W[dr];B[ds];W[bq]\n;B[kq];W[ko];B[lr];W[fq];B[eo];W[dp];B[gq];W[fr];B[es];W[fo]\n;B[gp];W[gn];B[gm];W[gl];B[fl];W[fk];B[hn];W[sk];B[re];W[rp]\n;B[qp];W[rn];B[po];W[so];B[pp];W[br];B[gr];W[qn];B[pn];W[sl]\n;B[eb];W[el];B[fm];W[nd];B[ne];W[oe])"
  },
  {
    "id": "sakata-otake-1969",
    "title": {
      "zh": "坂田对大竹",
      "en": "Sakata vs Otake",
      "ko": "사카타 대 오타케",
      "ja": "坂田対大竹"
    },
    "black": "Sakata Eio",
    "white": "Otake Hideo",
    "blackName": {
      "zh": "坂田荣男",
      "en": "Sakata Eio",
      "ko": "사카타 에이오",
      "ja": "坂田栄男"
    },
    "whiteName": {
      "zh": "大竹英雄",
      "en": "Otake Hideo",
      "ko": "오타케 히데오",
      "ja": "大竹英雄"
    },
    "event": "8th Judan Title",
    "date": "1969-12-24,25",
    "result": "W+R",
    "note": {
      "zh": "1969 年第十期十段战第三局。大竹英雄执白胜坂田荣男。",
      "en": "Game 3 of the 8th Judan title, 1969. Otake Hideo won with White against Sakata Eio.",
      "ko": "1969년 제8기 십단전 3국. 오타케 히데오가 백으로 사카타 에이오를 이겼습니다.",
      "ja": "1969年第8期十段戦第3局。大竹英雄が白番で坂田栄男を破りました。"
    },
    "sgf": "(;\nEV[8th Judan Title]\nRO[3]\nPB[Sakata Eio]\nBR[9p, Judan]\nPW[Otake Hideo]\nWR[8p]\nTM[9h]\nKM[5.5]\nRE[W+R]\nDT[1969-12-24,25]\nPC[Hazawa Garden, Shibuya, Tokyo, Japan]\n\n;B[qd];W[de];B[pp];W[eq];B[od];W[qj];B[cp];W[jq];B[dc];W[cn]\n;B[do];W[dn];B[fo];W[en];B[eo];W[fn];B[go];W[gq];B[dq];W[bq]\n;B[er];W[bp];B[fq];W[mq];B[qm];W[fd];B[qh];W[ec];B[ci];W[mc]\n;B[co];W[bo];B[bm];W[bk];B[ck];W[cl];B[bl];W[cj];B[dk];W[bj]\n;B[dj];W[bi];B[dh];W[cm];B[bh];W[cg];B[ch];W[bn];B[dd];W[ce]\n;B[cd];W[be];B[bd];W[fg];B[fi];W[hh];B[hj];W[db];B[ed];W[ee]\n;B[eb];W[fc];B[cb];W[fb];B[da];W[ji];B[ld];W[md];B[le];W[me]\n;B[lf];W[mf];B[lg];W[of];B[pg];W[nh];B[li];W[ik];B[gl];W[fh]\n;B[hm];W[nj];B[lc];W[lk];B[ic];W[ie];B[je];W[jf];B[id];W[jd]\n;B[ke];W[gn];B[hn];W[ho];B[gr];W[io];B[jm];W[lm];B[jk];W[ij]\n;B[hi];W[ii];B[il];W[hk];B[kj];W[in];B[im];W[fj];B[fk];W[ei]\n;B[oq];W[ad];B[mg];W[ng];B[ej];W[gi];B[kn];W[mo];B[kp];W[lr]\n;B[kq];W[kr];B[ip];W[mh];B[ki];W[bc];B[bb];W[ab];B[ba];W[gk]\n;B[fl];W[di];B[nb];W[mb];B[oc];W[iq];B[hp];W[nr];B[or];W[ql]\n;B[rl];W[rm];B[rn];W[pm];B[qn];W[rk];B[sm];W[pl];B[ri];W[kb]\n;B[jb];W[kc];B[lb];W[la];B[jc];W[pf];B[qf];W[kl];B[jl];W[if]\n;B[kd];W[ka];B[jg];W[pe];B[qe];W[os];B[ps];W[ns];B[pq];W[oo]\n;B[ir];W[po];B[qo];W[jr];B[hq];W[is];B[hr];W[ln];B[lp];W[lo]\n;B[mp];W[nq];B[np];W[js];B[ko];W[hd];B[hc];W[gd];B[pi];W[pj]\n;B[mj];W[mk];B[oi];W[ni];B[oj];W[ok];B[cr];W[dl];B[ek];W[br]\n;B[kg];W[cs];B[ds];W[bs];B[ig];W[hg];B[lq];W[ls];B[no];W[nn]\n;B[gb];W[fa];B[ea];W[rj];B[na];W[ma];B[ga];W[jp];B[jo];W[si]\n;B[sh];W[sj];B[pn];W[on];B[sl];W[cq];B[dr];W[pd];B[pc];W[hs]\n;B[ne];W[nf];B[gs];W[ja];B[ia];W[op];B[km];W[kk];B[jj];W[nc]\n;B[ob];W[gc];B[hb];W[ih];B[em];W[sk];B[cc];W[qr];B[pr];W[so])"
  },
  {
    "id": "nie-fujisawa-1988",
    "title": {
      "zh": "聂卫平对藤泽",
      "en": "Nie Weiping vs Fujisawa",
      "ko": "녜웨이핑 대 후지사와",
      "ja": "聶衛平対藤沢"
    },
    "black": "Nie Weiping",
    "white": "Fujisawa Hideyuki",
    "blackName": {
      "zh": "聂卫平",
      "en": "Nie Weiping",
      "ko": "녜웨이핑",
      "ja": "聶衛平"
    },
    "whiteName": {
      "zh": "藤泽秀行",
      "en": "Fujisawa Hideyuki",
      "ko": "후지사와 히데유키",
      "ja": "藤沢秀行"
    },
    "event": "1st Ing Cup",
    "date": "1988-11-20",
    "result": "B+1",
    "note": {
      "zh": "1988 年首届应氏杯半决赛。聂卫平执黑 1 点胜藤泽秀行。",
      "en": "The 1988 Ing Cup semifinal. Nie Weiping beat Fujisawa Hideyuki by one point with Black.",
      "ko": "1988년 제1회 잉창치배 준결승. 녜웨이핑이 흑으로 후지사와 히데유키를 1점 차로 이겼습니다.",
      "ja": "1988年第1回応氏杯準決勝。聶衛平が黒番で藤沢秀行に1点勝ちしました。"
    },
    "sgf": "(;\nEV[1st Ing Cup]\nRO[Semifinal 1]\nPB[Nie Weiping]\nBR[9p]\nPW[Fujisawa Hideyuki]\nWR[9p]\nKM[8]\nRE[B+1]\nDT[1988-11-20]\n\n;B[pd];W[dd];B[pq];W[dp];B[qo];W[dj];B[fq];W[dn];B[jp];W[nc]\n;B[fc];W[df];B[db];W[qf];B[pf];W[pg];B[of];W[qd];B[qe];W[re]\n;B[pe];W[rg];B[qc];W[rd];B[og];W[ph];B[kc];W[kd];B[ld];W[jc]\n;B[lc];W[cc];B[hc];W[he];B[fe];W[ff];B[ge];W[gf];B[hf];W[hd]\n;B[gd];W[ic];B[ke];W[hb];B[gc];W[je];B[jd];W[if];B[hg];W[ig]\n;B[hh];W[id];B[ef];W[eg];B[ee];W[fg];B[de];W[ce];B[cb];W[dg]\n;B[hj];W[kf];B[lf];W[ii];B[hi];W[kg];B[im];W[pr];B[oq];W[gp]\n;B[gq];W[fp];B[hq];W[hl];B[hm];W[il];B[jl];W[ik];B[gm];W[gl]\n;B[fm];W[fl];B[em];W[cl];B[kk];W[jk];B[kj];W[ki];B[nk];W[qq]\n;B[or];W[rp];B[dl];W[dk];B[cm];W[bl];B[dm];W[bn];B[ql];W[ro]\n;B[qp];W[rr];B[rn];W[qn];B[pn];W[os];B[ns];W[ps];B[nr];W[bb]\n;B[ed];W[pc];B[oc];W[pb];B[ob];W[qb];B[dc];W[cd];B[rb];W[rc]\n;B[qa];W[dq];B[cn];W[bo];B[pa];W[qj];B[rj];W[ri];B[co];W[cp]\n;B[ep];W[do];B[dr];W[eq];B[er];W[bq];B[qk];W[pj];B[rs];W[qr]\n;B[sr];W[sn];B[sq];W[rm];B[rq];W[qm];B[pm];W[po];B[pp];W[sp]\n;B[qs];W[ho];B[kl];W[io];B[jo];W[qc];B[jj];W[ij];B[ji];W[jh]\n;B[el];W[ek];B[cr];W[br];B[li];W[lg];B[mg];W[nb];B[ih];W[fk]\n;B[oa];W[gb];B[fb];W[kb];B[lb];W[jb];B[kh];W[jg];B[ba];W[ab]\n;B[mh];W[la];B[ma];W[ka];B[od];W[in];B[jn];W[cs];B[ok];W[kd]\n;B[le];W[rk];B[rl];W[sj];B[sl];W[sm];B[fo];W[eo];B[go];W[hp]\n;B[ip];W[sb];B[ra];W[ni];B[oi];W[oh];B[nh];W[oj];B[nj];W[pi]\n;B[bm];W[am];B[hn];W[ep];B[en];W[pk];B[pl];W[mi];B[mj];W[oi]\n;B[lh];W[fr];B[gr];W[fa];B[ea];W[ga];B[sk];W[rj];B[bs];W[as]\n;B[ds];W[bs];B[fs];W[cq];B[jd];W[bc];B[kd];W[aa];B[ca];W[sc]\n;B[sa])"
  },
  {
    "id": "cho-seo-1982",
    "title": {
      "zh": "曹薰铉对徐奉洙",
      "en": "Cho Hunhyun vs Seo Bongsoo",
      "ko": "조훈현 대 서봉수",
      "ja": "曹薫鉉対徐奉洙"
    },
    "black": "Cho Hunhyun",
    "white": "Seo Bongsoo",
    "blackName": {
      "zh": "曹薰铉",
      "en": "Cho Hunhyun",
      "ko": "조훈현",
      "ja": "曹薫鉉"
    },
    "whiteName": {
      "zh": "徐奉洙",
      "en": "Seo Bongsoo",
      "ko": "서봉수",
      "ja": "徐奉洙"
    },
    "event": "26th Kuksu Title",
    "date": "1982-11-19",
    "result": "B+R",
    "note": {
      "zh": "1982 年第 26 届国手战第二局。曹薰铉执黑中盘胜徐奉洙。",
      "en": "Game 2 of the 26th Kuksu title, 1982. Cho Hunhyun beat Seo Bongsoo by resignation with Black.",
      "ko": "1982년 제26기 국수전 2국. 조훈현이 흑으로 서봉수를 불계로 이겼습니다.",
      "ja": "1982年第26期国手戦第2局。曹薫鉉が黒番で徐奉洙を中押しで破りました。"
    },
    "sgf": "(;\nEV[26th Kuksu Title]\nRO[2]\nPB[Cho Hunhyun]\nBR[9p]\nPW[Seo Bongsoo]\nWR[7p]\nKM[5.5]\nRE[B+R]\nDT[1982-11-19]\n\n;B[qd];W[dc];B[pq];W[oc];B[cp];W[po];B[ce];W[dg];B[hc];W[de]\n;B[kc];W[lc];B[ld];W[mc];B[kd];W[qb];B[cd];W[dd];B[cf];W[cc]\n;B[ch];W[eq];B[qh];W[do];B[co];W[dn];B[cn];W[dm];B[dr];W[qq]\n;B[qr];W[qp];B[or];W[qk];B[lq];W[ei];B[cj];W[dj];B[ck];W[dk]\n;B[er];W[kp];B[lp];W[ko];B[mn];W[ln];B[mm];W[lm];B[ml];W[ll]\n;B[qm];W[pm];B[ql];W[pl];B[qn];W[pn];B[rk];W[rj];B[qj];W[pk]\n;B[ri];W[mk];B[gq];W[mo];B[cl];W[gb];B[hb];W[gc];B[he];W[go]\n;B[ih];W[ii];B[jh];W[hh];B[ji];W[hg];B[ig];W[rc];B[ij];W[hi]\n;B[kk];W[rd];B[qe];W[gd];B[hf];W[hj];B[ik];W[kq];B[nq];W[mp]\n;B[no];W[nn];B[hk];W[hr];B[hq];W[gr];B[fq];W[iq];B[ep];W[cg]\n;B[bg];W[bf];B[bh];W[df];B[be];W[bd];B[af];W[mq];B[mr];W[lr]\n;B[np];W[lo];B[ir];W[jq];B[nd];W[od];B[pb];W[ob];B[qc];W[rb]\n;B[pc];W[pa];B[re];W[md];B[ne];W[me];B[lb];W[mb];B[kb];W[nf]\n;B[oe];W[nc];B[of];W[ma];B[ff];W[rr];B[rs];W[sr];B[oo];W[ms]\n;B[nr];W[pp];B[op];W[lf];B[kg];W[se];B[sf];W[sd];B[rg];W[gg]\n;B[fe];W[gk];B[gl];W[fl];B[fk];W[gj];B[el];W[fm];B[dl];W[ek]\n;B[bc];W[bb];B[ad])"
  },
  {
    "id": "lee-yoo-1996",
    "title": {
      "zh": "李昌镐对刘昌赫",
      "en": "Lee Changho vs Yoo Changhyuk",
      "ko": "이창호 대 유창혁",
      "ja": "李昌鎬対劉昌赫"
    },
    "black": "Lee Changho",
    "white": "Yoo Changhyuk",
    "blackName": {
      "zh": "李昌镐",
      "en": "Lee Changho",
      "ko": "이창호",
      "ja": "李昌鎬"
    },
    "whiteName": {
      "zh": "刘昌赫",
      "en": "Yoo Changhyuk",
      "ko": "유창혁",
      "ja": "劉昌赫"
    },
    "event": "8th Asian TV Cup",
    "date": "1996-05-04",
    "result": "B+R",
    "note": {
      "zh": "1996 年第八届亚洲电视快棋赛决赛。李昌镐执黑中盘胜刘昌赫。",
      "en": "The 1996 Asian TV Cup final. Lee Changho beat Yoo Changhyuk by resignation with Black.",
      "ko": "1996년 제8회 아시아 TV 배 결승. 이창호가 흑으로 유창혁을 불계로 이겼습니다.",
      "ja": "1996年第8回アジアTV杯決勝。李昌鎬が黒番で劉昌赫を中押しで破りました。"
    },
    "sgf": "(;\nEV[8th Asian TV Cup]\nRO[Final]\nPB[Lee Changho]\nBR[7p]\nPW[Yoo Changhyuk]\nWR[7p]\nKM[5.5]\nRE[B+R]\nDT[1996-05-04]\n\n;B[qd];W[dp];B[dc];W[ce];B[pq];W[od];B[dh];W[eg];B[de];W[dd]\n;B[ed];W[cd];B[df];W[ec];B[cc];W[bc];B[bb];W[eb];B[bd];W[dg]\n;B[be];W[fd];B[cf];W[fe];B[mc];W[ne];B[qg];W[jc];B[gc];W[fc]\n;B[me];W[mf];B[le];W[ng];B[jd];W[ic];B[kg];W[ki];B[id];W[hd]\n;B[of];W[nf];B[ih];W[qi];B[qo];W[lc];B[pc];W[mb];B[lb];W[kb]\n;B[nb];W[md];B[ma];W[ld];B[ij];W[kp];B[fq];W[hq];B[dn];W[en]\n;B[em];W[eo];B[cq];W[dq];B[cp];W[do];B[co];W[dm];B[cn];W[fm]\n;B[el];W[fl];B[fk];W[ek];B[dl];W[gk];B[fj];W[gj];B[fi];W[gi]\n;B[fh];W[gh];B[fg];W[gg];B[ff];W[gf];B[kj];W[lj];B[li];W[cl]\n;B[dk];W[kk];B[jj];W[lh];B[kd];W[kc];B[mi];W[kh];B[lk];W[mj]\n;B[kl];W[mk];B[ll];W[ml];B[ln];W[mm];B[jn];W[nq];B[hm];W[jh]\n;B[gn];W[fn];B[qm];W[cr];B[br];W[dr];B[ip];W[iq];B[gp];W[cm]\n;B[ck];W[bk];B[bj];W[bn];B[bo];W[bq];B[bm];W[pp];B[qp];W[pr]\n;B[oq];W[or];B[qr];W[op];B[qq];W[hp];B[ho];W[ko];B[jp];W[jq]\n;B[kn];W[no];B[gq];W[kq];B[hj];W[ig];B[qk])"
  },
  {
    "id": "ke-park-2014",
    "title": {
      "zh": "柯洁对朴廷桓",
      "en": "Ke Jie vs Park Junghwan",
      "ko": "커제 대 박정환",
      "ja": "柯潔対朴廷桓"
    },
    "black": "Ke Jie",
    "white": "Park Junghwan",
    "blackName": {
      "zh": "柯洁",
      "en": "Ke Jie",
      "ko": "커제",
      "ja": "柯潔"
    },
    "whiteName": {
      "zh": "朴廷桓",
      "en": "Park Junghwan",
      "ko": "박정환",
      "ja": "朴廷桓"
    },
    "event": "2nd Bailing Cup",
    "date": "2014-09-18",
    "result": "B+R",
    "note": {
      "zh": "2014 年第二届百灵杯半决赛第一局。柯洁执黑中盘胜朴廷桓。",
      "en": "Game 1 of the 2nd Bailing Cup semifinal, 2014. Ke Jie beat Park Junghwan by resignation with Black.",
      "ko": "2014년 제2회 바이링배 준결승 1국. 커제가 흑으로 박정환을 불계로 이겼습니다.",
      "ja": "2014年第2回百霊杯準決勝第1局。柯潔が黒番で朴廷桓を中押しで破りました。"
    },
    "sgf": "(;\nEV[2nd Bailing Cup]\nRO[Semifinals, Game 1]\nPB[Ke Jie]\nBR[4p]\nPW[Park Junghwan]\nWR[9p]\nKM[7.5]\nRE[B+R]\nDT[2014-09-18]\nPC[China]\n\n;B[qd];W[dc];B[pq];W[dq];B[oc];W[po];B[qo];W[qn];B[qp];W[pm]\n;B[de];W[ce];B[cf];W[cd];B[co];W[cj];B[dg];W[ch];B[bf];W[fd]\n;B[ei];W[ek];B[ep];W[eq];B[fp];W[gq];B[cl];W[ck];B[dl];W[ej]\n;B[di];W[cp];B[bp];W[bq];B[dp];W[cq];B[gj];W[gk];B[hk];W[gm]\n;B[gl];W[fl];B[fk];W[fj];B[fi];W[gk];B[hl];W[em];B[gp];W[cn]\n;B[bo];W[dn];B[do];W[hq];B[bn];W[bm];B[bl];W[cm];B[am];W[hm]\n;B[en];W[dm];B[hp];W[hj];B[gi];W[fk];B[ij];W[jm];B[fn];W[fm]\n;B[jp];W[np];B[iq];W[ko];B[fq];W[fr];B[ir];W[gr];B[aq];W[ar]\n;B[hc];W[ef];B[he];W[ph];B[nh];W[oe];B[pf];W[nc];B[nb];W[mb]\n;B[ob];W[le];B[of];W[pj];B[lc];W[kc];B[mc];W[je];B[gf];W[gb]\n;B[jc];W[lh];B[oj];W[ng];B[pk];W[pi];B[mh];W[og];B[li];W[ok]\n;B[lg];W[nf];B[oo];W[nk];B[on];W[io];B[jo];W[jn];B[kp];W[lo]\n;B[lp];W[mo];B[om];W[op];B[pp];W[pl];B[pn];W[rn];B[nr];W[kh]\n;B[ap];W[br];B[lm];W[kl];B[kj];W[ih];B[jh];W[jg];B[ji];W[kg]\n;B[ll];W[il];B[ik];W[ho];B[gn];W[hg];B[ii];W[hn];B[al];W[bi]\n;B[aj];W[ip];B[an];W[or];B[oq];W[km];B[kk];W[mr];B[nq];W[mq]\n;B[mp];W[kr];B[jq];W[no];B[ms];W[lr];B[js])"
  }
];

