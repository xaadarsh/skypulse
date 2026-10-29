"""SkyPulse full QA: clicks every control on every page, at 1366x768, 1920x1080 and 390x844, dark + light.

Fails on: console errors or warnings, page errors, failed network requests (other than the ones a test
deliberately provokes), content left hidden by scroll-reveal, page scroll while zooming a 3D view,
horizontal overflow, or any broken step.  Saves screenshots to screenshots/.

Run against a QA backend (separate database) and a frontend that proxies to it:
  .venv\\Scripts\\python tests\\qa.py --base http://localhost:5181 [--combos 1366-dark,mobile-light] [--quick]
"""
import argparse
import re
import sys
import time
import traceback
from contextlib import contextmanager
from pathlib import Path

import pandas as pd
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
FIX = ROOT / "tests" / "fixtures"
VIEWPORTS = {
    "1366": dict(viewport={"width": 1366, "height": 768}),
    "1920": dict(viewport={"width": 1920, "height": 1080}),
    "mobile": dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2),
}
OFFLINE = "Can’t reach the SkyPulse server"

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:5181")
ap.add_argument("--combos", default="1366-dark,1366-light,1920-dark,1920-light,mobile-dark,mobile-light")
ap.add_argument("--quick", action="store_true", help="skip the slowest checks")
ARGS = ap.parse_args()
BASE = ARGS.base

failures, notes = [], []


def fixtures():
    FIX.mkdir(parents=True, exist_ok=True)
    test = pd.read_csv(ROOT / "data" / "test.csv").drop(columns=["Unnamed: 0", "satisfaction"])
    test.head(5000).to_csv(FIX / "passengers_5000.csv", index=False)
    pd.DataFrame({"name": ["a", "b"], "colour": ["red", "blue"]}).to_csv(FIX / "bad_columns.csv", index=False)
    return {"sample": ROOT / "sample_passengers.csv", "big": FIX / "passengers_5000.csv", "bad": FIX / "bad_columns.csv"}


class Session:
    def __init__(self, browser, vp, theme):
        self.vp, self.theme, self.tag = vp, theme, f"{vp}-{theme}"
        self.ctx = browser.new_context(**VIEWPORTS[vp], accept_downloads=True)
        self.ctx.add_init_script(f"try{{localStorage.setItem('theme','{theme}')}}catch(e){{}}")
        self.page = self.ctx.new_page()
        self.expect_http = 0
        p = self.page
        p.on("console", lambda m: m.type in ("error", "warning") and self.problem(f"console {m.type}: {m.text[:240]}"))
        p.on("pageerror", lambda e: self.problem(f"page error: {e}"))
        p.on("requestfailed", lambda r: not self.expect_http and "/api/" in r.url and self.problem(f"request failed: {r.url} {r.failure}"))
        p.on("response", lambda r: not self.expect_http and "/api/" in r.url and r.status >= 400 and self.problem(f"HTTP {r.status} {r.url}"))
        p.on("dialog", lambda d: d.accept())
        self.mobile = vp == "mobile"

    def problem(self, msg):
        if self.expect_http and ("Failed to load resource" in msg or "status of 4" in msg):
            return  # a test is deliberately sending bad input
        failures.append(f"[{self.tag}] ({getattr(self, 'current', '?')}) {msg}")

    @contextmanager
    def bad_requests(self):
        self.expect_http += 1
        try:
            yield
        finally:
            self.page.wait_for_timeout(300)
            self.expect_http -= 1

    def go(self, path, wait=1500):
        self.page.goto(BASE + path)
        self.page.wait_for_load_state("networkidle")
        self.page.wait_for_timeout(wait)

    def shot(self, name, full=False):
        self.page.screenshot(path=SHOTS / f"{self.vp}_{self.theme}_{name}.png", full_page=full)

    def scroll_through(self):
        p = self.page
        h = p.evaluate("document.body.scrollHeight")
        for y in range(0, h + 400, 350):
            p.evaluate(f"window.scrollTo(0, {y})")
            p.wait_for_timeout(70)
        p.wait_for_timeout(1000)
        hidden = p.evaluate("document.querySelectorAll('.reveal:not(.in)').length")
        if hidden:
            self.problem(f"{hidden} scroll-reveal blocks still hidden on {p.url}")
        w = p.evaluate("document.documentElement.scrollWidth - innerWidth")
        if w > 1:
            self.problem(f"horizontal overflow {w}px on {p.url}")
        p.evaluate("window.scrollTo(0, 0)")
        p.wait_for_timeout(400)

    def not_under_nav(self, locator, what):
        nav = self.page.locator("nav[aria-label=Main]").bounding_box()
        box = locator.bounding_box()
        if nav and box and box["y"] < nav["y"] + nav["height"] - 2:
            self.problem(f"{what} is hidden under the navbar (top {box['y']:.0f} < nav bottom {nav['y'] + nav['height']:.0f})")

    def wheel_does_not_scroll(self, locator, what):
        p = self.page
        locator.scroll_into_view_if_needed()
        p.wait_for_timeout(300)
        box = locator.bounding_box()
        before = p.evaluate("scrollY")
        p.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        for _ in range(4):
            p.mouse.wheel(0, 300)
            p.wait_for_timeout(80)
        p.wait_for_timeout(600)
        after = p.evaluate("scrollY")
        if abs(after - before) > 2:
            self.problem(f"mouse wheel over {what} scrolled the page ({before} -> {after})")

    def step(self, name, fn):
        self.current = name
        t = time.time()
        try:
            fn()
            notes.append(f"[{self.tag}] ok   {name} ({time.time() - t:.1f}s)")
        except Exception as e:
            failures.append(f"[{self.tag}] FAIL {name}: {type(e).__name__}: {str(e).splitlines()[0][:300]}")
            traceback.print_exc(limit=1)
            try:
                self.shot(f"FAIL_{re.sub('[^a-z0-9]+', '_', name.lower())}")
            except Exception:
                pass


