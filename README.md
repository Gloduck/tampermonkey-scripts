# Tampermonkey Scripts

集中维护油猴脚本及其公共组件。源码按固定顺序组装，不进行压缩、变量改名或 AST 转换。

## 目录结构

```text
src/
├── shared/
│   ├── dialog.js
│   └── settings-dialog.js
├── cookie-manager/
│   ├── main.js
│   └── userscript.json
├── 115-cookie-login/
│   ├── main.js
│   └── userscript.json
├── forum-list-images/
│   ├── main.js
│   └── userscript.json
├── job-assistant/
│   ├── main.js
│   └── userscript.json
├── vikacg-enhancement/
│   ├── main.js
│   └── userscript.json
└── opencode-extension/
    ├── main.js
    └── userscript.json

scripts/
└── build.mjs

dist/
├── 115 Cookie登录.user.js
├── Cookie管理器.user.js
├── 论坛列表显示图片.user.js
├── 求职助手.user.js
├── Vikacg增强脚本.user.js
└── OpenCode扩展.user.js
```

## 构建

```bash
npm run build
```

每个油猴脚本的元数据和业务代码都直接写在 `main.js` 中。需要插入公共组件时，在对应位置写一行 include 标识：

```javascript
// <include:../shared/dialog.js>
```

构建时该行会被文件内容替换，include 标识不会出现在 `dist/` 产物中。include 支持递归引用，并会检测循环引用。

只修改 `src/` 下的源码，`dist/` 下的脚本由构建命令生成。

组装器会自动扫描 `src/*/userscript.json`，不需要在构建脚本中登记公共文件或业务脚本。公共代码的位置和顺序完全由 `main.js` 中的 include 标识决定：

```javascript
// ==UserScript==
// ...
// ==/UserScript==

(function () {
    "use strict";

    // <include:../shared/dialog.js>
    // <include:../shared/settings-dialog.js>

    // 业务代码
})();
```

`userscript.json` 只声明入口和输出文件：

```json
{
  "entry": "main.js",
  "output": "示例.user.js"
}
```

## 校验

```bash
npm run check
```
