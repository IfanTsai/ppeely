<p align="center">
  <img src="resources/icon.svg" width="112" alt="Ppeely 图标">
</p>

<h1 align="center">Ppeely</h1>

<p align="center"><b>从任何照片里撕下一张贴图，全程离线。</b></p>

<p align="center">
  Android 与 iOS 上的 WhatsApp 贴图制作应用：抠出主体，加上描边和文字，整包发送到 WhatsApp。<br>
  贴图的制作、存储和编码全部在设备上完成。
</p>

<p align="center">
  <a href="../../releases/latest"><img src="https://img.shields.io/badge/下载-APK-16A05C?style=for-the-badge&logo=android&logoColor=white" alt="下载 APK"></a>
  &nbsp;
  <img src="https://img.shields.io/badge/Android-7.0%2B-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android 7.0+">
  &nbsp;
  <img src="https://img.shields.io/badge/iOS-15%2B-1e293b?style=for-the-badge&logo=apple&logoColor=white" alt="iOS 15+">
  &nbsp;
  <a href="../../actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/IfanTsai/ppeely/ci.yml?branch=main&style=for-the-badge&label=CI" alt="CI 状态"></a>
  &nbsp;
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT 许可证"></a>
</p>

<p align="center">
  <a href="../../releases/latest">⬇️ 下载</a>
  ·
  <a href="#-功能">功能</a>
  ·
  <a href="#-构建">构建</a>
  ·
  <a href="#-测试">测试</a>
  ·
  <a href="#-发布">发布</a>
  ·
  <a href="README.md">English</a>
</p>

<p align="center">
  <img src="docs/screenshots/pack.webp" width="200" alt="贴图包">
  <img src="docs/screenshots/cut.webp" width="200" alt="手绘裁剪">
  <img src="docs/screenshots/smart-select.webp" width="200" alt="智能选择与描边">
  <img src="docs/screenshots/decorate.webp" width="200" alt="描边与文字图层">
</p>

<table>
<tr>
<td>

**🔒 从设计上离线** · Ppeely 不使用网络，Android 版甚至没有申请联网权限。照片、贴图和字体都留在设备上：智能选择在设备上运行模型，编码在应用内的 WebAssembly 中完成。

**ℹ️ 与 WhatsApp 无关联** · Ppeely 是独立项目，与 WhatsApp 和 Meta 没有关联，也未获得其认可或赞助。WhatsApp 是 WhatsApp LLC 的商标；本项目只按 WhatsApp 公开的第三方贴图协议与其交互。

</td>
</tr>
</table>

---

## ✨ 功能

| | 功能 | 说明 |
| :---: | --- | --- |
| 🗂️ | **贴图包** | 新建、重命名、删除、搜索；每包最多 30 张贴图和一个托盘图标 |
| 🖼️ | **多种来源** | 相机、相册、任意文件、贴图库（已有贴图与 WhatsApp 收发的贴图）、纯文字 |
| ✂️ | **抠图编辑器** | 手绘、矩形、椭圆、多边形、全选、旋转，以及在设备上运行图像分割模型的智能选择 |
| 🖍️ | **描边与文字** | 描边的颜色与宽度；文字图层的字体、配色和四种样式，支持拖动、缩放、旋转 |
| 🎞️ | **动态贴图** | 由 GIF、视频或动画 WebP 生成，自动控制在 500 KB 以内 |
| 😀 | **表情符号标注** | 每张贴图最多 3 个，供 WhatsApp 的贴图搜索使用 |
| 💬 | **添加到 WhatsApp** | Android 通过 ContentProvider，iOS 通过剪贴板协议 |
| 📦 | **贴图包文件** | 导出与导入 `.wastickers`，可以从其他应用直接打开 |
| ⌨️ | **贴图键盘** | 仅 Android：在任意聊天应用里通过输入法发送贴图 |
| 🌐 | **中英双语** | 跟随系统语言，也可以在设置里切换 |
| 🛟 | **其他** | 自定义字体、本地备份与恢复 |

## 🛠️ 技术栈

