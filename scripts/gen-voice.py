#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成斗地主快捷语音素材（mp3）

用法：
    python -m pip install edge-tts
    python scripts/gen-voice.py

产物落在 game-ddz-web/public/voice/*.mp3，由 Vite 直接当静态资源服务，
前端用 <audio> / new Audio() 播放，不需要后端参与。

为什么用 edge-tts 现生成而不是扒现成音频：
  1. 商业游戏（如欢乐斗地主）的语音包有版权，不能直接拷进项目；
  2. 现生成的文件小（每条约 10~25KB），且随时能按文案重新生成；
  3. 生成结果是普通 mp3，运行时零依赖，断网也能播。

注意：本脚本只在开发期跑一次，产物要提交进仓库。
"""

import asyncio
import os
import sys

try:
    import edge_tts
except ImportError:
    sys.exit("缺少 edge-tts，请先执行：python -m pip install edge-tts")

# 语音音色：晓晓（女声，活泼），略微加速更像游戏播报
VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "+12%"
PITCH = "+2Hz"

# id → 文案。id 要和前端 src/utils/voice.ts 里的 QUICK_CHAT 保持一致
LINES = {
    "hurry": "快点吧，我等的花儿都谢了",
    "hello": "大家好，很高兴见到各位",
    "praise": "你的牌打得也太好了吧",
    "fight": "不要走，决战到天亮",
    "quiet": "不要吵了，不要吵了，专心玩游戏吧",
    "bigger": "大你",
    "cooperate": "和你合作真是太愉快了",
    "bye": "再见了，我会想你的",
}

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "game-ddz-web",
    "public",
    "voice",
)


async def make_one(key: str, text: str) -> None:
    out = os.path.join(OUT_DIR, f"{key}.mp3")
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
    await communicate.save(out)
    size = os.path.getsize(out)
    print(f"  ✓ {key}.mp3  {size / 1024:.1f} KB  「{text}」")


async def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"生成 {len(LINES)} 条语音 → {OUT_DIR}")
    for key, text in LINES.items():
        await make_one(key, text)
    print("完成")


if __name__ == "__main__":
    asyncio.run(main())
