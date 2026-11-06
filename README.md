# SiliconSphere — The Complete VLSI Learning & Interview Preparation Platform

A colourful, browser-based VLSI learning portal built from the VLSI Master Course question bank. Plain HTML/CSS/JavaScript with no framework and no build step.

## What's inside
- **50 technical domains · 100 questions each · 5,000 Q&A pairs**, grouped into **10 colour-coded tracks** (Digital & RTL, Verification, Timing, DFT, Physical Design, Analog/RF, Power, SoC/FPGA, Device & Process, Manufacturing & EDA)
- **Study mode**: one question at a time with Previous / Next navigation and keyboard shortcuts (`←` `→` navigate, `Space` reveal, `M` mark understood, `B` bookmark)
- Per-domain filters (All / To do / Understood / Bookmarked), **section filter** for the 38 domains whose source has section headings, and in-domain search
- **Global search** across all questions and answers (multi-word, ranked, highlighted, filterable by domain, shareable URL)
- Answers split into 💡 Example / 🛠️ Application / 🎯 Follow-up callouts, with **formatted Verilog/SystemVerilog code**
- **Gamification**: 10 XP per understood question, 9 levels (Wafer Rookie → VLSI Master), progress to next level, daily streak + longest streak, 35-day activity grid, 50 domain-mastery badges, level-up / mastery notifications, motivational messages
- Bookmarks and completion tracking saved in the browser (localStorage), with **export / import** of progress
- Light and dark themes (follows the OS until you choose), responsive for desktop, tablet and mobile

## Project structure
| File | Purpose |
| --- | --- |
| `index.html` | App shell, SEO / Open Graph metadata, all views |
| `style.css` | All styling (tracks set `--c1/--c2` colour pairs) |
| `script.js` | App logic: state, gamification, rendering, hash router |
| `questions.js` | The question bank (`VLSI_DOMAINS`) — the source data, unchanged |
| `assets/` | Favicon, app icons, social preview image |
| `netlify.toml` | Static publish config and headers |

## URLs
Routing uses the URL hash, so every link works on refresh or when shared:
`#/` · `#/domains?track=verif` · `#/domain/5` · `#/q/d05q012` · `#/bookmarks` · `#/completed` · `#/achievements` · `#/search?q=clock%20gating`

## Run locally
Open `index.html` directly, or serve the folder (`python3 -m http.server`). Google Fonts load from the internet; everything else works offline.