| 层 | 选型 |
| --- | --- |
| 界面 | [Ionic](https://ionicframework.com/) 9 + [Vue](https://vuejs.org/) 3 + TypeScript |
| 原生外壳 | [Capacitor](https://capacitorjs.com/) 8，配合 Kotlin（Android）与 Swift（iOS）插件 |
| 图片编码 | 编译为 WebAssembly 的 libwebp（`wasm-webp`） |
| 智能选择 | [MediaPipe](https://ai.google.dev/edge/mediapipe) Tasks Vision 与 DeepLab v3 模型 |
| 构建与测试 | Vite、Vitest、Playwright，以及 adb 加 Chrome DevTools Protocol |

## 🧭 架构

业务逻辑都在 Web 层，两个平台共用；原生层只处理必须调用系统接口的部分。界面使用 Ionic 的 Vue 组件（页面、列表、对话框、弹层）；核心库 `src/lib/` 与界面框架无关，画布上的裁剪和图层操作直接使用指针事件。

| 目录 | 内容 |
| --- | --- |
| `src/lib/` | 核心库：贴图包仓库、图像处理、WebP 编码、动态贴图、分割、描边、文字渲染、贴图包文件、备份 |
| `src/views/` | 页面（Ionic Vue）：主界面、贴图包制作、设置、自定义字体、开源许可 |
| `src/components/` | 弹层与组件：编辑器（裁剪、描边与文字）、文字输入、表情选择、贴图库 |
| `src/flows.ts`、`src/router.ts`、`src/ui/overlays.ts` | 跨页面的流程、路由、对 Ionic 对话框控制器的封装 |
| `native/android/app/src/main/java/com/ppeely/stickers/` | Kotlin：WhatsApp 的 ContentProvider、桥接插件、接收文件的中转 Activity、贴图键盘、WhatsApp 贴图目录读取 |
| `native/ios/App/App/` | Swift：桥接插件（剪贴板协议、接收文件）、贴图包读取 |
| `native/` | Capacitor 的两个原生工程：`native/android/` 与 `native/ios/`（路径在 `capacitor.config.ts` 中指定） |
| `native/ios/checks/` | 可以在 Linux 上运行的 Swift 代码检查 |
| `e2e/` | 端到端测试脚本与 WhatsApp 协议替身应用 |
| `resources/` | SVG 格式的应用图标；所有图标和启动图都由 `scripts/generate-icons.mjs` 生成 |
| `licenses/` | 不随 npm 包附带的第三方许可证原文，用于生成应用内的开源许可清单 |

Web 层把数据写在应用私有目录：`packs/index.json` 保存全部贴图包的元数据，`packs/<id>/` 保存图片。原生层只读取这些文件。

图像编码与模型推理使用 WebAssembly，在两个平台的 WebView 里行为一致：

- WebP（静态与动画）：libwebp 1.3.2 的 WASM 构建（`wasm-webp`）。iOS 的 WebView 不能用画布导出 WebP，两个平台也都没有动画 WebP 的浏览器接口。
- 智能选择：MediaPipe Tasks Vision 加 DeepLab v3 模型（`public/models/deeplab_v3.tflite`）。

## 🚀 构建

环境要求：Node.js 20 以上、JDK 21、Android SDK（平台 36、构建工具 36）。iOS 需要 macOS 与 Xcode。

```bash
npm install

# 类型检查与单元测试
npm run typecheck
npm test

# Android 调试版，加 --install 同时安装到已连接的设备
export JAVA_HOME=<JDK 21 路径> ANDROID_HOME=<Android SDK 路径>
./scripts/android-debug.sh --install

# Android 发布版，输出到 release/ppeely-<版本>.apk
./scripts/android-release.sh

# iOS：同步 Web 资源后用 Xcode 打开 native/ios/App/App.xcodeproj
npm run build && npx cap sync ios
```

发布版使用 `native/android/keystore/ppeely-release.jks` 中的密钥签名，口令放在 `native/android/keystore.properties`，两者都不提交到仓库。`./scripts/generate-release-key.sh` 会生成这两个文件，口令随机生成且不会输出。请另外备份：应用上架后只能用同一把密钥发布更新，密钥库和口令丢失后无法找回。没有 `keystore.properties` 时，发布版用调试密钥签名，可以安装试用，但不能上架。

两个平台的图标和启动图由 `./scripts/generate-icons.sh`（需要 Docker）按 `scripts/generate-icons.mjs` 中定义的图形生成。

## 🧪 测试

测试分三层，从快到全：

| 命令 | 覆盖范围 | 需要 | 耗时 |
| --- | --- | --- | --- |
| `npm test` | 核心库的单元测试（WebP 容器、帧时长、贴图包文件） | Node.js | 几秒 |
| `./scripts/browser-test.sh` | Web 层的端到端流程（编辑器、编码、存储、导入导出），分别在 Chromium（Android WebView 的引擎）和 WebKit（iOS WKWebView 的引擎）上运行 | Docker | 每个引擎约 1 分钟、1.3 GB 内存 |
| `./scripts/android-test.sh` | 在 Android 模拟器上测试全部内容：WebView、原生代码、WhatsApp 投递、贴图键盘、系统选择器和相机 | Android SDK、JDK 21 | 约 5 分钟、内存峰值 4.6 GB |

改了 Web 层就跑浏览器测试；改了原生代码或者准备发布时再跑 Android 测试。

端到端测试从 `e2e/fixtures/` 读取测试素材。两个脚本第一次运行时会调用 `./scripts/make-fixtures.sh` 生成这个目录：从固定地址下载一张 CC0 授权的猫的照片（智能选择需要主体清晰的照片）和一个 OFL 授权的字体并校验哈希，再用 ffmpeg 生成 GIF、视频和动画 WebP。`E2E_ONLY=<模式>` 只运行名称匹配的步骤，适合只改了一个功能时快速验证；后面的步骤可能依赖前面步骤留下的数据，提交前仍要完整运行一遍。

### Android

`./scripts/android-test.sh` 会构建调试版 APK，第一次运行时创建测试用模拟器（AVD `ppeely-test`），以无窗口方式启动，依次运行 `e2e/run-editor.mjs` 和 `e2e/run-integration.mjs`，结束后关闭模拟器以释放内存。测试用模拟器的屏幕是 720×1600、280 dpi，宽度与 Pixel 6 同为 411 dp；内存 2 GB，渲染器用基于 ANGLE 的 SwiftShader。编辑器套件在它上面的内存峰值是 3.8 GB，在默认的 Pixel 6 模拟器上是 5.0 GB。模拟器每跑一轮会增长约 1 GB，不关的话会涨到 10 GB 以上，所以脚本每次都会关掉它。

测试通过 adb 和 Chrome DevTools Protocol 操作已安装的 APK：点击由系统级输入注入，拖动与捏合由调试协议注入，应用写出的文件以 root 身份从应用私有目录取回，在主机上检查。这要求设备运行 userdebug 系统镜像并且 adb 以 root 运行，测试用模拟器满足这一条件。发布版没有开启 WebView 调试，但 userdebug 系统对所有应用开放 WebView 调试端口，所以调试版和发布版 APK 都可以不加改动地测试。

模拟器里无法注册真实的 WhatsApp，测试改用 `e2e/whatsapp-double/` 中的协议替身。它以包名 `com.whatsapp` 安装，持有 `com.whatsapp.sticker.READ` 权限，按 WhatsApp 公开的第三方贴图协议读取本应用的 ContentProvider，并执行 WhatsApp 官方示例工程文档中的校验规则（512×512、静态贴图不超过 100 KB、动态贴图不超过 500 KB、每帧至少 8 ms、总时长不超过 10 秒、每包 3 到 30 张、托盘图标不超过 50 KB）。它不是 WhatsApp，所以「添加到 WhatsApp」还在 Android 真机上用真实的 WhatsApp 人工验证过。

```bash
# 构建，在测试用模拟器上运行，结束后关闭模拟器
./scripts/android-test.sh

# 只运行语言相关的步骤，沿用上一次的构建
SKIP_BUILD=1 E2E_ONLY=language ./scripts/android-test.sh

# 测试发布版，包括不依赖 WebView 调试的冒烟测试
APK=release/ppeely-0.1.0.apk SUITES="editor integration release-smoke" ./scripts/android-test.sh

# 使用已经在运行的设备或模拟器（结束后不关闭）
ANDROID_SERIAL=emulator-5554 ./scripts/android-test.sh
```

### iOS

在 Linux 上无法编译和运行 iOS 应用。下面这些检查覆盖了在 Linux 上能检查的部分，前两项需要 Docker：

```bash
# 用 iPhone 15 的设备参数在 WebKit 引擎上运行两个平台共用的 Web 层（Playwright）
BROWSERS=webkit ./scripts/browser-test.sh

# Swift 代码的语法检查、类型检查，以及用真实数据执行 PackStore
PACKS_HOME=<含 Documents/packs 的目录> ./scripts/check-swift.sh

# Xcode 工程文件、Info.plist 与故事板的完整性（不需要 Docker）
python3 scripts/check-ios-project.py
```

### 持续集成

`.github/workflows/ci.yml` 在每次推送和每个 Pull Request 上运行，在 Linux 上执行类型检查、单元测试、Swift 代码检查、Xcode 工程检查和 Android 调试版构建，调试版 APK 作为工作流产物保留 14 天。`.github/workflows/ios.yml` 在 macOS 上用 Xcode 编译 iOS 应用，只在 iOS 工程或依赖变化时运行。端到端测试需要模拟器和测试素材，不在持续集成里运行。Dependabot 每周为 npm 包和 GitHub Actions 提交更新的 Pull Request。

## 📦 发布

版本号只在 `package.json` 里维护。Android 构建时直接读取它（`versionName`，以及 `versionCode` = 主版本号 × 1000000 + 次版本号 × 1000 + 修订号）；Xcode 工程无法读取，由 `scripts/sync-version.mjs` 同步过去，两边不一致时 Xcode 工程检查会失败。

发布新版本：

```bash
npm version minor          # 或 patch / major / 1.2.0-beta.1
git push --follow-tags
```

`npm version` 会更新 `package.json`、`package-lock.json` 和 Xcode 工程，以 `chore(release): vX.Y.Z` 为说明提交，并打上 `vX.Y.Z` 标签。推送标签后，`.github/workflows/release.yml` 会依次：

1. 运行持续集成的全部检查，并确认标签与 `package.json` 的版本一致；
2. 用发布密钥签名构建 APK 和 App Bundle，APK 的签名证书不是下文那一张时直接失败；
3. 发布 GitHub Release，附带 APK、`SHA256SUMS.txt`、按合并的 Pull Request 自动生成的更新说明（按标签分组，见 `.github/release.yml`）和构建来源证明；带后缀的版本（例如 `-beta.1`）标记为预发布；
4. 把用于 Google Play 的 App Bundle（`.aab`）作为工作流产物保留 90 天。

iOS 版本不随 Release 发布，因为签名需要 Apple 开发者账号。

首次配置：如果还没有发布密钥，先运行 `./scripts/generate-release-key.sh` 生成；然后运行 `./scripts/upload-release-secrets.sh`（需要 GitHub CLI），把密钥保存为仓库 `release` 环境的 `ANDROID_KEYSTORE_BASE64` 和 `ANDROID_KEYSTORE_PASSWORD` 两个 Secret。如果希望每次发布都人工批准，可以在仓库设置里为这个环境添加必需的审核人。用自己的密钥签名的 fork 需要修改 `release.yml` 中的 `RELEASE_CERT_SHA256`。

### 🔐 校验下载的文件

发布版 APK 的签名证书 SHA-256 为 `0b0e86ba52c04eed4cbb324df0cfaf44873e3b7e9e0df4f4dde4b8d2df839115`。

```bash
sha256sum -c SHA256SUMS.txt
apksigner verify --print-certs ppeely-X.Y.Z.apk                # 核对上面的证书 SHA-256
gh attestation verify ppeely-X.Y.Z.apk --repo IfanTsai/ppeely   # 确认由本仓库的发布工作流构建
```

## ⚠️ 已知限制

- iOS 应用没有在 iOS 设备或模拟器上运行过。已经检查过的是：Web 层在 Playwright 的 WebKit 上的行为（这是 Linux 上的构建，媒体解码与图形后端和 iOS 上的 WKWebView 不同），以及 Swift 代码的语法和类型（依据的是人工编写的接口声明，不是真实的 iOS SDK）。Capacitor 的 iOS 原生插件（相机、文件、分享）和把贴图包交给 WhatsApp 的最后一步（写入剪贴板、打开 `whatsapp://stickerPack`）都没有执行过。
- Android 的自动化测试都在 x86_64 模拟器上进行，ARM 真机上只人工验证过添加贴图包到 WhatsApp。
- 贴图键盘和「收发的贴图」只在 Android 上提供：iOS 的沙盒不允许读取其他应用的文件，自定义键盘也不能向其他应用提交图片。
- 智能选择需要 WebView 支持 WebAssembly SIMD（Android System WebView 91 以上、iOS 16.4 以上）。

## 🙏 第三方组件

| 组件 | 许可证 |
| --- | --- |
| DeepLab v3 模型（TensorFlow 发布，取自 MediaPipe 模型库） | Apache-2.0 |
| MediaPipe Tasks Vision | Apache-2.0 |
| libwebp（`wasm-webp`） | BSD-3-Clause（封装为 MIT） |
| 字体：Alfa Slab One、Anton、Comic Neue、Cutive Mono、DynaPuff、Freckle Face、Fredoka One、Nunito、Sedgwick Ave Display（Fontsource 打包） | SIL Open Font License 1.1 |
| fflate、gifuct-js | MIT |

`public/models/deeplab_v3.tflite` 是 MediaPipe 模型库中原样未改的文件，下载地址为 `https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite`，SHA-256 为 `ff36e24d40547fe9e645e2f4e8745d1876d6e38b332d39a82f0bf0f5d1d561b3`。

应用内「设置 → 开源许可」显示随安装包分发的全部第三方组件及其许可证原文。这份清单由 `scripts/third-party-notices.ts` 在 `npm run build` 时生成（`dist/third-party-notices.txt`）：打包进 Web 层的 npm 包按构建的模块图自动收集；模型、编译进 WASM 的 libwebp 和两个平台的原生依赖在脚本中登记，原文放在 `licenses/`。npm 包缺少许可证文件时构建会失败，需要在脚本里补上原文。升级 Capacitor 或插件后，要按脚本开头的说明核对原生依赖的登记。

## 📄 许可证

Ppeely 以 [MIT 许可证](LICENSE)发布。第三方组件适用各自的许可证，见上一节。
