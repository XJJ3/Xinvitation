import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { env } from "./env.js"

mkdirSync(dirname(env.dbPath), { recursive: true })

export const db = new DatabaseSync(env.dbPath)

// WAL：读写互不阻塞；busy_timeout 兜住备份脚本等外部进程短暂持锁
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 3000;

  -- 宾客：vid 为前端生成的唯一 ID；no 自增，后台显示为「宾客 #no」（按首次到访先后）
  CREATE TABLE IF NOT EXISTS visitors (
    no         INTEGER PRIMARY KEY,
    vid        TEXT    NOT NULL UNIQUE,
    fp         TEXT,
    ip         TEXT,
    ua         TEXT,
    first_at   INTEGER NOT NULL,
    last_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_visitors_fp ON visitors(fp);

  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY,
    type       TEXT    NOT NULL,
    vid        TEXT    NOT NULL,
    ip         TEXT,
    ua         TEXT,
    ref        TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(type, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_vid ON events(vid);

  -- 每个访客只能点亮一次，计数 = 行数
  CREATE TABLE IF NOT EXISTS lights (
    vid        TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blessings (
    id         INTEGER PRIMARY KEY,
    vid        TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    ip         TEXT,
    ua         TEXT,
    hidden     INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_blessings_time ON blessings(hidden, created_at);
`)

// 幂等迁移：visitors 补充姓名与回执字段（老库缺列时补齐，每次启动安全执行）
const visitorColumns = new Set(
  (db.prepare("PRAGMA table_info(visitors)").all() as { name: string }[]).map(c => c.name),
)
const MIGRATIONS: [string, string][] = [
  ["name", "ALTER TABLE visitors ADD COLUMN name TEXT"],
  ["attending", "ALTER TABLE visitors ADD COLUMN attending INTEGER"],
  ["guests", "ALTER TABLE visitors ADD COLUMN guests INTEGER"],
]
for (const [col, sql] of MIGRATIONS) {
  if (!visitorColumns.has(col)) db.exec(sql)
}

const updateVisitor = db.prepare(
  "UPDATE visitors SET fp = COALESCE(?, fp), ip = ?, ua = ?, last_at = ? WHERE vid = ?",
)
const insertVisitor = db.prepare(
  "INSERT OR IGNORE INTO visitors (vid, fp, ip, ua, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?)",
)

// 先更新、不存在再插入：宾客编号只在真正新增时分配，保持连续（UPSERT 冲突也会占用编号）
export function touchVisitor(v: { vid: string; fp?: string; ip: string; ua: string }, now: number) {
  const fp = v.fp ?? null
  if (updateVisitor.run(fp, v.ip, v.ua, now, v.vid).changes) return
  insertVisitor.run(v.vid, fp, v.ip, v.ua, now, now)
}
