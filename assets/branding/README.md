# Canvas 随行图标

应用图标采用深藏蓝底、象牙白折带；这是本移植的原创品牌图形，不代表学校或上游项目的官方标识。

- `approved-concept.png`：用户选定的内置图像工具原始结果，SHA-256 为 `1eb86e2a17ac4fad63805418781e008ef4837a0d13add11ea6149faed2238c55`。
- `app-icon.svg`：对照原图轮廓适配的正式矢量图标；保留中间留白与左下细连接线。
- `ribbon-foreground.svg`：Android 自适应图标前景，保留安全区。
- `icon-manifest.json`：Tauri 图标编译配置。

原始设计提示围绕“单个高级简约安卓学习应用图标；深藏蓝圆角底，象牙白连续折带；用留白与几何比例呈现学习路径；不使用书本、播放键、文档图形、文字、装饰和设备样机”。生成方式为内置图像工具。尝试的透明素材出现杂点，未采用；正式资源使用对照原图适配的干净矢量轮廓，由 Tauri 编译为各密度 PNG，并以原生矢量提供 Android 自适应/主题图标。

正式矢量源与原始概念图一并保留。已编译的 Android 各密度及自适应资源位于 `src-tauri/gen/android/app/src/main/res`，应用内图标位于 `demo/public/app-icon.svg`；仅交付 Android 安装包。
