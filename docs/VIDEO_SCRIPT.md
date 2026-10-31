# Video script — 3:00 pitch cut

**IMBERE Data · NISR 2026 Big Data Hackathon · Track 2**

One of **two** required videos. This is the pitch cut; the screen-recorded demo of the running
prototype is linked from `README.md` §Videos. Both are listed in `docs/SUBMISSION.md` §9.

Read at roughly **150 words per minute**. The narration below is 445 words, which lands at
2:58 with the pauses marked. Every figure spoken appears on screen at the same moment, so a
viewer who misses a word still gets the number.

| | |
|---|---|
| Length | 3:00 hard limit (this cut: 2:58) |
| Format | 1920×1080, 30 fps, H.264 MP4 |
| Visuals | `docs/video/slides/slide-01.png` … `slide-08.png` |
| Audio | one voice, close-mic, no music bed (music fights the numbers) |
| Captions | burn in or ship a sidecar `.srt`; the script doubles as the transcript |

Slide frames are rendered from HTML, not hand-drawn, so a figure change is a text edit plus
one command:

```powershell
powershell -ExecutionPolicy Bypass -File docs/video/render_slides.ps1
```

---

## Beat sheet

| Time | Slide | Beat | Rubric |
|---|---|---|---|
| 0:00–0:10 | 01 | Title, the gap in one sentence | 1 |
| 0:10–0:40 | 02 | 96 / 34 / 27.4 / 37.1 and why it matters | 1 |
| 0:40–0:55 | 03 | Three questions, three modules | 1, 3 |
| 0:55–1:25 | 04 | Where fragility sits | 2, 4 |
| 1:25–1:50 | 05 | What a shock costs | 2, 3, 5 |
| 1:50–2:08 | 06 | Five rules, one budget | 3 |
| 2:08–2:40 | 07 | The result: 2.7×, leakage, cost per poor person | 5 |
| 2:40–2:58 | 08 | Measured vs modelled, the swap, close | 2, 4, 5 |

The times above are the *target* pacing. The rendered cut is **2:46** — `build_pitch.py` derives
each slide's length from the narration it actually synthesises, so the real per-slide starts live
in `docs/video/pitch-schedule.json`, not in this table.

---

## 0:00–0:10 · Slide 01 — Title

**On screen:** IMBERE Data · *Financial resilience, measured where it runs out.*

> Rwanda has 96 percent financial inclusion. It also has 34 percent of adults who are
> financially vulnerable. IMBERE Data is about the gap between those two numbers.

*27 words · 10 s*

**Delivery:** flat and factual. Do not sell the title — the next slide does the work.

---

## 0:10–0:40 · Slide 02 — The problem

**On screen:** four stat blocks — 96%, 34%, 27.4%, 37.1%.

> Rwanda's inclusion success is real. 96 percent of adults are financially included. But 34
> percent remain vulnerable or extremely vulnerable, 27.4 percent live below the poverty
> line, and 37.1 percent of households reported a severe shock.
>
> Access outpaced resilience. A mobile wallet does not stop a drought. So the question for a
> budget cycle is not who has an account — it is who is one shock away from the line, and what
> is the cheapest way to reach them.

*80 words · 30 s*

**Delivery:** slow down on "27.4" and "37.1". Pause one beat after "drought" — it is the line
the whole pitch rests on.

---

## 0:40–0:55 · Slide 03 — Three questions

**On screen:** 01 Where · 02 What a shock costs · 03 Which rule works.

> IMBERE answers three questions. Where is fragility concentrated? What does a shock cost?
> And which targeting rule reaches the poor most cheaply? Three modules, one dataset, one
> screen at a time.

*31 words · 15 s*

**Delivery:** the three questions are a list — raise the pitch slightly on each, then drop for
"three modules". This is the only place the video is allowed to feel like a trailer.

---

## 0:55–1:25 · Slide 04 — Module 01, where

**On screen:** district-level points; the "5 of 30" panel in navy.

> Module one is the map. Thirty districts, drawn in the same legend bins as the official EICV7
> Poverty Profile, so the prototype and the published map can be read side by side. Click a
> district and you get people below the line, share of the national poor, mobile-money and
> savings coverage, and shock incidence. And the change since 2017, not just the level —
> because five of thirty districts cut poverty by less than five points.

*76 words · 30 s*

**Delivery:** "same legend bins" is the credibility line — stress it. If you plan to cut in
live app footage, this is the beat to do it: open `/`, hover two districts, cut back to the
slide.

---

## 1:25–1:50 · Slide 05 — Module 02, what a shock costs

**On screen:** shock chips, then the four-stage pipeline.

