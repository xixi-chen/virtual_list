# VList (Cocos Creator 3.8.6)

`VList` is a high-performance virtual list component built on top of Cocos Creator `ScrollView`.
It targets large datasets, variable item sizes, loop mode, and frame-by-frame creation scenarios.

This repository includes reusable component code and complete demo scenes for quick integration.

## Features

- Virtual list rendering (`SingleColumn`, `SingleRow`, flow layouts, pagination)
- Loop list support
- Frame-by-frame creation support
- Nested list demos
- Pull-to-refresh demos
- Variable-size item support via `setItemSizeProvider`

## Environment

- Cocos Creator: `3.8.6`

## Demo Scenes

Defined in `assets/scripts/demo/Main.ts`:

1. `virtual_single` (virtual list)
2. `virtual_cols_rows` (multi-row/multi-column)
3. `virtual_page` (pagination)
4. `virtual_loop` (loop list)
5. `virtual_frame_by_frame` (frame-by-frame creation)
6. `nested` (nested lists)
7. `chat` (chat list)
8. `pull_refresh` (pull-to-refresh)
9. `align` (alignment demo)

## Quick Start

1. Open the project with Cocos Creator `3.8.6`.
2. Add `VList` to a node with a `ScrollView` structure.
3. Set `defaultItem`.
4. Bind renderer/provider callbacks.
5. Set `numItems`.

Example:

```ts
this.vList.setItemRenderer(this, (index, item) => {
    // render item UI
});

this.vList.setItemProvider(this, (index) => {
    // optional: return item type name / prefab key
    return "default";
});

this.vList.setItemSizeProvider(this, (index) => {
    // optional: variable size
    return { width: 200, height: 100 };
});

this.vList.numItems = 1000;
```

## VList.ts Maintenance Guide

`assets/scripts/VList.ts` is intentionally kept as a single file.  
To keep it maintainable, functions are grouped by module separators (for example: virtual core, linear scroll paths, page behaviors, lifecycle hooks, public scroll APIs).

When making changes:

- Prefer editing inside the existing module block instead of adding logic in random locations.
- Keep behavior changes and refactor/reorder changes in separate commits.
- For virtual scroll fixes, run regression with [`docs/TEST_MATRIX.md`](docs/TEST_MATRIX.md), especially:
  - `virtual_loop`
  - `virtual_frame_by_frame`
  - `virtual_cols_rows`
- If a bug appears only during drag/inertia, test both:
  - immediate drag interaction
  - post-release settle (`SCROLL_ENDED`) behavior

## Regression Checklist

See: [`docs/TEST_MATRIX.md`](docs/TEST_MATRIX.md)

Coverage includes:

- All 9 demo scenes
- High-risk interactions (fast drag, bottom rebound, `scrollToIndex`, add/remove data)
- Frame-by-frame interruption and viewport backfill behavior

## Recent Stability Changes

See: [`CHANGELOG.md`](CHANGELOG.md)

Highlights:

- Frame-mode viewport backfill improvements
- Safer cleanup logic for loop/non-loop modes
- Defensive virtual item initialization for fast-scroll edge cases

## Notes

- Temporary blank area during elastic overscroll can be normal `ScrollView` behavior.
- After bounce-back/scroll-end, the list should recover with no persistent blank gap.

## Contact

If this project helps you, a star is appreciated.

WeChat:

![wechat](wechat.jpg)
