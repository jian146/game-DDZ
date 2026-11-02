import { useEffect, useState } from "react"

/**
 * 视口信息 hook。
 *
 * 只用于「JS 必须知道尺寸」的场景（比如给头像传 px、算手牌间距）。
 * 纯样式层面的响应式一律走 CSS 媒体查询 / clamp，不要用这个。
 */
export interface I_Viewport {
  width: number
  height: number
  /** < 768px，手机 */
  isMobile: boolean
  /** < 480px，小屏手机 */
  isSmall: boolean
  /** 横屏 */
  isLandscape: boolean
}

function read(): I_Viewport {
  const w = typeof window === "undefined" ? 1280 : window.innerWidth
  const h = typeof window === "undefined" ? 800 : window.innerHeight
  return {
    width: w,
    height: h,
    isMobile: w < 768,
    isSmall: w < 480,
    isLandscape: w > h,
  }
}

export function useViewport(): I_Viewport {
  const [vp, setVp] = useState<I_Viewport>(read)

  useEffect(() => {
    let raf = 0
    const onResize = () => {
      // rAF 节流，避免 resize 时疯狂重渲染
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setVp(read()))
    }
    window.addEventListener("resize", onResize)
    window.addEventListener("orientationchange", onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", onResize)
    }
  }, [])

  return vp
}
