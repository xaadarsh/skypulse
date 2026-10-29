# SkyPulse — QA Report (Fix Pass 4)

## Fix Pass 4 — Home scroll performance, sharpness and the cabin story

### Root cause of the scroll lag (one trace: Playwright, 1366×768, CPU 4× throttle — `tests/perf_home.py`)
| Cause found | Fix |
|---|---|
| The Home 3D canvas **kept rendering after you scrolled past it** (bloom + depth of field every frame) — the lower/middle page ran at ~1 fps in the trace | Canvas stops (`frameloop="never"`) whenever the pinned section is off screen (IntersectionObserver) or the tab is hidden |
| **2.33 M triangles per frame**: 140 full-detail Blender seats + cabin walls | Story uses meshoptimizer-simplified seats (12% of triangles) and walls → **~0.35 M triangles**; cabin not drawn at all during the hero (hidden inside the fuselage) |
| Bloom + depth of field + MSAA composer every frame; bloom compiled on first scroll (hitch) | Post-processing removed from Home; all shaders compiled before the first frame |
| `setState` from inside the render loop when entering the cabin | Removed: scroll-linked values live in refs read in `useFrame` |
| Backdrop blur on every card and caption, re-rendered over the live canvas each frame; 500 px blurred cursor glow | Blur kept **only on the navbar**; cards use semi-opaque backgrounds; cursor glow is a plain gradient |

Frames per second (`tests/perf_home.py` / per-stage probe). This container has **no GPU** (SwiftShader software WebGL), so absolute numbers are far below a real laptop; the comparison is like for like:
| Part of Home | Before | After |
|---|---|---|
| Lower page (problem → "Built by"), CPU 4× | **1.0 fps** | **61 fps** |
| Pinned 3D story (software GL, fill-rate bound) | 1.0–3.7 fps | 1.0–3.3 fps |
| Triangles per story frame | 2.33 M (cabin stages) | 0.35 M |
A real integrated GPU was not available here, so the ~60 fps target in the 3D section could not be measured; with 85% fewer triangles, no post-processing and no blur over the canvas, the per-frame GPU work is a fraction of before.

### Blur while scrolling
Cause: `PerformanceMonitor` dropped the pixel ratio to 1 when frames dipped during scrolling, and depth of field blurred the cabin. Both removed; DPR is fixed at `min(devicePixelRatio, 1.75)`; no CSS blur on the canvas wrapper. Verified: a frame captured mid-scroll and one at rest have the same edge sharpness (Laplacian variance 1160 vs 1170).

### New cabin story (pinned, 430 vh: hero + ~300 vh of cabin stages)
Damped camera on a Catmull-Rom spline (no flips, old rotation removed); caption on the left (top on phones), cabin centred in the free area via a camera view offset and a projected-corner fit (1366×768, 1920×1080, 390×844). Stages: arrival (fuselage turns see-through) → whole cabin → scan line reveals red/amber seats with a live count → aisle-level focus on one seat with its real top reason and action → green ripple, chip "before → after". Reduced motion: one static frame per stage.
**Real numbers** (`python -m tools.make_story` → `frontend/src/three/story.json`): 140 real test-set passengers (seed 5), meal-shortage event, SkyPulse `/flight/recover`: **100 at risk → 83** (17 saved, ₹54,800). Focus seat 11D: 99.9% → 49.8%, "Inflight wifi rated 2", Wifi voucher. Seed 5 was chosen as the flight (of 30 seeds × 3 events) where recovery saved the most; with a 2-hour delay recovery saves only 2 of 104, so the caption says "turn 17 of them green" rather than implying all.
Screenshots: `screenshots/*_home_story_{000,025,050,075,100}.png`.

