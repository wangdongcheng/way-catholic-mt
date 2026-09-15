MSPSL routine is a five-step driving method used to safely approach and navigate hazards, junctions, and roundabouts. It stands for Mirrors, Signal, Position, Speed, and Look.

Mirror, Signal, Manoeuvre (MSM) 


# 20260912 潜在的可能问题

有。主要问题集中在**事件同时触发、扣分结算、暂停/重启，以及编辑器与运行时规则不一致**。

我检查了主要交互代码，并用内存场景测试复现了其中 10 项行为。当前四份路线/观察/违规数据都通过现有校验，但校验通过并不代表交互没有问题。以下区分了明确缺陷与需要你决定的产品规则。

1. **排队中的考官指令可能被直接丢掉**

   如果 A 指令还没回答，B 指令先进入队列；等轮到 B 时，用户已离开 B 的 `answerRadius`，代码会直接跳过 B，既不显示，也不记录漏答或扣分。

   用户可能通过持续移动避开排队的题目。当前两条路线各只有一道题，暂时不容易出现；增加密集事件后会明显。

   建议：排队指令也应有明确的超范围结算规则。位置：[main.js:148](D:/Users/wdc/Documents/github/way-catholic-mt/src/main.js:148)。

2. **Observation 设置朝向后，原地转头不会立即触发**

   Observation 引擎支持 `headingMin/headingMax`，但 `pov_changed` 只检查考官事件，没有检查 Observation。

   例如进入范围时朝向不符合，随后原地转向标志，观察提示仍可能不出现，直到发生位置或 panorama 变化。

   建议：转头时也检查 Observation。位置：[main.js:602](D:/Users/wdc/Documents/github/way-catholic-mt/src/main.js:602)。

3. **Observation 答错一次后，可能被扣两次分，而且不能纠正**

   单个观察事件的实际流程是：

   `点错 → 扣错误分 → 按钮隐藏 → 离开范围 → 再扣漏答分`

   已复现默认配置下累计扣 `1 + 3 = 4` 分。问题在于答错消耗了唯一机会，但事件仍停留在 `ACTIVE`，离开时继续判为漏答。

   这需要明确产品规则：如果只允许一次回答，答错后应该进入明确的错误终态；如果允许纠正，按钮就不应该立即消失。位置：[observation-engine.js:236](D:/Users/wdc/Documents/github/way-catholic-mt/src/observation-engine.js:236)。

   另一个明确缺陷是：单条配置 `penaltyOnIncorrect: 0` 时，会被 `||` 替换成默认扣分，导致“不扣分”设置无效。位置：[observation-engine.js:256](D:/Users/wdc/Documents/github/way-catholic-mt/src/observation-engine.js:256)。

4. **模态框锁住操作，却没有暂停违规计时**

   Critical violation 的窗口直接使用真实时间。经过 A 后，如果打开模态提示或 Restart 确认框，阅读和等待时间仍计入 `windowMs`。

   例如窗口是 30 秒，在弹框中等 31 秒再去 B，这次违规就不会触发。用户没有移动，检测资格却已过期。

   建议统一定义“暂停”：哪些弹框暂停驾驶时间，哪些只阻止点击。位置：[critical-violation-engine.js:90](D:/Users/wdc/Documents/github/way-catholic-mt/src/critical-violation-engine.js:90)。

5. **模态教学消息可能延迟锁屏，甚至永久丢失**

   两个不同场景：

   - 当前非模态消息正在显示时，新触发的模态消息会进入队列。它不会立即锁屏，用户仍能继续走，直到前一条关闭。
   - Practice 致命违规会清空所有教学消息，但 Observation 在入队时已经标记为 `SHOWN`。继续练车后，被清掉的消息不会再出现。

   对重要长文本而言，当前“已触发”不等于“用户已看到并确认”。建议区分待显示、显示中、已确认状态。位置：[ui.js:388](D:/Users/wdc/Documents/github/way-catholic-mt/src/ui.js:388)、[main.js:536](D:/Users/wdc/Documents/github/way-catholic-mt/src/main.js:536)。

6. **重启不能取消尚未完成的初始化**

   驾驶会先解锁，再异步加载事件位置。如果此时点击 Restart，旧的初始化完成后仍可能触发事件，让消息出现在模式选择界面上。

   已复现引擎在 `reset()` 后仍通过未完成的 `initialize()` 发出事件。当前数据都有坐标，时间窗口较小；使用需要远程解析的 pano 时风险更明显。

   建议增加本次驾驶的会话标识，忽略已经结束会话的异步结果。位置：[main.js:414](D:/Users/wdc/Documents/github/way-catholic-mt/src/main.js:414)、[event-engine.js:158](D:/Users/wdc/Documents/github/way-catholic-mt/src/event-engine.js:158)。

