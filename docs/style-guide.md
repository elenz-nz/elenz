# Elenz style guide

How everything public on Elenz is written: the method pages, the chart notes (ⓘ), the Now, Tracker and Records pages,
Using Elenz, About and the articles. The method pages have the most rules, because they carry the most weight.

The standard to aim for is a published technical note from a New Zealand market institution: exact, calm and open about
its limits. A reader should be able to answer three questions quickly: what is this figure, how far can I trust it, and
how can I check it?

## Who we write for

Write for an interested reader who doesn't work in the industry, and keep the detail an industry professional needs. A
reader meets the plain explanation first and the technical detail second.

| Reader | What they need | What serves them |
| --- | --- | --- |
| Interested public | What the figure means and whether to rely on it | Chart notes, Introduction, How to interpret it, key caveats |
| Journalist, analyst or policy adviser | A figure they can quote correctly | Data sources, Accuracy and limitations, Historical coverage |
| Industry professional | The exact method and its evidence | How it works, Data sources, References, linked code |

## Where things belong

| Content | Where it goes |
| --- | --- |
| Buttons, menus, colours and how to use a chart | Using Elenz (`/guide`) and the How to panels. A method page covers a display choice only when it changes what a figure means. |
| What a chart shows, in a few lines | The chart's ⓘ note |
| How a figure is made and how far to trust it | The method page |
| What each dataset is | The source register, once |
| What each market term means | The glossary (`/methods#glossary`), once |
| Bug history, test reports and design decisions | `CLAUDE.md`, `analysis/README.md` and pull requests |
| Planned work | The Elenz team's own notes. Public pages describe what Elenz does today. |

## Evidence

- Base every claim on public data or a document we have opened. Add a reference only after opening it and checking it says what the page says it does.
- Public wording rests on the EA's meters and published documents, and nothing else.
- Where no public document settles a point, say so and mark the reading as ours. The model: "That is our reading of the meters: no public document has been found which specifies the plant behind this one."
- If a search found no document, say that, not that none exists.
- Name no block-dispatched chain or station until a public document does.
- Never name trader codes.
- Transpower's reports need consent to reproduce. Cite and link them, and don't copy their tables.
- Speak as "we" or "Elenz", never "I". Use "owner" only for the owner of a plant.

## Voice

The voice is that of a careful New Zealand analyst explaining their work to a colleague in another field. It states
facts directly, shows its reasoning and names its doubts without apologising for them.

| Quality | What it means on the page | Test |
| --- | --- | --- |
| Authoritative | State what the data shows. Attribute judgements to Elenz and facts to their source. | Could the reader tell which sentences are data and which are our judgement? |
| Precise | Give the number, unit, date and scope. | Would two readers calculate the same figure from this text? |
| Readable | Use one idea per sentence, and explain a term before relying on it. | Does it make sense read aloud once? |
| Transparent | Put uncertainty next to the claim it affects. | Would an expert reviewer learn of any weakness only by finding it themselves? |

### Sentences

- Average under 20 words a sentence. Split any sentence over 35 words, unless it is technically required.
- Use a colon to introduce a list or a definition, not to join clauses. Allow one colon or semicolon a sentence.
- Write reasoning as prose. Use bullets only for parallel items of the same kind.
- Don't start every bullet with a bold label. Keep that form for lists read as a reference, such as the groupings.
- Use "we" for choices and judgements, and "Elenz" where the name reads better. Don't write "the site".
- Use the present tense. Describe what Elenz does now, not how it came to do it.
- Avoid "robust", "comprehensive", "seamless", "leverage" and "in order to". Use "not X" only when a reader would otherwise assume X.

### Say only what is true of this figure

- Give a reason only if it is correct and explains the point being made. Don't use "which" or "because" to join two separate ideas.
- Leave out anything that is true of every chart. It tells the reader nothing about this figure.
- Use the words on the screen. The chart's control is called Interval, so write "interval", not "point".
- Make every sentence and table cell stand alone. If "the same", "as above" or "these" needs another row to make sense, name the thing.

### What makes text read as generated

The giveaway is shape, not stock phrases: repeated sentence patterns, compressed lists and traces of the build process.

