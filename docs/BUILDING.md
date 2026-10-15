# 从源码运行与构建

## 浏览器交互预览

需要 Node 24（本机验证 24.14.0）。从仓库根目录运行：

```sh
npm ci --prefix demo
npm --prefix demo run dev
```

打开终端显示的本地地址（默认 `http://127.0.0.1:4173`）。预览使用示例数据，不收集 Token，也不具备 APK 的原生功能。无需安装根目录的旧桌面前端依赖。

```sh
npm --prefix demo test
npm --prefix demo run build
npm --prefix demo run test:encoding
node tools/check-public-source.mjs
cargo test --locked --manifest-path tools/ai-core-tests/Cargo.toml
```

## Android 工具链

| 工具 | 此项目的配置／已验证版本 |
| --- | --- |
| JDK | 17（本机 17.0.20.1+1） |
| Android SDK / Build Tools | 36 / 36.0.0 |
| 最低 Android | API 29 / Android 10 |
| NDK | 28.2.13676358 |
| Gradle / Android Gradle Plugin | 8.13 / 8.11.1 |
| Kotlin | 2.1.21 |
| CMake | 3.22.1 |
| Rust | 使用能编译当前 Cargo.lock 的 stable；增加 aarch64-linux-android 目标 |

设置 `JAVA_HOME` 和 `ANDROID_HOME`，安装表中的 SDK、NDK 和 CMake，执行 `rustup target add aarch64-linux-android`。

Android 目录含自定义 Activity、播放器和插件代码，已纳入源码；不要删除 `src-tauri/gen/android` 或无条件重新执行 `tauri android init`。

Windows PowerShell 7：

```powershell
./tools/build-mobile.ps1 -Target aarch64
# 模拟器需要 x86_64 Rust 目标和 LIBCLANG_PATH，使用 libclang 18.1.1：
./tools/build-mobile.ps1 -Target x86_64
```

可选 `-ToolboxRoot <便携工具目录>`（或 `CANVAS_ANDROID_TOOLBOX`）包含 `jdk/`、`sdk/`、`user-data/` 和 `temp/`。本机自动识别 `D:\DevTools\android`，其他机器使用标准环境变量即可，无需同样的磁盘布局。`tools/build-android.ps1` 是旧入口的兼容包装。

Windows 的符号链接权限不足时，脚本只在确认该错误后复制当前 Rust 库并调用 Gradle，不会将普通编译失败包装成成功。`-GradleInitScript` 允许本地指定私有镜像配置；项目不默认替换官方仓库。使用受信任的代理或镜像时需自行管理。

Linux（配置 SDK/JDK 后）：

```sh
export NDK_HOME="$ANDROID_HOME/ndk/28.2.13676358"
demo/node_modules/.bin/tauri android build --target aarch64 --apk --debug --config src-tauri/tauri.mobile.conf.json
```

APK 在 `src-tauri/gen/android/app/build/outputs/apk/`。仓库提供手动 GitHub Actions 预览构建，但在新仓库的云端成功运行之前，不能视为已验证的云端构建。每个全新环境生成的 debug 证书可能不同，不能保证相互覆盖安装。

## 正式签名

开发预览 APK 与公开发行签名应明确区分。私钥放在仓库外并离线备份；长期使用相同包名与签名。

Gradle 从以下环境变量读取配置，不写入仓库：

| 变量 | 内容 |
| --- | --- |
| CANVAS_KEYSTORE_PATH | 仓库外密钥库的绝对路径 |
| CANVAS_KEY_ALIAS | 密钥别名 |
| CANVAS_KEYSTORE_PASSWORD | 密钥库密码 |
| CANVAS_KEY_PASSWORD | 密钥密码 |

配置后在 Windows 使用 `./tools/build-mobile.ps1 -Target aarch64 -Release`；其他系统使用 Tauri 的同等 release 构建，默认不传 `--debug`。发布签名接入仍需在维护者环境执行与核验。

参考 [Tauri Android 签名说明](https://v2.tauri.app/distribute/sign/android/)。本项目使用环境变量替代凭据文件。未配置签名时发布任务拒绝完成；不要改为使用 debug 签名冒充公开发行。

发布验收和 GitHub 整理见 [RELEASING.md](RELEASING.md)。
