# WinCare tasks (summary)

Full details for each task are in `docs/plano-melhorias.md` (Portuguese).

---

## T01 — Responsiveness, DPI and zoom

**Task description**
I want the app to look good at any window size, not just 1360×900. The minimum window is 1024×640 and a lot of people use laptops at 125% or 150% scaling, so today some screens get cut off and cards get squeezed. Go through every page at those widths, make the sidebar collapse on its own in small windows, fix headers, lists, charts and modals, and add zoom with Ctrl +, Ctrl − and Ctrl 0 (saved in Settings).

**How to judge completion**
- No page scrolls horizontally at 1024×640, including at 125% zoom.
- All main buttons stay visible and clickable at that size.
- The screenshot script generates a grid at 1024×640, 1366×768 and 1920×1080 in `docs/screenshots/responsivo/`.
- Zoom stays the same after closing and reopening the app.

**Other notes for the reviewer**
Compare the before and after screenshots. Pay attention to modals at 1024×640: the action buttons can't disappear. This task is about layout, not changing the look.

---

## T02 — Accessibility and keyboard navigation

**Task description**
I want the whole app to be usable with only the keyboard and with Windows Narrator, in both themes. Run axe on every page and fix the issues, fix contrast, visible focus, focus trapped inside modals, `aria` on chips, lists and progress bars, and add shortcuts (Alt+1…9 for the pages and `?` to see the shortcuts).

**How to judge completion**
- Zero serious or critical axe violations on the main pages, in light and dark themes.
- You can run a tool, confirm a modal, uninstall a program and clean a browser (in demo mode) without the mouse.
- When a modal closes, focus goes back to the button that opened it.

**Other notes for the reviewer**
Try it yourself with only the keyboard. The shortcuts panel can't have a text field. Animations have to respect the Windows "reduce motion" setting.

---

## T03 — Design system and consistent states

**Task description**
Today each screen shows loading, empty and error states in a different way, and a lot of CSS classes are copied by hand. I want this standardized: one rule for loading (`PageLoading` or skeleton), an `ErrorState` with "Try again", reusable components for the repeated patterns, a light theme with the same hierarchy as the dark one, and a pass over the UI text. Document it all in `docs/design-system.md`.

**How to judge completion**
- No screen is left blank while loading or after an error.
- No copies are left of the classes that became components.
- Light and dark themes have the same hierarchy (compare `dashboard` and `dashboard-claro`).
- `docs/design-system.md` exists and explains when to use each state.

**Other notes for the reviewer**
The brand identity (colors, font, logo) wasn't supposed to change. Check the UI text: consistent verbs, correct Portuguese accents, and nothing claiming something that wasn't measured.

---

## T04 — Unified recommendations with snooze/ignore

**Task description**
Today we have two recommendation engines (`intelligence.ts` and `recommendations.ts`) and two components (`RecommendationList` and `RecommendationsCard`), and the Dashboard hides the duplicates by hand. I want one engine with all the rules from both, one component (compact on the Dashboard, full on the Intelligence page), and a way to snooze (1 or 7 days) or ignore a recommendation.

**How to judge completion**
- No recommendation shows up twice anywhere.
- `RecommendationsCard`, `recommendations.ts` and `COVERED_BY_MAINTENANCE` are removed and knip passes.
- Snooze hides the item until the deadline; ignore only brings it back if the condition goes away and comes back.
- There are unit tests for the rules, snooze and ignore.

**Other notes for the reviewer**
Check that no rule from the two old engines got lost (SMART, overdue Windows Update, PC on for days, no schedule, every disk drive). The warning shown when the app opens must count only active recommendations.

---

## T05 — Guided first run and quick checkup

**Task description**
Someone opening WinCare for the first time lands straight on the Dashboard without understanding anything. I want a 3–4 step wizard explaining what the app does (and what it never does), with the main preferences as switches, a suggestion to schedule the weekly cleanup and an explanation of admin mode. At the end, a quick read-only checkup, which also stays as a button on the Dashboard.