| Don't | Do |
| --- | --- |
| Chain clauses with colons and semicolons. | Break them into separate sentences. |
| Use bold label, colon, fragment on line after line. | Vary the form, and join connected ideas in a paragraph. |
| Mention earlier versions: "These replace the earlier month records". | Remove it. Record real method changes in Historical coverage. |
| Refer to something no longer there: "The 'about 6%' is how uncertain that factor is". | Name the figure in full where it first appears. |
| Leave promises and to-do notes: "the rates are to be checked after a month". | Do the check, or remove the line. |
| Use informal labels as method terms: "boils it down", "Nobody measures it". | Use the plain technical term. Quote a control's name only when referring to the control. |
| Open a method page with a tour of the buttons. | Move it to Using Elenz, and start with what the figure is. |
| Signpost: "it is important to note", "this page explains". | Delete it and state the point. |

### Do and don't

| Don't | Do |
| --- | --- |
| Batteries count discharge only; the price they paid to charge is its own row: charging × its island's reference price, ÷ the energy charged, left out of the average. | Battery output counts only while a battery is discharging. The price paid to charge it appears separately in the Battery (charging) row and isn't part of the average. |
| Where each point is a day, week, month or year, the chart shows energy instead of average MW, which reads low for output that varies through the day. | On day, week, month and year intervals, the chart shows the energy generated in each interval. |
| A simple average of the two balances read about 22 MW low on average. A straight-line fit against the metered flows does better: | We make a calculated estimate of the transfer with a straight-line fit to metered flows. A simple average of the two island balances read about 22 MW low. |
| Provides the same inputs for recent weeks. | Each island's generation and grid demand for recent weeks, which feed the calculated estimate of the transfer until metered flows are published. |
| Every five minutes the system operator runs a dispatch case: a solve of the whole market that sets each generating unit's output. | Every 5 minutes, the system operator solves the market for the coming interval. This dispatch case sets each generating unit's output and the price at each node. |

## Terms

Use one term for one thing.

| Use | Meaning | Avoid |
| --- | --- | --- |
| Metered history | The months built from metered data | "the metering", "metered months" as a general term |
| Recent dispatch data | History built from daily dispatch files | "the recent weeks" without saying which data |
| Live week | The last 7 days from the real-time feed | "live data" for anything older |
| History | All half-hourly data behind the live views, metered and recent | Using it to mean metered data only |
| Grid solar | Solar farms that the market dispatches | "grid-scale solar", "dispatched solar" as a label |
| Embedded solar | Solar on local networks that isn't dispatched | "rooftop solar" for the whole category |
| Other embedded generation | Other generation on local networks that isn't dispatched. "Other embedded" on charts. | "small hydro" for the whole category |
| Grid demand | Electricity taken from the grid | "load", except when quoting the dispatch data's field |
| Demand with embedded generation | Grid demand plus embedded solar and other embedded generation | "underlying demand" |
| Demand with embedded solar | Only on a demand record's page, whose dashed line leaves out other embedded generation | Using it on the Tracker or Now pages |
| Station | A named power station | Mixing with "plant" in one passage |
| Plant | A station or farm as Elenz displays it, and the general word for generating equipment | |
| Unit | One generating machine or dispatch unit | "generator" for a machine |
| Generator | The company that runs generation | "owner", unless ownership is the point |
| Connection point | The general term for a point on the grid | "grid connection", "POC" |
| Grid exit point (GXP) | The specific case where electricity leaves the grid | "Root NSP", except when naming the dataset's field |
| Half-hour | The default word for a 30-minute period | |
| Trading period | The market's term for a half-hour | "TP" without explanation |
| Dispatch price, final price, interim price | The three price states | "live price", or "spot price" where the state matters |
| HVDC transfer | The flow on the link | "HVDC flow", except for the dataset's name |
| The Electricity Authority, then the EA | First use on a page, then afterwards | "EA" as the first mention |

**Half-hour and trading period.** Write "half-hour" by default. Use "trading period" as a back-up, where a passage needs
the market's own term or uses it a lot, as an article on the market might. Give it once in plain words on any page
that uses it. The glossary and the overview's Conventions say what a trading period is.

**Interval.** Use "interval" for what the chart's Interval control sets, such as 5 minutes, half-hours, days or months.

**Estimates.** Write "calculated estimate" the first time a paragraph or table cell says something is an estimate, then
"estimate" for the rest of it. Write "we make a calculated estimate of", not "we estimate". Headings and short labels
such as "est." don't need it. Chart notes are short, so "estimated" is enough there.

