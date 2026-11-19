# 审核测试说明 / Notes for Certification

产品：公众号文章同步助手
版本：0.2.3
更新日期：2026-11-18

> 提交前请把所有 `<...>` 占位符替换为真实内容。
> 下面的英文部分可以直接粘贴到 Chrome Web Store / Microsoft Partner Center 的
> `Notes for certification` 或 `Submission options > Notes for certification`。

## 一、提交前必须填写的信息

| 项目 | 内容 |
|---|---|
| 公网隐私政策 URL | `https://imoowi.github.io/mp-sync-privacy.html` |
| 测试公众号文章 URL | `<PUBLIC_WECHAT_ARTICLE_URL>` |
| CSDN 测试账号 | `<CSDN_TEST_USERNAME>` / `<CSDN_TEST_PASSWORD>` |
| 今日头条测试账号 | `<TOUTIAO_TEST_USERNAME>` / `<TOUTIAO_TEST_PASSWORD>` |
| 51CTO 测试账号（可选） | `<51CTO_TEST_USERNAME>` / `<51CTO_TEST_PASSWORD>` |
| 小红书测试账号（可选） | `<XHS_TEST_USERNAME>` / `<XHS_TEST_PASSWORD>` |
| 功能演示视频（建议） | `<YOUTUBE_OR_DRIVE_VIDEO_URL>` |
| 支持邮箱 | simpleyuan@gmail.com |

测试账号要求：

- 使用专用测试账号，不要使用个人主账号。
- 不要开启短信二次验证；如必须开启，请在审核备注中提供可用的验证码获取方式。
- 测试账号中不要包含真实个人信息、客户资料或未公开内容。
- 如果部分平台只支持扫码登录，请提供录屏，并在备注中说明审核员可跳过该平台。

如果确实无法提供平台测试账号，请在审核备注中说明：

```text
The target platforms require mainland-China phone verification and the test accounts
contain user-generated drafts, so we cannot share reusable passwords. We have provided:
1) a public WeChat article for the read/edit/local-save flow, which does not require login;
2) a complete walkthrough video showing CSDN and Toutiao draft creation:
   <YOUTUBE_OR_DRIVE_VIDEO_URL>
The extension never publishes content automatically.
```

## 二、最短审核路径

### 路径 A：读取公众号文章并编辑（不需要平台账号）

1. 在 Edge 或 Chrome 中安装扩展。
2. 打开测试公众号文章：`<PUBLIC_WECHAT_ARTICLE_URL>`。
3. 点击工具栏中的扩展图标，或使用页面右侧的“公众号文章同步助手”面板。
4. 点击“去同步”。
5. 确认编辑页显示文章标题、摘要、正文预览和图片数量。
6. 修改标题或正文，等待自动保存，确认“已保存”状态出现。
7. 点击“同步到平台”，确认平台列表和登录状态正常显示。

预期结果：文章可以被正确读取、编辑和本地保存；此步骤不需要任何平台登录。

### 路径 B：同步到 CSDN（接口直存）

1. 使用 `<CSDN_TEST_USERNAME>` / `<CSDN_TEST_PASSWORD>` 登录 CSDN。
2. 回到编辑页，打开“同步到平台”。
3. 只勾选 CSDN，点击“同步为草稿”。
4. 等待状态变为“打开草稿”，点击该链接。
5. 在 CSDN 草稿编辑器中检查标题、正文和封面。

预期结果：

- 扩展显示 CSDN 已登录；
- 创建的是草稿，不会自动发布；
- 标题、正文和封面已写入；
- 草稿 ID 和链接显示在同步结果中。

### 路径 C：同步到今日头条（页面自动填充）

1. 使用 `<TOUTIAO_TEST_USERNAME>` / `<TOUTIAO_TEST_PASSWORD>` 登录今日头条后台。
2. 回到编辑页，只勾选今日头条，点击“同步为草稿”。
3. 扩展会打开今日头条图文编辑器，并自动填写标题、正文和单图封面。
4. 确认页面显示“草稿将自动保存”或草稿状态。
5. 在头条号后台“草稿”列表中检查文章。

预期结果：

- 扩展打开的是图文编辑器，不是发布页；
- 标题和正文已填入；
- 有原文封面时会自动上传并选择封面；
- 扩展不会点击“预览并发布”。

### 路径 D：51CTO / 小红书（可选）

- 51CTO：验证封面通过 upload-sign、COS 上传，并写入 `banner_type=1`、`img_urls`。
- 小红书：验证长文编辑器自动填入标题和正文，并停在草稿/暂存状态；封面由小红书编辑器自动生成。

## 三、审核备注（英文，可直接粘贴）