def nav_click(s, label):
    p = s.page
    if s.mobile:
        p.get_by_role("button", name="Open menu").click()
        p.get_by_role("navigation", name="Main").locator("..").get_by_role("link", name=label, exact=True).last.click()
    else:
        p.get_by_role("navigation", name="Main").get_by_role("link", name=label, exact=True).click()
    p.wait_for_load_state("networkidle")
    p.wait_for_timeout(800)


def home(s):
    s.go("/", 3000)
    s.shot("home_1_hero")
    p = s.page
    story = p.evaluate("document.querySelector('[aria-label=\"SkyPulse story\"]').offsetHeight - innerHeight")
    for f, n in ((0.25, "home_2_flight"), (0.68, "home_3_risk"), (0.95, "home_4_recovered")):
        p.evaluate(f"window.scrollTo(0, {int(story * f)})")
        p.wait_for_timeout(2200)
        if s.theme == "dark" or n == "home_3_risk":
            s.shot(n)
    p.evaluate("window.scrollTo(0, 0)")
    p.wait_for_timeout(500)
    p.get_by_role("link", name="See the results").click()
    p.wait_for_timeout(2200)
    s.not_under_nav(p.get_by_role("heading", name="Airlines find out too late."), "the 'Airlines find out too late' heading")
    s.shot("home_5_problem")
    s.scroll_through()
    # feature cards -> each page and back
    for label in ("Flight Monitor", "Predictor", "Insights", "Bulk Analysis"):
        p.locator("a", has=p.get_by_role("heading", name=label, exact=True)).click()
        p.wait_for_load_state("networkidle")
        p.wait_for_timeout(700)
        p.go_back()
        p.wait_for_timeout(700)
    expect(p.get_by_role("heading", name=re.compile("Know who"))).to_be_visible()


def navigation(s):
    p = s.page
    s.go("/")
    for label, url in (("Flight Monitor", "/monitor"), ("Predictor", "/predictor"), ("Insights", "/insights"), ("Bulk", "/bulk"), ("About", "/about"), ("Home", "/")):
        nav_click(s, label)
        assert p.url.split("?")[0].endswith(url), f"{label} went to {p.url}"
    p.go_back(); p.wait_for_timeout(600); assert "/about" in p.url
    p.go_back(); p.wait_for_timeout(600); assert "/bulk" in p.url
    p.go_forward(); p.wait_for_timeout(600); assert "/about" in p.url
    # direct URL + refresh on every route
    for path, text in (("/", "Know who"), ("/monitor", "Watch a flight"), ("/predictor", "leave happy"), ("/insights?tab=strategy", "fixed"),
                       ("/insights?tab=segments", "kinds of"), ("/insights?tab=lab", "How good"), ("/bulk", "passenger list"),
                       ("/about", "AI Passenger Care"), ("/strategy", "fixed"), ("/lab", "How good"), ("/nope", "Page not found")):
        s.go(path, 900)
        p.reload(); p.wait_for_load_state("networkidle"); p.wait_for_timeout(900)
        expect(p.get_by_text(re.compile(text)).first).to_be_visible(timeout=10000)
    # theme toggle round trip
    s.go("/about", 800)
    other = "light" if s.theme == "dark" else "dark"
    p.get_by_role("button", name=f"Switch to {other} theme").click()
    p.wait_for_timeout(500)
    p.get_by_role("button", name=f"Switch to {s.theme} theme").click()
    p.wait_for_timeout(300)