## Dates and times

These follow the data.govt.nz style guide, except for clock times, where a space and "noon" match the charts.

| Item | Use | Avoid |
| --- | --- | --- |
| Date | 9 August 2021 | 9 Aug 2021, 9/8/21 |
| Month in prose | September 2026 | Sep 2026 |
| Month in a narrow table column | Sep 2026 | September 2026, if it forces a line wrap |
| Date range | December 1997 to December 2002 | December 1997–December 2002 |
| Year range | 2020 to 2026 in prose, 2020–26 in tables | Aug 2013 – 2015 |
| Financial year | Year to June 2026, then 2025/26 | FY26, unless quoting a report |
| Quarter | July to September 2026 | FY21 Q1 as printed text |
| Time | 1:30 pm, noon, midnight | 12:00 am, 13:30 |
| Time zone | New Zealand time, stated once in Conventions | NZST or NZDT on individual figures, unless it matters |

## Numbers and units

| Item | Use | Avoid |
| --- | --- | --- |
| Quantities and durations | 5 to 10 weeks, 7 days, 1 to 4 days | five to ten weeks, 5–10 weeks in prose |
| Simple counts under 10 | three layers, two islands | 3 layers |
| Approximate values | about 470 MW | ~470 MW |
| Thousands | 1,270 MW | 1270 MW |
| Percentages | 12%, with percentage points where needed | per cent, 12 % |
| Ranges in tables | 120–165 MW | 120-165 MW |
| Units | A space before the unit: 54.1 kg CO₂e/GJ | 54.1kg/GJ |
| Prices | $100/MWh, which is 10c a kWh | 10 c/kWh, 10 cents a kWh |
| Emissions | g CO₂e/kWh and t CO₂e/MWh | g/kWh or t/MWh on first mention |
| Currency | New Zealand dollars, said once in Conventions | NZ$ throughout |
| Minus sign | − (U+2212) | A hyphen |
| Regions | North Island, South Island, New Zealand | NI, SI and NZ in prose. They are fine in formulas with a definition. |

Use the same rounded figure everywhere, and don't write a ratio in two forms. Glenbrook's metered output is "about 1.47
times" its dispatch figure on every page.

## Names and language

- Write New Zealand English: "licence" as a noun, "modelled", "organisation".
- Use macrons in Māori names. Keep one spelling for each plant, and name it the same way in prose and data.
- Show dataset files in code style after their plain name: metered generation (`Generation_MD`). Later references use the plain name.
- Use sentence case for headings.
- Make link text name the destination. Avoid "see below" and "here".

## Status labels

Every figure carries one of six labels. The overview publishes them at `/methods#status`.

| Label | Meaning | How to describe it |
| --- | --- | --- |
| Metered | Recorded by a meter and published by the EA | "metered" |
| Dispatch | A 5-minute figure from the market system, not a meter reading. It is a target for most plants, and a snapshot of output at the time for wind and solar. | "dispatched" or "dispatch data", never "measured". Don't call it a target where wind or solar are included. |
| Final price | The price the market settles on, as published by the EA | "final", or "interim" until confirmed |
| Published | A figure another organisation reports, which isn't a meter reading or a market price and which we haven't worked out, such as register capacities, offers and Genesis's coal share | "published", naming who published it |
| Calculated | Arithmetic on other figures, with no added assumption | "calculated", naming the inputs |
| Calculated estimate | Modelled, fitted, assumed or filled | "calculated estimate", with the error where known |

- A calculated figure takes the weakest label of its inputs. The order, from strongest, is metered or final, published, dispatch, then calculated estimate.
- Emissions intensity is a calculated estimate in every period, because its factors are published averages or assumptions.
- Say how an estimate was made: "modelled" for a physical model, "fitted" for a statistical fit, "assumed" for an adopted factor and "filled" for a gap. The label stays Calculated estimate.
- Never put metered and estimated figures in the same sentence without labelling each one.
- Keep the visual markers: hatching on charts and "est." in readouts.

## Market terms

Explain a market term once on each page, in one plain sentence, the first time it matters. The first sentence says what
the thing is, and the second says why it matters to the figure. After that, use it normally. The glossary at
`/methods#glossary` holds the standard explanations, so match them. Add a term there when a page starts relying on it.

Check a glossary definition against Part 1 of the Electricity Industry Participation Code before changing it.

