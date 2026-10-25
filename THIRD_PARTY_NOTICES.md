# Third-party notices

BlinkPulse Lab's own code is MIT-licensed (`LICENSE`). The app also ships the following
third-party software and data, which keep their own licences.

| Component                       | Version | Licence    | Shipped as                                              |
| ------------------------------- | ------- | ---------- | ------------------------------------------------------- |
| `@mediapipe/tasks-vision`       | 1.1.1   | Apache-2.0 | JavaScript bundle and `public/wasm/*` (copied at build) |
| MediaPipe Face Landmarker model | -       | See below  | `public/models/face_landmarker.task`                    |
| `react`, `react-dom`            | 19.3.1  | MIT        | JavaScript bundle                                       |

Licences above are taken from each package's `package.json`.

**Face Landmarker model.** `face_landmarker.task` is published by Google for MediaPipe and bundles
three models (face detector, FaceMesh-V2, blendshapes). Its licence terms are set out in Google's
model cards for those models, linked from the
[Face Landmarker guide](https://ai.google.dev/mediapipe/solutions/vision/face_landmarker). We have
not yet confirmed the exact licence from Google's own model cards; check them before
redistributing the model separately from this project.

The Apache License 2.0 text is at https://www.apache.org/licenses/LICENSE-2.0.

Development-only tools (Vite, Vitest, ESLint, Prettier, TypeScript, and the Python
packages in `tools/requirements.txt`) are not shipped in the app.