def monitor(s, files):
    p = s.page
    s.go("/monitor", 1500)
    s.shot("monitor_1_create")
    btn = p.get_by_role("button", name="Create flight")
    expect(btn).to_be_visible()
    s.not_under_nav(p.get_by_role("heading", name="Create a flight"), "Create-a-flight card")
    if not s.mobile:  # the create button must be on screen without scrolling at 1366x768 and up
        box = btn.bounding_box()
        assert box["y"] + box["height"] <= s.page.viewport_size["height"], f"Create flight button below the fold ({box['y']:.0f})"
    p.locator("#count").fill("60")
    btn.click()
    p.get_by_text("Passengers from real dataset").first.wait_for(timeout=40000)
    p.wait_for_timeout(5000)
    cabin = p.locator("[data-testid=cabin-canvas]")
    p.evaluate("document.querySelector('[data-testid=cabin]').scrollIntoView({block:'start'})")
    p.wait_for_timeout(800)
    s.shot("monitor_2_flight")
    s.wheel_does_not_scroll(cabin, "the 3D cabin")
    p.get_by_role("button", name="Reset camera view").click()
    p.wait_for_timeout(500)
    # 3D picking: click around the cabin until a seat drawer opens
    if not s.mobile:
        box = cabin.bounding_box()
        opened = False
        for fx in (0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7):
            for fy in (0.5, 0.45, 0.55, 0.4, 0.6):
                p.mouse.click(box["x"] + box["width"] * fx, box["y"] + box["height"] * fy)
                p.wait_for_timeout(120)
                if p.get_by_text("What would fix it").count():
                    opened = True
                    break
            if opened:
                break
        assert opened, "clicking seats in the 3D cabin never opened the passenger panel"
        p.wait_for_timeout(1500)
        s.shot("monitor_3_seat_drawer_3d")
        p.keyboard.press("Escape")
        p.wait_for_timeout(500)
    # events: 0-minute, max, every type, rapid repeated clicks
    p.get_by_role("tab", name="Events").click()
    p.locator("#delay").fill("0")
    p.get_by_role("button", name="Apply 0-minute delay").click()
    p.get_by_text("Delay · 0 min").first.wait_for(timeout=20000)
    p.locator("#delay").fill("300")
    p.get_by_role("button", name="Apply 300-minute delay").click()
    p.get_by_text("Delay · 300 min").first.wait_for(timeout=20000)
    p.locator("#delay").fill("120")
    p.get_by_role("button", name="Apply 120-minute delay").click()
    p.get_by_text("Delay · 120 min").first.wait_for(timeout=20000)
    for name in ("Wifi outage", "Meal shortage", "Turbulence"):
        p.get_by_role("button", name=re.compile(name)).click()
        p.wait_for_timeout(1200)
    w = p.get_by_role("button", name=re.compile("Wifi outage"))
    for _ in range(5):
        try:
            w.click(timeout=600, force=True)
        except Exception:
            pass
    p.wait_for_timeout(2500)
    p.evaluate("document.querySelector('[data-testid=cabin]').scrollIntoView({block:'start'})")
    p.wait_for_timeout(1500)
    s.shot("monitor_4_after_events")
    # recovery
    p.get_by_role("tab", name="Recovery").click()
    p.get_by_role("button", name="Auto-Recover all at-risk passengers").click()
    p.get_by_text("Crew alerts").wait_for(timeout=30000)
    p.wait_for_timeout(1500)
    p.locator("summary:visible", has_text="Read").first.click()
    p.get_by_text("Crew alerts").scroll_into_view_if_needed()
    s.shot("monitor_5_recovery")
    # budget: Rs 0, huge, chips, sort, apply
    p.get_by_role("tab", name="Budget").click()
    p.get_by_label("Budget in rupees").fill("0")
    p.get_by_role("button", name="Optimize", exact=True).click()
    p.locator("[data-testid=optimizer]").wait_for(timeout=30000)
    p.get_by_label("Budget in rupees").fill("10000000")
    p.get_by_role("button", name="Optimize", exact=True).click()
    p.wait_for_timeout(2500)
    for chip in ("₹10,000", "₹60,000", "₹30,000"):
        p.get_by_role("button", name=chip, exact=True).click()
    p.get_by_role("button", name="Optimize", exact=True).click()
    p.wait_for_timeout(2500)
    spent = p.locator("[data-testid=optimizer]").inner_text()
    assert "₹30,000" in spent
    if not s.mobile:
        for col in ("Cost", "Gain", "Seat"):
            p.locator("[data-testid=optimizer] thead").get_by_role("button", name=col).click()
            p.wait_for_timeout(150)
    p.locator("[data-testid=optimizer]").scroll_into_view_if_needed()
    s.shot("monitor_6_budget_plan")
    p.get_by_role("button", name="Apply this plan to the flight").click()
    p.wait_for_timeout(2500)
    # seat map, drawer, edit, remove
    p.get_by_role("tab", name="Seat map").click()
    p.wait_for_timeout(1000)
    p.evaluate("document.querySelector('[data-testid=cabin]').scrollIntoView({block:'start'})")
    p.wait_for_timeout(500)
    s.shot("monitor_7_seat_map")
    p.locator("[data-testid=cabin] button[aria-label*='risk']:visible").first.click()
    p.get_by_text("What would fix it").wait_for(timeout=20000)
    p.wait_for_timeout(1200)
    s.shot("monitor_8_seat_drawer")
    p.get_by_role("button", name="Edit passenger").click()
    p.get_by_label("Full name").fill("QA Edited Passenger")
    p.get_by_role("radiogroup", name="Inflight wifi").get_by_role("radio", name="5 stars").click()
    p.get_by_role("button", name="Save passenger").click()
    p.get_by_text("QA Edited Passenger").first.wait_for(timeout=15000)
    p.wait_for_timeout(800)
    p.keyboard.press("Escape")  # the seat panel re-opens after saving
    p.wait_for_timeout(600)
    p.evaluate("document.querySelector('[data-testid=cabin]').scrollIntoView({block:'start'})")
    p.wait_for_timeout(600)
    p.locator("[data-testid=cabin] button[aria-label*='QA Edited Passenger']:visible").click()
    p.get_by_role("button", name="Remove").click()
    p.wait_for_timeout(1500)
    assert p.locator("[data-testid=cabin] button[aria-label*='QA Edited Passenger']:visible").count() == 0
    # add a passenger by hand
    p.get_by_role("button", name="Add passenger").first.click()
    p.get_by_label("Full name").fill("QA New Passenger")
    p.get_by_label("Seat (optional)").fill("25F")
    p.get_by_role("button", name="Save passenger").click()
    p.wait_for_timeout(1500)
    p.get_by_role("tab", name="3D").click()
    p.wait_for_timeout(500)
    s.scroll_through()
    s.shot("monitor_9_full", full=True)
    # back to the list, re-open from the strip, delete
    p.get_by_role("button", name="Back to all flights").click()
    p.wait_for_timeout(800)
    first = p.get_by_role("button", name=re.compile("^Open flight")).first
    code = first.get_attribute("aria-label").replace("Open flight ", "")
    first.click()
    p.get_by_text("Passengers from real dataset").first.wait_for(timeout=20000)
    p.get_by_role("button", name="Back to all flights").click()
    p.wait_for_timeout(600)
    p.get_by_role("button", name=f"Delete flight {code}").click()
    p.wait_for_timeout(1200)
    assert p.get_by_role("button", name=f"Open flight {code}").count() == 0