7. **考试尚未形成完整的结束与结算流程**

   目前有致命违规失败，但没有正常完成、最终结果、通过标准或尾部未到达检查点结算。路线的漏点是在“到达后面的事件”时处理的，因此最后一个必经点如果始终没到，没有后续事件来结算它。

   此外，README 明确规定“到达位置就算经过检查点，朝向只决定是否出题”。所以进入范围但朝向不匹配，再离开，可能既没答题也没扣分。这是现有设计，不是实现偏离，但对于考试是否合理需要决定。

   位置：[route-progress.js:54](D:/Users/wdc/Documents/github/way-catholic-mt/src/route-progress.js:54)、[event-engine.js:141](D:/Users/wdc/Documents/github/way-catholic-mt/src/event-engine.js:141)。

编辑器还有这些问题：

| 问题 | 实际影响 | 建议 |
|---|---|---|
| Import 没有检查未保存修改 | 导入另一份 JSON 会直接替换当前编辑内容；刷新页面也没有离开提醒 | 统一未保存修改保护。[代码](D:/Users/wdc/Documents/github/way-catholic-mt/src/editor/editor-main.js:512) |
| 切换数据集没有取消“两步放置违规点” | 在 Critical 中选了 A，切到路线后再点 B，会把 critical event 加入路线。已复现 | 切换、导入、新建时清理放置状态，并再次检查数据集类型。[代码](D:/Users/wdc/Documents/github/way-catholic-mt/src/editor/editor-main.js:158) |
| 编辑器未按运行时方式处理 defaults | 观察事件继承了默认值，表单却可能显示空值或未勾选；修改路线默认值也不会更新已展开成显式值的旧事件 | 明确显示“继承”与“单条覆盖”。[代码](D:/Users/wdc/Documents/github/way-catholic-mt/src/editor/route-store.js:19) |
| 校验遗漏运行时必需条件 | 删除 Observation 的 `startState` 后仍显示校验通过，但 Practice 会初始化失败 | 校验器和运行时共用有效配置规则。[代码](D:/Users/wdc/Documents/github/way-catholic-mt/src/editor/route-validator.js:42) |
| Observation 类型有两份定义 | 运行时读 JSON，编辑器使用硬编码列表；新增类型后两边可能不同，甚至没有对应答题按钮 | 编辑器也读取 `observation-types.json`，并校验类型引用。[代码](D:/Users/wdc/Documents/github/way-catholic-mt/src/editor/event-form.js:132) |

界面方面还有一个需要浏览器实测的问题：**手机布局的 Observation 工具栏占据底部区域，而 Restart 和 Penalty 也在底部，且层级更低，存在被遮挡的风险**。见 [style.css:669](D:/Users/wdc/Documents/github/way-catholic-mt/src/style.css:669)。这项目前是 CSS 检查发现，尚未做真实屏幕验证。

我建议优先处理排队指令结算、Observation 朝向检查、零扣分失效和编辑器数据保护；然后确定答错是否允许纠正、模态框是否暂停计时，以及考试如何结束。这几条规则会直接影响后续修复方式。

本次没有修改任何仓库文件；验证以代码审查和内存场景测试为主，未进行真实 Google Street View 浏览器联调。

---

# Practice 与 Exam 模式下的 Event 行为清单

下面是根据目前代码实际行为整理的清单。

## 总览

| Event 类型 | Practice 练车模式 | Exam 考试模式 |
|---|---|---|
| Examiner Command | 当前不会加载 | 到点显示答题指令，记录结果和扣分 |
| Observation Check | 自动显示教学提示 | 要求点击对应观察按钮，可能扣分 |
| Critical Violation | 暂停练习并警告，可以继续 | 立即终止考试 |
| Route Checkpoint | 当前不追踪 | 按事件顺序追踪，可判定漏点并扣分 |
| Route Finish | 当前不会加载 | 到点结算剩余事件并显示考试结果 |

路线 JSON 目前只支持 `examiner-command` 和 `route-finish`。独立的 `route-message` / `message` Event 已不再支持；Practice 教学提示统一来自全局 Observation Check 的 `practiceMessage`。`showRouteMessage()` 仍作为通用消息 UI，用于练习提示、漏点提示和初始化错误等非独立 Event 场景。

## 1. Examiner Command

对应类型：

```json
"type": "examiner-command"
```

支持：

- `single`：单选。
- `multiple`：多选。
- `sequence`：顺序选择。

### Practice

当前实际行为：**完全不会加载或显示。**

不会：

- 弹出 Examiner Command。
- 判断答案。
- 记录结果。
- 扣分。

### Exam

进入 `radius` 后：

- Command 加入等待队列。
- 没有其他活动指令时显示答题卡。
- 用户必须在 `answerRadius` 内完成回答。
- 答题结果加入 `results`。
- 扣分累加到页面上的 `Penalty`。

