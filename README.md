# Dice Roller

Roll dice against a friend, or let the dice settle a decision. Part of the arcade at
[alikonainofficial.github.io](https://alikonainofficial.github.io/#arcade).

**Play:** https://alikonainofficial.github.io/randomdicegenerator/

## How to play

- **Roll** with the Roll button, **Space** or **Enter**, a tap or click anywhere on the dice,
  or by **shaking your phone**. Player 1's dice land first; Player 2's land a quarter-second later.
- **Rename players:** click (or tap) a name, type up to 14 characters, then press Enter or click away.
  Names are remembered on this device. Escape cancels.
- **Dice per player:** 1, 2, 3 or 5. The higher total wins the roll.
- **Series:** Single roll, Best of 3 or Best of 5. Ties re-roll automatically ("Tie — rolling off…").
  When someone is one win away you'll see *Match point*; the match ends with a banner,
  **Rematch** and **Copy result**. Press **R** to start the current match over.
- **Streaks:** win consecutive matches under the same name to build a 🔥 streak.
  The longest one is shown as *Best streak*.
- **Settle it:** switch the mode to *Settle it*, type the two options (for example Pizza and Sushi),
  and roll. It defaults to Best of 3 and ends with a verdict like `🎲 Pizza beat Sushi 2–1`.
- **Copy result** puts a one-line summary on your clipboard:
  `🎲 Ali beat Sara 3–1 (best of 5)`, `🎲 Ali 9 vs Sara 7` for a single roll, or the Settle-it verdict.
- **History** (below the dice) lists your last 10 rolls, newest first. The bar chart next to it
  counts every face rolled in this session, so you can see the dice are fair.

### Shake to roll

On Android, shaking works straight away. On iPhone and iPad, tap **Enable shake** once and allow
motion access when Safari asks. A shake rolls at most once every 1.5 seconds.

### Sound and motion

Use the **Sound** button at the top to mute. If your device asks for reduced motion, the dice
don't tumble (they simply change face when they land) and there is no confetti.

## Privacy

Nothing leaves your browser. There is no server, no analytics, and no font or CDN requests:
names, history and streaks are kept in your browser's `localStorage` under `arcade.dice.*`
(`names`, `history`, `streak`, `best`, `plays`). Clearing site data resets them. Dice values come
from `crypto.getRandomValues`.

## Files

```
index.html
css/arcade-shell.css   shared arcade shell (identical in every arcade repo; don't edit here)
css/game.css
js/arcade-shell.js     shared arcade shell (identical in every arcade repo; don't edit here)
js/game.js
images/dice1..6.png
```

A plain static site: no build step, no dependencies. To run it locally, serve the folder with any
static server (for example `python3 -m http.server`) and open the printed address.
