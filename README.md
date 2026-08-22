# Dino C++ / WebAssembly

**在线运行：** https://krysof.github.io/dino-cpp-wasm/

这个仓库只承载 GitHub Pages 的编译后产物，不公开游戏主程序的 C++、汇编或反编译源码。
浏览器必须由用户选择自己合法持有的 `dino.zip`；ROM 仅进入当前标签页的内存，不会上传。

## 为什么仍然需要 ROM

WASM 内包含播放器、CPS-1 兼容执行核心和已经编译的主 CPU 迁移逻辑，但不包含游戏受版权
保护的图块、精灵、调色板、QSound/Z80 程序、声音采样以及主程序映像中的大量数据表。
兼容核心也需要 ROM 集来建立原机内存映射并校验游戏。因此页面不能在没有 ROM 的情况下
显示和播放完整游戏。

把这些资源直接嵌入 WASM 虽然在技术上可行，但等同于公开分发 ROM 内容，所以本项目不这样做。

## 第三方核心来源

WASM 静态链接了 FB Alpha 2012 CPS-1 核心。按照其许可证要求，这里公开第三方核心的来源和
本发行版对该核心所作的最小修改；这不是游戏逆向源码：

- 上游源码：[`libretro/fbalpha2012_cps1` 固定提交 `5542c184`](https://github.com/libretro/fbalpha2012_cps1/tree/5542c1848ef81e92db311193b01dc349bc29d7cc)
- 修改补丁：[`third_party/fbalpha2012_modified_program_roms.patch`](third_party/fbalpha2012_modified_program_roms.patch)
- 完整许可：[`site/fba-license.txt`](site/fba-license.txt)

网页必需的 HTML、Emscripten JavaScript 胶水和 `.wasm` 编译产物仍会公开，否则浏览器无法加载。
