# 项目约定

## 更新日志必须跟着改

每次提交用户能看到的改动（新功能、交互调整、修复、文案/样式调整），都要在同一次提交里补一条更新日志：

```bash
npm run changelog -- --version 2026.11.18.1 --kind feature \
  --title "一句话标题" --content "第一行\n第二行"
```

- `--kind`：`feature` 新功能 / `improvement` 体验优化 / `fix` 问题修复。
- `--version`：`年.月.日`，同一天多条依次加 `.1`、`.2`、`.3`，一天只有一条可省略后缀。
- `--date`：默认今天；补记旧记录时才手动指定。
- 内容写用户能感知的变化和好处，2～4 行，别写内部实现细节。
- 脚本会同时写入 `changelog-seed.json`（部署用）和 `private/admin/changelog.json`（本地后台立即可见）。
- 线上后台的日志存在 PostgreSQL，部署后会用 `changelog-seed.json` 自动补齐缺少的版本；在后台手动删掉的版本不会被补回。
- 查看已有记录：`npm run changelog -- --list`。批量补记：`npm run changelog -- --json 清单.json`（数组，字段同上）。

提交前自查：这一版改的东西，后台「更新日志」里有没有对应的一条？

## 其他

- 测试逐文件跑：`node test/xxx.test.mjs`。
- 作者信息：`-c user.name="3121597355" -c user.email="3121597355@qq.com"`。
