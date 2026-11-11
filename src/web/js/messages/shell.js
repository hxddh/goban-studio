/**
 * Strings of the shell (docs/v9.md, "Layout"): the two spaces, storage,
 * backups. messages.js merges every area file into MESSAGES.
 */
import { m } from "./m.js";

export const SHELL = {
  "nav.play": m("下棋", "Play", "대국", "対局"),
  "nav.learn": m("练习", "Practice", "연습", "練習"),
  "nav.today": m("今天", "Today", "오늘", "今日"),
  "nav.library": m("棋谱", "Library", "기보", "棋譜"),
  "today.morning": m("早上好", "Good morning", "좋은 아침입니다", "おはようございます"),
  "today.afternoon": m("下午好", "Good afternoon", "안녕하세요", "こんにちは"),
  "today.evening": m("晚上好", "Good evening", "좋은 저녁 되세요", "こんばんは"),
  "today.night": m("夜深了", "Late night", "늦은 밤이네요", "夜更けですね"),
  "today.practice": m("今天的练习", "Today's practice", "오늘의 연습", "今日の練習"),
  "today.next": m("下一项", "Next", "다음", "次"),
  "today.week": m("本周", "This week", "이번 주", "今週"),
  "today.weekLine": m("下了 {0} 盘棋，做对 {1} 道题。", "{0} games played, {1} problems solved.", "대국 {0}판, 문제 {1}개 해결.", "対局 {0} 局、正解 {1} 問。"),
  "today.weekNone": m("这周还没有下棋或做题。", "No games or problems yet this week.", "이번 주에는 아직 대국이나 문제가 없습니다.", "今週はまだ対局も問題もありません。"),
  "today.recent": m("最近的对局", "Recent games", "최근 대국", "最近の対局"),

  // The store (data/store.js): one toast however many writes failed.
  "store.writeFailed": m(
    "无法把更改存到磁盘，现在退出可能会丢失最近的更改。",
    "Couldn't save your changes to disk. If you quit now, the latest ones may be lost.",
    "변경 내용을 디스크에 저장하지 못했습니다. 지금 끝내면 최근 변경이 사라질 수 있습니다.",
    "変更をディスクに保存できませんでした。今終了すると、最近の変更が失われることがあります。",
  ),
  "store.readFailed": m("有些保存的数据无法读取。", "Some saved data couldn't be read.", "저장된 데이터 일부를 읽을 수 없습니다.", "保存したデータの一部を読み込めませんでした。"),

  // SGF import (sgf.js): what the file as a whole needs said.
  // {0} is the number of games in the file.
  "sgf.warn.collection": m(
    "这个文件里有 {0} 局棋，只导入了第 1 局。",
    "This file holds {0} games; only the first was imported.",
    "이 파일에는 대국이 {0}개 있습니다. 첫 번째 대국만 가져왔습니다.",
    "このファイルには {0} 局あります。最初の1局だけを読み込みました。",
  ),
  // {0} is the charset's name (GBK, Big5, Shift_JIS, EUC-JP, EUC-KR).
  "sgf.warn.guessedCharset": m(
    "棋谱没有写明文字编码，已按 {0} 读取。如果名字是乱码，请先把文件另存为 UTF-8。",
    "The record doesn't name its text encoding; it was read as {0}. If names look wrong, re-save the file as UTF-8 first.",
    "기보에 문자 인코딩이 적혀 있지 않아 {0}(으)로 읽었습니다. 이름이 깨져 보이면 파일을 UTF-8로 다시 저장해 주세요.",
    "棋譜に文字コードの指定がないため、{0} として読み込みました。名前が文字化けしている場合は、ファイルを UTF-8 で保存し直してください。",
  ),
  // {0} is KM as written in the record, {1} the komi used instead.
  "sgf.warn.komi": m(
    "棋谱里的贴目“{0}”无法识别，已按 {1} 目处理。",
    "The record's komi \"{0}\" can't be read; {1} was used instead.",
    "기보의 덤 \"{0}\"을(를) 알 수 없어 {1}집으로 처리했습니다.",
    "棋譜のコミ「{0}」を読み取れないため、{1} 目として読み込みました。",
  ),

  // Backups (data/backup.js): every stored file in one document.
  "backup.help": m(
    "把设置、棋力、学习记录、错题和全部对局存成一个文件；换电脑时用它恢复。",
    "Saves your settings, level, learning, mistake drills and every game in one file. Use it to move to another computer.",
    "설정, 기력, 학습 기록, 오답 연습과 모든 대국을 파일 하나로 저장합니다. 다른 컴퓨터로 옮길 때 쓰세요.",
    "設定・棋力・学習の記録・間違えた手・すべての対局を1つのファイルに保存します。別のコンピュータへ移るときに使います。",
  ),
  "backup.confirmFiles": m(
    "备份里有 {0} 盘对局，共 {1} 个文件。现在的数据会被全部替换。",
    "The backup holds {0} games in {1} files. Everything you have now will be replaced.",
    "백업에는 대국 {0}판, 파일 {1}개가 있습니다. 지금의 데이터는 모두 바뀝니다.",
    "バックアップには対局 {0} 局、{1} 個のファイルがあります。今のデータはすべて置き換わります。",
  ),
  "backup.error.olderVersion": m(
    "这份备份来自旧版本，这个版本不再读取。",
    "This backup is from an earlier version, which this version no longer reads.",
    "이전 버전에서 만든 백업이라 이 버전에서는 읽지 않습니다.",
    "以前のバージョンのバックアップのため、このバージョンでは読み込みません。",
  ),
  "backup.error.newerVersion": m("这份备份来自更新的版本，请先更新 Goban Studio。", "This backup is from a newer version. Update Goban Studio first.", "더 새 버전에서 만든 백업입니다. 먼저 Goban Studio를 업데이트하세요.", "新しいバージョンのバックアップです。先に Goban Studio を更新してください。"),
  "toast.saved": m("已保存到我的对局", "Saved to your games", "내 대국에 저장했습니다", "自分の対局に保存しました"),

  // Feedback (app/feedback.jsx, app/parts.jsx): toasts, tasks, error cards.
  "common.retry": m("重试", "Retry", "다시 시도", "再試行"),
  "common.undoAction": m("撤销", "Undo", "실행 취소", "元に戻す"),
  "list.comma": m("、", ", ", ", ", "、"),
  "toast.region": m("通知", "Notifications", "알림", "通知"),
  "task.loading": m("正在载入…", "Loading…", "불러오는 중…", "読み込み中…"),
  "task.failed": m("这部分内容没能载入。", "This couldn't be loaded.", "이 내용을 불러오지 못했습니다.", "この内容を読み込めませんでした。"),
  "task.contentFailed": m(
    "这部分内容没能载入，所以刚才没有打开。",
    "This content couldn't be loaded, so nothing opened.",
    "이 내용을 불러오지 못해 열리지 않았습니다.",
    "この内容を読み込めなかったため、開けませんでした。",
  ),
  "task.openingGame": m("正在打开这盘棋…", "Opening this game…", "이 대국을 여는 중…", "この対局を開いています…"),
  "task.gameFailed": m("这盘棋的文件没能读取。", "This game's file couldn't be read.", "이 대국의 파일을 읽지 못했습니다.", "この対局のファイルを読み込めませんでした。"),
  "error.unexpected": m(
    "出了点问题，刚才的操作可能没有完成。",
    "Something went wrong. What you just did may not have finished.",
    "문제가 생겼습니다. 방금 한 작업이 끝나지 않았을 수 있습니다.",
    "問題が起きました。今の操作は完了していないかもしれません。",
  ),
  "error.sheet": m("这个面板没能打开。", "That panel couldn't be opened.", "이 창을 열지 못했습니다.", "このパネルを開けませんでした。"),
  "error.page.title": m("这一页出了点问题", "This page ran into a problem", "이 페이지에 문제가 생겼습니다", "このページで問題が起きました"),
  "error.page.body": m(
    "它没能显示出来。你可以重试，或者回到“今天”。",
    "It couldn't be shown. Try again, or go back to Today.",
    "페이지를 표시하지 못했습니다. 다시 시도하거나 ‘오늘’로 돌아가세요.",
    "表示できませんでした。もう一度試すか、「今日」に戻ってください。",
  ),
  "error.tryAgain": m("重试", "Try again", "다시 시도", "もう一度試す"),
  "error.goToday": m("回到今天", "Go to Today", "오늘로 가기", "今日に戻る"),
  "library.deleted": m("对局已删除", "Game deleted", "대국을 삭제했습니다", "対局を削除しました"),
  "safe.resetFailed": m(
    "没能删除{0}，所以还不能重新开始。请重试。",
    "{0} couldn't be removed, so these files weren't started over. Try again.",
    "{0} 파일을 지우지 못해 새로 시작하지 못했습니다. 다시 시도하세요.",
    "{0}を削除できなかったため、やり直せませんでした。もう一度試してください。",
  ),
  "clear.failed": m(
    "没能删除全部数据：{0} 删不掉。",
    "Not everything could be deleted: {0} is still there.",
    "모든 데이터를 지우지 못했습니다. {0} 파일이 남아 있습니다.",
    "すべてのデータは削除できませんでした。{0} が残っています。",
  ),
  "clear.failedMore": m("{0} 和另外 {1} 个文件", "{0} and {1} more", "{0} 외 {1}개", "{0} ほか {1} 個"),
};