def monitor_manual_and_manifest(s, files):
    p = s.page
    s.go("/monitor", 1000)
    p.get_by_role("radio", name="Add by hand").click()
    p.get_by_role("button", name="Create flight").click()
    p.get_by_text("Manually entered passengers").first.wait_for(timeout=20000)
    expect(p.get_by_text("The cabin is empty")).to_be_visible()
    s.shot("monitor_10_empty_flight")
    with s.bad_requests():  # recovery on an empty flight is refused (friendly error)
        p.get_by_role("tab", name="Recovery").click()
    p.get_by_role("button", name="Add the first passenger").click()
    p.get_by_label("Full name").fill("Solo Traveller")
    p.get_by_role("button", name="Save passenger").click()
    p.wait_for_timeout(2500)
    p.get_by_role("tab", name="Events").click()
    p.get_by_role("button", name=re.compile("Turbulence")).click()
    p.wait_for_timeout(1000)
    p.get_by_role("tab", name="Recovery").click()
    p.get_by_role("button", name="Auto-Recover all at-risk passengers").click()
    p.wait_for_timeout(2000)
    p.get_by_role("button", name="Back to all flights").click()
    p.wait_for_timeout(600)
    # manifest: valid, then invalid
    p.get_by_role("radio", name="Upload CSV").click()
    p.locator("input[type=file]").set_input_files(str(files["sample"]))
    p.get_by_role("button", name="Create flight").click()
    p.get_by_text("Uploaded passenger manifest").first.wait_for(timeout=20000)
    p.get_by_role("button", name="Back to all flights").click()
    p.wait_for_timeout(600)
    p.get_by_role("radio", name="Upload CSV").click()
    p.locator("input[type=file]").set_input_files(str(files["bad"]))
    with s.bad_requests():
        p.get_by_role("button", name="Create flight").click()
        expect(p.get_by_role("alert")).to_contain_text("missing", timeout=10000)
    s.shot("monitor_11_bad_manifest")


