/**
 * 快捷语音
 *
 * 素材是 scripts/gen-voice.py 用 edge-tts 生成的 mp3，放在 public/voice/ 下，
 * 运行时零依赖、断网也能播（不走任何在线 TTS 接口）。
 *
 * 文案的权威版本在服务端 QUICK_CHAT_TEXT，这里只维护 id → 显示文案的映射，
 * 两边 id 必须一致，加语音时两边一起改。
 */

import { sound } from "./sound"

export interface I_QuickChat {
  id: string
  /** 按钮上显示的文案（短一点，完整语音在 mp3 里） */
  label: string
  /** 气泡里显示的完整文案 */
  text: string
  icon: string
}

export const QUICK_CHAT: I_QuickChat[] = [
  { id: "hurry", label: "快点吧", text: "快点吧，我等的花儿都谢了", icon: "⏰" },
  { id: "hello", label: "大家好", text: "大家好，很高兴见到各位", icon: "👋" },
  { id: "praise", label: "打得好", text: "你的牌打得也太好了吧", icon: "👍" },
  { id: "fight", label: "决战到天亮", text: "不要走，决战到天亮", icon: "🔥" },
  { id: "quiet", label: "别吵了", text: "不要吵了，不要吵了，专心玩游戏吧", icon: "🤫" },
  { id: "bigger", label: "大你", text: "大你", icon: "💥" },
  { id: "cooperate", label: "合作愉快", text: "和你合作真是太愉快了", icon: "🤝" },
  { id: "bye", label: "再见", text: "再见了，我会想你的", icon: "👋" },
]

/** 按 id 取文案，服务端推过来时也用它兜底 */
export const quickChatText = (id: string): string =>
  QUICK_CHAT.find((c) => c.id === id)?.text ?? ""

const BASE = `${import.meta.env.BASE_URL}voice/`

/** 同一个音频对象复用，避免每次点击都新建一个 Audio 拖慢首次播放 */
const cache = new Map<string, HTMLAudioElement>()
/** 同时只允许一条语音在响，否则多人连发会叠成噪音 */
let current: HTMLAudioElement | null = null

function getAudio(id: string): HTMLAudioElement | null {
  if (typeof window === "undefined") return null
  const hit = cache.get(id)
  if (hit) return hit

  const audio = new Audio(`${BASE}${id}.mp3`)
  audio.preload = "auto"
  cache.set(id, audio)
  return audio
}

/**
 * 播放一条语音
 * 音效总开关关掉时也静音 —— 用户按的是"静音"，不是"只静音音效"
 */
export function playVoice(id: string) {
  if (!sound.enabled) return
  const audio = getAudio(id)
  if (!audio) return

  if (current && current !== audio) {
    try {
      current.pause()
      current.currentTime = 0
    } catch {
      /* 忽略：某些浏览器上暂停未播放的音频会抛错 */
  }
  }

  try {
    audio.currentTime = 0
    audio.volume = 0.9
    const p = audio.play()
    // 移动端没解锁自动播放时会 reject，静默失败即可
    if (p && typeof p.catch === "function") p.catch(() => {})
    current = audio
  } catch {
    /* ignore */
  }
}

/** 进房间时预热，避免第一次点语音有半秒延迟 */
export function preloadVoice() {
  QUICK_CHAT.forEach((c) => getAudio(c.id))
}
