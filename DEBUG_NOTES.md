# VList Debug Notes

## Context

We are debugging `assets/scripts/VList.ts`, mainly the virtual frame-by-frame scene:

- Scene: `assets/resources/prefabs/virtual_frame_by_frame/virtual_frame_by_frame.scene`
- Demo script: `assets/scripts/demo/virtual_loop_frame_by_frame/VirtualFrameByFrame.ts`
- Main issue: horizontal `SingleRow` and vertical virtual lists could show blank space or wrong reused items near the end when frame-by-frame rendering is interrupted or when dragging back after reaching the boundary.

The game is run in Chrome from Cocos Creator. The goal is to use `chrome-devtools-mcp` in a new Codex session to control Chrome, inspect console logs, take screenshots, and ideally reproduce drag/release behavior.

## MCP Setup

`chrome-devtools-mcp` was configured outside the repo:

- Portable Node: `C:\Users\QTZ\.codex\tools\node-v24.15.0-win-x64`
- MCP launcher: `C:\Users\QTZ\.codex\tools\chrome-devtools-mcp.cmd`
- Codex config: `C:\Users\QTZ\.codex\config.toml`

Expected config block:

```toml
[mcp_servers.chrome-devtools]
command = 'cmd.exe'
args = ['/c', 'C:\Users\QTZ\.codex\tools\chrome-devtools-mcp.cmd']
```

Current session cannot see the new MCP because MCP servers are loaded when a Codex session starts. Start a new Codex session and first check whether `chrome-devtools` tools are available.

Note: `codex mcp list` reported `拒绝访问` in this Windows environment even after removing the MCP block, so do not rely on that command alone. The launcher script itself was smoke-tested and can start `chrome-devtools-mcp` using Node 24.

## VList Changes Already Made

In `assets/scripts/VList.ts`:

- Added layout helpers such as `isVerticalVirtualLayout`, `isHorizontalVirtualLayout`, `getVirtualLayoutMode`, and main-axis helpers.
- Unified scroll dispatch through `handleScrollImmediate` and `handleScrollFrame`.
- Added frame-fill lifecycle helpers:
  - `beginFrameFill`
  - `stopFrameLoop`
  - `restartImmediateScrollAfterFrameStop`
  - `ensureFrameLoopScheduled`
  - `applyPendingFrameContentDelta`
  - `syncPendingFrameOriginSize`
  - `abortCurrentFrameFill`
- Added safe virtual offset helpers:
  - `getEffectiveMaxScrollOffset`
  - `clampVirtualScrollPos`
  - `correctFirstIndexByPos`
- Added safe cleanup helper:
  - `cleanupVirtualItemsWindow`
- `handleScroll1/2` and `handleScroll1/2InitFillStep` now use a clamped logical position for virtual index calculations, but no longer force the visual content position during normal elastic dragging.
- Added stronger `VLIST_TRACE` fields:
  - `rawMainAxisPos`
  - `safeMainAxisPos`
  - `logicalMaxMainAxisPos`
- Added debug methods:
  - `debugForceVirtualMainAxisPos`
  - `debugOverscrollMainAxis`

In `assets/scripts/demo/virtual_loop_frame_by_frame/VirtualFrameByFrame.ts`:

- Added a dev-only stress-test scaffold controlled by `_autoDevStressTest = false`.
- If temporarily set to `true`, it schedules bottom scroll and overscroll actions on `hList`.

## Current Behavior / Open Question

After preserving elastic visual position again, the user saw blank space while dragging beyond the right boundary. The latest logs showed content overscrolling far beyond the logical end and then bouncing back:

- Example overscroll: `posX` went to around `-5579`
- Final bounce-back stabilized around `posX: -5205`
- `firstIndex` stayed around `44` near the end

This may be normal elastic blank area while the content is visually overscrolled, not necessarily the old render-window bug. The new trace fields should distinguish it:

- If `rawMainAxisPos > logicalMaxMainAxisPos` and `safeMainAxisPos == logicalMaxMainAxisPos`, the blank is likely normal elastic overscroll.
- If `rawMainAxisPos` is back near `logicalMaxMainAxisPos` but the blank remains, it is likely still a VList render/reuse bug.

## Suggested Next Steps In New Session

1. Check whether `chrome-devtools` MCP is available.
2. Open or connect to the Chrome instance running the Cocos preview.
3. Capture console logs containing `VLIST_TRACE`.
4. Use screenshot and coordinate-based drag tools if available to perform:
   - drag horizontal `SingleRow` list to the right boundary
   - overscroll slightly
   - release and wait for bounce-back
