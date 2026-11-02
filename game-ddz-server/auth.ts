/**
 * 认证：密码哈希 + 无状态签名 token
 *
 * 密码：scrypt（Node 内置，抗 GPU 暴力破解），每个账号独立随机盐。
 * token：HMAC-SHA256 签名，自带过期时间，服务端不存 session。
 *        好处是进程重启后 token 依然有效，玩家不用重新登录；
 *        代价是无法主动踢下线（本项目不需要）。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { DATA_DIR } from './store';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_SIZE = 64;
/** token 有效期：7 天 */
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;

export interface TokenPayload {
  /** 玩家 id */
  pid: string;
  /** 昵称快照，方便免查库拿到展示名 */
  name: string;
  /** 过期时间戳 */
  exp: number;
}

/**
 * 签名密钥：首次启动生成并落盘，之后一直复用。
 * 存在数据目录里，和 players.json 一起备份即可。
 */
let SECRET: Buffer;
function loadSecret(): Buffer {
  const keyFile = path.join(DATA_DIR, 'secret.key');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(keyFile)) {
      const hex = fs.readFileSync(keyFile, 'utf8').trim();
      if (hex.length === 64) return Buffer.from(hex, 'hex');
    }
    const fresh = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, fresh.toString('hex'), 'utf8');
    console.log('[auth] 已生成新的签名密钥');
    return fresh;
  } catch (e: any) {
    // 磁盘不可写时退化为进程内密钥：功能正常，但重启后 token 全部失效
    console.warn('[auth] 密钥无法持久化，重启后需重新登录:', e.message);
    return crypto.randomBytes(32);
  }
}
SECRET = loadSecret();

/** 生成密码摘要 */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(16).toString('hex');
  const buf = await scrypt(password, salt, KEY_SIZE);
  return { hash: buf.toString('hex'), salt };
}

/** 生成玩家内部 ID（与昵称解耦，改名不影响身份） */
export function newPlayerId(): string {
  return crypto.randomBytes(12).toString('hex');
}

/** 校验密码，使用等时比较避免时序侧信道 */
export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  try {
    const buf = await scrypt(password, salt, KEY_SIZE);
    const expected = Buffer.from(hash, 'hex');
    if (expected.length !== buf.length) return false;
    return crypto.timingSafeEqual(buf, expected);
  } catch {
    return false;
  }
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string): string {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

/** 签发 token */
export function signToken(pid: string, name: string): string {
  const payload: TokenPayload = { pid, name, exp: Date.now() + TOKEN_TTL };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/** 校验 token，任何异常都返回 null（过期/篡改/格式错） */
export function verifyToken(token: unknown): TokenPayload | null {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);

  // 长度不等时 timingSafeEqual 会抛错，先挡掉
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload || typeof payload.pid !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** 从 Authorization 头里取出 token */
export function extractToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

// ============================
// 输入校验
// ============================

export const NAME_MIN = 2;
export const NAME_MAX = 10;
export const PWD_MIN = 4;
export const PWD_MAX = 32;

/** 昵称：中英文数字下划线，不允许空格和特殊符号（避免和 URL 路径冲突） */
const NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_]+$/;

export function validateName(name: unknown): string | null {
  if (typeof name !== 'string') return '昵称格式不正确';
  const n = name.trim();
  if (n.length < NAME_MIN) return `昵称至少 ${NAME_MIN} 个字符`;
  if (n.length > NAME_MAX) return `昵称不能超过 ${NAME_MAX} 个字符`;
  if (!NAME_RE.test(n)) return '昵称只能包含中文、字母、数字和下划线';
  return null;
}

export function validatePassword(pwd: unknown): string | null {
  if (typeof pwd !== 'string') return '密码格式不正确';
  if (pwd.length < PWD_MIN) return `密码至少 ${PWD_MIN} 位`;
  if (pwd.length > PWD_MAX) return `密码不能超过 ${PWD_MAX} 位`;
  return null;
}
