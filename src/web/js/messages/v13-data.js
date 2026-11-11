/**
 * v13 strings of the data layer (docs/storage.md): the safe state, the
 * missing bridge, unfinished games, exports, and restoring a backup.
 * messages.js merges every area file into MESSAGES.
 */
import { m } from "./m.js";

export const DATA13 = {
  "v13.retry": m("重试", "Retry", "다시 시도", "再試行"),

  // The packaged app without its bridge to the host (app/safety.jsx BootError).
  "v13.bridge.title": m("Goban Studio 无法访问你的数据", "Goban Studio can't reach your data", "Goban Studio가 데이터에 접근할 수 없습니다", "Goban Studio がデータにアクセスできません"),
  "v13.bridge.body": m(
    "暂时无法读取或保存数据，你的对局和设置没有受影响。请重试；仍不行就退出后重新打开。",
    "Your data can't be read or saved right now. Nothing has been lost. Retry, or quit and reopen.",
    "지금은 데이터를 읽거나 저장할 수 없습니다. 대국과 설정은 그대로입니다. 다시 시도하고, 그래도 안 되면 종료한 뒤 다시 여세요.",
    "いまはデータの読み込みも保存もできません。対局と設定は失われていません。再試行し、それでもだめなら終了して開き直してください。",
  ),

  // The safe state (app/safety.jsx StoreProblem, ReadOnlyBanner).
  "v13.safe.title": m("有些保存的数据无法读取", "Some of your saved data couldn't be read", "저장된 데이터 일부를 읽을 수 없습니다", "保存したデータの一部を読み込めませんでした"),
  "v13.safe.files": m("下面的文件读不出来。它们没有被改动，Goban Studio 也不会覆盖它们。", "These files couldn't be read. They have not been changed or overwritten.", "아래 파일을 읽지 못했습니다. 파일은 바뀌지 않았고, Goban Studio가 덮어쓰지도 않습니다.", "下のファイルを読み込めませんでした。ファイルは変更されておらず、上書きもしません。"),
  "v13.safe.list": m(
    "读不出数据文件夹里有哪些文件。里面的内容没有被改动，Goban Studio 也不会覆盖它们。",
    "The files in your data folder couldn't be listed. Nothing in it has been changed or overwritten.",
    "데이터 폴더의 파일 목록을 읽지 못했습니다. 폴더 안의 내용은 바뀌지 않았고 덮어쓰지도 않습니다.",
    "データフォルダーのファイル一覧を読み込めませんでした。中身は変更されておらず、上書きもしません。",
  ),
  "v13.safe.newer": m(
    "这些文件是更新版本的 Goban Studio 保存的，这个版本读不了。文件没有被改动。请更新 Goban Studio。",
    "These files were saved by a newer version of Goban Studio. They have not been changed. Update Goban Studio to open them.",
    "이 파일은 더 새 버전의 Goban Studio에서 저장했습니다. 파일은 바뀌지 않았습니다. Goban Studio를 업데이트하면 열 수 있습니다.",
    "これらのファイルは新しいバージョンの Goban Studio で保存されました。ファイルは変更されていません。Goban Studio を更新すると開けます。",
  ),
  "v13.safe.nothingWritten": m("在你选择之前，什么都不会写入。", "Nothing is written until you choose.", "선택하기 전까지는 아무것도 저장하지 않습니다.", "選ぶまで、何も書き込みません。"),
  "v13.safe.readOnly": m("以只读方式继续", "Continue read-only", "읽기 전용으로 계속", "読み取り専用で続ける"),
  "v13.safe.reset": m("重置这些数据", "Reset these items", "이 항목 초기화", "これらの項目をリセット"),
  "v13.safe.resetHelp": m(
    "损坏的文件已原样存了一份副本，在数据文件夹的 bad 文件夹里。重置只影响上面列出的项目，你的棋谱不受影响。",
    "A copy of each damaged file is kept, unchanged, in the bad folder of your data folder. Resetting affects only the items listed above; your Library is not touched.",
    "손상된 파일은 데이터 폴더의 bad 폴더에 그대로 복사해 두었습니다. 초기화는 위 항목만 바꾸며 기보는 그대로입니다.",
    "壊れたファイルは、データフォルダー内の bad フォルダーにそのまま複製してあります。リセットされるのは上の項目だけで、棋譜はそのままです。",
  ),
  "v13.safe.copied": m("副本：{0}", "copy: {0}", "사본: {0}", "複製：{0}"),
  "v13.safe.banner": m("只读模式：现在的更改不会保存。", "Read-only: changes aren't saved.", "읽기 전용: 변경 내용은 저장되지 않습니다.", "読み取り専用：変更は保存されません。"),
  "v13.readOnlyNow": m("只读模式下不能这样做。你的数据没有变化。", "This can't be done in read-only mode. Your data is unchanged.", "읽기 전용 모드에서는 할 수 없습니다. 데이터는 그대로입니다.", "読み取り専用モードでは実行できません。データはそのままです。"),
  "v13.file.settings": m("设置", "Settings", "설정", "設定"),
  "v13.file.profile": m("你的棋力与练习记录", "Your level and practice history", "기력과 연습 기록", "棋力と練習の記録"),
  "v13.file.current": m("进行中的对局", "The game in progress", "진행 중인 대국", "対局中の碁"),

  // Unfinished games (app/play-ctl.js parkCurrent).
  "v13.parked": m("进行中的对局已存入棋谱，标为“未下完”。在棋谱里打开就能接着下。", "The game in progress was saved to your Library as unfinished. Open it there to continue.", "진행 중인 대국을 미완료로 기보에 저장했습니다. 기보에서 열면 이어서 둘 수 있습니다.", "対局中の碁を未完として棋譜に保存しました。棋譜から開くと続きを打てます。"),

  // Exports (play-ctl saveText, review-ctl exportReviewImage, backups).
  "v13.exportFailed": m("文件没能保存，你的数据没有变化。请换个位置再试。", "The file couldn't be saved. Your data is unchanged. Try another location.", "파일을 저장하지 못했습니다. 데이터는 그대로입니다. 다른 위치에 다시 시도하세요.", "ファイルを保存できませんでした。データはそのままです。別の場所でもう一度お試しください。"),
  "v13.backupSaved": m("备份已保存", "Backup saved", "백업을 저장했습니다", "バックアップを保存しました"),

  // Restoring a backup (data/backup.js, controller.js).
  "v13.restore.safety": m("恢复前会先保存一份现有数据，30 天内可以在“设置 → 数据”中撤销。", "Your current data is copied first; you can undo this in Settings → Data for 30 days.", "복원하기 전에 현재 데이터를 복사해 둡니다. 30일 동안 설정 → 데이터에서 되돌릴 수 있습니다.", "復元の前に今のデータを複製します。30日間は 設定 → データ から元に戻せます。"),
  "v13.restore.snapshotFailed": m("没能先保存现有数据，所以没有恢复。你的数据没有变化。", "Your current data couldn't be copied first, so nothing was restored. Your data is unchanged.", "현재 데이터를 먼저 복사하지 못해 복원하지 않았습니다. 데이터는 그대로입니다.", "今のデータを先に複製できなかったため、復元していません。データはそのままです。"),
  "v13.backup.tooLarge": m("备份里有一个文件太大，无法恢复。你的数据没有变化。", "A file in this backup is too large to restore. Your data is unchanged.", "이 백업에 너무 큰 파일이 있어 복원할 수 없습니다. 데이터는 그대로입니다.", "このバックアップには大きすぎるファイルがあり、復元できません。データはそのままです。"),
  "v13.note.restored": m("备份已恢复。可以在“设置 → 数据”中撤销。", "Backup restored. You can undo this in Settings → Data.", "백업을 복원했습니다. 설정 → 데이터에서 되돌릴 수 있습니다.", "バックアップを復元しました。設定 → データ から元に戻せます。"),
  "v13.note.undone": m("已撤销：数据回到了恢复备份之前。", "Undone. Your data is as it was before the restore.", "되돌렸습니다. 데이터가 복원 전 상태로 돌아갔습니다.", "元に戻しました。データは復元の前の状態です。"),
  "v13.note.restorePartial": m("备份没有完全恢复。可以在“设置 → 数据”中撤销。", "The backup wasn't fully restored. You can undo this in Settings → Data.", "백업이 완전히 복원되지 않았습니다. 설정 → 데이터에서 되돌릴 수 있습니다.", "バックアップを完全には復元できませんでした。設定 → データ から元に戻せます。"),
  "v13.undoRestore.row": m("撤销上次恢复（回到 {0} 之前的数据）", "Undo the last restore (back to your data from before {0})", "마지막 복원 되돌리기 ({0} 이전 데이터로)", "最後の復元を元に戻す（{0} より前のデータへ）"),
  "v13.undoRestore.title": m("撤销上次恢复？", "Undo the last restore?", "마지막 복원을 되돌릴까요?", "最後の復元を元に戻しますか？"),
  "v13.undoRestore.body": m(
    "现有数据会换回恢复备份之前的样子。换之前会先保存一份现有数据，所以这一步也能撤销。",
    "Your data goes back to what it was before the backup was restored. What you have now is copied first, so this too can be undone.",
    "현재 데이터가 백업을 복원하기 전의 데이터로 바뀝니다. 지금 데이터를 먼저 복사해 두므로 이 작업도 되돌릴 수 있습니다.",
    "今のデータが、バックアップを復元する前のデータに戻ります。今のデータを先に複製するので、この操作も元に戻せます。",
  ),
  "v13.undoRestore.confirm": m("撤销恢复", "Undo restore", "복원 되돌리기", "復元を元に戻す"),
  "v13.undoRestore.none": m("没有可以撤销的恢复。", "There is no restore to undo.", "되돌릴 복원이 없습니다.", "元に戻せる復元はありません。"),
};