5. Compare screenshot timing with trace fields:
   - during drag overscroll
   - after bounce-back settles
6. If blank remains after bounce-back, inspect `handleScroll2`, `getIndexOnPos2`, and `correctFirstIndexByPos` around the final `safeMainAxisPos`.

## 2026-04-23 Follow-up

Chrome DevTools MCP is available in the new Codex session. It connected to Chrome, opened the Cocos preview at:

- `http://localhost:7456/`

The `virtual_frame_by_frame` scene was opened from the main menu and the horizontal `SingleRow` list was dragged to the right boundary through MCP coordinate events.

Observed trace/screenshot behavior:

- At the settled right boundary, `rawMainAxisPos`, `safeMainAxisPos`, and `logicalMaxMainAxisPos` all converged to `5166`.
- The rendered horizontal window showed the final items (`44` through `48`) without persistent blank space after bounce-back.
- While holding an elastic overscroll beyond the boundary, the screenshot showed blank area to the right, and logs showed `rawMainAxisPos > logicalMaxMainAxisPos` while `safeMainAxisPos == logicalMaxMainAxisPos`.
- After release, the list bounced back to `rawMainAxisPos == safeMainAxisPos == logicalMaxMainAxisPos == 5166`.

This supports the current hypothesis: blank area during the drag is normal ScrollView elastic overscroll, not the old virtual render-window bug, as long as it disappears after bounce-back.

Additional code hardening in `assets/scripts/VList.ts`:

- `handleScroll1InitFillStep` and `handleScroll2InitFillStep` now call `stopFrameLoop(...)` before returning when the frame-fill target first index is unchanged and `forceUpdate` is false. This prevents `_initFillState` from being left as an in-progress frame fill with no loop scheduled.
- `handleScroll1Loop` and `handleScroll2Loop` now call `handleArchOrder1/2` after frame-fill completion when no resize-triggered refresh happened. Previously the horizontal path only called arch ordering inside the size-delta branch, and the vertical path had it commented out.

## 2026-04-23 Continued Optimization

Additional low-risk `VList.ts` cleanup:

- `_interruptTraceLog` now defaults to `false`, is exposed as a DEV-only property, and can be toggled by `setInterruptTraceLog(true)`. This keeps normal preview runs from flooding the console with `VLIST_TRACE`, while preserving the trace tool for focused debugging.
- `stopFrameLoop(...)` now also clears `dynamicItemsPerFrame`, so a one-time catch-up frame size cannot leak into a later frame-fill pass.
- `handleScroll3InitFillStep` now mirrors the vertical/horizontal fixes: if pagination frame-fill detects the same first index and returns early, it calls `stopFrameLoop(this.handleScroll3Loop)` first.
- Non-virtual frame-fill now also uses `beginFrameFill`, `ensureFrameLoopScheduled`, and `stopFrameLoop` in `refreshListInitFillStep/refreshListLoop`, so the frame-fill lifecycle is handled consistently across non-virtual and virtual paths.
- Repeated per-frame creation limit logic has been centralized in `getMaxCreateForFrame()`, covering non-virtual, vertical virtual, horizontal virtual, and pagination virtual frame loops.
- `refreshListLoop` removes its temporary `SCROLLING` listener after non-virtual frame-fill completes, preventing stale interruption handling after the initial fill is done.
- Added `resetFrameFillState()` and call it before applying a new `numItems` value. This cancels any old scheduled frame loops and clears pending frame state before rebuilding the list, preventing stale frame-fill state from leaking when data is reset during an unfinished fill.

Preview caveat:

- After this source edit, Chrome preview still appeared to be running an older compiled bundle: `VLIST_TRACE` stack frames referenced old source line numbers. Wait for Creator to reimport/rebuild the script, then reload preview before judging the new default trace behavior.

Latest runtime test:

- After code edits, Cocos Creator was focused and sent `Shift+Ctrl+P` per user instruction before opening Chrome preview.
- Reloaded `http://localhost:7456/`; default console output no longer includes `VLIST_TRACE`.
- Opened `virtual_frame_by_frame` scene and dragged horizontal `SingleRow` to the end; final items `44-48` display correctly and console has no new errors.
- Dragged the left vertical list to the end; items `42-48` display correctly. The final gray cell is expected because 49 items fill a two-column layout unevenly.

## Verification Caveats

`npx tsc -p tsconfig.json --noEmit` currently fails due to Cocos Creator 3.8.6 generated declaration/type environment issues under the available TypeScript/Node setup. The errors are in Creator engine declaration files, not directly in the edited source files.
