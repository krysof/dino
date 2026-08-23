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

当前发行版已包含第一批简体中文汉化：投币/开始、币数、选人时间、加入游戏、人物能力
提示、第一关地点和开场对白。中文字形已经转换成 1 bpp 二进制数组并封装在
`dino.data` 中，浏览器不依赖系统字体。

移动端首次开始会尝试全屏和系统横屏锁定；浏览器拒绝时自动使用安全区域内的 CSS 旋转
降级。画面保持 12:7 contain 等比显示，Canvas 内部分辨率固定为 384×224。虚拟摇杆支持
八方向、快速轻触、长按、多点方向+动作，并在取消、失焦和切后台时立即释放，不会卡键。

## 声音第三方代码

声音模块使用未修改的 FB Alpha Z80 core：

- [固定上游提交中的 Z80 源码](https://github.com/libretro/fbalpha2012_cps1/tree/5542c1848ef81e92db311193b01dc349bc29d7cc/src/cpu/z80)
- [本发行版附带的完整许可](site/sound-core-license.txt)

简体中文字形来自 Noto Sans CJK SC，许可见
[`site/zh-font-license.txt`](site/zh-font-license.txt)。

游戏名称、程序、图形与声音归各自权利人所有。本页为非商业逆向与可移植性演示，不隶属
于 Capcom。
