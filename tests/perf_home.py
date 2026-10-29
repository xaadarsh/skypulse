"""Home scroll performance: 1366x768, CPU 4x throttle. Scrolls the page with the mouse wheel and
reports frames per second (requestAnimationFrame) per part of the page, plus long tasks.
  python tests/perf_home.py --base http://localhost:5181 [--trace out.json]
"""
import argparse
import os
import json

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:5181")
ap.add_argument("--trace", default="")
a = ap.parse_args()

PROBE = """() => { window.__f = []; const t = (n) => { window.__f.push([n, scrollY]); requestAnimationFrame(t) }; requestAnimationFrame(t);
  window.__lt = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt += e.duration)).observe({ entryTypes: ['longtask'] }) }"""

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=os.environ.get("CHROMIUM") or None, args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    p = b.new_page(viewport={"width": 1366, "height": 768})
    p.goto(a.base + "/")
    p.wait_for_load_state("networkidle")
    p.wait_for_timeout(4000)
    cdp = p.context.new_cdp_session(p)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    if a.trace:
        b.start_tracing(page=p, path=a.trace, screenshots=False)
    p.evaluate(PROBE)
    p.mouse.move(683, 400)
    story = p.evaluate("document.querySelector('[aria-label=\"SkyPulse story\"]').offsetHeight")
    total = p.evaluate("document.body.scrollHeight - innerHeight")
    for _ in range(int(total / 240) + 4):  # ~240 px per 100 ms wheel step, like a steady trackpad scroll
        p.mouse.wheel(0, 240)
        p.wait_for_timeout(100)
    p.wait_for_timeout(1500)
    if a.trace:
        b.stop_tracing()
    f, lt = p.evaluate("[window.__f, window.__lt]")
    parts = {"story (pinned 3D)": (0, story - 768), "middle + lower page": (story - 768, total + 1)}
    out = {}
    for name, (lo, hi) in parts.items():
        fr = [x for x in f if lo <= x[1] < hi]
        dt = [(b2[0] - b1[0]) for b1, b2 in zip(fr, fr[1:])]
        out[name] = {"frames": len(fr), "fps": round(1000 * len(dt) / sum(dt), 1) if dt else 0,
                     "p95_frame_ms": round(sorted(dt)[int(len(dt) * 0.95)], 1) if dt else None}
    out["long_tasks_ms"] = round(lt)
    out["final_scrollY"], out["page_bottom"] = f[-1][1] if f else None, total
    print(json.dumps(out, indent=1))
    b.close()
