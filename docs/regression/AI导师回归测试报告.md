# AI 导师回归测试报告

## 测试目的

用于每次修改 AI 导师、图片问答、本地兜底、模型回退链或教师后台后，快速确认核心能力没有退化。

## 当前固定测试集

- 文字自由问答：3 条
- 作业辅导：2 条
- 乐理概念解释：3 条
- 图片作业识别：3 条
- 图片问题识别：1 条
- 非作业图片识别：2 条
- 合计：14 条

## 通过标准

- 总通过率必须为 100%。
- 图片类样本必须调用视觉模型链，而不是退回纯文本模板。
- 无意义输入允许回答，不应被“无效问题”模板屏蔽。
- “作业是什么 / 作业要求”必须返回作业入口说明，不应误判为教师批改建议。
- 非作业图片必须如实说明图片内容或提示其不是乐理作业，不应硬套当前课时模板。

## 本地验证命令

```powershell
npm run test:ai-tutor
```

## 公网文字回归命令

```powershell
node scripts\run-ai-tutor-regression.mjs --public --category text-free-form
```

## 最近一次验证结果

- 本地构建：通过
- AI 导师回归：14/14 通过
- 图片类：6/6 通过
- 公网文字回归：3/3 通过
- 公网健康接口：`/api/health` 通过
- 教师状态接口：`/api/status` 已新增

## 后续维护要求

每次改动以下文件后，必须重新运行本报告中的测试命令：

- `server.js`
- `src/AITutorV2.jsx`
- `src/openaiTutorBridge.js`
- `scripts/run-ai-tutor-regression.mjs`
- `src/musicaiKnowledgeAliases.js`
- `src/musicaiKnowledge.js`