def predictor(s):
    p = s.page
    s.go("/predictor", 2000)
    s.shot("predictor_1")
    for g in ("Passenger", "Flight", "Services"):
        b = p.get_by_role("button", name=re.compile(f"^{g}"))
        b.click(); p.wait_for_timeout(300); b.click(); p.wait_for_timeout(300)
    for group, opt in (("Gender", "Female"), ("Customer type", "First-time"), ("Type of travel", "Personal"), ("Class", "Business"), ("Class", "Eco")):
        p.get_by_role("radiogroup", name=group).get_by_role("radio", name=opt, exact=True).click()
    for sid, v in (("p-age", "62"), ("p-dist", "2401"), ("p-dep", "45"), ("p-arr", "60")):
        p.locator(f"#{sid}").fill(v)
    for svc, stars in (("Inflight wifi", "1 star"), ("Online boarding", "2 stars"), ("Seat comfort", "N/A"), ("Cleanliness", "5 stars")):
        p.get_by_role("radiogroup", name=svc).get_by_role("radio", name=stars).click()
    p.wait_for_timeout(1200)
    p.get_by_role("button", name="Fix it — smallest changes to satisfy").click()
    p.wait_for_timeout(2500)
    if p.get_by_role("button", name="Apply these changes").count():
        p.get_by_role("button", name="Apply these changes").click()
        p.wait_for_timeout(1500)
        expect(p.get_by_text("Applied to the form")).to_be_visible()
    s.shot("predictor_2_fix")
    p.get_by_role("tab", name=re.compile("Booking-time")).click()
    p.get_by_text("Honest note").wait_for(timeout=10000)
    s.shot("predictor_3_booking")
    p.get_by_role("tab", name=re.compile("In-flight")).click()
    p.get_by_role("button", name="Reset").click()
    p.wait_for_timeout(800)
    s.scroll_through()


def insights(s):
    p = s.page
    s.go("/insights?tab=strategy", 2500)
    s.shot("insights_1_strategy")
    combos = [("Online boarding", "Eco", "Everyone", "+1 star"), ("Inflight wifi", "All classes", None, "+2 stars"),
              ("Seat comfort", "Business", None, "+3 stars"), ("Cleanliness", "Eco Plus", None, "+1 star")]
    personas = p.get_by_label("Passenger persona").locator("option").all_inner_texts()
    for i, (svc, cls, seg, amt) in enumerate(combos):
        p.get_by_label("Service").select_option(label=svc)
        p.get_by_label("Cabin class").select_option(label=cls)
        p.get_by_label("Passenger persona").select_option(label=seg or personas[1 + i % (len(personas) - 1)])
        p.get_by_role("radiogroup", name="Improvement").get_by_role("radio", name=amt).click()
        p.get_by_role("button", name="Run simulation").click()
        p.wait_for_timeout(1500)
        expect(p.get_by_text(re.compile(rf"{re.escape(svc)} \+\d"))).to_be_visible()
    s.scroll_through()
    p.get_by_role("tab", name="Personas").click()
    p.wait_for_timeout(2500)
    s.shot("insights_2_personas")
    scatter = p.locator("[data-testid=scatter-canvas]")
    s.wheel_does_not_scroll(scatter, "the 3D persona map")
    p.get_by_role("button", name="Reset 3D view").click()
    for card in p.locator("h4").all()[:6]:
        card.hover()
        p.wait_for_timeout(100)
    s.scroll_through()
    p.get_by_role("tab", name="Model Lab").click()
    p.wait_for_timeout(2500)
    s.shot("insights_3_lab")
    for term in ("F1", "ROC-AUC"):
        p.get_by_role("button", name=f"What is {term}?").first.hover()
        p.wait_for_timeout(250)
    s.scroll_through()
    s.shot("insights_3_lab_full", full=True)