#### 回答正确

记录：

```js
{
  status: "answered",
  correct: true,
  penalty: 0
}
```

并显示正确反馈。

#### 回答错误

记录：

```js
{
  status: "answered",
  correct: false,
  penalty
}
```

扣分规则：

- 单选：优先使用所选 Option 的 `penalty`。
- 单选没有 Option penalty：使用 Event 的 `penalty`。
- 多选或顺序题：使用 Event 的 `penalty`。

目前考试模式会立即显示正确或错误反馈，也可能显示事件配置的答案提示。

#### 离开答题范围仍未提交

当活动指令距离超过 `answerRadius`：

- 自动关闭指令。
- 记录 `status: "out-of-range"`。
- 使用 `penaltyOnOutOfRange` 扣分。
- 显示未回答提示。
- 继续显示队列中的下一条指令。

#### 整个路线点被跳过

如果事件是 `required: true`，并且驾驶者先到达后面的路线事件：

- 当前事件判定为 `missed`。
- 使用 `penaltyOnMiss` 扣分。
- 显示漏掉路线点的提示。

## 2. Observation Check

数据来自：

```text
public/data/observation-checks.json
```

对应类型：

```json
"type": "observation-check"
```

这类事件是全局事件，不属于具体 Route JSON。

### 两个模式共有条件

只有未被明确禁用的事件会加载：

```json
"enabled": false
```

触发时检查：

- `radius`
- 可选的 `pano`
- 可选的 `headingMin` / `headingMax`

`enabled: false` 时，两个模式都不处理；字段省略或为 `true` 时加载。

### Practice

`examEnabled` 不影响练车模式。

也就是说：

```json
"examEnabled": false
```

仍然可以在 Practice 中显示。

进入触发范围后：

- 自动显示 `practiceMessage`。
- 不显示观察按钮。
- 不要求用户确认。
- 不记录成绩。
- 不扣分。
- 每次练习 Session 只显示一次。

提示分为两种：

- `modal: true`：模态弹窗，用户点击 OK 后关闭。
- 其他情况：非模态提示，并在默认时间后自动消失。

### Exam

只加载未被以下任一配置明确禁用的事件：

```json
"enabled": false,
"examEnabled": false
```

也就是说，`enabled` 和 `examEnabled` 省略或为 `true` 时会在 Exam 中加载；如果任一字段为 `false`：

- 考试中完全忽略。
- 不显示按钮。
- 不要求确认。
- 不扣分。

进入触发半径后：

- Observation 变成 `active`。
- 显示观察按钮栏。
- 用户需要在离开 `answerRadius` 前点击对应类型。
- 不会告诉用户哪个按钮正确。

#### 点击正确按钮

记录：

```js
{
  status: "observation-acknowledged",
  correct: true,
  penalty: 0
}
```

然后：

- 显示正确反馈。
- Observation 状态变成 `acknowledged`。
- 离开 `answerRadius` 后变成 `completed`。
- 不再扣分。

#### 点击错误按钮

记录：

```js
{
  status: "observation-incorrect",
  correct: false,
  penalty
}
```

然后：

- 使用 `penaltyOnIncorrect` 扣分。
- 显示不匹配提示。
- 消耗一次可用尝试。

如果只有一个 Observation 正在等待，点错后按钮会隐藏，但 Observation 仍然是 `active`；之后离开范围，还会再判定一次漏观察并扣 `penaltyOnMiss`。

因此当前逻辑允许：

```text
点错扣分 + 最后漏观察再扣分
```

#### 未确认便离开范围

记录：

```js
{
  status: "observation-missed",
  correct: false,
  penalty
}
```

然后：

- 使用 `penaltyOnMiss` 扣分。
- 显示漏掉必要观察的反馈。

#### 多个 Observation 同时激活

- 每个激活事件增加一次可用尝试。
- 点击正确类型时，确认第一个匹配的事件。
- 点击不匹配类型时，使用所有活动事件中最高的 `penaltyOnIncorrect`。
- 所有观察按钮统一显示，不暴露正确答案。

## 3. Critical Violation

数据来自：

```text
public/data/critical-violations.json
```

对应类型：

```json
"type": "critical-violation"
```

### 两个模式共有的检测过程

只有 `enabled !== false` 的事件会加载。

触发过程：

1. 到达 `triggerCheckpoint`，事件进入 `armed`。
2. 在 `windowMs` 时间内到达 `forbiddenDestination`。
3. 判定 Critical Violation。
4. 超过时间没有到达禁区，事件过期。
5. 离开触发点后，可以恢复到等待状态。

`pano` 是可选条件；配置了才要求 Panorama 完全匹配。

### Practice

触发后：

- 记录 `status: "practice-warning"`。
- 暂停驾驶检测。
- 锁定 Street View。
- 清除普通路线提示。
- 显示红色严重违规警告。
- 不增加数字 Penalty。
- 提供“Continue practice”。
- 也可以 Restart。