**How to judge completion**
- The wizard shows up only on the first launch, can be skipped and can be reopened from Settings.
- The checkup doesn't ask for UAC and finishes in about 15 seconds.
- The checkup summary shows what's fine, what needs attention and a shortcut to fix it.

**Other notes for the reviewer**
No text fields in the wizard. In demo mode it has to be clear that the data is simulated. The checkup can't run SFC, DISM or chkdsk.

---

## T06 — Maintenance history ("before and after")

**Task description**
I want to show how much the app has helped: space freed, programs removed, repairs done and the PC's health over time. Record a history of maintenance events in the main process (separate from the logs, with a size limit), covering cleanups, uninstalls, repairs, memory optimization and scheduled jobs. Build a history page with totals per period (7/30/90 days), a weekly chart, a timeline and export.

**How to judge completion**
- The totals match the sum of the events (with a test).
- The history survives an app restart and doesn't grow without limit.
- Scheduled cleanups show up alongside manual ones.
- The history can be exported and cleared (with confirmation).

**Other notes for the reviewer**
Check that every flow records events, especially uninstalls and scheduled jobs. It needs simulated data for the demo and the screenshots.

---

## T07 — Program updates hub (winget)

**Task description**
I want the Programs page to show which apps have updates and allow updating with one click using `winget`. Detect whether winget exists (if not, explain and open App Installer in the Store), list updates without asking for UAC, allow selecting several and updating them with per-item progress, and allow ignoring a version.

**How to judge completion**
- Works with and without winget installed.
- One failed item doesn't stop the others, and the error shows in the list and in the log.
- There's a test guaranteeing that no winget argument comes from text sent by the renderer.
- There's simulated data and a new screenshot in the README.

**Other notes for the reviewer**
Most important point: the renderer only sends the id from the list the main process generated, never the command. If winget's output is parsed as text, it has to work with the console in Portuguese and in English. It needs a test on a real machine updating at least one program.

---

## T08 — System tray, alerts and notifications

**Task description**
I want WinCare to warn when something important happens, even with the window closed, without becoming an annoying app. Add a tray icon with shortcuts (open, checkup, optimize memory, quick cleanup, quit), an option to stay in the tray when closing and to start minimized with Windows, and a lightweight monitor that sends notifications for a full disk, high temperature, Defender turned off and overdue Windows Update.

**How to judge completion**
- With "stay in the tray", closing the window doesn't quit the app, and "Quit" really quits.
- An alert doesn't repeat before its interval or after being ignored.
- Each alert type can be turned off and there's a "do not disturb".
- Idle resource usage is measured in the summary (average CPU under 1%).

**Other notes for the reviewer**
By default, closing the window still quits the app and starting with Windows is off. Alerts must use the rules from the T04 engine and respect snooze/ignore. Check that the monitor never runs twice.

---

## T09 — Battery and power

**Task description**
On laptops, I want to show battery health in a way that's easy to understand. Detect whether there's a battery, read `powercfg /batteryreport` and show health in %, wear, cycles and a chart of capacity over time, with a button to open the full report and power tips when they make sense.

**How to judge completion**
- On desktops the section doesn't show up.
- Parsing the report has tests with at least two sample XML files (healthy and worn battery).
- No temporary files are left behind.

**Other notes for the reviewer**
The text has to be honest: wear is normal over time, so don't scare the user. Tips only open Windows pages, they don't change settings on their own. It needs testing on a real laptop and a real desktop.

---

## T10 — UI tests, E2E and visual regression

**Task description**
Today we only have the security tests for the main process. I want a real safety net: Vitest for the renderer logic, Testing Library for the main components (modal, chips, ToolCard, demo cleanup and uninstall), Playwright for the main flows and a visual comparison of the screenshots against a baseline. All of it in CI and documented in `docs/testes.md`.

**How to judge completion**
- CI is green with the new jobs.
- `test:unit`, `test:e2e` and `test:visual` exist and `npm test` stays fast.
- A bug added on purpose (for example, breaking modal focus or a page layout) makes some test fail, and the summary says which one.

**Other notes for the reviewer**
If E2E runs against the web build instead of Electron, there has to be a justification. Check that the visual comparison tolerance isn't so high that everything passes.