Haywards and Benmore need careful wording: "Elenz uses Haywards and Benmore as its reference prices because they sit at
the two ends of the HVDC link. ASX electricity futures use Ōtāhuhu and Benmore."

| Don't | Do |
| --- | --- |
| Their output never reaches the market data as generation; it shows up only as less demand at the grid exit point. | Their output doesn't appear in market data as generation. It appears only as lower demand at the grid exit point, where electricity leaves the national grid for a local network. |
| Some river chains are dispatched as one block: the owner only has to meet the chain's total. | Some river chains are dispatched as one block. The generator must meet the chain's total but can divide it between stations, so one station's dispatch figure may differ from what it generated. |

## Tables

A table should make sense to someone who lands on it from a search result. Numbers, codes and names can stay short, but
any cell that explains something needs a complete statement.

- Use a column heading that says what the column holds. Avoid one-word labels such as "Why" where a phrase is clearer.
- Write explanatory cells as sentences, with a subject, a verb and a full stop.
- Spell out the action in a label: "Island added", not "Island".
- Don't use a code on its own. Give the plain name first and the code after it.
- Don't use symbols such as "–" for a missing value. Say "Not applicable" or "Static".
- Introduce each table with one sentence, and use a caption for its units or exceptions.
- Apply the same rules to registry fields, which become table cells on several pages.

| Don't | Do |
| --- | --- |
| Island · `OHG1101` · the feed gives it no island | Island added · Pātea hydro (`OHG1101`) · The real-time feed gives the connection no island, so we assign it to the North Island. |
| Demand in history. | Supplies the energy leaving the grid, one of the inputs to metered demand. |
| Published: – | Publication timing: Static dataset, not updated. |
| Not suitable: island totals only. | Not suitable. Elenz publishes demand only for New Zealand and each island. |

## Method pages

Each page is one Svelte file in `site/src/lib/methods/pages/`. Its header comes from `TOPICS` in `registry.ts`, its Data
sources from `ROLES` in `roles.ts`, and its References from `REFERENCES` and the topic's `code`.

### Structure

Every method page uses these seven headings, in this order, with these anchors. Keep every section, even if it is short.
`scripts/check-methods.js` fails the build if one goes missing.

| Heading | Anchor | Question it answers | Must contain |
| --- | --- | --- | --- |
| Introduction | `#introduction` | What is this figure? | Two to four plain sentences. A term the page needs may be explained here. |
| Data sources | `#data-sources` | What information is used? | Which data each period uses, its status, and the role of each dataset. This is the only place a page says so. |
| How it works | `#how-it-works` | How is it calculated or processed? | The method in reading order, in plain words, with each calculation behind a Show calculations button. Plant notes come last. |
| How to interpret it | `#interpretation` | What does the result tell me? | What a high, low or changing value means, and the "How far to trust it" table. |
| Accuracy and limitations | `#limitations` | What is measured, estimated or uncertain? | A status table, quantified errors, checks made and known limits, largest effect first. |
| Historical coverage | `#coverage` | How far back does it go, and what changed? | A dated table, oldest first, of changes in data or method. |
| References | `#references` | What supports this page? | Reports and external documents, then code and evidence files. |

Subheadings under How it works can follow the subject. Number the steps of a method only when their order matters. Keep
older anchors on their subsections, because other pages and chart notes link to them: a heading can carry one as
`<span id="limits"></span>`.

### The header and key caveats

The header says what the figure is, where it appears, when it was reviewed and what to be careful of. It doesn't say
what data is used. The summary in `TOPICS` is one sentence on what the figure is.

Key caveats sit in `.mt-caveats` at the top of the body.

- Use up to three, each one sentence long.
- Choose a caveat by this test: would a careful reader quote or use the figure differently if they knew it?
- Give the size of the effect where it is known.
- End the block with one link to Accuracy and limitations.
- Describe today's limit, not planned work.

Bringing caveats forward doesn't excuse an unqualified claim later. Put a caveat directly beside any claim it qualifies.

### Data sources

Open with a sentence or two, then `<DataSources slug="…" />`. Each dataset's row starts with its period and status, such
as "History: metered", "Recent weeks: dispatch data", "Live week: calculated estimate", "Mapping", "Fill-in" or "Check".
The labels decide the source register's columns: "Live week" and "Recent weeks" count as recent and live data, and
"Mapping", "Check" and "Fill-in" as supporting data.

