# 参与贡献

感谢你愿意改进公众号文章同步助手。提交代码即表示你同意以本项目的 [MIT License](LICENSE) 授权该贡献。

## 开发环境

- Node.js 22 或更高版本
- Microsoft Edge 或其他 Chromium 浏览器
- 不需要安装 npm 依赖，也不需要构建步骤

```bash
git clone https://github.com/imoowi/mp-sync.git
cd mp-sync
npm test
```

在 `edge://extensions` 或 `chrome://extensions` 中开启开发者模式，选择“加载解压缩的扩展”，加载仓库根目录即可调试。

## 常用命令

```bash
npm test          # 运行全部测试
npm run pack      # 自检并生成 dist/gzh-sync-<version>.zip
npm run icons     # 重新生成插件图标
```

## 修改适配器

平台适配器位于 `adapters/`，统一提供 `checkLogin()` 和 `publish()`：

- 只保存草稿，不自动点击发布按钮；
- 不绕过平台登录、验证码或访问限制；
- 不在仓库中提交 Cookie、令牌、账号密码或真实用户内容；
- 平台接口变化时优先只改对应适配器，避免影响其他平台；
- 新增或修改接口行为时，在 `tests/` 中添加不依赖真实浏览器的测试。

修改 `manifest.json` 的权限后，必须同步更新 `docs/permissions.md` 和隐私政策，并确保测试通过。

## 提交 Pull Request

1. 从 `main` 创建分支。
2. 保持改动聚焦，并补充相应测试。
3. 运行 `npm test` 和 `npm run pack`。
4. 在 Pull Request 中说明变更、验证方式和平台限制。

界面或平台流程有明显变化时，建议附上截图或录屏。发现安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。
