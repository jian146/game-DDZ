/**
 * 斗地主音效引擎
 *
 * 全部用 Web Audio API 实时合成，不依赖任何外部音频文件：
 *   - 零资源体积，不需要处理格式兼容
 *   - 可随时调整音色/音量
 *
 * 浏览器的自动播放策略要求 AudioContext 必须由用户手势激活，
 * 所以对外暴露 `unlock()`，在第一次点击时调用。
 */

export type SoundName =
  | "deal" // 发牌
  | "select" // 选牌
  | "unselect" // 取消选牌
  | "play" // 出牌
  | "pass" // 不要
  | "call" // 抢地主
  | "nocall" // 不抢
  | "bomb" // 炸弹 / 王炸
  | "win" // 胜利
  | "lose" // 失败
  | "click" // 通用按钮
  | "join" // 玩家加入
  | "throw" // 投掷道具（番茄/鸡蛋飞出）
  | "splat" // 砸中

const STORAGE_KEY = "DDZ_SoundEnabled"

class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private _enabled = true

  constructor() {
    // 读取用户上次的开关选择，默认开启
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved !== null) this._enabled = saved === "1"
    } catch {
      /* localStorage 不可用，用默认值 */
    }
  }

  get enabled() {
    return this._enabled
  }

  setEnabled(v: boolean) {
    this._enabled = v
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0")
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.02)
    }
  }

  toggle() {
    this.setEnabled(!this._enabled)
    return this._enabled
  }

  /** 必须在用户手势里调用一次，否则移动端 Safari 不发声 */
  unlock() {
    const ctx = this.getCtx()
    if (ctx && ctx.state === "suspended") {
      void ctx.resume()
    }
  }

  private getCtx(): AudioContext | null {
    if (typeof window === "undefined") return null
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return null
      try {
        this.ctx = new Ctor()
        this.master = this.ctx.createGain()
        this.master.gain.value = this._enabled ? 0.9 : 0
        this.master.connect(this.ctx.destination)
      } catch {
        return null
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume()
    return this.ctx
  }

  // ============================
  // 基础发声单元
  // ============================

  /**
   * 单个音调
   * @param freq 起始频率
   * @param dur  持续秒数
   * @param opts 波形 / 音量 / 延迟 / 终止频率（做滑音）
   */
  private tone(
    freq: number,
    dur: number,
    opts: {
      type?: OscillatorType
      gain?: number
      delay?: number
      endFreq?: number
    } = {},
  ) {
    if (!this._enabled) return
    const ctx = this.getCtx()
    if (!ctx || !this.master) return

    const { type = "sine", gain = 0.12, delay = 0, endFreq } = opts
    const t0 = ctx.currentTime + delay

    const osc = ctx.createOscillator()
    const g = ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, endFreq),
        t0 + dur,
      )
    }

    // 快速起音 + 指数衰减，听起来像敲击
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

    osc.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  /** 白噪声，用于爆炸 / 洗牌质感 */
  private noise(
    dur: number,
    opts: { gain?: number; delay?: number; filter?: number } = {},
  ) {
    if (!this._enabled) return
    const ctx = this.getCtx()
    if (!ctx || !this.master) return

    const { gain = 0.15, delay = 0, filter = 1200 } = opts
    const t0 = ctx.currentTime + delay
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) {
      // 尾部衰减，避免"咔"的截断感
      const decay = 1 - i / len
      data[i] = (Math.random() * 2 - 1) * decay
    }

    const src = ctx.createBufferSource()
    src.buffer = buf

    const lp = ctx.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.setValueAtTime(filter, t0)
    lp.frequency.exponentialRampToValueAtTime(
      Math.max(80, filter * 0.25),
      t0 + dur,
    )

    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

    src.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    src.start(t0)
    src.stop(t0 + dur)
  }

  // ============================
  // 音效定义
  // ============================

  play(name: SoundName) {
    if (!this._enabled) return
    switch (name) {
      // 发牌：三声快速"嗒嗒嗒"，模拟牌滑过桌面
      case "deal":
        this.noise(0.05, { gain: 0.06, filter: 4000 })
        this.noise(0.05, { gain: 0.06, delay: 0.09, filter: 3600 })
        this.noise(0.06, { gain: 0.07, delay: 0.18, filter: 3200 })
        break

      // 选牌：清脆短促
      case "select":
        this.tone(1180, 0.045, { type: "triangle", gain: 0.07 })
        break

      // 取消选牌：比选牌低一点
      case "unselect":
        this.tone(760, 0.045, { type: "triangle", gain: 0.05 })
        break

      // 出牌：木质"啪"
      case "play":
        this.noise(0.07, { gain: 0.1, filter: 2600 })
        this.tone(320, 0.09, { type: "square", gain: 0.06, endFreq: 180 })
        break

      // 不要：低沉下滑，表示放弃
      case "pass":
        this.tone(300, 0.16, { type: "sine", gain: 0.09, endFreq: 150 })
        break

      // 抢地主：三音上行，有"抢"的冲劲
      case "call":
        this.tone(523.25, 0.1, { type: "square", gain: 0.08 })
        this.tone(659.25, 0.1, { type: "square", gain: 0.08, delay: 0.09 })
        this.tone(783.99, 0.16, { type: "square", gain: 0.09, delay: 0.18 })
        break

      // 不抢：两音下行
      case "nocall":
        this.tone(440, 0.1, { type: "triangle", gain: 0.07 })
        this.tone(330, 0.14, { type: "triangle", gain: 0.07, delay: 0.09 })
        break

      // 炸弹：低频轰鸣 + 噪声爆裂，牌局高潮
      case "bomb":
        this.noise(0.45, { gain: 0.22, filter: 900 })
        this.tone(90, 0.42, { type: "sawtooth", gain: 0.16, endFreq: 40 })
        this.tone(180, 0.3, { type: "square", gain: 0.08, endFreq: 60 })
        break

      // 胜利：C 大调琶音上行
      case "win":
        this.tone(523.25, 0.16, { type: "triangle", gain: 0.1 })
        this.tone(659.25, 0.16, { type: "triangle", gain: 0.1, delay: 0.13 })
        this.tone(783.99, 0.16, { type: "triangle", gain: 0.1, delay: 0.26 })
        this.tone(1046.5, 0.4, { type: "triangle", gain: 0.12, delay: 0.39 })
        break

      // 失败：下行小调，带点遗憾
      case "lose":
        this.tone(392, 0.2, { type: "sine", gain: 0.09 })
        this.tone(329.63, 0.2, { type: "sine", gain: 0.09, delay: 0.17 })
        this.tone(261.63, 0.42, { type: "sine", gain: 0.1, delay: 0.34 })
        break

      // 通用按钮
      case "click":
        this.tone(900, 0.03, { type: "sine", gain: 0.05 })
        break

      // 玩家加入：上扬双音
      case "join":
        this.tone(659.25, 0.09, { type: "sine", gain: 0.07 })
        this.tone(880, 0.12, { type: "sine", gain: 0.07, delay: 0.08 })
        break

      // 投掷：一声"嗖"——高频噪声快速扫过 + 上滑的短音
      case "throw":
        this.noise(0.18, { gain: 0.08, filter: 5200 })
        this.tone(420, 0.16, {
          type: "sine",
          gain: 0.05,
          endFreq: 900,
        })
        break

      // 砸中：闷响 + 湿润的碎裂噪声，像番茄糊在脸上
      case "splat":
        this.noise(0.14, { gain: 0.2, filter: 1800 })
        this.noise(0.1, { gain: 0.12, delay: 0.05, filter: 800 })
        this.tone(160, 0.16, { type: "square", gain: 0.09, endFreq: 60 })
        break
    }
  }
}

export const sound = new SoundEngine()

/** 便捷调用 */
export const playSound = (name: SoundName) => sound.play(name)