点击继续后：

- 关闭警告。
- 解锁 Street View。
- 恢复驾驶和位置检测。

如果：

```json
"oncePerSession": false
```

驾驶者离开触发区和禁区后，该违规可以再次触发。

### Exam

触发后：

- 记录 `status: "failed"`。
- 立即停止考试。
- 停止位置检测。
- 清除当前及等待中的 Examiner Commands，但不把它们另记为未回答。
- 隐藏 Observation Toolbar。
- 锁定 Street View。
- 直接显示 Failed 考试结果页，不结算仍在等待的 Observation。
- Critical 事件在问题清单中的名称优先使用 `examFailure.message`，失败原因标记为 Critical Violation。
- 提供 Try again 和 Choose another route。
- 不增加数字 Penalty。

也就是说，Critical Violation 当前是“直接挂科”，不是普通扣分。

## 4. Route Checkpoint 顺序机制

Route JSON 中的每个 Event 都参与路线顺序追踪，包括 `examiner-command` 和 `route-finish`。

### Practice

当前不加载 Route Events，因此：

- 不追踪路线顺序。
- 不判定路线漏点。
- 不使用 `required`。
- 不使用 `penaltyOnMiss`。

### Exam

路线事件按 JSON 数组顺序执行。

普通路线事件的默认值由 Route Navigation 控制：

```json
"navigation": {
  "eventsAreCheckpoints": true,
  "defaultPenaltyOnMiss": 5
}
```

当 `eventsAreCheckpoints: true`：

- 没有单独设置 `required` 的普通事件，默认都是必经点。
- 没有单独设置 `penaltyOnMiss` 的事件，使用路线默认扣分。
- `route-finish` 始终被规范化为 `required: true`、`penaltyOnMiss: 0`。

到达后面的事件时，前面仍未到达的事件会被结算：

- `required: true`：标记为 `missed`，记录并扣分。
- `required: false`：标记为 `skipped`，不扣分、不提示。

### Checkpoint 到达与内容触发

Checkpoint 的“到达”和 Event 内容的“触发”条件不同：

- 进入 `radius` 就算 Checkpoint 已到达。
- 但 Examiner Command 内容可能还要求 Heading 匹配。
- `route-finish` 不检查 Heading。

因此可能出现：

```text
路线点算已到达，但因为朝向不符合，Examiner Command 没有显示。
```

这种情况当前不会按漏点扣分；到达后面的事件时，尚未触发的指令内容会被抑制。

## 5. Route Finish 与考试结算

对应类型：

```json
"type": "route-finish"
```

Practice 不加载路线事件，因此不会触发 Route Finish。

Exam 到达 Route Finish 的 `radius` 后：

1. 先按路线顺序把此前尚未到达的必经事件记为 `missed` 并扣分。
2. Route Finish 不受 `headingMin` / `headingMax` 限制。
3. 把当前活动和排队中的 Examiner Commands 记为 `out-of-range`。
4. 把仍为 `active` 的 Observation 记为 `observation-missed`；已确认的 Observation 结算为 `completed`。
5. 停止位置检测、锁定 Street View，并显示考试结果页。

Critical Violation 也会立即结束考试，但不会执行上述待处理 Command 和 Observation 的普通结算。

## 6. `grievousFault` 当前行为

Examiner Command 和 Observation Check 可以配置：

```json
"grievousFault": true
```

该字段不会在事件发生时立即终止考试，而是随答题、漏答或漏点结果保存。考试结算时，只有该事件产生失败结果才会导致 `grievousFailure: true`；正确完成带有 `grievousFault` 的事件不会导致失败。

因此：

- 普通 grievous fault 不会立即中断驾驶。
- 它本身不额外增加 Penalty。
- 最终分数即使达到及格线，仍会判定考试失败。

Critical Violation 始终以 `criticalViolation: true` 和 `grievousFault: true` 记录，并立即终止考试。

## 7. 当前结果记录范围

Exam 会记录：

- Examiner Command 的正确、错误、超出答题范围和路线漏点结果。
- Observation Check 的确认正确、按钮错误和漏确认结果。
- Critical Violation 的直接失败结果。

分数规则为：

```text
最高分 100
最终分数 = max(0, 100 - totalPenalty)
及格线 75
```

必须同时满足以下条件才通过：

- 分数不少于 75。
- 没有 Critical Violation。
- 没有产生失败结果的 grievous fault。

Route Finish 触发正常结算后，结果页会显示分数、扣分、时长、指令与 Observation 统计、漏过的必经路线点、Critical Violation 数量和问题清单。

Practice 中普通 Observation 不记录成绩；Practice Critical Violation 会留下 `practice-warning` 记录，但不会进入考试结果页。