```text
Product: 公众号文章同步助手 (WeChat Article Draft Sync)
Version: 0.2.3

Purpose
This extension helps a user save an article they are authorized to use from a WeChat
Official Account as a draft in their own account on another content platform. It does
not publish content automatically and does not operate a developer server.

Privacy policy
https://imoowi.github.io/mp-sync-privacy.html

Recommended test flow
1. Install the extension and open this public article:
   <PUBLIC_WECHAT_ARTICLE_URL>
2. Click the extension icon, then click “去同步” (Go to sync).
3. Verify that the title, summary, body preview, and image count are extracted.
4. Edit the title or body and verify that the change is saved locally.
5. Click “同步到平台” (Sync to platforms) and select one test platform.
6. Click “同步为草稿” (Save as draft), then open the returned draft link.

Target platform test accounts
- CSDN: <CSDN_TEST_USERNAME> / <CSDN_TEST_PASSWORD>
- Toutiao: <TOUTIAO_TEST_USERNAME> / <TOUTIAO_TEST_PASSWORD>
- 51CTO (optional): <51CTO_TEST_USERNAME> / <51CTO_TEST_PASSWORD>
- Xiaohongshu (optional): <XHS_TEST_USERNAME> / <XHS_TEST_PASSWORD>

Expected results
- The extension only creates or updates drafts. It never clicks a publish button.
- CSDN tests the direct API flow and cover upload.
- Toutiao tests the page-fill flow, including title, body, and cover.
- If a platform is not logged in, the extension shows a “未登录” (not logged in) link
  and does not attempt to bypass authentication.

Permissions
- activeTab: to open or toggle the in-page panel after the user clicks the toolbar icon.
- scripting: to read the current public WeChat article and fill supported platform editors.
- storage: to keep the user's draft, sync results, and preferences locally.
- cookies: to reuse the user's existing platform login session and read CSRF-related
  cookie fields. Passwords and cookies are not exported to the developer.
- tabs: to open the editor, open draft links, and close temporary tabs created by the
  extension.
- clipboardWrite: to copy article content to the clipboard only when automatic filling
  fails, so the user can paste it manually.
- declarativeNetRequestWithHostAccess: see the header explanation below.

Host permissions are used only for the corresponding platform accounts and their
image-storage endpoints. A complete per-host matrix is provided in docs/permissions.md
and can be copied into the dashboard's permission justification field.

Header rule explanation
The extension's background requests otherwise carry an Origin/Referer of
chrome-extension://, which several platform APIs reject. The session rules only apply
to requests initiated by the extension service worker (tabIds = [-1]) and only for
the declared platform/image-storage domains. They set Origin/Referer to the
corresponding platform origin. They do not modify requests made by the user's normal
browsing, do not bypass login, and do not grant access to content the user cannot
already access with their own session.

Data handling
- No developer server, analytics, advertising, or tracking SDK.
- Article content and edits are stored in chrome.storage.local.
- Platform cookies/localStorage are read only for login/CSRF purposes.
- Data is sent to a platform only after the user selects it and clicks
  “同步为草稿”.

Known limitations
- Platform APIs are unofficial and may change without notice.
- Some platforms require mainland-China network access or phone/SMS verification.
- CSDN/51CTO body images currently remain as original WeChat links; use text-only
  test content if you want to verify the draft flow without image dependencies.
- The extension does not publish and does not automate engagement actions.

If a platform is unavailable in your region, please use the walkthrough video:
<YOUTUBE_OR_DRIVE_VIDEO_URL>

Contact: simpleyuan@gmail.com
```

## 四、中文审核备注（备用）

```text
产品：公众号文章同步助手 0.2.3
用途：将用户有权使用的微信公众号文章，在用户主动选择平台后保存为用户本人账号下的草稿。

隐私政策：https://imoowi.github.io/mp-sync-privacy.html

测试步骤：
1. 打开公开测试文章：<PUBLIC_WECHAT_ARTICLE_URL>
2. 点击扩展图标，点击“去同步”，确认标题、摘要、正文和图片数量被读取。
3. 修改正文，确认本地自动保存。
4. 点击“同步到平台”，只勾选 CSDN 或今日头条，点击“同步为草稿”。
5. 打开返回的草稿链接，确认标题、正文和封面。

测试账号：
CSDN：<CSDN_TEST_USERNAME> / <CSDN_TEST_PASSWORD>
今日头条：<TOUTIAO_TEST_USERNAME> / <TOUTIAO_TEST_PASSWORD>

说明：
- 扩展只保存草稿，不会点击发布。
- Cookie 仅用于复用用户已有登录态和读取必要 CSRF 字段，不导出到开发者服务器。
- Origin/Referer 会话规则仅作用于扩展自身发起、且目标域名已声明的请求
  （tabId = -1），不修改用户正常浏览请求，也不绕过登录。
- 平台接口为非公开接口，可能随平台改版失效。

如果审核地区无法访问某平台，请使用演示视频：<YOUTUBE_OR_DRIVE_VIDEO_URL>
联系邮箱：simpleyuan@gmail.com
```

## 五、提交前检查

- [ ] 隐私政策已部署到 HTTPS 公网地址，并能匿名访问。
- [ ] 已替换本文所有 `<...>` 占位符。
- [ ] 测试账号可以正常登录，未开启不可用的二次验证。
- [ ] 至少验证 CSDN 和今日头条两条路径。
- [ ] 录屏展示了“只保存草稿、不发布”。
- [ ] 商店权限说明、隐私表单和隐私政策内容一致。
