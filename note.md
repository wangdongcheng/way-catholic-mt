MSPSL routine is a five-step driving method used to safely approach and navigate hazards, junctions, and roundabouts. It stands for Mirrors, Signal, Position, Speed, and Look.

Mirror, Signal, Manoeuvre (MSM) 


20260912

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