def bulk(s, files):
    p = s.page
    s.go("/bulk", 1200)
    expect(p.get_by_text("No file yet")).to_be_visible()
    s.shot("bulk_1_empty")
    p.locator("[data-testid=bulk-input]").set_input_files(str(files["sample"]))
    p.get_by_role("button", name="Download results CSV").wait_for(timeout=30000)
    with p.expect_download() as d:
        p.get_by_role("button", name="Download results CSV").click()
    assert d.value.suggested_filename == "skypulse_predictions.csv"
    p.get_by_role("tab", name=re.compile("At risk")).click()
    p.get_by_role("tab", name=re.compile("All")).click()
    p.wait_for_timeout(800)
    s.shot("bulk_2_results")
    if not ARGS.quick:
        p.locator("[data-testid=bulk-input]").set_input_files(str(files["big"]))
        p.get_by_text(re.compile("of 5000 at risk")).wait_for(timeout=90000)
        p.get_by_role("button", name=re.compile("^Show 500 more")).click()
        p.wait_for_timeout(800)
        s.shot("bulk_3_5000_rows")
    with s.bad_requests():
        p.locator("[data-testid=bulk-input]").set_input_files(str(files["bad"]))
        expect(p.get_by_role("alert")).to_contain_text("missing", timeout=15000)
    s.shot("bulk_4_bad_csv")
    s.scroll_through()


def about(s):
    p = s.page
    s.go("/about", 1500)
    for t in ("How the pieces connect", "From raw survey to recovery action", "Built with", "The team"):
        expect(p.get_by_role("heading", name=t)).to_be_visible()
    expect(p.get_by_text("Aadarsh Raj").first).to_be_visible()
    s.shot("about")
    s.scroll_through()
    s.shot("about_full", full=True)


def offline(browser, s_tag):
    ctx = browser.new_context(**VIEWPORTS["1366"])
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.route("**/api/**", lambda r: r.abort())
    for path in ("/monitor", "/predictor", "/insights", "/"):
        page.goto(BASE + path)
        page.wait_for_timeout(2500)
        if path != "/" and not page.get_by_text(OFFLINE).count():
            failures.append(f"[offline] no friendly message on {path}")
    page.screenshot(path=SHOTS / "1366_dark_offline_message.png")
    if errs:
        failures.append(f"[offline] page crashed: {errs[0][:200]}")
    ctx.close()


def main():
    SHOTS.mkdir(exist_ok=True)
    files = fixtures()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for combo in ARGS.combos.split(","):
            vp, theme = combo.split("-")
            s = Session(browser, vp, theme)
            t = time.time()
            s.step("home", lambda: home(s))
            s.step("navigation, history, refresh, theme", lambda: navigation(s))
            s.step("flight monitor lifecycle", lambda: monitor(s, files))
            s.step("manual + manifest flights", lambda: monitor_manual_and_manifest(s, files))
            s.step("predictor", lambda: predictor(s))
            s.step("insights", lambda: insights(s))
            s.step("bulk", lambda: bulk(s, files))
            s.step("about", lambda: about(s))
            print(f"{combo}: done in {time.time() - t:.0f}s, failures so far {len(failures)}", flush=True)
            s.ctx.close()
        offline(browser, "offline")
        browser.close()
    print("\n".join(notes))
    print(f"\nFAILURES: {len(failures)}")
    for f in failures:
        print("  ", f)
    sys.exit(1 if failures else 0)


main()
