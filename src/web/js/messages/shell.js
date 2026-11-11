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
  "safe.resetFailed": m("没能删除{0}，所以还没有重置。请重试。", "{0} couldn't be removed, so nothing was reset. Try again.", "{0} 파일을 지우지 못해 초기화하지 못했습니다. 다시 시도하세요.", "{0}を削除できなかったため、リセットできませんでした。もう一度試してください。"),
  "clear.failed": m(
    "没能删除全部数据：{0} 删不掉。",
    "Not everything could be deleted: {0} is still there.",
    "모든 데이터를 지우지 못했습니다. {0} 파일이 남아 있습니다.",
    "すべてのデータは削除できませんでした。{0} が残っています。",
  ),
  "clear.failedMore": m("{0} 和另外 {1} 个文件", "{0} and {1} more", "{0} 외 {1}개", "{0} ほか {1} 個"),

  // Settings by pane (app/sheets.jsx), the level sheet, the New game sheet's size cards.
  "settings.pane.you": m("棋力与练习", "You", "기력과 연습", "棋力と練習"),
  "settings.pane.engines": m("引擎", "Engines", "엔진", "エンジン"),
  "settings.soundGroup": m("声音", "Sound", "소리", "サウンド"),
  "settings.volume.off": m("关", "Off", "끔", "オフ"),
  "settings.volume.quiet": m("轻", "Quiet", "작게", "小"),
  "settings.volume.normal": m("中", "Normal", "보통", "中"),
  "settings.volume.loud": m("响", "Loud", "크게", "大"),
  "settings.boardStyle": m("棋盘样式", "Board", "바둑판 스타일", "碁盤のスタイル"),
  "settings.boardStyle.standard": m("标准", "Standard", "표준", "標準"),
  "settings.boardStyle.contrast": m("高对比", "High contrast", "고대비", "ハイコントラスト"),
  "settings.boardStyleHelp": m(
    "高对比棋盘没有木色，线条更重，棋子有清楚的边：在强光下、暗处或需要更清晰时更容易看。",
    "The high-contrast board is plain, with strong lines and clear rims on the stones: easier to read in a bright or dim room.",
    "고대비 바둑판은 나무색이 없고 선이 굵으며 돌의 테두리가 뚜렷합니다. 밝거나 어두운 곳에서 더 잘 보입니다.",
    "ハイコントラストの碁盤は無地で線が太く、石の縁がはっきりしています。明るい場所や暗い場所でも見やすくなります。",
  ),
  "settings.lastMove": m("标出最后一手", "Mark the last move", "마지막 수 표시", "最後の一手に印を付ける"),
  "settings.placing": m("落子", "Placing stones", "착수", "着手"),
  "settings.level.change": m("修改…", "Change…", "변경…", "変更…"),
  "settings.level.fromYou": m(
    "这是你自己估的，下过几盘之后会按战绩调整。",
    "This is your own estimate. After a few games it follows your results.",
    "직접 고른 값입니다. 몇 판 두고 나면 결과에 따라 조정됩니다.",
    "あなたが選んだ目安です。何局か打つと、結果に合わせて調整されます。",
  ),
  "settings.level.fromGames": m("根据 {0} 盘对局估计。", "Estimated from {0} games.", "대국 {0}판으로 추정했습니다.", "{0}局の対局から推定しています。"),
  "settings.level.fromGames.one": m("根据 {0} 盘对局估计。", "Estimated from {0} game.", "대국 {0}판으로 추정했습니다.", "{0}局の対局から推定しています。"),
  "settings.level.help": m(
    "选个大概的就行。估计会从这里重新开始，再按你的对局调整。",
    "A rough level is enough. The estimate starts again from here, then follows your games.",
    "대략적인 기력이면 충분합니다. 추정은 여기서 다시 시작해 대국 결과에 따라 조정됩니다.",
    "おおよその棋力でかまいません。推定はここからやり直し、対局の結果に合わせて調整されます。",
  ),
  "settings.practiceGroup": m("练习", "Practice", "연습", "練習"),
  "settings.daily": m("每天的练习", "Daily practice", "하루 연습", "毎日の練習"),
  "settings.daily.n": m("{0} 题", "{0} problems", "{0}문제", "{0}問"),
  "settings.dailyHelp": m("“今天的练习”里做几道题。", "How many problems Today's practice holds.", "‘오늘의 연습’에 들어가는 문제 수입니다.", "「今日の練習」に入る問題の数です。"),
  "settings.folderGroup": m("数据文件夹", "Data folder", "데이터 폴더", "データフォルダー"),
  "settings.reveal": m("打开数据文件夹", "Show data folder", "데이터 폴더 열기", "データフォルダーを開く"),
  "settings.reveal.failed": m("无法打开数据文件夹。", "The data folder couldn't be opened.", "데이터 폴더를 열 수 없습니다.", "データフォルダーを開けませんでした。"),
  "settings.dataKept": m(
    "你的设置、进度和棋谱都在这个文件夹里。卸载应用不会删除它。",
    "Your settings, progress and games are in this folder. Uninstalling the app leaves it in place.",
    "설정, 진도, 기보가 모두 이 폴더에 있습니다. 앱을 삭제해도 폴더는 남습니다.",
    "設定、進捗、棋譜はこのフォルダーにあります。アプリを削除しても残ります。",
  ),
  "settings.eraseGroup": m("清除", "Erase", "지우기", "消去"),
  "settings.updatesGroup": m("更新", "Updates", "업데이트", "アップデート"),
  "settings.undoRestoreNote": m(
    "这份副本保留 30 天；导出新的备份后会被删除。",
    "This copy is kept for 30 days, or until you export a new backup.",
    "이 사본은 30일 동안, 또는 새 백업을 내보낼 때까지 보관됩니다.",
    "この複製は30日間、または新しいバックアップを書き出すまで保管されます。",
  ),
  "newGame.size": m("{0} 路", "{0}×{0}", "{0}줄", "{0}路"),

  // Onboarding's last line, and Today's hero for someone who never played (app/first-run.jsx).
  "onboarding.rulesLine": m("新对局使用{0}，可以在设置里更改。", "New games use {0}. You can change this in Settings.", "새 대국은 {0:을/를} 사용합니다. 설정에서 바꿀 수 있습니다.", "新しい対局は{0}で打ちます。設定で変更できます。"),
  "first.eyebrow": m("从这里开始", "Start here", "여기서 시작", "ここから始めましょう"),
  "first.lesson.title": m("学会下第一手棋", "Learn your first moves", "첫 수 배우기", "最初の一手を学ぶ"),
  "first.lesson.body": m(
    "棋子、气和提子。大约十分钟后，你就能下第一盘棋。",
    "Stones, liberties and captures. In about ten minutes you'll play your first game.",
    "돌, 활로, 따내기. 10분쯤 뒤에는 첫 대국을 둘 수 있습니다.",
    "石、呼吸点、石の取り方。10分ほどで最初の一局が打てます。",
  ),
  "first.lesson.start": m("开始第一课", "Start lesson one", "1강 시작", "第1課を始める"),
};
