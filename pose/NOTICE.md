# Pose assets

- Motion and camera helpers: copied without algorithm changes from the user-supplied `motion-lab-source-v10/src/motion.mjs` and `camera.mjs`. Left/right are the person's anatomical hands; mirroring affects only the preview. The game maps `throw-left`, `throw-right`, `raise-both`, and the continuous `run` state.
- Model: user-supplied `public/models/pose_landmarker_lite.task`, Google MediaPipe Pose Landmarker Lite.
- Runtime: `@mediapipe/tasks-vision` 0.10.32, Apache-2.0. The classic Worker, ES module bundle, and WASM were copied from the matching user-supplied `motion-lab-github-pages-v10` build. SDK copyright/license headers are preserved. https://github.com/google-ai-edge/mediapipe
- No CDN requests, server inference, image recording, or image uploads are used. All runtime URLs resolve relative to this directory for GitHub Pages project sites.

The game's input continuity adapter and calibration flow are in `../pose-input.js` and `../pose-session.js`. The source project is retained separately; it is not modified by this integration.
