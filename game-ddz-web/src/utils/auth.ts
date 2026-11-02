/**
 * 前端登录态管理
 *
 * token 和玩家资料都存 localStorage：
 *   - token  服务端签发的 HMAC 凭证，有效期 7 天，请求时自动放进 Authorization 头
 *   - player 昵称/积分/胜场等展示用数据，登录或刷新资料时更新
 *
 * 注意：player 只是缓存，任何涉及权限的判断都以服务端为准。
 */
import storage, { getToken as getStoredToken, setToken as setStoredToken } from "./storage"
import newRequest from "./request"

export interface I_Player {
  name: string
  score: number
  wins: number
  games: number
  createdAt: number
}

export interface I_AuthResult {
  isSuccess: boolean
  message?: string
  token?: string
  player?: I_Player
}

const PLAYER_KEY = "DDZ_Player"

/** 取本地 token（自带 7 天过期判断） */
export function getToken(): string | null {
  return getStoredToken()
}

/** 取缓存的玩家资料 */
export function getPlayer(): I_Player | null {
  return storage.getObject(PLAYER_KEY)
}

/** 是否已登录（只看本地凭证，服务端是否认可由 /api/me 校验） */
export function isLoggedIn(): boolean {
  return !!getToken()
}

/** 写入登录态 */
export function setAuth(token: string, player: I_Player) {
  setStoredToken(token)
  storage.setObject(PLAYER_KEY, player)
}

/** 只更新玩家资料缓存（结算后刷新积分用） */
export function cachePlayer(player: I_Player) {
  storage.setObject(PLAYER_KEY, player)
}

/** 清空登录态 */
export function clearAuth() {
  storage.removeItem("token")
  storage.removeItem("tokenST")
  storage.removeItem(PLAYER_KEY)
}

// ============================
// 接口封装
// ============================

export async function apiRegister(
  name: string,
  password: string,
): Promise<I_AuthResult> {
  const res = (await newRequest({
    url: "/api/register",
    options: { method: "POST", data: { name, password } },
  })) as I_AuthResult | null
  return res ?? { isSuccess: false, message: "网络异常，请稍后重试" }
}

export async function apiLogin(
  name: string,
  password: string,
): Promise<I_AuthResult> {
  const res = (await newRequest({
    url: "/api/login",
    options: { method: "POST", data: { name, password } },
  })) as I_AuthResult | null
  return res ?? { isSuccess: false, message: "网络异常，请稍后重试" }
}

/** 用本地 token 换最新资料，token 失效返回 null */
export async function apiMe(): Promise<I_Player | null> {
  const res = (await newRequest({
    url: "/api/me",
    options: { method: "GET" },
  })) as { isSuccess: boolean; player?: I_Player } | null
  if (!res || !res.isSuccess || !res.player) return null
  cachePlayer(res.player)
  return res.player
}

/** 拉排行榜 */
export async function apiLeaderboard() {
  const res = (await newRequest({
    url: "/api/leaderboard",
    options: { method: "GET" },
  })) as { isSuccess: boolean; list?: I_Player[] } | null
  return res?.list ?? []
}

/** 退出登录（无状态 token，本地清掉即可） */
export function logout() {
  clearAuth()
}
