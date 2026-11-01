# Android 工具箱（D 盘）

安卓 SDK、NDK、JDK、Gradle、模拟器、Cargo/Rustup、Gradle 和 Android 用户数据统一放在 `D:\Codex\android-toolchain`。

已迁移并校验的原路径保留了兼容 Junction：

- `C:\Users\asd\.android` → `D:\Codex\android-toolchain\user-data\android`
- `C:\Users\asd\.gradle` → `D:\Codex\android-toolchain\user-data\gradle`
- `C:\Users\asd\.cargo\registry` → `D:\Codex\android-toolchain\user-data\cargo-registry`
- `C:\Users\asd\.rustup` → `D:\Codex\android-toolchain\user-data\rustup`

每个目录迁移后都逐文件比较了长度和 SHA-256。C 盘上的软件仍可使用原路径，新增数据会落到 D 盘。

## 独立工具

使用 `D:\Codex\android-toolchain\Canvas-Android-Tools.ps1`：

```powershell
& 'D:\Codex\android-toolchain\Canvas-Android-Tools.ps1' -Action status
& 'D:\Codex\android-toolchain\Canvas-Android-Tools.ps1' -Action emulator
& 'D:\Codex\android-toolchain\Canvas-Android-Tools.ps1' -Action build -Target aarch64
& 'D:\Codex\android-toolchain\Canvas-Android-Tools.ps1' -Action stop
```

`status` 会显示 D 盘工具链、模拟器列表和 C/D 剩余空间；`emulator` 使用 D 盘的 AVD 数据；`build` 调用项目的安卓构建脚本。

正式开发前可以运行 `-Action env` 检查当前 PowerShell 会话是否使用 D 盘路径。
