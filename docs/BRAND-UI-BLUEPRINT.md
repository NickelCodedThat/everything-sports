# Everything Sports Brand and UI Blueprint

**Status:** Direction for owner and Tech Bull approval

**Audience:** Product owner, Tech Bull, Jason, frontend contributors, editorial team

**Scope:** Brand identity, editorial experience, interaction direction, and implementation tokens

**North star:** The urgency of a live sports desk with the taste of a collectible magazine

## 1. Brand thesis

Everything Sports is the front page for fans who care about what happened, why it matters, and what the culture is saying now. It is a news publication, not a scoreboard with articles attached.

The brand should feel like entering an arena tunnel after the game: flash photography, black rubber floor, concrete walls, a hot broadcast lamp, and people still talking about the moment. That physical scene gives the identity its contrast, rhythm, and confidence without borrowing literal team graphics or obvious hip-hop props.

The editorial promise is **the whole sports conversation, edited with a point of view**. “Everything” means breadth, not clutter. Basketball leads the daily rhythm, football runs nearly level with it, baseball anchors the third pillar, and major stories from every other sport receive serious treatment when the moment earns it.

Three brand-voice words:

- **Charged:** immediate, alert, and close to the action.
- **Composed:** edited, legible, and never frantic for its own sake.
- **Knowing:** culturally fluent without forcing slang or performing fandom.

## 2. Visual personality

The visual reference is a meeting of arena wayfinding, premium sneaker campaign photography, independent music packaging, and a tightly edited Sunday sports section. This is not nostalgia cosplay and not a broadsheet pastiche. The result should feel current because of crop, scale, tempo, and restraint.

Core principles:

1. **News earns scale.** Importance, freshness, and editorial judgment determine size. Every item does not receive a card of equal weight.
2. **Photography carries atmosphere.** The interface frames images; it does not decorate over them.
3. **Type creates the beat.** Condensed display type supplies impact, serif headlines bring editorial credibility, and a clear sans handles speed and utility.
4. **One signal, used hard.** Burnt Signal coral is the recognizable brand color. It marks live, selected, urgent, and owned moments. It is not sprayed across every component.
5. **Calm chrome, intense content.** Navigation and controls recede so stories can feel loud.

Reference lane: a contemporary sports publication built from arena signage and record-sleeve composition, not the saturated “serif plus mono plus thin rules” editorial template. The signature is a compressed masthead, decisive crops, dense but breathable news rails, and an asymmetric lead package.

## 3. Logo and wordmark direction

### Recommended concept: The Full Bleed Wordmark

Create a custom, horizontally compressed `EVERYTHING SPORTS` wordmark in one line where possible and two locked lines for narrow placements. The form should begin from the proportions of League Gothic, then be custom drawn so it is owned rather than typeset.

Distinctive moves:

- Build a shared vertical cut into both `E` forms, suggesting an edit mark and forward motion.
- Tighten the central `THING` rhythm so `EVERYTHING` reads as a single visual block rather than two implied words.
- Give the `S` terminals in `SPORTS` a blunt, square finish that survives favicon and watermark reduction.
- Use one intentional interruption: a narrow rectangular notch through the crossbar zone. It should read as a broadcast splice, not a speed stripe.
- Keep the silhouette rectangular and compact. The wordmark should sit comfortably beside a menu button at 36 px tall and across a social graphic at poster scale.

Required lockups:

- Primary horizontal: `EVERYTHING SPORTS`.
- Compact stacked: `EVERYTHING` above `SPORTS`, optically equal in width.
- Reversed: white on Blacktop or photography.
- One-color: Blacktop, white, or Burnt Signal only.

Do not place a ball, hoop, field, bat, helmet, microphone, crown, chain, or graffiti texture inside the letterforms. Do not italicize the full wordmark. Speed comes from compression and spacing, not a generic forward slant.

Clear space should equal the cap width of the wordmark's `E`. Minimum digital size is 132 px wide for the horizontal lockup and 76 px wide for the stacked lockup. Below that, use the compact mark.

## 4. Compact brand-mark direction

### Recommended concept: The ES Cut

The compact mark is a monogram formed from one continuous rectangular path. A vertical spine produces an `E`; the negative space through its middle resolves into an `S`. The same narrow notch used in the wordmark crosses the center, connecting the systems.

