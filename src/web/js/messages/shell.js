/**
 * Strings of the shell (docs/v9.md, "Layout"): the two spaces, storage,
 * backups. messages.js merges every area file into MESSAGES.
 */
import { m } from "./m.js";

export const SHELL = {
  "nav.play": m("下棋", "Play", "대국", "対局"),
  "nav.learn": m("学棋", "Learn", "배우기", "学ぶ"),

  // The store (data/store.js): one toast however many writes failed.
  "store.writeFailed": m(
    "无法把更改存到磁盘，现在退出可能会丢失最近的更改。",
    "Couldn't save your changes to disk. If you quit now, the latest ones may be lost.",
    "변경 내용을 디스크에 저장하지 못했습니다. 지금 끝내면 최근 변경이 사라질 수 있습니다.",
    "変更をディスクに保存できませんでした。今終了すると、最近の変更が失われることがあります。",
  ),
  "store.readFailed": m("有些保存的数据无法读取。", "Some saved data couldn't be read.", "저장된 데이터 일부를 읽을 수 없습니다.", "保存したデータの一部を読み込めませんでした。"),

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
};
