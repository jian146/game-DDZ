# 斗地主项目 · 长期约定

## 🚫 硬性规则（每次动手前先读）

### 1. 绝不删除测试账号

**任何时候都不要删 `game-ddz-server/data/players.json`，也不要清空里面的账号。**

- 不要用「清理测试数据」当理由删文件
- 测试脚本跑完自己创建的账号要**保留**
- 需要干净环境时，新建专用账号，而不是删旧的
- 如果确实必须重置，先问用户，并把 `players.json` 备份成 `players.backup-<时间戳>.json`

现存的固定测试账号（密码都是 `1234`）：

| 昵称 | 用途 |
|---|---|
| `test1` | 通用测试位 |
| `test2` | 通用测试位 |
| `test3` | 通用测试位 |

> 历史教训：2026-10-29 收尾时删了 `players.json`，把用户之前注册的账号全弄丢了，
> 用户明确要求「不要删除测试账号」。

---

## 项目约定

- **包管理**：pnpm workspace，`game-ddz-web` + `game-ddz-server`
- **单服务部署**：Express 一个端口同时托管 SPA + HTTP API + WS + 静态文件
- **不要引入 `node:sqlite`**：根 `package.json` 声明 `engines >=18`，Railway Nixpacks 可能不是 Node 22
- **前端音频**：音效用 Web Audio 实时合成；只有快捷语音是 mp3（`public/voice/`），由 `scripts/gen-voice.py` 生成
- **语音文案以服务端 `QUICK_CHAT_TEXT` 为准**，前端只维护 id → 显示文案，两边 id 必须一致
- **CSS Modules**：portal（antd Popover/Modal）里的内容，样式必须写在 `.page {}` 外面
- **CSS 自定义属性在「声明它的元素」上求值**，不是在使用它的元素上。
  `--card-h: calc(var(--card-w) * 1.34)` 写在 `.page` 上就被 `.page` 的 `--card-w` 算死了，
  在子元素上改 `--card-w` 带不动它。牌宽/牌高/间距必须一起从 JS 内联传。
  （反过来，声明处的 `--card-w` 已是最终值时，在同层写 `calc()` 是安全的）
- **牌面尺寸由 JS 按张数算**（`douDiZhu.tsx` 的 `handCardW` / `roundCardW`），不用 CSS `clamp`。
  点数字号还要受 `--card-exposed`（露出条宽度）约束，否则「10」会被右边那张盖掉一半
- **本地测试端口**：不要用 9210 —— 本机有个进程固定占着 `127.0.0.1:9210`，会把请求劫持成一段 JWT 错误响应。用 9301 之类的端口
- **`pnpm dev:server` 是 ts-node，没有 watch**：改了服务端代码必须重启。
  出现 `EADDRINUSE 9200` 说明上一轮的旧进程还活着，前端会连到**旧代码**上
  （症状：改了规则没生效、建「跑得快」房间却出来 17 张+底牌的斗地主局）。
  先 `Get-NetTCPConnection -LocalPort 9200` 看 `StartTime`，旧的就 `Stop-Process` 再起
- **准备阶段没有投掷热区**：头像（`PlayerHeader`）只在叫地主/出牌阶段渲染，
  所以「砸番茄/扔鸡蛋」按钮只在 `THROWABLE_STATUS` 阶段显示，别在准备阶段占右下角
- **`left: 50%` 的浮动面板必须显式写宽度**：`width: auto` 时 shrink-to-fit 的可用宽度
  只有包含块的一半，`.prepare` 和 `.roundCardList` 都因此被压变形。
  统一 `width: max-content` + `max-width: calc(100% - 20px)`
- **`round` 和 `roundLog` 只能一起清**：前者是规则判定（最后一条=要压的牌），
  后者是前端展示（含「不要」）。清空一律走 `clearRound(roomInfo)`
- **牌型规则只在服务端**：新功能（提示、校验、AI）都调 `utils/identify.ts` / `utils/pdk.ts`，
  前端不复制第二套。提示走 WS `hint` 消息，服务端枚举、前端只负责选中
- **AI 思考时长 ≠ AI 决策**：`scheduleAITurn` 分档只是表演时间，
  决策必须在定时器内用最新状态重算（`computeAIDecision` 是纯函数，可以空算一次拿类型）
- **curl 本机**：必须加 `--noproxy '*'`，否则会被环境代理拦掉
- **后台跑服务**：用工具的 `run_in_background`，不要用 `&` / `nohup`
