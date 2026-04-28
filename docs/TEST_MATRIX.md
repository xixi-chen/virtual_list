# VList Regression Test Matrix

Use this checklist before publishing to GitHub or the Cocos forum.

## Test Environment

- Cocos Creator: `3.8.6`
- Browser preview: `http://localhost:7456/`
- Target script: `assets/scripts/VList.ts`

## Pass Criteria

- No runtime errors in console
- No persistent viewport blank gap after release/bounce-back
- Correct left-column parity in two-column vertical demo (left side should remain even-indexed)
- No obvious drag jitter after inertia release

## Scene Checklist (9 Scenes)

1. `virtual_single`
- Drag to top/bottom repeatedly
- Click `scrollToTop` / `scrollToBottom`
- Test random `scrollToIndex`
- Add/remove items via UI controls

2. `virtual_cols_rows`
- Drag to bottom, then drag up quickly
- Verify two-column order remains stable
- Add items around middle index
- Remove items and verify no stale/wrong reuse

3. `virtual_page`
- Swipe pages quickly left/right
- Jump pages via buttons/indicator
- Verify page index and indicator stay synchronized

4. `virtual_loop`
- Cross loop boundaries repeatedly
- Drag to end, reverse direction, and observe inertia
- Verify no odd index appears in the left column
- Verify no blank area remains after settle

5. `virtual_frame_by_frame`
- Drag quickly during initial frame fill
- Scroll to bottom, then drag upward quickly
- Repeat top/bottom switching
- Verify: no crash, no persistent blank area, no wrong reuse

6. `nested`
- Alternate scrolling outer and inner lists
- Verify touch-focus transfer is stable
- Verify no stuck scroll state

7. `chat`
- Add/remove chat items dynamically
- Verify scroll-to-bottom behavior after new messages
- Verify keep-position behavior when adding historical messages

8. `pull_refresh`
- Pull down to trigger refresh threshold
- Release and verify state transitions back to idle/loading correctly
- Repeat multiple rounds

9. `align`
- Test all alignment modes used in demo
- Verify item positions after resize/resolution changes
- Verify `scrollToIndex` landing remains correct

## High-Risk Focus Cases

1. Bottom boundary + variable-size items
2. Frame-by-frame interrupted by fast dragging
3. Reuse-window cleanup in loop mode
4. Add/remove operations while near bottom

## Suggested Minimal Automated Checks

- Programmatic offset sweep: `0 -> max -> 0`
- Per-step assert: no exception thrown
- Per-step assert: expected left-column parity for target demo
- Per-step assert: `hasLinearViewportGap('vertical')` does not stay `true` after settle
