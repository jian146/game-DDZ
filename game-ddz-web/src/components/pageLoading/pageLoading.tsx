/**
 * 页面加载占位
 *
 * 和 index.html 里内联的 #splash 长得一模一样。
 *
 * 为什么要两套：首屏骨架（index.html 内联）只在「JS 还没下载完」这段时间生效，
 * React 一挂载就被清掉了。之后路由用 React.lazy 懒加载，拆出去的 chunk 又要等一次，
 * 这段时间如果 Suspense fallback 是 null，用户会看到骨架闪一下 → 空白 → 页面，
 * 比一直转圈更难受。所以 fallback 用同一套视觉，切换过程是无缝的。
 */
const PageLoading = () => {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background:
          "radial-gradient(ellipse at 50% 0%, #9ede74 0%, #63b84f 52%, #3f8b36 100%)",
        color: "#fff",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif',
        userSelect: "none",
      }}
    >
      <div
        aria-hidden
        style={{
          fontSize: 20,
          letterSpacing: 10,
          textIndent: 10,
          lineHeight: 1,
          opacity: 0.92,
        }}
      >
        <span style={{ color: "#ffd7c9" }}>♥</span>
        <span>♠</span>
        <span style={{ color: "#ffd7c9" }}>♦</span>
        <span>♣</span>
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: 3,
          textShadow: "0 2px 8px rgba(0,0,0,0.18)",
        }}
      >
        欢乐斗地主
      </div>
      <div
        aria-hidden
        style={{
          width: 26,
          height: 26,
          marginTop: 6,
          boxSizing: "border-box",
          border: "3px solid rgba(255,255,255,0.28)",
          borderTopColor: "#fff",
          borderRadius: "50%",
          animation: "sp-rotate 0.8s linear infinite",
        }}
      />
      <div style={{ fontSize: 13, opacity: 0.82, letterSpacing: 1 }}>
        正在加载…
      </div>
    </div>
  )
}

export default PageLoading
