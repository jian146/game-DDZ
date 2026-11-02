/**
 * 玩家数据持久化层
 *
 * 设计取舍：
 *   - 用 JSON 文件而非数据库：项目是单进程 + 小规模玩家，JSON 零依赖、零版本门槛，
 *     部署环境不需要额外的 native 编译，备份就是拷一个文件。
 *   - 原子写：先写 .tmp 再 rename，进程在写入中途被杀也不会留下半个文件。
 *   - 防抖落盘：100ms 内多次改动合并成一次磁盘 IO，避免一局结算连写三次。
 *
 * 数据文件：game-ddz-server/data/players.json
 */
import fs from 'node:fs';
import path from 'node:path';

export interface PlayerRecord {
  /** 内部唯一 ID，不对外暴露 */
  id: string;
  /** 昵称，全局唯一，同时作为房间内的 playerId */
  name: string;
  /** scrypt 派生出的密码摘要（hex） */
  hash: string;
  /** 每个账号独立的盐（hex） */
  salt: string;
  /** 积分，可负 */
  score: number;
  /** 胜场 */
  wins: number;
  /** 总局数 */
  games: number;
  createdAt: number;
  lastLoginAt: number;
}

interface Database {
  version: number;
  players: PlayerRecord[];
}

/**
 * 数据目录定位：
 *   - 编译后 __dirname = game-ddz-server/dist  → 数据放 game-ddz-server/data
 *   - ts-node 直跑 __dirname = game-ddz-server → 数据同样放 game-ddz-server/data
 * 两种情况都落在同一处，避免开发/生产各存一份。
 */
const IS_COMPILED = path.basename(__dirname) === 'dist';
const DEFAULT_DATA_DIR = path.resolve(__dirname, IS_COMPILED ? '..' : '.', 'data');
export const DATA_DIR = process.env.DDZ_DATA_DIR
  ? path.resolve(process.env.DDZ_DATA_DIR)
  : DEFAULT_DATA_DIR;

const DB_FILE = path.join(DATA_DIR, 'players.json');
const TMP_FILE = DB_FILE + '.tmp';

let db: Database = { version: 1, players: [] };
let saveTimer: NodeJS.Timeout | null = null;

/** 首次启动时建库 */
function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
      db = { version: 1, players: [] };
      flush();
      console.log(`[store] 新建数据库 ${DB_FILE}`);
      return;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Database;
    if (!parsed || !Array.isArray(parsed.players)) {
      throw new Error('数据结构不合法');
    }
    // 补齐可能缺失的字段（老数据升级用）
    db = {
      version: parsed.version ?? 1,
      players: parsed.players.map((p) => ({
        score: 0,
        wins: 0,
        games: 0,
        lastLoginAt: 0,
        createdAt: Date.now(),
        ...p,
      })),
    };
    console.log(`[store] 载入 ${db.players.length} 个玩家账号`);
  } catch (e: any) {
    // 文件损坏时不能直接覆盖，先留证据再重建，否则玩家数据永久丢失
    const broken = DB_FILE + '.broken-' + Date.now();
    try {
      fs.copyFileSync(DB_FILE, broken);
      console.error(`[store] 数据文件损坏，已备份到 ${broken}`);
    } catch {}
    db = { version: 1, players: [] };
    flush();
  }
}

/** 立即同步落盘（原子写） */
function flush() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TMP_FILE, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(TMP_FILE, DB_FILE);
  } catch (e: any) {
    console.error('[store] 落盘失败:', e.message);
  }
}

/** 防抖落盘，100ms 内的多次改动只写一次磁盘 */
export function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, 100);
}

/** 进程退出前强制落盘，避免防抖窗口内的改动丢失 */
export function flushNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  flush();
}

// ============================
// 查询
// ============================

/** 昵称查找（大小写不敏感，防止 "Tom" 和 "tom" 注册成两个号） */
export function findByName(name: string): PlayerRecord | undefined {
  const key = name.trim().toLowerCase();
  return db.players.find((p) => p.name.toLowerCase() === key);
}

export function findById(id: string): PlayerRecord | undefined {
  return db.players.find((p) => p.id === id);
}

/** 排行榜：积分降序，胜场多者优先 */
export function topPlayers(limit = 20) {
  return [...db.players]
    .sort((a, b) => b.score - a.score || b.wins - a.wins)
    .slice(0, limit)
    .map((p) => ({ name: p.name, score: p.score, wins: p.wins, games: p.games }));
}

export function countPlayers(): number {
  return db.players.length;
}

// ============================
// 写入
// ============================

export function createPlayer(input: {
  id: string;
  name: string;
  hash: string;
  salt: string;
}): PlayerRecord {
  const now = Date.now();
  const record: PlayerRecord = {
    id: input.id,
    name: input.name,
    hash: input.hash,
    salt: input.salt,
    score: 0,
    wins: 0,
    games: 0,
    createdAt: now,
    lastLoginAt: now,
  };
  db.players.push(record);
  save();
  return record;
}

/** 局部更新，返回更新后的记录（找不到返回 undefined） */
export function updatePlayer(
  id: string,
  patch: Partial<Omit<PlayerRecord, 'id' | 'name'>>,
): PlayerRecord | undefined {
  const p = findById(id);
  if (!p) return undefined;
  Object.assign(p, patch);
  save();
  return p;
}

/** 对局结算：一次性累加积分/胜场/局数，减少落盘次数 */
export function applyMatchResult(
  entries: { id: string; scoreDelta: number; isWinner: boolean }[],
): void {
  let touched = false;
  for (const e of entries) {
    const p = findById(e.id);
    if (!p) continue;
    p.score += e.scoreDelta;
    p.games += 1;
    if (e.isWinner) p.wins += 1;
    touched = true;
  }
  if (touched) save();
}

/** 对外返回的安全视图（绝不带 hash / salt） */
export function publicProfile(p: PlayerRecord) {
  return {
    name: p.name,
    score: p.score,
    wins: p.wins,
    games: p.games,
    createdAt: p.createdAt,
  };
}

load();