The mark should read first as a strong publication stamp and second as `ES`. That order prevents it from becoming a generic esports logo.

Construction rules:

- Use a 12 by 12 base grid.
- Keep all primary strokes two grid units thick.
- Use square exterior corners and one subtly chamfered internal turn.
- Preserve a one-unit safety channel through the negative-space `S` at the smallest size.
- Test at 16, 24, 32, 48, 128, and 1024 px.
- Prepare filled and knockout versions. Do not rely on an outline-only version below 48 px.

Primary applications:

- Favicon: white mark on Blacktop.
- App icon: Blacktop field, Burnt Signal mark, no text.
- Social avatar: Burnt Signal field, white mark.
- Image watermark: white at 72 to 82 percent opacity with a subtle hard-edged Blacktop backing only when contrast demands it.
- Video bug: single-color mark, top-right safe area, static except for a brief first appearance.

Before final identity production, commission three optical variants: small digital, standard, and display. The small variant needs wider internal openings.

## 5. Color system

The strategy is **committed restraint**: neutral reading architecture with Burnt Signal carrying the brand in concentrated, memorable fields. Replay Blue is functional and rare. Photography supplies the rest of the palette.

| Role | Name | Hex | OKLCH | Primary use |
| --- | --- | --- | --- | --- |
| Background | Clean Sheet | `#FFFFFF` | `oklch(1 0 0)` | Main reading canvas |
| Surface | Replay Gray | `#F1F1EF` | `oklch(0.958 0.003 106.4)` | Secondary bands, skeletons, quiet panels |
| Ink | Blacktop | `#0C0C0E` | `oklch(0.155 0.004 285.9)` | Text, header, dark immersive sections |
| Muted ink | Film Gray | `#54545A` | `oklch(0.448 0.010 286)` | Metadata and secondary copy |
| Border | Chalk | `#D8D8D4` | `oklch(0.881 0.005 106.5)` | Dividers, input outlines |
| Primary | Burnt Signal | `#BC482E` | `oklch(0.555 0.155 34.1)` | Brand fields, selected states, urgent labels |
| Primary hover | Deep Signal | `#9E341F` | `oklch(0.478 0.145 33.1)` | Hover and active state |
| Accent | Replay Blue | `#2447D8` | `oklch(0.478 0.224 266.4)` | Links, focus, live utility, search highlights |
| Success | Final Green | `#127A4B` | `oklch(0.512 0.116 157.1)` | Confirmed and successful states only |
| Warning | Review Amber | `#A45C00` | `oklch(0.547 0.127 61.2)` | Delays, corrections under review |
| Danger | Flag Red | `#B42318` | `oklch(0.500 0.182 29.5)` | Errors and destructive actions only |

Contrast baselines on Clean Sheet:

- Blacktop: 19.54:1.
- Film Gray: 7.52:1.
- Burnt Signal with white text: 5.12:1.
- Replay Blue with white text: 7.08:1.
- Focus indicators use Replay Blue against light surfaces and white against Burnt Signal or Blacktop.

Color rules:

- Burnt Signal means publication energy, not generic error. Error states use Flag Red and a text or icon cue.
- Never assign permanent colors to sports. A basketball article should not become orange by taxonomy.
- Never lay small Film Gray text over photography.
- Use gradients only when they are a necessary photo scrim. Do not use gradients as brand decoration or in text.
- Default to light reading surfaces. Use Blacktop for the masthead, breaking treatment, immersive features, and night-mode surfaces.
- Support `prefers-color-scheme` only after a manual theme control exists. Remember the reader's choice. The initial release can ship light-default with dark feature modules; do not delay launch for a complete dark theme.

### Dark palette mapping

- Canvas: `#0C0C0E`.
- Raised surface: `#17171A`.
- Primary text: `#FFFFFF`.
- Muted text: `#B8B8BE`.
- Divider: `#343438`.
- Burnt Signal shifts to `#D85A3A` for clearer separation from Blacktop.
- Links and focus shift to `#86A3FF`.

## 6. Typography recommendations

Use three open-source web families, each with a specific job:

