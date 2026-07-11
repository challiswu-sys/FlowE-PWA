# FlowE PWA

FlowE 是一个个人英语练习 PWA 原型。这个公开版只包含应用外壳、图标和交互逻辑，不内置第三方视频、音频或字幕素材。

核心流程：

- 打开素材包
- 导入自己的音频和 transcript
- 用语音或输入抓取词伙
- 用语音或输入记录中文理解
- 分析词伙含义、使用范围和理解准确度
- 保存词伙后继续造句
- 检查句子后手动加入错题本

## 文件

- `index.html`：页面结构
- `styles.css`：Apple 风格的简洁界面和移动端流程布局
- `app.js`：本地数据、素材导入、语音输入、词伙分析、造句和错题逻辑
- `manifest.webmanifest`：PWA 配置
- `service-worker.js`：离线缓存
- `assets/icon.svg`：应用图标

## 使用

直接打开 `index.html` 可以预览页面，但 PWA 的安装和离线缓存需要通过 `localhost` 或 HTTPS 访问。  
部署到 GitHub Pages、Vercel 或其他 HTTPS 地址后，可以在 iPhone Safari 中添加到主屏幕，作为 PWA 使用。

本地预览建议在这个文件夹里启动一个静态服务，例如：

```bash
python3 -m http.server 5173
```

然后打开：

```text
http://127.0.0.1:5173
```

当前版本把文字数据保存在浏览器本地，音频文件保存在 IndexedDB。后续可以接入 Supabase/Firebase 做账号和云同步，再接入 AI API 做更完整的纠错与练习生成。

语音输入优先使用浏览器语音识别；如果当前 iPhone PWA 环境不支持，会自动回到输入框，可以继续使用 iPhone 键盘自带听写。

## 素材隐私

请不要把第三方视频、音频、字幕或其他受版权保护的素材上传到公开仓库。  
在手机或电脑中通过页面导入的素材会保存在当前浏览器本地，不会随 GitHub Pages 代码一起发布。