> Module two prices a shock. Pick a district, pick a drought, flood or food-price shock, pick
> the severity. IMBERE applies that loss to the household distribution, lets savings, mobile
> money and insurance absorb part of it, and reports how many households cross the poverty
> line — and how much cash it takes to restore them. That is a number a district can budget
> against, not a vulnerability score.

*68 words · 25 s*

**Delivery:** the pipeline is four boxes; you do not have to read them, the voice carries the
sequence. Land hard on "how much cash".

---

## 1:50–2:08 · Slide 06 — Module 03, five rules

**On screen:** five rules, proxy-means highlighted.

> Module three is the differentiator. Five allocation rules — universal, geographic,
> community-based, financial-exclusion first, and a proxy-means test — run on the same budget,
> the same households and the same scoring. Same money, five different answers. That is the
> choice a programme officer actually has to make.

*47 words · 18 s*

**Delivery:** read the five rule names as a rhythm, then stop. Do not explain what proxy-means
means here; the next slide shows why it matters.

---

## 2:08–2:40 · Slide 07 — The result

**On screen:** the full comparison table, proxy-means row highlighted.

> At 300 million francs, covering 2,000 households, the proxy-means rule reaches 37.8 percent
> of the poor. Universal selection reaches 13.9. Same money: two point seven times more poor
> people reached, leakage down from 71.2 percent to 21.9, and cost per poor person reached down
> from 520,000 to 191,000. Geographic targeting still captures most of the gain without a
> household survey — that is the practical fallback.

*67 words · 32 s*

**Delivery:** this is the beat judges remember. Read the numbers slowly, one per breath,
and let the highlighted row sit for a second before "geographic targeting".

**Must not be cut:** "synthetic" is on screen in the caveat, and the narrator says "prototype
figures" in the next beat. Do not remove either — the honesty is scored.

---

## 2:40–2:58 · Slide 08 — Method, and close

**On screen:** Measured · published vs Modelled · illustrative; the swap line.

> Every number says whether it is measured or modelled. Published NISR and FinScope figures, a
> calibrated synthetic household layer that is labelled as such, and a one-file swap for the
> real EICV7 microdata. The engines do not change. That is IMBERE Data — built for LODA, MINALOC
> and district officers, and tied to the second National Strategy for Transformation and
> Vision 2050.

*63 words · 22 s*

**Delivery:** "measured or modelled" is the methodological claim of the whole project —
emphasise both words. The last sentence is the only place the pitch names the policy it serves,
so slow down for it. End on "Vision 2050" and stop; no outro music, no "thank you for watching".

---

## Trim guide, if you come in over 3:00

Cut in this order — each costs the least argument:

1. Slide 03: drop "one screen at a time" (4 words).
2. Slide 04: drop the "change since 2017" clause and put the 5-of-30 panel on screen instead
   (~20 words).
3. Slide 05: drop the shock list to "a drought or a flood" (~7 words).
4. Never cut: the four published stats, the proxy-means comparison, "measured or modelled",
   or the synthetic caveat.

---

## Before you record

- [ ] Replace the placeholders: `[names, universities]` and `[date]` on slide 01,
      `[github.com/…]` and `[deployed url]` on slide 08 — then re-render.
- [ ] Re-render the frames after any figure changes (`render_slides.ps1`), and check the
      numbers against `docs/SUBMISSION.md` §4, which is the canonical table.
- [ ] Record the voice first, visuals second. The slide changes are written to the narration
      timings; cutting picture to a loose take is much harder.
- [ ] Record at 1920×1080. If you add app footage from a smaller window, scale the window to
      1080p before capture rather than upscaling after.
- [ ] Keep the caveat readable: it is the smallest type on slide 07 and the first thing a
      judge will zoom in on.
- [ ] The screen-recorded demo (linked in `README.md` §Videos) currently has a silent audio
      track — mean and peak both measure −91 dB, i.e. digital silence. Add the voiceover or burn
      in captions before the final upload.
- [ ] Upload as unlisted/public per the submission form, then paste the link into the video row
      of the deliverables table in `docs/SUBMISSION.md` §9.
      **Done for the pitch:** the rendered cut is committed at `media/imbere-pitch.mp4` (2:46,
      1920×1080, captions in `media/imbere-pitch.srt`) and linked from the top of `README.md`
      and `README.md` §Videos. Re-copy it there after any re-render:
      `Copy-Item docs\video\imbere-pitch.* media\`. The demo stays on Drive.
- [ ] The AI-use disclosure in `docs/SUBMISSION.md` §7 stays in the written submission; do not
      let the video imply the team built everything unaided.
