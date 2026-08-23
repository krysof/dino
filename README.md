# Dino Pure Native C++ / WebAssembly

**在线运行：** https://krysof.github.io/dino-cpp-wasm/

这个仓库只承载 GitHub Pages 的编译后二进制产物，不公开游戏主程序的 C++、汇编、
反编译源码或生成脚本。页面无需选择或上传 ROM。

## 发布物

- `site/dino.wasm`：逆向生成的 C++ 主程序和原生视频、内存、输入运行时；
- `site/dino.data`：按已证明布局转换的图形、QSound 和主程序数据 `.bin` 数组包；
- `site/dino.js`：Emscripten 浏览器装载胶水；
- `site/mobile-game-shell.js`：响应式横屏/竖屏降级与多点触控输入层；
- `site/index.html`：Canvas/WebAudio、键盘、手柄和触摸前端。

主 CPU、视频、VBlank、内存和输入都不依赖 CPS/libretro/68000 模拟器。唯一允许的模拟
边界是 Z80/QSound 音频。构建审计拒绝 C/C++、汇编、Python 源文件、ROM 压缩包以及
libretro/CPS 执行核心符号；已验证主程序可执行 C++ 覆盖率为 100%。

当前发行版包含扩展简体中文汉化：192 条精确规则覆盖投币/开始、人物姓名和能力、
八章标题、关卡地点、开场叙事、过场对白、Boss 台词与结局文本。448 个中文字形已经
转换成 1 bpp 二进制数组并封装在 `dino.data` 中，浏览器不依赖系统字体。游戏 Logo、
人物插画装饰字和 `1P/2P/3P` 等直接画进图形资源的美术文字仍保留原样。

移动端首次开始只尝试全屏，不锁定设备方向。手机竖屏时游戏仍以未旋转的横向 12:7
contain 画面显示，Canvas 内部分辨率固定为 384×224。虚拟摇杆支持
八方向、快速轻触、长按、多点方向+动作，并在取消、失焦和切后台时立即释放，不会卡键。
摇杆尺寸按较短视口边自适应计算并设置上下限，控制区会随之自动预留空间。攻击和跳跃
在 160 ms 内分别按下时会重整为同一个采样边沿，动作按钮也带有轻微滑出迟滞，方便可靠
触发原作的攻击+跳跃组合技。

## 声音第三方代码

声音模块使用未修改的 FB Alpha Z80 core：

- [固定上游提交中的 Z80 源码](https://github.com/libretro/fbalpha2012_cps1/tree/5542c1848ef81e92db311193b01dc349bc29d7cc/src/cpu/z80)
- [本发行版附带的完整许可](site/sound-core-license.txt)

简体中文字形来自 Noto Sans CJK SC，许可见
[`site/zh-font-license.txt`](site/zh-font-license.txt)。

游戏名称、程序、图形与声音归各自权利人所有。本页为非商业逆向与可移植性演示，不隶属
于 Capcom。
