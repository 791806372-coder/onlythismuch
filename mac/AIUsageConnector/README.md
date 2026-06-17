# AI Usage 连接器 for macOS

AI Usage Widget 的原生 macOS 伴随应用。

这一版是 SwiftUI 菜单栏 + 主窗口应用，包装现有 `aiuw` 连接器 CLI，不替代后端。
用户可以在图形界面里完成：

- 查看连接器状态
- 安装、启动、停止、重载 LaunchAgent
- 检查 live ping 和 snapshot 是否可用
- 生成 iPhone 配对二维码/手动配对码

日常状态界面不显示 token。配对二维码/手动配对码包含本地 bearer token，
只有用户主动点击“配对 iPhone”时才显示。

主窗口右上角和菜单栏弹窗里都有“语言”按钮，可手动选择：

- English
- 简体中文
- 繁體中文
- Español
- Português
- 日本語

## Commands

在项目根目录运行：

```sh
npm run mac:build
npm run mac:run
npm run mac:verify
```

在这个 package 目录运行：

```sh
./script/build_and_run.sh
./script/build_and_run.sh --verify
```

`npm run mac:run` 会创建并打开：

```text
mac/AIUsageConnector/dist/AIUsageConnector.app
```
