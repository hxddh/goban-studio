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
    "应用界面没能连接到读写文件的部分，所以现在什么都不会读取或保存，你的对局和设置都还在原处。请重试；如果问题持续，请退出并重新打开 Goban Studio。",
    "The app's window couldn't connect to the part that reads and writes your files, so nothing is read or saved right now. Your games and settings are still where they were. Retry, and if this keeps happening, quit and reopen Goban Studio.",
    "앱 화면이 파일을 읽고 쓰는 부분에 연결하지 못해 지금은 아무것도 읽거나 저장하지 않습니다. 대국과 설정은 그대로 있습니다. 다시 시도하고, 계속 이러면 Goban Studio를 종료한 뒤 다시 여세요.",
    "アプリの画面がファイルを読み書きする部分に接続できなかったため、いまは何も読み込み・保存しません。対局と設定はそのまま残っています。再試行し、続くようなら Goban Studio を終了して開き直してください。",
  ),

  // The safe state (app/safety.jsx StoreProblem, ReadOnlyBanner).
  "v13.safe.title": m("有些保存的数据无法读取", "Some of your saved data couldn't be read", "저장된 데이터 일부를 읽을 수 없습니다", "保存したデータの一部を読み込めませんでした"),
  "v13.safe.files": m(
    "下面的文件没能读取。为了不覆盖它们，Goban Studio 没有把你当作新用户重新开始。",
    "The files below couldn't be read. So as not to write over them, Goban Studio hasn't started over as if you were new.",
    "아래 파일을 읽지 못했습니다. 덮어쓰지 않도록 Goban Studio는 새 사용자처럼 처음부터 시작하지 않았습니다.",
    "下のファイルを読み込めませんでした。上書きしないよう、Goban Studio は新しい利用者として最初からやり直していません。",
  ),
  "v13.safe.list": m(
    "无法列出数据文件夹里的文件。为了不覆盖任何东西，Goban Studio 没有重新开始。",
    "The files in your data folder couldn't be listed. So as not to write over anything, Goban Studio hasn't started over.",
    "데이터 폴더의 파일 목록을 읽지 못했습니다. 아무것도 덮어쓰지 않도록 Goban Studio는 처음부터 시작하지 않았습니다.",
    "データフォルダーのファイル一覧を読み込めませんでした。何も上書きしないよう、Goban Studio は最初からやり直していません。",
  ),
  "v13.safe.newer": m(
    "这些文件是由更新版本的 Goban Studio 保存的，这个版本读不懂。请更新 Goban Studio，文件不会被改动。",
    "These files were saved by a newer version of Goban Studio, which this version can't read. Update Goban Studio; the files are left as they are.",
    "이 파일은 더 새 버전의 Goban Studio에서 저장되어 이 버전으로는 읽을 수 없습니다. Goban Studio를 업데이트하세요. 파일은 그대로 둡니다.",
    "これらのファイルは新しいバージョンの Goban Studio で保存されたため、このバージョンでは読めません。Goban Studio を更新してください。ファイルはそのままにします。",
  ),
  "v13.safe.nothingWritten": m("在你做出选择之前，不会写入任何内容。", "Nothing is written until you choose.", "선택하기 전까지는 아무것도 저장하지 않습니다.", "選ぶまで、何も書き込みません。"),
  "v13.safe.readOnly": m("以只读方式继续", "Continue read-only", "읽기 전용으로 계속", "読み取り専用で続ける"),
  "v13.safe.reset": m("重新开始这些文件", "Start these files over", "이 파일을 새로 시작", "これらのファイルを作り直す"),
  "v13.safe.resetHelp": m(
    "损坏的文件已原样复制到数据文件夹的 bad 文件夹中。重新开始只会替换上面列出的文件，你的棋谱不受影响。",
    "A copy of each damaged file is kept, unchanged, in the bad folder of your data folder. Starting over replaces only the files listed above; your Library is not touched.",
    "손상된 파일은 데이터 폴더의 bad 폴더에 그대로 복사해 두었습니다. 새로 시작하면 위에 있는 파일만 바뀌고 기보는 그대로입니다.",
    "壊れたファイルは、データフォルダー内の bad フォルダーにそのまま複製してあります。作り直すと上のファイルだけが置き換わり、棋譜には触れません。",
  ),
  "v13.safe.copied": m("副本：{0}", "copy: {0}", "사본: {0}", "複製：{0}"),
  "v13.safe.banner": m("只读模式：更改不会被保存。", "Read-only: changes aren't saved.", "읽기 전용: 변경 내용은 저장되지 않습니다.", "読み取り専用：変更は保存されません。"),
  "v13.readOnlyNow": m("现在是只读模式，无法进行这项操作。", "This can't be done while Goban Studio is read-only.", "읽기 전용인 동안에는 할 수 없습니다.", "読み取り専用のあいだは実行できません。"),
  "v13.file.settings": m("设置", "Settings", "설정", "設定"),
  "v13.file.profile": m("你的棋力与练习记录", "Your level and practice history", "기력과 연습 기록", "棋力と練習の記録"),
  "v13.file.current": m("进行中的对局", "The game in progress", "진행 중인 대국", "対局中の碁"),

  // Unfinished games (app/play-ctl.js parkCurrent).
  "v13.parked": m("进行中的对局已作为“未下完”存入棋谱，可以随时接着下。", "The game in progress was saved to your Library as unfinished. Open it there to continue.", "진행 중인 대국을 미완료로 기보에 저장했습니다. 기보에서 열면 이어서 둘 수 있습니다.", "対局中の碁を未完として棋譜に保存しました。棋譜から開くと続きを打てます。"),

  // Exports (play-ctl saveText, review-ctl exportReviewImage, backups).
  "v13.exportFailed": m("无法保存文件。请换个位置再试。", "The file couldn't be saved. Try another location.", "파일을 저장하지 못했습니다. 다른 위치에 다시 시도하세요.", "ファイルを保存できませんでした。別の場所でもう一度お試しください。"),
  "v13.backupSaved": m("备份已保存", "Backup saved", "백업을 저장했습니다", "バックアップを保存しました"),

  // Restoring a backup (data/backup.js, controller.js).
  "v13.restore.safety": m("恢复前会先自动保存现有数据的副本，之后可以在设置中撤销。", "Your current data is copied first, so you can undo this in Settings.", "복원하기 전에 현재 데이터를 먼저 복사해 두므로 설정에서 되돌릴 수 있습니다.", "復元の前に今のデータを複製するので、設定から元に戻せます。"),
  "v13.restore.snapshotFailed": m("无法先保存现有数据的副本，因此没有恢复任何内容。", "Your current data couldn't be copied first, so nothing was restored.", "현재 데이터를 먼저 복사하지 못해 아무것도 복원하지 않았습니다.", "今のデータを先に複製できなかったため、何も復元していません。"),
  "v13.backup.tooLarge": m("备份中有一个文件太大，无法恢复。", "A file in this backup is too large to restore.", "이 백업에 복원하기에는 너무 큰 파일이 있습니다.", "このバックアップには、復元するには大きすぎるファイルがあります。"),
  "v13.note.restored": m("备份已恢复。如需撤销，请前往 设置 → 数据。", "Backup restored. To undo it, go to Settings → Data.", "백업을 복원했습니다. 되돌리려면 설정 → 데이터로 가세요.", "バックアップを復元しました。元に戻すには 設定 → データ へ。"),
  "v13.note.undone": m("已恢复到上次恢复备份之前的数据。", "Your data is back as it was before the last restore.", "마지막 복원 전의 데이터로 되돌렸습니다.", "最後の復元の前のデータに戻しました。"),
  "v13.note.restorePartial": m(
    "恢复没有全部完成。已重新读取磁盘上的数据；可以在 设置 → 数据 中撤销。",
    "The restore didn't finish. What is on disk has been read again; you can undo it in Settings → Data.",
    "복원이 끝나지 않았습니다. 디스크에 있는 데이터를 다시 읽었습니다. 설정 → 데이터에서 되돌릴 수 있습니다.",
    "復元が最後まで終わりませんでした。ディスク上のデータを読み直しました。設定 → データ から元に戻せます。",
  ),
  "v13.undoRestore.row": m("撤销上次恢复（{0} 之前的数据）", "Undo the last restore (your data from before {0})", "마지막 복원 되돌리기 ({0} 이전 데이터)", "最後の復元を元に戻す（{0} より前のデータ）"),
  "v13.undoRestore.title": m("撤销上次恢复？", "Undo the last restore?", "마지막 복원을 되돌릴까요?", "最後の復元を元に戻しますか？"),
  "v13.undoRestore.body": m("现有数据会被替换为恢复备份之前的数据。", "Your data is replaced with what it was before the backup was restored.", "현재 데이터가 백업을 복원하기 전의 데이터로 바뀝니다.", "今のデータが、バックアップを復元する前のデータに置き換わります。"),
  "v13.undoRestore.confirm": m("撤销恢复", "Undo restore", "복원 되돌리기", "復元を元に戻す"),
  "v13.undoRestore.none": m("没有可以撤销的恢复。", "There is no restore to undo.", "되돌릴 복원이 없습니다.", "元に戻せる復元はありません。"),
};
