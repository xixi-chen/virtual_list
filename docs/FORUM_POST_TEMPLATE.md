# Cocos 论坛发帖模板（VList）

> 直接复制，把占位符替换掉就可以发。

---

## 标题（可选其一）

1. `[开源] Cocos Creator 3.8.6 高性能虚拟列表 VList（循环/分帧/分页/可变尺寸）`
2. `[开源组件] VList：大数据量列表更顺滑，支持 loop、分帧创建、分页`
3. `[实战可用] Cocos 虚拟列表组件 VList，已覆盖 9 个 Demo 场景回归`

---

## 正文模板

大家好，分享一个我在项目里持续打磨的开源列表组件：**VList**（Cocos Creator 3.8.6）。

如果你也遇到过这些问题：

- 列表数据量一大就掉帧
- 快速拖拽后出现留白/错位
- 循环列表、分帧创建、可变尺寸 item 不好兼容

这个组件可能正好能帮上忙。

**项目名称：** `{{PROJECT_NAME}}`  
**仓库地址：** `{{GITHUB_URL}}`  
**在线预览（可选）：** `{{DEMO_URL}}`

---

## 这个组件解决了什么

- 大数据量列表只渲染可视区域，降低创建和更新开销
- 支持可变尺寸 item（高度/宽度动态）
- 支持循环列表（loop）和分帧创建
- 支持单列、单行、多行多列、分页布局
- 对“快速拖拽 + 松手回弹”等边界场景做了稳定性处理

---

## 核心能力

- 虚拟列表渲染：`SingleColumn`、`SingleRow`、Flow、Pagination
- 循环模式（loop）
- 分帧创建模式（frame-by-frame）
- `setItemRenderer / setItemProvider / setItemSizeProvider` 回调体系
- 嵌套列表、聊天列表、下拉刷新场景示例

---

## Demo 场景（仓库内已提供）

1. `virtual_single`（虚拟列表）
2. `virtual_cols_rows`（多行多列）
3. `virtual_page`（分页）
4. `virtual_loop`（循环列表）
5. `virtual_frame_by_frame`（分帧创建）
6. `nested`（列表嵌套）
7. `chat`（聊天）
8. `pull_refresh`（下拉刷新）
9. `align`（对齐）

---

## 快速使用

1. 用 **Cocos Creator 3.8.6** 打开项目
2. 在带 `ScrollView` 结构的节点上挂载 `VList`
3. 设置默认 item
4. 绑定渲染/类型/尺寸回调
5. 设置 `numItems`

```ts
this.vList.setItemRenderer(this, (index, item) => {
  // 渲染 item UI
});

this.vList.setItemProvider(this, (index) => {
  // 可选：返回 item 类型 key
  return "default";
});

this.vList.setItemSizeProvider(this, (index) => {
  // 可选：动态尺寸
  return { width: 200, height: 100 };
});

this.vList.numItems = 1000;
```

---

## 稳定性与回归

- 回归清单：`docs/TEST_MATRIX.md`
- 最近一次完整回归：`{{LAST_TEST_DATE}}`（9 个场景已覆盖）
- 变更记录：`CHANGELOG.md`

---

## 已知说明

- 弹性越界阶段出现短暂留白，可能是 ScrollView 的正常表现
- 在松手/回弹结束后，视口应恢复，不应长期留白

---

## 适合哪些项目

- 聊天、消息流、背包、商城、任务列表等长列表 UI
- item 尺寸变化频繁的界面
- 对滚动手感和稳定性要求较高的移动端项目

---

## 欢迎反馈

如果你在项目里用了它，欢迎反馈体验和边界 case。  
如果发现问题，建议附上：**场景名 + 操作路径 + 预期/实际表现**，我会更快定位。  
也欢迎直接提 PR 一起完善。

如果这个项目对你有帮助，欢迎点个 Star，感谢支持 🙌

