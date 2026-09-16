# 更新日志

本文件根据仓库提交历史按主要功能里程碑整理，不逐条记录分支合并、实验性提交和单纯的数据缓存更新。

## 2026-09-16 — R2 在线路线编辑与受保护的管理接口

- Route Editor 新增 R2 远程数据工作流，同时保留原有本地目录编辑方式：
  - 在线 HTTPS 环境自动从 R2 加载数据，无需选择本地 `public/data` 目录；本地开发环境继续使用 File System Access API。
  - 数据集菜单从远程 `route-index.json`、`observation-checks.json` 和 `critical-violations.json` 动态建立。
  - 支持在线读取、编辑并保存现有路线、Observation Checks 和 Critical Violations，也支持创建新路线。
  - 保存路线后自动更新并排序远程路线索引；编辑器同步刷新数据集菜单及当前 ETag。
  - 在线错误提示覆盖身份验证失效、远程文件冲突、服务端校验失败和非 JSON 响应等情况。
- 新增 Cloudflare Worker 数据层，将静态应用、公开数据读取和管理写入统一到同一部署中：
  - `/data/*` 从 `MDTS_DATA` R2 binding 提供公开的只读 JSON，仅允许路线、路线索引、全局观察数据、严重违规数据和地理编码缓存等明确的数据路径。
  - `/api/admin/data/*` 仅允许 `PUT`，并限制可写目标为路线、Observation Checks 和 Critical Violations。
  - 写入前检查 JSON Content-Type、1 MiB 大小限制、文档对象格式、稳定 ID、数据类型及现有 Route Editor 校验规则。
  - 路线 ID 仅接受字母、数字和连字符，阻止路径穿越及未声明的数据文件访问。
- 管理写入接入 Cloudflare Access / Zero Trust 身份验证：
  - Worker 验证 `Cf-Access-Jwt-Assertion` 的签名、签发方和 Application Audience，而不是仅依赖边缘转发的请求头。
  - 使用 Cloudflare Access 团队域名公开的 JWK，并在 Worker 实例内复用签名密钥集合。
  - 验证成功后记录令牌中的邮箱或主体标识，并随保存结果返回更新者信息。
  - Access 未配置、缺少登录令牌及令牌校验失败分别返回明确的 `503`、`401` 和 `403` 响应。
- 增加远程数据的并发保护与可恢复性：
  - 加载数据时记录 R2 ETag，更新时使用 `If-Match`，防止旧编辑页面静默覆盖较新的修改。
  - 创建新路线时使用 `If-None-Match: *`，防止重复 ID 覆盖已有文件。
  - 每次覆盖前按时间戳将原文件保存到 R2 `backups/`；路线索引在更新前同样保留备份。
  - 修复 Cloudflare gzip 压缩把浏览器可见 ETag 改为弱 ETag、导致所有保存误报 `412 Precondition Failed` 的问题：Worker 额外返回未经转换的 `X-MDTS-ETag`，编辑器优先使用该值进行条件写入。
- 明确区分 preview 与 production 的 R2 数据：
  - `wrangler.preview.jsonc` 将 preview 部署绑定到 `mdts-data-preview`。
  - `wrangler.jsonc` 将正式部署绑定到 `mdts-data-production`。
  - 新增 `deploy:preview` 与 `deploy:production` 命令，避免依赖容易混淆的 Wrangler 环境覆盖关系。
  - preview 使用版本上传流程，production 使用正式部署流程，并保留远程环境变量。
- 新增远程编辑自动化检查，覆盖数据源选择、远程数据集列表、ETag 读取与传递、新路线条件创建以及冲突错误处理。
- Observation 类型列表新增 `tunnel-entrance`（Tunnel entrance），可用于配置隧道入口观察检查。

## 2026-09-15 — 结果回放地图与缓存地图

- Exam Result 改为以醒目的通过／失败标识和地图为核心的简洁报告：
  - 本次实际完成且正确的事件显示绿色勾选；答错、漏答或错过的事件显示红色叉号。
  - 发生错误的 `grievousFault` 以及 Critical Violation 显示红色感叹号；未触发或未评估事件不显示。
  - 显示路线起点 `S`；正常完成时显示终点 `E`，若发生 Critical Violation 则隐藏终点。
  - 标记支持悬停／点击查看事件明细，并显示与 Current Info 一致格式的路名和地区；优先使用缓存，缺失时自动反向地理编码并写入缓存。
  - 修正详情信息窗的文字对比度和默认空白标题区。
- 新增 `/cached.html` 全屏缓存地点地图：
  - 自动读取 `public/data/geocoding-cache/index.json` 中声明的全部 shard，并标记所有已缓存坐标。
  - 自动缩放以显示所有点；点击标记可查看地点名称和坐标。
  - 缓存数量提示框移至顶部居中，避免遮挡 Google 地图／卫星图切换控件。

## 2026-09-14 — 考试结束与成绩报告

- 新增明确的 `route-finish` 路线终点事件：
  - 每条路线必须且只能包含一个终点，并位于有序事件列表末尾。
  - 到达终点后结算尚未回答的考官指令和仍在等待确认的 Observation。
  - 现有两条示例路线均已加入 demo 终点。
- 新增完整 Exam Result 报表：
  - 采用 100 分制，累计罚分从总分扣除，75 分为及格线。
  - 展示路线、完成时间、考试时长、总罚分、指令与观察完成情况、漏过的路线点及 Critical Violation 数量。
  - 支持展开查看答错、漏答、漏观察和严重违规明细。
  - 提供重新考试和选择其他路线操作。
- 实现 `grievousFault` 最终判定规则：
  - 普通严重事件失败后继续完成考试。
  - 最终结果强制为失败，不受剩余分数影响。
  - Critical Violation 天然视为严重错误，无需配置 `grievousFault`，并继续保持立即终止考试的行为。
- Route Editor 支持放置和识别 `route-finish`：
  - 使用独立地图标记颜色。
  - 阻止同一路线添加多个终点。
  - 新增考官指令时自动插入到终点之前。
  - 校验终点的唯一性及事件顺序。
- 增加考试结果、严重错误、终点触发及终点 Observation 结算的自动化测试。

## 2026-09-12 — Route Editor 本地目录工作流

- Route Editor 改为直接维护本地 `public/data` 目录：
  - 首次连接后保存目录句柄，后续可复用已授权的目录。
  - 动态扫描 `routes/*.json`、`observation-checks.json` 和 `critical-violations.json` 并建立数据集菜单。
  - 移除写死的数据集清单以及路线 JSON 的导入、下载流程。
  - `Save` 直接创建或覆盖对应的本地 JSON 文件。
  - 新路线保存后自动从草稿转为正式数据集，并阻止重复路线 ID 覆盖已有路线。
- 未连接数据目录时禁用路线编辑操作，并明确提示需要桌面版 Chrome 或 Edge。
- Editor 地图启用地图类型控件，可切换普通地图与卫星图层。

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