A page that uses the layers gives the short form and links to the full account:

> Recent figures come from dispatch data. Elenz replaces them with metered data as the Electricity Authority publishes each month, and History since 1997 explains how the layers fit together.

The full account is one component, `Handover.svelte`, on the overview and History. Three consequences need stating
wherever they matter: the same half-hour can show a dispatch price in the 7-day view and a final price in the 30-day
view, HVDC transfer moves to metered data earlier than generation, and before 10 September 2020 metered data stands
alone.

Don't describe a dataset on a method page. The register does that. Name it, link to it once in each section, and say
what the page does with it. Don't restate its publication timing or coverage in the body.

### Calculations

Set out every calculation in the same order: one plain sentence, the formula, its terms, then a worked example where one
helps. The plain sentence stays on the page, and the rest sits inside `Calculations`, a Show calculations button that
works without JavaScript. A reader who opens it should be able to reproduce the result with a calculator.

- Hide the working, not the method. The page must make sense with the button closed.
- Before the button, say in words what is worked out, from what, and how close it is.
- Use one operation a line and brackets wherever the order could be misread. Use the `.formula` block.
- Define every term in a table: its meaning and unit.
- A worked example is required when a formula has more than two terms, uses weights or fitted coefficients, or converts units. A simple definition doesn't need one.
- Show every step and the rounding. Label invented inputs as illustrative, and date real ones.
- Use one button for each piece of method, even if it holds more than one formula.
- Keep status tables, error figures and limits outside the button, because they affect how a figure can be used.
- Say when coefficients are rounded.
- Read constants from the code where possible, as Emissions and the Price explainer do. `ingest/tests/method_constants.py` compares figures typed into a page with the Python that holds them, so add a line there for a new one.
- Check that rounded examples add up as printed.

### How far to trust it

Use the `GoodFor` table on every page with a figure a reader might quote.

| Rating | Meaning | How to write the reason |
| --- | --- | --- |
| Credible | Fit for this use | Say what supports it. |
| Useful | Fit for this use, with care | Say what could affect it. |
| Indicative | A rough signal only | Say how far out it could be. |
| Not suitable | Don't use it for this | Say why, and offer a better source if there is one. |

### Accuracy, coverage and plant notes

Accuracy and limitations opens with a table of Figure, Status and Typical accuracy.

Historical coverage records changes in data or method. When a change moves published figures, add a dated row, as
Kawerau (Onepu) moving to geothermal did. Routine fixes and rebuilds stay out.

Move plant-by-plant exceptions into Plant notes at the end of How it works, so they don't interrupt the method.

## Source register

The register at `/methods/sources` is the only place that describes a dataset. It opens with a table of the data behind
each figure, built from `ROLES`, then groups the datasets by what they are about.

Every entry uses the same fields, written as complete statements: Role, Contains, Used for, Coverage, Publication timing,
Licence and Method pages.

| Field | Example |
| --- | --- |
| Role | Recent and live data |
| Contains | Each 5-minute dispatch case, with the output of every generating unit, the load at every connection point and the price at every node. |
| Used for | Provides generation, grid demand and prices for the live week. Also supplies the inputs to the HVDC estimate and the Price explainer. |
| Coverage | About the last month. |
| Publication timing | Usually 1 to 2 minutes after each interval starts. |
| Licence | CC BY 4.0. |

## Chart notes (ⓘ)

Every ⓘ beside a title (`InfoTip`) follows one pattern, so they read alike across the site.

