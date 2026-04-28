# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Rewritten release-ready `README.md` in English.
- New regression document: `docs/TEST_MATRIX.md`.
- Scroll-end settle guard in `VList` (`onAnyScrollEnded`) for virtual-mode stability.
- Defensive virtual item initializer: `ensureVirtualItemInfo(index)`.

### Changed

- Unified first-line alignment logic via `alignIndexToLineStart`.
- Refined loop-mode anti-jitter behavior:
- applies during manual drag only
- no impact on auto-scrolling inertia
- tighter threshold for better responsiveness
- Improved frame-mode render completion:
- keep filling while viewport gap exists
- finish only when render window is reached and viewport is covered

### Fixed

- Fixed horizontal virtual lists jumping back to the start after repeated fast tail drags.
- Fixed possible out-of-range access in `cleanupUnusedVirtualChildren(...)`.
- Fixed frame-mode edge-case crash:
- `Cannot read properties of undefined (reading 'obj')`
- caused by sparse/missing `virtualItems[curIndex]` during rapid direction switches
- Fixed intermittent bottom blank persistence after fast drag/release in frame-mode demos.

### Verified

- Regression rerun completed on **2026-04-28** against `docs/TEST_MATRIX.md`.
- All 9 demo scenes were loaded and exercised via browser preview (`http://localhost:7456/`):
- `virtual_single`, `virtual_cols_rows`, `virtual_page`, `virtual_loop`, `virtual_frame_by_frame`, `nested`, `chat`, `pull_refresh`, `align`
- No new runtime `error`-level console failures observed during this pass.
- Existing browser-level `issue` hints (Quirks Mode / form field id-name) are unchanged and non-blocking for VList behavior.

## [0.1.0]

### Added

- Initial VList implementation and demos:
- virtual list
- loop list
- frame-by-frame creation
- nested list
- pull refresh
- pagination mode
