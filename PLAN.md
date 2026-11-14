# Dice Roller — implementation plan

Repo: `alikonainofficial/randomdicegenerator` · Live: `https://alikonainofficial.github.io/randomdicegenerator/` · Game id for storage: `dice`

## 0. What the repo is today

`index.html` (heading "Refresh Me", two `.dice` blocks with `<p>Player 1</p>` / `<p>Player 2</p>` and an `<img>` each, Google Fonts), `index.js` (runs once at load: two `Math.random()` rolls, swaps the image `src` to `images/dice{n}.png`, sets the heading to the winner), `styles.css`, six PNG dice faces.

Known defects: the only way to roll again is to reload the page; no button, no animation, no state, no sound; the result appears instantly so there is no moment.

This stays a DOM page (no canvas). Use the shell for store, sfx, share, rng and the stage chrome. Put a `<canvas id="gameCanvas" width="800" height="600" style="display:none">` in the page so `Arcade.init` has something to wrap (the inline style beats the shell's `.arcade-frame canvas { display:block }`), then move your DOM into the frame: `const frame = document.querySelector('.arcade-frame'); frame.style.aspectRatio = ''; frame.appendChild(yourRootElement)`. Overlays, HUD, toast, mute and the back link then work unchanged.

## 1. Target

A roll that is an event (button / Space / tap / shake, tumble animation, staggered landing, rattle + thud, winner bounce), a best-of series with editable names and a streak, a "Settle it" mode with custom options and a copyable verdict, 1–5 dice, and a visible roll history + session histogram.

## 2. File layout after

```
index.html
css/arcade-shell.css  (copied, unmodified)
css/game.css
js/arcade-shell.js    (copied, unmodified)
js/game.js
images/dice1..6.png   (keep)
```
Delete `styles.css`, `index.js`, the Google Fonts link.

## 3. Steps

### Step 1 — Roll button and the roll animation
1. Markup: a header row (`Player 1` / `Player 2` names as `<button class="name">` so they can be renamed), two `.die` columns each holding `<img>` ×`diceCount`, a big `<button id="roll">Roll</button>`, a verdict line `<div class="verdict">`.
2. Roll on: button click, `Space`/`Enter` keydown, tap anywhere on the dice area, and `devicemotion` with acceleration magnitude > 18 m/s² (debounced 1.5 s; request permission on iOS via `DeviceMotionEvent.requestPermission` behind a "Enable shake" button that appears only when that function exists).
3. Random values via `Arcade.rng.secureInt(6) + 1`.
4. Animation (CSS + JS): for 750 ms each die cycles a random face every 60 ms with a `transform: rotate()` wobble that eases out; **Player 1's dice land at 750 ms, Player 2's at 1,000 ms** (held suspense). While rolling, the roll button is disabled and the verdict is blank.
5. Sound: `Arcade.sfx.play('rattle')` at start, `Arcade.sfx.play('thud')` on each landing; on the verdict `Arcade.sfx.play('score')` for a win, `Arcade.sfx.play('tick')` for a draw.
6. Landing: `.land` class (scale 1.15 → 1 bounce, 200 ms). Winner's dice get `.win` (gold glow pulse); loser's `.lose` (small shake). `navigator.vibrate && navigator.vibrate(30)` on landing.
7. Verdict text: `🚩 Ali wins!`, `It's a draw`, styled in coral.

Acceptance: every roll is a visible 1-second event; no page reload; works on phone with tap and (where allowed) shake.

### Step 2 — Series, names, streaks
1. Controls row: dice per player `1 | 2 | 3 | 5` (segmented buttons), series `Single | Best of 3 | Best of 5`.
2. Names: clicking a name turns it into an `<input maxlength="14">`; Enter/blur saves to `arcade.dice.names` → `['Ali', 'Sara']`.
3. Series state: `{ target: 2|3, wins: [0, 0], round }`. After each roll compare totals; draws trigger an automatic **roll-off** ("Tie — rolling off…", 600 ms later, roll again). Scoreboard under the names: `● ● ○`.
4. Match point: when a player is one win away, show "Match point — {name}" above the dice before the roll.
5. Match win: overlay-style banner `🏆 {name} wins 3–1`, a confetti burst (DOM: 40 absolutely-positioned 6×6 squares in theme colours animated upward with CSS, removed after 1.2 s), `Arcade.sfx.play('win')`. Buttons: "Rematch", "Copy result".
6. Streak: `arcade.dice.streak` → `{ name, count }` for consecutive match wins by the same name; show "🔥 {name} on a 3-match streak" when ≥ 2.

### Step 3 — "Settle it" mode, share, history
1. Mode toggle at the top: **Players** / **Settle it**. In Settle it the two name fields become option fields ("Pizza" / "Sushi") with placeholders, series defaults to Best of 3, and the verdict reads `🎲 Pizza beat Sushi 2–1`.
2. Copy result (`Arcade.share.copy`): Players mode `🎲 Ali beat Sara 3–1 (best of 5)`; single roll `🎲 Ali 9 vs Sara 7`; Settle it as above.
3. History panel (collapsible, below): last 10 rolls as `Ali 4+3=7 · Sara 6+2=8 → Sara`, newest first, persisted in `arcade.dice.history`.
4. Session histogram: six bars (faces 1–6) counting every die rolled this session, drawn as a tiny inline SVG or six `div`s with heights; caption "Fair dice: counts for this session".

### Step 4 — Polish and ship
- Theme via the shell CSS; the dice PNGs are white-on-black-dots and look fine on the dark background; add a subtle `drop-shadow`.
- Reduced motion: no tumble (just swap the face after the delay) and no confetti.
- README: how to rename, series, settle-it, shake-to-roll, nothing leaves the browser.

## 4. Data formats

- `arcade.dice.best` → number: longest match-win streak (so the portfolio card can show "Best streak 4")
- `arcade.dice.names` → `['Player 1', 'Player 2']`
- `arcade.dice.streak` → `{ name, count }`
- `arcade.dice.history` → array of `{ t, a: [4,3], b: [6,2], winner: 0|1|null }`, max 10
- `arcade.dice.plays` → number of matches completed
- Share strings as in Step 3.2

## 5. Test checklist

- [ ] Roll via button, Space, tap, and shake (Android Chrome; iOS after permission)
- [ ] Second player's dice land ~250 ms after the first
- [ ] Draw triggers an automatic roll-off; series ends at the target with the banner
- [ ] Names persist across reloads; history shows 10 newest
- [ ] Histogram counts match the history
- [ ] Copy string correct in all three cases
- [ ] No console errors; no network requests beyond the page's files
