# 题库 / 卡片生成规范（agent 用）

## 输出两个 JSON 数组

### 1) questions: 题目数组

每道题 **id 全局唯一**，命名约定：`{topic-prefix}-{NNN}`，三位数字，从 001 开始。

```json
{
  "id": "topic-001",
  "type": "choice" | "truefalse",
  "topic": "topic-id",        // 主题英文 id
  "topicName": "中文主题名",
  "question": "题目正文",
  "options": ["A", "B", "C", "D"],   // 仅 type=choice 才有
  "answer": 1,                       // choice: 0-based 索引；truefalse: true/false
  "explanation": "正确答案的解释（一两句话即可，引用 post 里的具体数据/说法）",
  "source": "post-slug"              // 即 post 目录名去掉日期前缀
}
```

### 2) cards: 知识卡片数组

```json
{
  "topic": "topic-id",
  "title": "知识点标题（短，10 字内最佳）",
  "displayType": "table" | "chart" | "flow" | "formula" | "checklist" | "comparison" | "bigNumber" | "text",
  "content": "一两句概述",
  "richData": { ... },        // 见下方各类型 schema
  "actionItem": "可执行的行动建议（可选）",
  "source": "post-slug"
}
```

### displayType 各类 richData schema

**table**:
```json
{ "headers": ["列1", "列2"], "rows": [["a","b"], ["c","d"]] }
```

**chart**（横向柱状图，按数值大小自动等比）:
```json
{ "bars": [{ "label": "项A", "value": 1.5, "display": "1.5x" }] }
```

**flow**（步骤流程，自上而下带箭头）:
```json
{ "steps": ["步骤1", "步骤2", "步骤3"] }
```

**formula**（高亮的公式或定理）:
```json
{ "formula": "幸福 = 享受 + 满足 + 意义" }
```

**checklist**（可执行清单）:
```json
{ "items": ["项1", "项2", "项3"] }
```

**comparison**（左右对比，左红右绿）:
```json
{
  "leftTitle": "❌ 误区",
  "leftItems": ["a", "b"],
  "rightTitle": "✅ 真相",
  "rightItems": ["c", "d"]
}
```

**bigNumber**（突出关键数字）:
```json
{ "number": "4.2x", "label": "感冒风险增加" }
```

**text**: richData 留空 / 不写，只用 content。

## 内容质量要求

1. 每篇 post **题目 10-20 道**，**卡片 5-10 张**，根据原文丰富度决定。
2. 题目里的数字、专家名字、概念必须**直接源自原文**，不要瞎编。
3. 选择题的干扰项要合理（不能明显瞎），尽量是相近概念。
4. 题型分布：选择题约 70%，判断题约 30%。
5. 卡片要**多样**——一篇 post 不要全是 text 或全是 checklist，根据内容性质挑最合适的展示方式：
   - 多个数字对比 → chart
   - 步骤/因果链 → flow
   - 误区 vs 真相 → comparison
   - 数据列表 → table
   - 关键比例 / 时长 / 倍数 → bigNumber
   - 具体行动条 → checklist
   - 公式/定理 → formula
6. **explanation 必须有用**——告诉读者为什么这是答案，引用原文细节。