1. **[League Gothic Variable](https://www.theleagueofmoveabletype.com/league-gothic):** masthead prototype, feature headlines, section titles, scoreless live labels, and large numbers. It brings arena signage and music-poster compression without a varsity costume. Use sparingly and mostly uppercase.
2. **[Source Serif 4 Variable](https://adobe-fonts.github.io/source-serif/):** story headlines, decks, pull quotes, and long-form article copy. Its optical sizes support both tight display use and extended reading.
3. **[Source Sans 3 Variable](https://github.com/adobe-fonts/source-sans):** navigation, metadata, captions, bylines, controls, ticker copy, and utility text.

These families are open source and practical to self-host. Production should self-host WOFF2 subsets, preload only the critical roman files, and use `font-display: swap`. Keep system fallbacks:

```css
--font-display: "League Gothic", "Arial Narrow", sans-serif;
--font-editorial: "Source Serif 4", Georgia, serif;
--font-ui: "Source Sans 3", Arial, sans-serif;
```

Typographic rules:

- League Gothic is a high-impact instrument, not the default font for every title.
- Article headlines use Source Serif 4 unless a feature package is explicitly art directed.
- Sentence case is the default. All caps is limited to short section names, compact labels, and the wordmark.
- Headline tracking must not be tighter than `-0.03em`.
- Body measure is 62 to 72 characters. Mobile article copy targets 34 to 42 characters.
- Use tabular numerals for timestamps, ranking numbers, and score references.
- Avoid faux italics and faux bold. Load the actual required axes or static faces.

## 7. Type scale

The scale uses a 1.25 to 1.333 progression with fluid display sizes. Values are rem-based and assume a 16 px root.

| Token | Mobile | Desktop | Line height | Weight | Typical use |
| --- | --- | --- | --- | --- | --- |
| `display-1` | `clamp(3.25rem, 16vw, 4.75rem)` | up to `6rem` | 0.88 | 500 display | Feature or tentpole lead |
| `display-2` | `2.75rem` | `clamp(3.5rem, 6vw, 5rem)` | 0.92 | 500 display | Feature section title |
| `headline-1` | `2.25rem` | `3.5rem` | 1.02 | 650 serif | Standard lead or article headline |
| `headline-2` | `1.75rem` | `2.5rem` | 1.08 | 650 serif | Major story card |
| `headline-3` | `1.375rem` | `1.625rem` | 1.14 | 650 serif | Standard story card |
| `body-lg` | `1.125rem` | `1.25rem` | 1.55 | 400 serif | Article body and lead deck |
| `body` | `1rem` | `1rem` | 1.5 | 400 sans or serif | General copy |
| `ui` | `0.9375rem` | `0.9375rem` | 1.35 | 600 sans | Controls and nav |
| `meta` | `0.8125rem` | `0.8125rem` | 1.35 | 600 sans | Byline, time, category |
| `micro` | `0.75rem` | `0.75rem` | 1.3 | 700 sans | Short badges only |

Apply `text-wrap: balance` to display and card headings, and `text-wrap: pretty` to decks and article copy. Test real long names at 320 px, including hyphenated surnames and team names.

## 8. Spacing and grid system

Use a 4 px base unit with a deliberately uneven editorial rhythm:

`4, 8, 12, 16, 24, 32, 48, 64, 96, 128`

Core layout tokens:

- Mobile page gutter: 16 px at 320 to 389 px; 20 px at 390 px and above.
- Tablet gutter: 32 px.
- Desktop gutter: `clamp(32px, 4vw, 64px)`.
- Maximum editorial shell: 1440 px.
- Maximum article text column: 720 px.
- Desktop grid: 12 columns, 24 px gutters.
- Tablet grid: 8 columns, 20 px gutters.
- Mobile grid: 4 columns, 12 px gutters.

Rhythm rules:

- Group headline, deck, and metadata tightly: 8 to 12 px internal gaps.
- Separate editorial packages generously: 48 px mobile and 72 to 96 px desktop.
- Use full-width rules or surface shifts to change tempo. Do not wrap every section in a container card.
- Permit one controlled grid break per major package, usually an image extending to the viewport edge or a label overlapping a media edge.
- Align baselines across adjacent story lists. Visual disorder should come from scale and crop, not arbitrary offsets.

## 9. Core UI primitives

### Buttons

- Primary: Burnt Signal fill, white text, 44 px minimum height, 6 px radius.
- Secondary: Blacktop fill, white text.
- Tertiary: text with a trailing arrow, underline appears on hover and focus.
- Icon button: 44 by 44 px touch target, 4 px visible glyph breathing room.
- Disabled: preserve legibility and use `aria-disabled`; do not communicate state by opacity alone.

### Links

- Body links use Replay Blue and an underline with a 2 px offset.
- Headline links inherit text color; hover, focus, and visited treatment must remain distinguishable.
- Never use “Read more.” Use a headline or a specific action such as “Open the trade analysis.”

### Tags and badges

- Tags are navigational filters, not decoration. Use a 999 px pill only for compact tags.
- Breaking, live, analysis, opinion, video, and updated labels have text plus an optional icon.
- Limit a card to one content-type badge and one urgency badge.

### Rules, borders, radius, and shadows

- Default divider: 1 px Chalk.
- Strong divider: 2 px Blacktop.
- Media radius: 0 px for lead and immersive images; 4 px for compact thumbnails.
- Controls: 6 px radius.
- Panels and cards: 8 px default, 12 px maximum.
- Avoid decorative shadows. Use a sharp `0 4px 0` Blacktop offset only for a rare branded action or promo, never paired with a border.
- Elevation for menus and dialogs uses `0 8px 24px rgb(12 12 14 / 0.18)` with no decorative border.

### Forms

- Input minimum height: 48 px mobile, 44 px desktop.
- Persistent visible labels. Placeholder text is an example, not a label.
- Error text identifies the problem and recovery action.
- Search uses a native search input with clear and submit controls that remain keyboard accessible.

### Iconography

- Use a restrained 1.75 px stroke icon set with square line caps where available.
- Default icon sizes: 16, 20, and 24 px.
- Avoid filled cartoon sports icons and mixed icon families.
- Sport identity comes from photography and language, not tiny ball pictograms.

## 10. Story card variants

“Card” means an editorial unit, not automatically a floating rounded rectangle.

### A. Lead package

- One dominant image, headline, deck, byline/time, and at most two related links.
- Mobile order: image, urgency/category row, headline, deck, metadata, related links.
- Desktop: asymmetric 7/5 split. Image occupies seven columns; text occupies five and aligns to the image baseline or vertical center according to headline length.
- Use Source Serif 4 for the lead headline by default. League Gothic is reserved for a major feature or tentpole package.

### B. Major split story

- Image and text at near-equal weight.
- Useful for the second and third stories or a sport-section opener.
- Never repeat the same left/right orientation more than twice in one page region.

### C. Standard river story

- Headline, metadata, optional two-line dek, and a 104 by 78 px mobile thumbnail.
- Entire headline is the link; do not make the whole row an invisible link if it contains secondary actions.
- Use a bottom divider instead of a card outline.

### D. Brief

- Timestamp, concise headline, optional update marker.
- No image by default.
- Ideal for transactions, injuries, quotes, lineup news, and rapid updates.

### E. Analysis or column

- Author portrait or monogram is subordinate to the headline.
- “Analysis” or “Opinion” label is always explicit.
- Use a quiet Replay Gray field or strong rule, not a tinted side stripe.

### F. Visual feature

- Full-bleed photography with a controlled bottom scrim and white text.
- Minimum mobile image height: 420 px.
- Copy stays in a protected crop zone defined by the art desk.
- No automatic image zoom on hover.

### G. Live or developing story

- Burnt Signal live marker with visible “Live” or “Developing” text.
- Show last update time and what changed.
- Animation is optional and never the only signal.

## 11. Homepage information architecture

The homepage should behave like an edited edition with a live spine, not a stack of sport-category shelves.

### Recommended sequence

1. **Masthead and primary navigation**
2. **The Wire:** compact breaking and developing-news rail
3. **The Lead:** one dominant editorial package with up to two supporting stories
4. **Now:** chronological latest-news stream, visible within the first two mobile screenfuls
5. **The Run:** basketball-led package
6. **The Huddle:** NFL and college football package
7. **The Cut:** one cross-sport feature, investigation, profile, or culture story that interrupts the category rhythm
8. **The Diamond:** baseball package
9. **Fight Desk:** boxing and MMA, merged editorially unless volume justifies separation
10. **World Game:** global soccer package
11. **Across the Board:** NHL, tennis, golf, motorsports, Olympics, and major other-sport stories
12. **Most Read / Editors' Picks:** a compact end-of-edition recirculation block
13. **Newsletter and footer**

Why this improves the initial outline:

- The latest stream appears early, honoring the 24/7 promise.
- A cross-sport feature breaks the predictable league-by-league march.
- Fight coverage shares one desk, avoiding thin parallel sections.
- Lower-volume sports are edited into a credible package instead of an “other” junk drawer.
- Section names express editorial voice but remain clear through secondary plain-language labels and accessible headings.

Editorial ranking rules:

- The biggest story leads regardless of sport, but basketball should win ties and receive the most consistent depth.
- A league section can be omitted on a quiet day rather than padded with stale or minor items.
- No story appears more than twice on the homepage, including related-link echoes.
- Chronological “Now” items should not displace major enterprise work from the composed edition.

## 12. Mobile homepage behavior

Mobile is the primary editorial canvas, not a collapsed desktop page.

- The header is 56 px tall, sticky after the first 24 px of scroll, and contains menu, compact mark, search, and one optional utility action.
- The Wire sits directly below the header. It is a horizontally scrollable list with visible partial next item, previous/next buttons for pointer users, and no forced auto-scroll.
- The Lead uses a 4:5 or 1:1 image crop. Keep the entire headline visible before related links.
- “Now” begins with six items. A clear “Load more latest news” action progressively appends items without moving focus unexpectedly.
- Category packages alternate rhythm: one major image story, two river stories, then briefs. Do not use identical horizontal carousels for every sport.
- Carousels are permitted only when sequence is meaningful or shelf density materially benefits. They must expose scroll position and work without drag.
- A sticky bottom nav is not recommended for the publication website. It consumes reading space and implies an app-like task model. Use a sticky header and a quick-sections sheet instead.
- At 320 px, preserve 16 px gutters, 44 px targets, and a headline floor of 20 px for standard stories.
- Respect the browser back gesture and keep horizontal scrolling isolated to clearly signaled rails.
- Avoid cumulative layout shift by reserving image aspect ratios and ad or embed space.

## 13. Desktop homepage behavior

- Use the 12-column shell with a wide lead composition and a four-column “Now” rail only above 1180 px.
- From 768 to 1179 px, place “Now” below The Lead as a two-column list. Do not squeeze a narrow sidebar beside the hero.
- The masthead has two rows: identity/utility above, section navigation below. The section row becomes sticky after the large identity row scrolls away.
- Major packages can alternate 7/5, 5/7, and 8/4 compositions. Avoid a repeating three-card grid.
- Use a maximum 1440 px shell but allow selected feature images and Blacktop bands to bleed to the viewport edge.
- Hover reinforces clickability through underline, border, or surface change. Images remain still.
- On wide screens, whitespace should clarify hierarchy, not expand every gap uniformly.

## 14. Navigation behavior

Primary desktop order:

`Latest · Basketball · Football · Baseball · Fight · Soccer · More`

- The wordmark links home. The compact mark may replace it only after scroll.
- “More” opens an accessible popover or menu listing remaining sports, shows, newsletters, and company links.
- The active section uses a strong bottom rule plus `aria-current="page"`; color alone is insufficient.
- Mobile menu opens as a full-height dialog with focus trap, visible close action, scroll lock, and focus restoration.
- Mobile sections appear first, followed by editorial products and company links. Search remains a separate top-level action.
- On article pages, the sticky header may show the story title only after the main headline leaves the viewport. Truncate to one line and preserve a home escape.
- Do not hide core navigation behind hover-only mega menus.

## 15. Breaking-news treatment

Use three levels so urgency remains meaningful:

1. **Breaking:** one major confirmed event. Burnt Signal field, white text, `BREAKING` label, headline, timestamp, and dismiss control if persistent.
2. **Developing:** an active story with meaningful updates. White or Blacktop field with Burnt Signal marker, update time, and “What changed” text.
3. **The Wire:** routine fast news. Compact neutral rail with timestamps.

Rules:

- Never label rumors, opinion, or routine transactions “Breaking.”
- One breaking banner maximum. Additional urgent items live in The Wire.
- No flashing. A single 180 ms color reveal is enough when a banner first appears.
- Use `role="status"` for noncritical live updates and reserve `role="alert"` for truly urgent user-facing changes.
- Dismissal persists for that story version. A materially updated version may reappear with “Updated.”
- The banner headline must state the fact, not tease it.

## 16. Section-page visual direction

Each section uses the same publication grammar with a different editorial tempo, not a permanent team-color skin.

- Header: large section name, one-sentence desk promise, optional live context, and subnavigation for leagues or beats.
- Opening package: one section lead, two secondary stories, and a compact latest list.
- Follow with chronological river, analysis module, and one visual feature.
- Use photography to distinguish sections: hardwood detail and courtside intimacy for basketball, sideline scale and tactical overheads for football, daylight-to-night geometry for baseball.
- Section landing pages may use a unique crop rhythm or typographic composition, but the core colors and controls stay global.
- Filters such as NBA, WNBA, College, and International update the URL, preserve scroll where sensible, announce results, and remain deep-linkable.
- Empty or quiet beats should recommend adjacent coverage rather than present a blank grid.

## 17. Article and story-cluster page direction

The canonical article is a reading experience with a visible reporting spine.

### Article opening

- Breadcrumb or section link.
- Headline, deck, byline, publish time, updated time, and content label.
- Hero media with credit and meaningful caption.
- Share and save controls after metadata, not floating over the headline on mobile.

### Reading column

- Source Serif 4 at 18 px mobile and 20 px desktop, 1.55 line height.
- 720 px maximum measure, with pull quotes or context modules allowed to break wider on desktop.
- Inline links are underlined. External links identify destination when ambiguity matters.
- Subheads arrive only when the narrative needs them, not at fixed paragraph counts.
- Ads or embeds never split a sentence, list, quote, or two-paragraph thought unit.

### Story cluster

A cluster groups every useful format around a major event: main report, live updates, analysis, reaction, video, and background.

- Place a “Story so far” timeline after the opening or first major section.
- Label each item by format and timestamp.
- Highlight the canonical current story; older items remain accessible but visually subordinate.
- On mobile, render the cluster as a vertical ordered list, not a horizontal carousel.
- End with “Keep reading” containing three editorially related stories and one broader discovery link.

### Trust layer

- Corrections and updates are visible and timestamped.
- Author names link to bios with role and coverage focus.
- Analysis, opinion, sponsored, and affiliate content labels are unambiguous.
- AI-generated or materially AI-assisted editorial content requires a published disclosure policy before use.

## 18. Search UX direction

Search should reward quick name and topic lookup while supporting deep archive discovery.

- Desktop opens a focused search layer from the header; mobile opens a dedicated full-screen route or dialog.
- Autofocus only after an explicit user action. Do not steal focus on page load.
- Initial state shows recent searches on the device, trending topics, and direct section shortcuts.
- Typeahead begins after two characters and groups results into Stories, People/Teams, and Topics.
- Keyboard behavior: arrow through suggestions, Enter to open, Escape to close, and visible focus at every step.
- Results page uses query in the URL and supports filters for sport, content type, author, and date.
- Default sort is relevance with a clear “Newest” option.
- Highlight matches with weight and background, not color alone.
- No-results state corrects obvious spelling when confidence is high and offers adjacent topics, latest news, and a way to clear filters.
- Recent searches are private to the device and can be cleared individually or all at once.

## 19. Image-treatment rules

Photography is the main expressive material. Favor images that show access, consequence, and human detail over generic action wallpaper.

### Selection

- Lead with faces, tension, gesture, and scale.
- Mix game action with tunnel, bench, fan, fashion, training, and aftermath photography.
- Avoid repetitive ball-in-hand crops and stock celebration poses.
- Preserve editorial truth. Do not composite athletes into scenes they did not occupy.

### Crop system

- Lead mobile: 4:5 or 1:1.
- Lead desktop: 16:10 or art-directed 3:2.
- Standard landscape: 4:3.
- River thumbnail: 4:3.
- Portrait/profile: 3:4.
- Visual feature: flexible, with authored focal point and safe zones.

Use focal-point metadata so server and client crops preserve the subject. Never rely on `object-position: center` for every image.

### Processing

- Maintain natural skin tones and team-color fidelity.
- Use modest contrast and grain only as part of a commissioned feature package, never as a global filter.
- Photo scrims are neutral Blacktop at the minimum opacity needed for text contrast.
- Credits and captions stay attached to the media through responsive changes.
- Provide descriptive alt text for editorially meaningful images. Use empty alt text for purely redundant thumbnails.
- Generate responsive AVIF/WebP sources with explicit width and height. Protect the lead image from lazy loading; lazy-load below-fold media.

## 20. Motion and microinteraction rules

Motion should feel like broadcast switching: quick, clean, and decisive.

- Fast feedback: 100 to 140 ms.
- Standard transition: 180 to 220 ms.
- Large panel or menu: 240 to 320 ms.
- Preferred easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Use transform, opacity, clip, and color. Avoid animating layout dimensions during routine interactions.
- Page-load choreography is limited to the masthead lockup and lead package. Content remains visible if motion fails.
- Ticker content does not auto-marquee. New items may enter with a short crossfade and position shift.
- Do not scale or pan story images on hover.
- Preserve scroll position when returning from an article to a feed.
- Skeletons use a restrained luminance pulse, not an endless bright shimmer.
- Under `prefers-reduced-motion: reduce`, remove translation, parallax, auto-advance, and continuous pulses. Use instant state changes or a short crossfade.

## 21. Accessibility rules

Target WCAG 2.2 AA across the publication.

- Body text contrast: at least 4.5:1; large text: at least 3:1. The core body palette targets 7:1 or better.
- All controls and links are keyboard reachable with a visible focus indicator at least 2 CSS px thick.
- Minimum pointer target: 44 by 44 CSS px on touch surfaces.
- Use semantic landmarks: header, nav, main, article, aside, and footer.
- Provide one `h1` per page and preserve heading order even when visual styles differ.
- Include “Skip to main content” and, on article pages, “Skip to story.”
- Do not place critical text inside images.
- Live regions are narrowly scoped and do not announce every feed refresh.
- Video includes captions; audio-first work includes transcripts; significant prerecorded video includes audio description or an equivalent descriptive transcript.
- Charts, standings referenced within stories, and visual explainers require text summaries and non-color encodings.
- Save theme, font-size, and motion preferences without requiring an account.
- At 200 percent zoom and 320 CSS px width, content reflows without horizontal page scrolling.
- Test screen readers with VoiceOver/Safari and NVDA/Firefox or Chrome before release.
- Test forced colors, reduced motion, high contrast, keyboard-only use, and touch targets.

## 22. Anti-patterns

Everything Sports must never become:

- A scoreboard dashboard with news squeezed around league tables.
- A clone of ESPN, Bleacher Report, The Athletic, or a betting app.
- A wall of equal rounded cards.
- A black-and-neon “sports tech” skin.
- A vintage newspaper costume with decorative drop caps and faux aging.
- A graffiti, gold-chain, boombox, sneaker-outline, or street-court cliché.
- A collage of sports balls in the logo.
- A rainbow of league-specific section colors.
- A homepage that requires horizontal swiping for every category.
- A page where breaking labels appear on routine updates.
- A design full of gradients, glass panels, pill containers, oversized shadows, or animated image zooms.
- A feed that hides timestamps, sources, corrections, content type, or sponsorship.
- A typography system where every headline is condensed uppercase.
- A desktop composition merely stacked into mobile order without editorial reconsideration.
- A dark theme forced by category stereotype. The default reading canvas remains bright and direct.

## 23. Suggested implementation tokens

Use OKLCH as the canonical token value and keep the hex values above as design-tool and legacy fallbacks.

```css
:root {
  color-scheme: light;

  --color-canvas: oklch(1 0 0);
  --color-surface: oklch(0.958 0.003 106.4);
  --color-ink: oklch(0.155 0.004 285.9);
  --color-ink-muted: oklch(0.448 0.01 286);
  --color-border: oklch(0.881 0.005 106.5);
  --color-brand: oklch(0.555 0.155 34.1);
  --color-brand-hover: oklch(0.478 0.145 33.1);
  --color-accent: oklch(0.478 0.224 266.4);
  --color-success: oklch(0.512 0.116 157.1);
  --color-warning: oklch(0.547 0.127 61.2);
  --color-danger: oklch(0.5 0.182 29.5);

  --font-display: "League Gothic", "Arial Narrow", sans-serif;
  --font-editorial: "Source Serif 4", Georgia, serif;
  --font-ui: "Source Sans 3", Arial, sans-serif;

  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-ui: 0.9375rem;
  --text-body: 1rem;
  --text-body-lg: 1.125rem;
  --text-card: 1.375rem;
  --text-section: clamp(2.75rem, 8vw, 5rem);
  --text-lead: clamp(3.25rem, 12vw, 6rem);

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-24: 6rem;
  --space-32: 8rem;

  --radius-media: 0;
  --radius-control: 0.375rem;
  --radius-panel: 0.5rem;
  --radius-panel-max: 0.75rem;
  --radius-pill: 999px;

  --line-hairline: 1px;
  --line-strong: 2px;
  --content-max: 90rem;
  --article-max: 45rem;
  --gutter: clamp(1rem, 4vw, 4rem);

  --duration-fast: 120ms;
  --duration-standard: 200ms;
  --duration-panel: 280ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);

  --z-dropdown: 20;
  --z-sticky: 30;
  --z-backdrop: 40;
  --z-modal: 50;
  --z-toast: 60;
  --z-tooltip: 70;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-standard: 0ms;
    --duration-panel: 0ms;
  }
}

[data-theme="dark"] {
  color-scheme: dark;
  --color-canvas: oklch(0.155 0.004 285.9);
  --color-surface: oklch(0.206 0.006 285.9);
  --color-ink: oklch(1 0 0);
  --color-ink-muted: oklch(0.784 0.008 286.2);
  --color-border: oklch(0.327 0.007 286);
  --color-brand: oklch(0.624 0.166 35.4);
  --color-accent: oklch(0.732 0.138 269.5);
}
```

Suggested Tailwind semantic mapping:

```js
colors: {
  canvas: "var(--color-canvas)",
  surface: "var(--color-surface)",
  ink: "var(--color-ink)",
  muted: "var(--color-ink-muted)",
  border: "var(--color-border)",
  brand: { DEFAULT: "var(--color-brand)", hover: "var(--color-brand-hover)" },
  accent: "var(--color-accent)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)"
}
```

Implementation should consume semantic tokens, never use sport-specific raw hex classes in components. Component variants express role (`breaking`, `analysis`, `live`), not arbitrary visual names (`orange`, `dark`, `blue`).

## 24. Jason implementation brief

Build a mobile-first sports publication, not a sports dashboard. Start with the reading shell, header, The Wire, The Lead, the Now river, and one reusable sport package. Use asymmetric editorial composition on desktop and recompose deliberately for mobile.

Use Clean Sheet, Blacktop, and Burnt Signal as the unmistakable core. Replay Blue is functional, not decorative. Self-host League Gothic, Source Serif 4, and Source Sans 3 in WOFF2, with only critical faces preloaded. Treat the lead, river, brief, analysis, visual feature, and live unit as distinct editorial patterns rather than one configurable rounded card.

Ship the first frontend slice with semantic HTML, visible focus, 44 px touch targets, reserved media dimensions, real long headlines, loading/empty/error states, and reduced-motion behavior. Test at 320, 390, 768, 1024, and 1440 px before expanding the section catalog.

Jason should pause for explicit owner and Tech Bull approval on five decisions before visual implementation:

1. **Identity concept:** Full Bleed wordmark plus ES Cut monogram.
2. **Brand color:** Burnt Signal coral as the sole expressive brand carrier.
3. **Type voice:** League Gothic for compressed impact, Source Serif 4 for editorial reading, Source Sans 3 for utility.
4. **Homepage model:** edited edition plus early live stream, rather than a sequence of equal sport shelves.
5. **Theme scope:** light-default launch with selective Blacktop modules, then a complete user-controlled dark theme after the core reading experience is stable.

Once approved, produce the logo optical variants, a Figma token sheet, mobile homepage high-fidelity composition, desktop adaptation, and an article/story-cluster composition before broad component implementation.