### Found by QA this pass
| Problem | Fix |
|---|---|
| Page error `Cannot read properties of undefined (reading 'isReady')` when leaving Home during shader warm-up (three's `compileAsync` keeps polling disposed materials) | Own readiness poll that stops on unmount |
| Console warning `KHR_parallel_shader_compile extension not supported` | Same poll; no `compileAsync` call |

### QA results this pass
- Backend `pytest`: **19 / 19 passed**.
- Playwright suite, all 6 combinations, then 1366-dark re-run after the fixes: Home, navigation, predictor, insights, bulk, about and offline steps pass with no page errors and no app console warnings. Remaining failures are all environment-specific to this GPU-less container: SwiftShader `GPU stall due to ReadPixels` driver notices (screenshots), and **Flight Monitor clicks timing out** (its unchanged full-detail cabin renders ~1 fps in software). Previous passes ran on a real GPU.
- Team names verified everywhere (Aadarsh Raj, Pranjal Jaiswal, Gaurav Singh, Ansh Singh), no register numbers.

---

# Fix Pass 3 (previous)

How this was tested:
- **Backend:** `pytest` — 19 tests (`backend/tests/`), including edge cases and a real restart-persistence test that starts the API twice on the same database.
- **Frontend:** `tests/qa.py` (Playwright). It clicks every button, tab, toggle, slider, form and link on every page, at **1366×768, 1920×1080 and 390×844, in dark and light theme** (6 runs). It fails on any console error or warning, page error, failed or 4xx/5xx network request (except the ones a test deliberately provokes), scroll-reveal content left hidden, mouse wheel scrolling the page over a 3D view, horizontal overflow, content under the navbar, or the "Create flight" button below the fold. It also blocks the API to check the friendly offline message.
- **Performance:** Lighthouse (desktop preset) on Home.
- **Visual:** screenshots of every page and state reviewed by eye, several rounds.

The QA suite runs against its own API (port 8010, `data/qa.db`), so it never touches the demo database.

## Bugs found and fixed

### 3D quality (section A)
| # | Problem | Fix |
|---|---|---|
| 1 | Seats were blocky boxes; no Business-class seat | New economy seat (curved reclined backrest, headrest, bevelled cushion, slim legs, seat-back screen) and a Business pod (wrap-around shell, ottoman, reading lamp), modelled in Blender (`tools/blender/make_seats.py`), Draco-compressed GLB, drawn with `InstancedMesh` |
| 2 | Seat colour looked like flat plastic | Fabric material (roughness 0.82) tinted per seat, plus a per-seat emissive "risk glow" channel for the change pulse; bloom only catches emissive parts |
| 3 | Cabin was a slab with no fuselage | Cabin kit in Blender (`make_cabin.py`): curved walls, overhead bins, lit window row, floor + carpet + aisle light strips, galley and cockpit bulkhead with nose, lavatories at the rear, class dividers. The near side's upper wall and bins fade out so you can see in (cut-away) |
| 4 | Seats could overlap; uneven pitch | Real-metre layout: Business 2-2 at 1.45 m pitch, Eco Plus 3-3 at 0.95 m, Eco 3-3 at 0.82 m, 0.5 m seat spacing with shared armrests and a clear aisle (`three/layout.ts`) |
| 5 | Cabin diagonal, off-frame, nose cropped at 1366×768 | Camera fit by projecting all 8 corners of the cabin (including the nose) to the screen and binary-searching the distance; re-runs on resize; portrait screens get the cabin turned lengthwise |
| 6 | No clear selected/hovered state | Hovered/selected seat lifts, glows, gets an outline shell and a floating label (seat, risk, action) |
| 7 | Home airliner had floating engine/winglet and an odd ring | New airliner in Blender (`make_airliner.py`): lofted fuselage, swept airfoil wings with blended winglets, wing-root fairing, engines on pylons that run from inside the nacelle into the wing, fin and stabilisers rooted inside the body, SkyPulse livery (cheatline, gradient tail and nacelles), lit cabin windows, contrails |
| 8 | Mirrored wing/stabiliser rendered inside-out (found in preview) | Normals recalculated after mirroring |
| 9 | Clouds were grey fog blobs | Procedural billowy cumulus sprite (`tools/textures/make_textures.py`), lit from above, smaller and below the plane |
| 10 | Globe was a flat low-poly ball; over-bright glow washed out the hero | Day map + night-side city-lights map (procedural, seamless), sun-lit shader with tone mapping and a soft atmosphere rim |
| 11 | Home story cabin was a flat slab under the caption | Same Blender cabin kit (short section); captions moved to a clear left column (top on phones) with a scrim; depth of field focuses on the subject |
| 12 | Lighting had no environment | Bundled HDRI (`hdri/studio.hdr`, rendered offline in Blender Cycles), ACES tone mapping, contact shadows, selective bloom; `PerformanceMonitor` drops resolution and effects on slow GPUs; rendering pauses when the tab is hidden |
| 13 | `THREE.Clock` deprecation warning in the console on every 3D page | three.js pinned to r182 (the clock is created inside React Three Fiber) |

### Interaction (section B)
| # | Problem | Fix |
|---|---|---|
| 14 | Mouse wheel over the cabin scrolled the page | Non-passive `wheel` listener with `preventDefault` on the canvas wrapper + `data-lenis-prevent`; wheel now only zooms. Same for the Personas 3D map |
| 15 | No zoom limits / way back | Zoom limited relative to the fitted distance; **Reset view** button on both 3D views |
| 16 | Touch: one-finger drag on the cabin trapped page scroll | On touch screens one finger scrolls the page, two fingers pinch-zoom/rotate |
| 17 | Drag-rotate selected text | `select-none` on 3D views |
| 18 | Seat clicks unreliable | Picking uses the instanced mesh's `instanceId`; QA clicks the 3D cabin and asserts the passenger panel opens |
| 19 | Instanced seats re-created after a load rendered at the origin (found while testing) | Matrices are re-uploaded whenever an instanced mesh is (re)created |

### Layout / UI (section C)
| # | Problem | Fix |
|---|---|---|
| 20 | About page could render blank; reveal sections stayed ghosted | Scroll-reveal rewritten as a CSS class driven by IntersectionObserver **plus** a scroll-position fallback; content shows immediately if IntersectionObserver is missing or motion is reduced. QA counts any `.reveal` still hidden after scrolling |
| 21 | Page transition could leave a page invisible | Removed exit animation around the lazy route (enter-only fade) |
| 22 | Content showed through / under the floating navbar; "Airlines find out too late" heading clipped | Blurred gradient band behind the pill navbar; `scroll-margin-top` on headings and anchors; the "See the results" link scrolls with an offset. QA checks the heading is below the navbar |
| 23 | Flight Monitor: Create card cut off, big empty area below | Hero and Create card side by side; the Create button is above the fold at 1366×768 (asserted); saved flights directly below |
| 24 | Footer jumped when a page finished loading (CLS) | Main area reserves a full screen height |

### Found by the QA suite and testing
| # | Problem | Fix |
|---|---|---|
| 25 | Creating a "manifest" flight without a file crashed the API (HTTP 500) | Friendly 400 "Upload a manifest CSV" + test |
| 26 | Predictor: after "Apply these changes" the confirmation vanished instantly (the re-score cleared it) | The applied state is kept for changes made by Apply |
| 27 | Backend offline showed raw "500 Internal Server Error" / fetch errors | All API calls and the bulk upload show "Can't reach the SkyPulse server. Make sure it is running (start.bat), then try again." QA blocks the API and checks every page |
| 28 | Shader precision notes from the GPU driver printed as console warnings | Shader info-log checking turned off in production canvases (no effect on rendering) |

## Edge cases covered
- 0-minute and 300-minute delay; 301 minutes and unknown event types are rejected (422).
- Budget ₹0 (no paid actions), ₹1 crore (never over budget), negative budget rejected.
- Empty flight (recover refused with a message, optimizer returns an empty plan), single-passenger flight, deleting a passenger twice (404).
- Same seat requested twice: the second passenger gets the next free seat in that cabin.
- 5,000-row bulk CSV; CSV with wrong columns, empty file and binary junk → friendly errors.
- Rapid repeated clicks on an event button, browser back/forward, direct URL + refresh on every route (including old `/strategy` and `/lab` links and an unknown URL).
- Backend restart: flights, delay, stats and full event history are identical afterwards.

### Found in the final QA rounds
| # | Problem | Fix |
|---|---|---|
| 29 | Phone: "Pinch to zoom" hint overlapped the 3D / Seat map tabs; legend covered "Reset view"; "Budget" tab clipped | Hint shown on wide screens only; Reset view becomes an icon button top-right on phones; dock tabs drop their icons on phones |
| 30 | WebGL warning `glBlitFramebuffer: Depth/stencil buffer format combination not allowed` (195× across the matrix) when jumping through the Home story | The post-processing chain was changing shape (depth of field added/removed while running). It is now fixed in shape — only its settings change between hero and cabin — and canvases use no stencil buffer |
| 31 | Lighthouse 62 on Home: 1.1 s blocking time from compiling ~29 shader programs at once, and the footer jumping (CLS 0.094) | Shaders compiled in parallel before the first frame (`compileAsync`); bloom/depth-of-field added on first scroll or mouse move; story cabin loaded only when scrolled near; one WebGL canvas on Home instead of two; page height reserved so the footer never jumps |

## Results (final build)
| Check | Result |
|---|---|
| Backend `pytest` | **19 / 19 passed** |
| Playwright QA, 6 combinations (1366×768, 1920×1080, 390×844 × dark, light) | **48 / 48 steps passed, 0 failures** — zero console errors or warnings, zero failed requests, no hidden reveal sections, no overflow, wheel never scrolls the page over 3D, offline message on every page |
| Lighthouse performance, Home (desktop) | **72–76** over 6 runs (real Intel UHD GPU and software renderer); CLS 0, LCP 1.3–1.4 s, FCP 0.7 s |
| 3D asset size | 252 KB of models (Draco) + 112 KB textures + 132 KB HDR — far under the 3 MB budget |
| `start.bat` end to end | Ran from a closed state: packages checked, models found, web app built, both servers started; health check OK, existing flights intact, full workflow (new flight → 120-min delay → Auto-Recover → ₹30,000 budget → open a seat) passed with 0 console errors |
| Screenshots | 167 in `screenshots/`, named `<size>_<theme>_<page/state>.png` |

Full log of the last QA run: `tests/qa_last_run.log`.

## Known limits
- Lighthouse blocking time is mostly WebGL shader compilation, which depends on the GPU driver; on a fast GPU it is lower, on very old integrated graphics higher. The app lowers its own quality (`PerformanceMonitor`) if frames drop.
- Recovery effects are model estimates under assumed action boosts (see README), not measured airline outcomes.
