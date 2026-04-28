# Cocos 论坛发帖模板（VList）

> 直接复制，把占位符替换掉就可以发。

---

## 标题（可选其一）

`[免费开源] 分享一个个人用的比较舒服的虚拟列表`

---

## 正文模板
在论坛上找了几个虚拟列表，感觉都是不太满足项目需求。
一开始自己参照fairygui写了这个项目。
后面叫Codex进行了优化和测试。
用的版本是3.8.6

 
**仓库地址：** `https://github.com/xixi-chen/virtual_list`  
**在线预览：** `https://xixi-chen.github.io/virtual_list_preview/index.html`


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

## 这次具体做了哪些优化

- 对 `assets/scripts/VList.ts` 按模块重组函数顺序，并增加清晰分隔：
- 选择/事件、虚拟核心、线性滚动、分页、生命周期、滚动 API、下拉刷新
- 合并与抽取了部分重复滚动处理路径，减少重复代码
- 清理了局部不可达代码与噪音注释，降低阅读负担
- 保持“行为不变优先”，将结构整理与行为修复分步进行

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
