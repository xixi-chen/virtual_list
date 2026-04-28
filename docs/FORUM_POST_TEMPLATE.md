# Cocos 论坛发帖模板（VList）

> 直接复制，按需微调后即可发布。

---

## 标题（可选其一）

1. `[免费开源] 分享一个个人用着比较舒服的虚拟列表（我写框架，AI 做优化和测试）`
2. `[免费开源] virtual_list：作者原创框架 + AI 协助优化与回归测试`
3. `[免费开源] Cocos 虚拟列表框架 virtual_list（循环/分帧/分页/可变尺寸）`

---

## 正文模板

大家好，分享一个我自己长期在项目里用的虚拟列表框架：**virtual_list**。  
这个框架是我写的，后续我让 AI 协助做了优化和系统回归测试。

如果你也遇到过这些问题：

- 数据量一大就掉帧
- 快速拖拽后出现留白/错位
- 循环列表、分帧创建、可变尺寸 item 难兼容

可以看看这个项目。

**项目名称：** `virtual_list`  
**仓库地址：** [https://github.com/xixi-chen/virtual_list](https://github.com/xixi-chen/virtual_list)  
**在线预览：** [https://xixi-chen.github.io/virtual_list_preview/index.html](https://xixi-chen.github.io/virtual_list_preview/index.html)

---

## 这个项目能做什么

- 大数据量列表虚拟化渲染（只渲染可视区域）
- 支持可变尺寸 item
- 支持循环列表（loop）
- 支持分帧创建（frame-by-frame）
- 支持单列、单行、多行多列、分页
- 覆盖聊天、下拉刷新、嵌套列表等常见业务场景

---

## 我这次做了哪些优化（AI 协助）

- 对 `assets/scripts/VList.ts` 做模块化重排，降低维护复杂度（不拆文件）
- 合并/抽取部分重复滚动处理逻辑，减少重复代码
- 补强边界场景稳定性（快速拖拽、底部附近、分帧过程中断）
- 清理局部不可达代码和噪音注释，提升可读性

---

## 我是怎么测试的

- 按 `docs/TEST_MATRIX.md` 做完整回归
- 覆盖 9 个 demo 场景：
1. `virtual_single`
2. `virtual_cols_rows`
3. `virtual_page`
4. `virtual_loop`
5. `virtual_frame_by_frame`
6. `nested`
7. `chat`
8. `pull_refresh`
9. `align`
- 重点验证：
- 底部边界 + 可变尺寸 item
- 分帧创建时快速拖拽打断
- 循环列表边界切换
- add/remove 后继续拖拽

---

## 快速使用

1. 使用 Cocos Creator `3.8.6` 打开项目
2. 在 `ScrollView` 结构节点上挂载 `VList`
3. 设置默认 item
4. 绑定渲染/类型/尺寸回调
5. 设置 `numItems`

```ts
this.vList.setItemRenderer(this, (index, item) => {
  // 渲染 item UI
});

this.vList.setItemProvider(this, (index) => {
  return "default";
});

this.vList.setItemSizeProvider(this, (index) => {
  return { width: 200, height: 100 };
});

this.vList.numItems = 1000;
```

---

## 补充说明

- 回归清单：`docs/TEST_MATRIX.md`
- 变更记录：`CHANGELOG.md`
- 详细介绍：`README.md`

---

欢迎试用、提 issue、提 PR。  
如果这个项目对你有帮助，点个 Star 支持一下，感谢！

