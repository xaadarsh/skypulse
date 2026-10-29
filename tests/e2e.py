"""Playwright check: every page and state at 1366x768, 1920x1080 and 390x844.

Asserts zero console errors and no sideways scrolling, runs the full workflow
(new flight -> 120-min delay -> Auto-Recover -> Rs 30,000 budget -> open a seat) and saves screenshots/.

Needs the app running (start.bat).  Run:  .venv\\Scripts\\python tests\\e2e.py [base_url] [viewport names...]
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith("http")]
BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://localhost:5173")
ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
SHOTS.mkdir(exist_ok=True)
VIEWPORTS = {
    "1366": dict(viewport={"width": 1366, "height": 768}),
    "1920": dict(viewport={"width": 1920, "height": 1080}),
    "mobile": dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2),
}
if args:
    VIEWPORTS = {k: v for k, v in VIEWPORTS.items() if k in args}

errors, problems = [], []


def watch(page, tag):
    page.on("console", lambda m: m.type == "error" and errors.append(f"[{tag}] {m.text}"))
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))


def settle(page, ms=1800):
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(ms)


def scroll_through(page):
    """Scroll to the bottom so scroll-reveal animations run, then back to the top."""
    h = page.evaluate("document.body.scrollHeight")
    for y in range(0, h, 400):
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(90)
    page.wait_for_timeout(1200)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(700)


def overflow(page, tag):
    w = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    if w > 1:
        problems.append(f"{tag}: horizontal overflow {w}px")


def shot(page, vp, name, full=False):
    page.screenshot(path=SHOTS / f"{vp}_{name}.png", full_page=full)


def home(page, vp):
    page.goto(BASE + "/")
    settle(page, 2500)
    shot(page, vp, "home_1_hero")
    story = page.evaluate("document.querySelector('[aria-label=\"SkyPulse story\"]').offsetHeight - innerHeight")
    for frac, name in ((0.24, "home_2_flight"), (0.42, "home_3_into_cabin"), (0.68, "home_4_risk"), (0.95, "home_5_recovered")):
        page.evaluate(f"window.scrollTo(0, {int(story * frac)})")
        page.wait_for_timeout(1500)
        shot(page, vp, name)
    page.evaluate(f"window.scrollTo(0, {story + 200})")
    page.wait_for_timeout(1500)
    shot(page, vp, "home_6_problem")
    scroll_through(page)
    overflow(page, f"{vp} home")


def monitor(page, vp):
    page.goto(BASE + "/monitor")
    settle(page)
    shot(page, vp, "monitor_1_create")
    page.get_by_role("button", name="Create flight").click()
    page.get_by_text("Passengers from real dataset").first.wait_for(timeout=20000)
    settle(page, 2500)
    shot(page, vp, "monitor_2_flight")
    overflow(page, f"{vp} monitor flight")
    first = page.evaluate("fetch('/api/flights').then(r=>r.json()).then(f=>f[0])")
    page.locator("#delay").fill("120")
    page.get_by_role("button", name="Apply 120-minute delay").click()
    page.get_by_text("Delay · 120 min").first.wait_for(timeout=20000)
    page.wait_for_timeout(2500)
    page.evaluate("document.querySelector('[data-testid=cabin]').scrollIntoView({block: 'start'})")
    page.wait_for_timeout(600)
    shot(page, vp, "monitor_3_after_delay")
    after = page.evaluate("fetch('/api/flights').then(r=>r.json()).then(f=>f[0])")
    assert after["at_risk"] >= first["at_risk"], (first["at_risk"], after["at_risk"])
    page.get_by_role("tab", name="Recovery").click()
    page.get_by_role("button", name="Auto-Recover all at-risk passengers").click()
    page.get_by_text("Crew alerts").wait_for(timeout=30000)
    page.wait_for_timeout(2000)
    page.get_by_text("Crew alerts").scroll_into_view_if_needed()
    page.wait_for_timeout(500)
    shot(page, vp, "monitor_4_auto_recover")
    page.evaluate("document.querySelector('[data-testid=cabin]').scrollIntoView({block: 'start'})")
    page.wait_for_timeout(1500)
    shot(page, vp, "monitor_5_cabin_recovered")
    page.get_by_role("tab", name="Budget").click()
    page.get_by_label("Budget in rupees").fill("30000")
    page.get_by_role("button", name="Optimize", exact=True).click()
    page.locator("[data-testid=optimizer]").wait_for(timeout=30000)
    page.wait_for_timeout(1500)
    page.locator("[data-testid=optimizer]").scroll_into_view_if_needed()
    page.wait_for_timeout(500)
    shot(page, vp, "monitor_6_budget_plan")
    plan = page.locator("[data-testid=optimizer]").inner_text()
    # open a seat from the 2D seat map (deterministic), then the drawer
    page.get_by_role("tab", name="Seat map").click()
    page.wait_for_timeout(1200)
    page.evaluate("document.querySelector('[data-testid=cabin]').scrollIntoView({block: 'start'})")
    shot(page, vp, "monitor_7_seat_map")
    page.locator("[data-testid=cabin] button[aria-label*='risk']:visible").first.click()
    page.get_by_text("What would fix it").wait_for(timeout=20000)
    page.wait_for_timeout(1500)
    shot(page, vp, "monitor_8_seat_drawer")
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    page.get_by_role("tab", name="3D").click()
    page.wait_for_timeout(500)
    scroll_through(page)
    shot(page, vp, "monitor_9_full", full=True)
    print(vp, "workflow: at risk", first["at_risk"], "->", after["at_risk"], "| plan:", " ".join(plan.split()[:14]))


def others(page, vp):
    for path, name in (("/predictor", "predictor"), ("/insights?tab=strategy", "insights_strategy"),
                       ("/insights?tab=segments", "insights_segments"), ("/insights?tab=lab", "insights_lab"),
                       ("/bulk", "bulk_empty"), ("/about", "about")):
        page.goto(BASE + path)
        settle(page, 2200)
        shot(page, vp, name)
        scroll_through(page)
        shot(page, vp, name + "_full", full=True)
        overflow(page, f"{vp} {path}")
    page.goto(BASE + "/predictor")
    settle(page, 1500)
    page.get_by_role("button", name="Fix it — smallest changes to satisfy").click()
    page.get_by_role("button", name="Apply these changes").wait_for(timeout=20000)
    page.get_by_role("button", name="Apply these changes").scroll_into_view_if_needed()
    page.wait_for_timeout(1000)
    shot(page, vp, "predictor_fix")
    page.goto(BASE + "/bulk")
    settle(page, 800)
    page.locator("[data-testid=bulk-input]").set_input_files(str(ROOT / "sample_passengers.csv"))
    page.get_by_role("button", name="Download results CSV").wait_for(timeout=20000)
    page.wait_for_timeout(1500)
    shot(page, vp, "bulk_results")
    scroll_through(page)
    shot(page, vp, "bulk_results_full", full=True)


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    for vp, opts in VIEWPORTS.items():
        ctx = browser.new_context(**opts)
        page = ctx.new_page()
        watch(page, vp)
        home(page, vp)
        monitor(page, vp)
        others(page, vp)
        if vp == "1366":  # manifest upload through the UI
            page.goto(BASE + "/monitor")
            settle(page, 800)
            page.get_by_role("radio", name="Upload CSV").click()
            page.locator("input[type=file]").set_input_files(str(ROOT / "sample_passengers.csv"))
            page.get_by_role("button", name="Create flight").click()
            page.get_by_text("Uploaded passenger manifest").first.wait_for(timeout=20000)
        print(vp, "ok")
        ctx.close()
    browser.close()

print(f"console errors: {len(errors)}")
for e in errors[:20]:
    print("  ", e[:300])
for pr in problems:
    print("  PROBLEM", pr)
sys.exit(1 if errors or problems else 0)
