# Deploy Log

## 2026-07-22 — Export Fix Deploy

### Changes in this build
- `src/utils/videoExporter.ts` — FPS detection, max bitrate, frame-locked canvas, safe stop
- `src/hooks/useVideoExport.ts` — Drop-in React hook wiring all export fixes

### Fixes
1. **FPS** — `detectVideoFPS()` via `requestVideoFrameCallback`, snaps to standard rates (24/25/30/60)
2. **Quality** — `getBestRecorderOptions()` estimates source bitrate from file size, uses 4–25 Mbps + best codec
3. **Frozen export** — `startFrameLockedLoop()` locks canvas draws to real decoded frames (no phantom frames)
4. **Truncation** — `startSafeRecorder()` uses `timeslice=1000ms` + rVFC-gated `stop()` (no data loss)

### Rollback branch
`backup/v1-pre-export-fix-2026-07-22` — pinned at commit `3c51435ba`

### Integration TODO (App.tsx)
See previous assistant message for the 5-step wiring guide.