1. **One plain opening sentence** (`<p>`) saying what the chart or card shows, in layman's terms. Don't repeat the title word for word, because it sits right beside the note: "This shows…", "This lists…", "These are…".
2. **Then 2–5 short bullets** (`<ul>`), one idea each, saying what you can see or do. Say what it can do, not what it can't (no "not on All", "no comparison"). Drop a bullet that doesn't apply rather than explain its absence.
3. **Same order everywhere:** how to read it (lines, colours, units), then what you can do (buttons, hover, drag), then where the numbers come from.
4. **Start a bullet with the thing on screen**: "Dashed line:", "Shading:", a button's name in quotes ("Scale to this view"), so readers can match it to what they see.
5. **Fit the view.** Name the region, interval and choice shown ("New Zealand's", "the North Island", "each week", "wind"), and show bullets only when they apply (`{#if}` on island views, daily and longer intervals, a metric).
6. **End with a link to the method page section** (`<p><a href="/methods/…#…">How … is worked out</a></p>`). Add a second link only when two methods matter. A new kind of chart gets a method section to link to.
7. **Plain words and NZ English.** Explain a term the first time a note uses it (dispatch, node, capacity factor, inverter-based). Keep the same words everywhere. Give prices a feel: $100/MWh is 10c a kWh, before lines and retail charges.
8. **Same chart, same note.** HVDC transfer reads the same on both tracker tabs.
9. **Phone-sized:** about 70 words in any one view.
10. **Estimates and provisional figures stated as plain facts** ("estimated", "provisional"), not apologies.
11. **Lowercase for ordinary things** (wholesale price, generation), capitals only for names (Haywards, the EA, Huntly).
12. **Works in light and dark mode:** no "paler" or "darker" for colour scales. "Fainter colour" reads right in both.
13. **A data state** (no offers yet, not built yet) belongs on the chart itself (a banner, shading, a legend key), not in the ⓘ. The Generation chart's ⓘ ends with the grouping's own note (`NOTES` in tracker.js, one for every grouping, the grouping's name in bold, not capitals).

## Other pages

**Using Elenz and the How to panels** say what a reader can do, in the words on the screen. Each thing to do is one
labelled entry, starting with the action: "Pin it", "Zoom in". Keep the panels and `/guide` in step with the controls.
Leave method out and link to it.

**The Now, Tracker and Records pages** use the terms and number styles above in labels, tooltips and readouts. Labels
can be shorter than prose: "est.", "avg", "Sep 2026". Tooltips say what a figure is, and don't apologise for it.

**About** is short: why Elenz exists, what each page shows, where the data comes from in brief, support and contact. It
speaks as "we".

**Articles** follow the voice, terms and numbers here, and cite their own sources at the end. They have more room for
argument and narrative than a method page, and every figure quoted must come from a script in `analysis/`, which prints
it. An article can use "trading period" freely, once it has said what one is.

## Reviews

A review compares every formula, constant, date and claim on a page with the code and data. A proofread or a wording
change doesn't count. Each page shows "Reviewed against the code on 6 November 2026", from `reviewed` in `TOPICS`.
`REVIEWED` covers the overview, the source register and the shared handover text.

- Review a page when its method, constants or data sources change, and before any change that moves published figures.
- Review every page in May and November, and give them all the same date. November suits this because new geothermal figures are published then.
- Each topic lists the files it describes in `code`. `scripts/check-reviewed.js` warns when one has changed since the review date. Clear the warning by reviewing the page, or by putting `[method unchanged]` in the commit message of a change that doesn't touch the method.

## Checklist

**Structure**

- All seven headings are present, in order, and existing anchors still work.
- Up to three key caveats sit at the top, and the header doesn't describe the data used.
- Instructions for using the charts have moved to Using Elenz.

**Accuracy**

- Every number, constant and date has been compared with the code or data.
- Every claim rests on a listed dataset or an opened reference.
- Handover wording matches the shared component or uses the short form.
- Rounded figures match the other pages, and worked examples have been recalculated.

**Clarity**

- Data sources gives every period's status, and metered and estimated figures aren't mixed without labels.
- Dispatch data isn't called measured, or a target where wind or solar are included.
- Each market term is explained at first use.
- Every formula sits behind Show calculations, with its terms defined and a worked example where one is required.
- Explanatory table cells are complete statements that make sense on their own.

**Style**

- Sentences average under 20 words, and none is over 35.
- The page doesn't mention build history, future plans or to-do items.
- Terms, dates and numbers follow this guide, and estimates are "calculated estimates" at the first mention in a paragraph.
- Datasets use their registered names and link to the source register.

**Sign-off**

- The `reviewed` date and `code` list are up to date.
- The page has been read aloud once, on a phone-width preview.

## Sources

- [Numbers, dates and times](https://www.data.govt.nz/about/about-data-govt-nz/our-style-guide/numbers-dates-and-times), data.govt.nz style guide
- [Hedge market](https://www.ea.govt.nz/industry/wholesale/hedge-market/), Electricity Authority
- [Electricity Industry Participation Code 2010, Part 1](https://www.ea.govt.nz/documents/7239/Part_1_-_Preliminary_provisions.pdf), Electricity Authority
