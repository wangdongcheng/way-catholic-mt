# 更新日志

本文件根据仓库提交历史按主要功能里程碑整理，不逐条记录分支合并、实验性提交和单纯的数据缓存更新。

## 2026-09-11 — Observation 系统与 MDTS 品牌

- 将产品界面统一命名为 **MDTS - Malta Driving Test Simulator**。
- 新增全局 Observation Checks：
  - Practice 模式自动显示教学提示。
  - Exam 模式要求驾驶者选择对应的 “I noticed…” 按钮。
  - 支持漏答与错误选择罚分。
- 新增 Critical Violations：
  - 到达检查点 A 后进入监测状态。
  - 在规定时间内到达禁止位置 B 时触发严重违规。
  - Practice 显示红色警告，Exam 直接结束考试。
- Practice observation message 改为非模态提示，显示时仍可操作 Street View。
- Exam observation 工具栏改为按需显示：
  - 进入触发区域时自动出现。
  - 正确按钮短暂显示绿色反馈。
  - 正确或错误选择后保持显示。
  - 离开 `answerRadius` 后隐藏。
- Observation Checks 支持可选的 `headingMin` 和 `headingMax`：
  - 默认不限制镜头方向。
  - 配置后仅在指定 Street View 镜头角度内触发。
  - 支持跨越正北方向的角度范围。
- 增加仓库级 AI Agent 修改、提交和 preview 分支管理规则。

## 2026-09-10 — 路线、编辑器与缓存体系

- 新增独立 Route Editor：
  - 地图放置和拖动事件。
  - 编辑 examiner command、observation 和 critical violation。
  - 支持单选、多选及顺序答题。
  - 导入、验证并导出 JSON。
- 建立有序路线 checkpoint 系统：
  - 支持 `pending`、`reached`、`missed` 和 `skipped` 状态。
  - 到达后续事件时自动结算之前遗漏的必经点。
  - 支持路线级默认罚分和事件级覆盖。
- 将路线默认值和进度状态拆分为独立模块。
- 新增考试开始确认页面，并在开始前锁定 Street View。
- 新增 Practice/Exam 模式选择和随机考试路线。
- Restart 操作改为返回模式选择页面。
- 建立反向地理编码缓存：
  - 使用本地存储缓存新查询。
  - 支持按地理范围拆分 JSON shard。
  - 支持追加、去重和下载合并后的缓存文件。
- `currentinfo=1` 改为 Current Info 调试面板的严格启用条件。
- 增加 Cloudflare 静态资源部署配置。
- 大幅扩充 README，记录路线、事件、观察项、严重违规及缓存格式。

## 2026-09-09 — 驾驶模拟核心功能

- 接入 Google Maps JavaScript API 和 Google Street View。
- 新增当前位置、全景 ID、镜头方向和道路名称调试信息。
- Current Info 面板支持无操作后自动隐藏。
- 支持通过 URL 的 `lat` 和 `lng` 参数指定测试起点。
- 新增路线重新开始按钮及 Street View 状态复位。
- 将早期单文件实现重构为模块化架构：
  - `main.js` 负责运行时编排。
  - 独立配置、Street View、UI、事件和工具模块。
- 路线事件支持优先使用经纬度，并在缺少坐标时通过可选 pano 定位。
- 新增空间索引，减少附近事件检测时的无效扫描。
- 路线提示改为模态消息，并加入消息排队机制。
- 新增 JSON 路线和 examiner command：
  - 单选、多个选项和五步顺序答题。
  - 正确、错误、超出答题范围及罚分反馈。
- 添加 No Entry 标志资源；曾尝试启动时展示，随后回滚该界面行为。
- 添加项目展示图片和 README 品牌视觉。

## 2026-09-08 — 项目初始化

- 创建 Vite JavaScript 项目。
- 配置基础 HTML、CSS、npm 脚本和 Git 忽略规则。
- 完成最初的 Google Street View 页面原型。
- 添加早期驾驶提示和 Current Info 信息面板。
