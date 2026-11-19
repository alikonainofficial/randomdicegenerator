/*
 * game.js — Dice Roller for the alikonainofficial arcade.
 * A DOM game on top of js/arcade-shell.js (loaded first): the shell supplies the stage chrome,
 * store, sfx, share, rng, overlay and toast; the dice themselves are plain <img> elements.
 *
 * Storage (via Arcade.store, so every key is prefixed "arcade.dice."):
 *   names   ['Player 1', 'Player 2']
 *   streak  { name, count }        consecutive match wins by the same name
 *   best    number                 longest match-win streak
 *   plays   number                 matches completed
 *   history [{ t, a: [4,3], b: [6,2], winner: 0|1|null }]   last 10 rolls, oldest first
 */
(function () {
  'use strict';

  var A = window.Arcade;

  // ---------------------------------------------------------------- constants
  var FACE_MS = 60;            // a tumbling die shows a new face this often
  var LAND_MS = [750, 1000];   // Player 1 lands at 750 ms, Player 2 at 1,000 ms
  var VERDICT_DELAY = 200;     // verdict follows the last landing bounce
  var ROLLOFF_DELAY = 600;     // a tie re-rolls by itself after this long
  var BANNER_DELAY = 650;      // let the deciding round's glow show before the match banner
  var WOBBLE_DEG = 28;         // starting wobble, eases out to 0 at landing
  var SHAKE_THRESHOLD = 18;    // m/s²
  var SHAKE_DEBOUNCE = 1500;   // ms
  var NAME_MAX = 14;
  var HISTORY_MAX = 10;
  var DEFAULT_NAMES = ['Player 1', 'Player 2'];
  var DEFAULT_OPTIONS = ['Pizza', 'Sushi'];   // an empty Settle-it field reads as its placeholder
  var SERIES_LABEL = { 1: 'Single', 2: 'Best of 3', 3: 'Best of 5' };
  var CONFETTI_COLOURS = [A.theme.brass, A.theme.coral, A.theme.cyan, A.theme.magenta, A.theme.green, A.theme.yellow];

  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ---------------------------------------------------------------- state
  var state = {
    names: DEFAULT_NAMES.slice(),   // replaced from storage right after Arcade.init (the store is per game id)
    mode: 'players',                // 'players' | 'settle'
    options: ['', ''],              // Settle-it choices (not persisted: session only)
    playersTarget: 1,               // series length to restore when leaving Settle it
    diceCount: 2,
    history: [],
    faceCounts: [0, 0, 0, 0, 0, 0], // every die landed this session, faces 1..6
    rolling: false,
    values: [[], []],          // last landed faces per player
    lastTotals: null           // totals of the last decisive roll, for the single-roll share line
  };
  var series = newSeries(1);

  function newSeries(target) { return { target: target, wins: [0, 0], round: 0, over: false, winner: null }; }

  function loadNames() {
    var n = A.store.get('names', null);
    if (!Array.isArray(n) || n.length !== 2) return DEFAULT_NAMES.slice();
    return n.map(function (s, i) { return typeof s === 'string' && s.trim() ? s.trim().slice(0, NAME_MAX) : DEFAULT_NAMES[i]; });
  }

  function loadHistory() {
    var h = A.store.get('history', []);
    if (!Array.isArray(h)) return [];
    return h.filter(function (r) {
      return r && Array.isArray(r.a) && Array.isArray(r.b) && (r.winner === 0 || r.winner === 1 || r.winner === null);
    }).slice(-HISTORY_MAX);
  }

  // What to call side p right now: a player's name, or a Settle-it option.
  function label(p) {
    if (state.mode === 'settle') return state.options[p].trim() || DEFAULT_OPTIONS[p];
    return state.names[p];
  }

  // ---------------------------------------------------------------- shell + DOM
  A.init({
    game: 'dice',
    title: 'Dice Roller',
    onRestart: function () { if (!state.rolling) rematch(); },   // R key
    // The shell's P/Escape pause overlay has no meaning for a dice roll: undo it at once.
    onPauseChange: function (paused) { if (paused) A.pause(false); }
  });

  state.names = loadNames();
  state.history = loadHistory();

  var app = document.getElementById('dice-app');
  var frame = document.querySelector('.arcade-frame');
  frame.style.aspectRatio = '';
  frame.appendChild(app);

  var board = document.getElementById('board');
  var cols = [board.querySelector('.die[data-p="0"]'), board.querySelector('.die[data-p="1"]')];
  var players = [app.querySelector('.player[data-p="0"]'), app.querySelector('.player[data-p="1"]')];
  var nameBtns = [app.querySelector('.name[data-p="0"]'), app.querySelector('.name[data-p="1"]')];
  var optInputs = [app.querySelector('.opt-input[data-p="0"]'), app.querySelector('.opt-input[data-p="1"]')];
  var scoreEls = [app.querySelector('.score[data-p="0"]'), app.querySelector('.score[data-p="1"]')];
  var verdictEl = app.querySelector('.verdict');
  var calloutEl = app.querySelector('.callout');
  var streakEl = app.querySelector('.streak');
  var rollBtn = document.getElementById('roll');
  var copyBtn = document.getElementById('copy');
  var shakeBtn = document.getElementById('shake');
  var segs = {
    mode: app.querySelector('.seg[data-ctl="mode"]'),
    dice: app.querySelector('.seg[data-ctl="dice"]'),
    series: app.querySelector('.seg[data-ctl="series"]')
  };
  var historyList = app.querySelector('.history-list');
  var historyEmpty = app.querySelector('.history-empty');
  var historyCount = app.querySelector('.history-count');
  var barsEl = app.querySelector('.histogram .bars');

  // Preload the six faces so the tumble never flashes a blank image.
  for (var f = 1; f <= 6; f++) { new Image().src = faceSrc(f); }

  // ---------------------------------------------------------------- helpers
  function faceSrc(n) { return 'images/dice' + n + '.png'; }
  function rollValue() { return A.rng.secureInt(6) + 1; }
  function sum(arr) { return arr.reduce(function (s, v) { return s + v; }, 0); }
  function restartAnim(elm, cls) { elm.classList.remove(cls); void elm.offsetWidth; elm.classList.add(cls); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function wakeAudio() {
    var c = A.sfx.context();
    if (c && c.state === 'suspended' && c.resume) c.resume();
  }

  // ---------------------------------------------------------------- render
  function renderNames() {
    var settle = state.mode === 'settle';
    nameBtns.forEach(function (b, p) { b.textContent = state.names[p]; b.hidden = settle; });
    optInputs.forEach(function (inp, p) { inp.hidden = !settle; if (inp.value !== state.options[p]) inp.value = state.options[p]; });
    cols.forEach(function (c, p) { c.setAttribute('aria-label', label(p) + ' dice'); });
  }

  function buildDice() {
    board.setAttribute('data-count', state.diceCount);
    cols.forEach(function (col, p) {
      col.innerHTML = '';
      var vals = state.values[p];
      for (var i = 0; i < state.diceCount; i++) {
        var img = document.createElement('img');
        var v = vals[i] || 6;
        img.src = faceSrc(v);
        img.alt = 'Die showing ' + v;
        img.draggable = false;
        col.appendChild(img);
      }
    });
    clearOutcome();
  }

  function clearOutcome() { cols.forEach(function (c) { c.classList.remove('land', 'win', 'lose'); }); }

  function renderSegs() {
    setPressed(segs.mode, state.mode);
    setPressed(segs.dice, state.diceCount);
    setPressed(segs.series, series.target);
  }
  function setPressed(seg, v) {
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(String(b.dataset.v) === String(v))); });
  }

  function renderScore() {
    scoreEls.forEach(function (el, p) {
      if (series.target === 1) { el.innerHTML = ''; el.hidden = true; return; }
      el.hidden = false;
      var html = '';
      for (var i = 0; i < series.target; i++) html += '<span class="pip' + (i < series.wins[p] ? ' on' : '') + '">' + (i < series.wins[p] ? '●' : '○') + '</span>';
      el.innerHTML = html;
      el.setAttribute('aria-label', label(p) + ': ' + series.wins[p] + ' of ' + series.target + ' rounds');
    });
  }

  // "Match point — Ali" when a player is one win away (best-of series only), shown before the roll.
  function renderCallout() {
    var text = '';
    if (series.target > 1 && !series.over) {
      var on = [0, 1].filter(function (p) { return series.wins[p] === series.target - 1; });
      if (on.length) text = 'Match point — ' + on.map(label).join(' & ');
    }
    calloutEl.textContent = text;
  }

  function renderStreak() {
    var s = A.store.get('streak', null);
    if (state.mode === 'players' && s && s.count >= 2 && state.names.indexOf(s.name) !== -1) {
      streakEl.textContent = '🔥 ' + s.name + ' on a ' + s.count + '-match streak';
      streakEl.hidden = false;
    } else {
      streakEl.hidden = true;
    }
  }

  function renderHud() {
    var items = {};
    if (series.target > 1) items.Round = series.over ? '—' : String(series.wins[0] + series.wins[1] + 1);
    items.Matches = String(A.store.get('plays', 0) | 0);
    items['Best streak'] = String(A.store.get('best', 0) | 0);
    A.ui.hud(items);
  }

  function setVerdict(text) { verdictEl.textContent = text; }

  function setBusy(b) {
    state.rolling = b;
    rollBtn.disabled = b;
    app.classList.toggle('is-rolling', b);
    Array.prototype.forEach.call(app.querySelectorAll('.seg button'), function (btn) { btn.disabled = b; });
  }

  // History line: "Ali 4+3=7 · Sara 6+2=8 → Sara" (labels are whatever the sides are called now).
  function historyLine(r) {
    function side(p, vals) {
      var total = sum(vals);
      return label(p) + ' ' + (vals.length > 1 ? vals.join('+') + '=' + total : String(total));
    }
    return side(0, r.a) + ' · ' + side(1, r.b) + ' → ' + (r.winner === null ? 'draw' : label(r.winner));
  }

  function renderHistory() {
    historyList.innerHTML = '';
    for (var i = state.history.length - 1; i >= 0; i--) {   // newest first
      var li = document.createElement('li');
      li.textContent = historyLine(state.history[i]);
      historyList.appendChild(li);
    }
    historyEmpty.hidden = state.history.length > 0;
    historyCount.textContent = state.history.length ? '(' + state.history.length + ')' : '';
  }

  function renderHistogram() {
    var max = Math.max.apply(null, state.faceCounts.concat([1]));
    var html = '';
    for (var f = 0; f < 6; f++) {
      var n = state.faceCounts[f];
      html += '<div class="bar" data-face="' + (f + 1) + '" title="' + (f + 1) + ': ' + n + '">' +
        '<span class="bar-n">' + n + '</span>' +
        '<span class="bar-fill" style="height:' + (n / max * 100).toFixed(1) + '%"></span>' +
        '<span class="bar-face">' + (f + 1) + '</span></div>';
    }
    barsEl.innerHTML = html;
    barsEl.setAttribute('aria-label', 'Faces rolled this session: ' + state.faceCounts.map(function (n, f) { return (f + 1) + ' × ' + n; }).join(', '));
  }

  function renderAll() {
    renderNames(); renderSegs(); renderScore(); renderCallout(); renderStreak(); renderHud();
    renderHistory(); renderHistogram();
  }

  // ---------------------------------------------------------------- the roll
  function trigger() {
    if (state.rolling) return;
    if (series.over) {               // a finished match: the next roll starts a fresh one
      if (A.ui.overlayVisible()) A.ui.hideOverlay();
      rematch();
    }
    roll();
  }

  function roll() {
    setBusy(true);
    wakeAudio();
    copyBtn.hidden = true;
    setVerdict('');
    clearOutcome();

    var result = [[], []];
    for (var p = 0; p < 2; p++) for (var i = 0; i < state.diceCount; i++) result[p].push(rollValue());

    A.sfx.play('rattle');

    var start = performance.now();
    var landed = [false, false];
    var timer = null;
    if (!reducedMotion.matches) {
      var tumble = function () {
        var t = performance.now() - start;
        for (var p = 0; p < 2; p++) {
          if (landed[p]) continue;
          var k = Math.min(1, t / LAND_MS[p]);
          var amp = WOBBLE_DEG * (1 - k) * (1 - k);          // ease-out
          var imgs = cols[p].children;
          for (var i = 0; i < imgs.length; i++) {
            imgs[i].src = faceSrc(1 + Math.floor(Math.random() * 6)); // cosmetic only
            var rot = (Math.random() * 2 - 1) * amp;
            var lift = -Math.random() * amp * 0.35;
            imgs[i].style.transform = 'translateY(' + lift.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg)';
          }
        }
      };
      tumble();
      timer = setInterval(tumble, FACE_MS);
    }

    setTimeout(function () { landed[0] = true; land(0, result[0]); }, LAND_MS[0]);
    setTimeout(function () {
      landed[1] = true;
      clearInterval(timer);
      land(1, result[1]);
      setTimeout(function () { resolve(result); }, VERDICT_DELAY);
    }, LAND_MS[1]);
  }

  function land(p, vals) {
    state.values[p] = vals.slice();
    var imgs = cols[p].children;
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].src = faceSrc(vals[i]);
      imgs[i].alt = 'Die showing ' + vals[i];
      imgs[i].style.transform = '';
    }
    restartAnim(cols[p], 'land');
    A.sfx.play('thud');
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function resolve(result) {
    var a = sum(result[0]), b = sum(result[1]);
    var winner = a > b ? 0 : b > a ? 1 : null;
    series.round++;
    recordRoll(result, winner);

    if (winner === null) {
      // Tie: automatic roll-off. Stay busy so no other input sneaks in between.
      setVerdict('Tie — rolling off…');
      A.sfx.play('tick');
      setTimeout(roll, ROLLOFF_DELAY);
      return;
    }

    state.lastTotals = [a, b];
    cols[winner].classList.add('win');
    cols[1 - winner].classList.add('lose');
    series.wins[winner]++;
    A.sfx.play('score');

    if (series.wins[winner] >= series.target) {
      series.winner = winner;
      setVerdict(state.mode === 'settle' ? settleLine() : '🚩 ' + label(winner) + ' wins!');
      matchWon(winner);
    } else {
      setVerdict('🚩 ' + label(winner) + ' takes the round');
      renderScore(); renderCallout(); renderHud();
      setBusy(false);
    }
  }

  function recordRoll(result, winner) {
    state.history.push({ t: Date.now(), a: result[0].slice(), b: result[1].slice(), winner: winner });
    if (state.history.length > HISTORY_MAX) state.history = state.history.slice(-HISTORY_MAX);
    A.store.set('history', state.history);
    result[0].concat(result[1]).forEach(function (v) { state.faceCounts[v - 1]++; });
    renderHistory();
    renderHistogram();
  }

  // ---------------------------------------------------------------- match end
  function matchWon(w) {
    series.over = true;
    series.winner = w;
    A.store.bumpPlays();

    // Streaks are about people, so only Players-mode matches count towards them.
    var streak = null;
    var name = label(w);
    if (state.mode === 'players') {
      var prev = A.store.get('streak', null);
      streak = prev && prev.name === name ? { name: name, count: (prev.count | 0) + 1 } : { name: name, count: 1 };
      A.store.set('streak', streak);
      A.store.best('best', streak.count);
    }

    renderScore(); renderCallout(); renderStreak(); renderHud();
    setBusy(false);
    copyBtn.hidden = false;

    if (series.target === 1) return; // a single roll: the verdict line is the whole ceremony

    setBusy(true); // hold input until the banner is up
    setTimeout(function () {
      setBusy(false);
      A.sfx.play('win');
      confetti();
      var lines = [];
      if (streak && streak.count >= 2) lines.push('🔥 ' + esc(name) + ' on a ' + streak.count + '-match streak');
      var settle = state.mode === 'settle';
      A.ui.overlay({
        kicker: (settle ? 'Settled · ' : '') + SERIES_LABEL[series.target],
        title: settle ? esc(settleLine()) : '🏆 ' + esc(name) + ' wins ' + series.wins[w] + '–' + series.wins[1 - w],
        lines: lines,
        buttons: [
          { label: 'Rematch', onClick: rematch },
          { label: 'Copy result', onClick: copyResult, keepOpen: true }
        ],
        hint: 'Space or tap for a rematch',
        action: rematch
      });
    }, BANNER_DELAY);
  }

  function rematch() {
    if (A.ui.overlayVisible()) A.ui.hideOverlay();
    series = newSeries(series.target);
    state.lastTotals = null;
    copyBtn.hidden = true;
    setVerdict('');
    clearOutcome();
    renderAll();
  }

  // "🎲 Pizza beat Sushi 2–1"
  function settleLine() {
    var w = series.winner;
    return '🎲 ' + label(w) + ' beat ' + label(1 - w) + ' ' + series.wins[w] + '–' + series.wins[1 - w];
  }

  function shareText() {
    var w = series.winner, n = [label(0), label(1)];
    if (w === null) return '';
    if (state.mode === 'settle') return settleLine();
    if (series.target === 1) {
      var t = state.lastTotals;
      return '🎲 ' + n[0] + ' ' + t[0] + ' vs ' + n[1] + ' ' + t[1];
    }
    return '🎲 ' + n[w] + ' beat ' + n[1 - w] + ' ' + series.wins[w] + '–' + series.wins[1 - w] +
      ' (best of ' + (series.target * 2 - 1) + ')';
  }

  function copyResult() { var s = shareText(); if (s) A.share.copy(s, 'Result copied'); }

  // DOM confetti: 40 small squares burst upward from the middle of the frame, gone after 1.2 s.
  function confetti() {
    var box = document.createElement('div');
    box.className = 'confetti';
    for (var i = 0; i < 40; i++) {
      var c = document.createElement('i');
      var dx = (Math.random() * 2 - 1) * 260;
      var dy = -(140 + Math.random() * 260);
      c.style.left = (40 + Math.random() * 20) + '%';
      c.style.background = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length];
      c.style.setProperty('--dx', dx.toFixed(0) + 'px');
      c.style.setProperty('--dy', dy.toFixed(0) + 'px');
      c.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
      c.style.animationDelay = (Math.random() * 120).toFixed(0) + 'ms';
      box.appendChild(c);
    }
    frame.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1200);
  }

  // ---------------------------------------------------------------- names
  function editName(p) {
    var btn = nameBtns[p];
    if (btn.hidden) return;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'name-input';
    input.maxLength = NAME_MAX;
    input.value = state.names[p];
    input.setAttribute('aria-label', 'Name for player ' + (p + 1));
    btn.hidden = true;
    btn.parentNode.insertBefore(input, btn);
    input.focus();
    input.select();

    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      if (save) {
        var v = input.value.trim().slice(0, NAME_MAX);
        if (v) {
          state.names[p] = v;
          A.store.set('names', state.names.slice());
        }
      }
      input.parentNode.removeChild(input);
      btn.hidden = false;
      renderAll();
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); btn.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); btn.focus(); }
    });
    input.addEventListener('blur', function () { finish(true); });
  }
  nameBtns.forEach(function (b, p) { b.addEventListener('click', function () { editName(p); }); });

  // ---------------------------------------------------------------- Settle-it options
  optInputs.forEach(function (inp, p) {
    inp.addEventListener('input', function () {
      state.options[p] = inp.value.slice(0, NAME_MAX);
      renderScore(); renderCallout(); renderHistory();
      cols[p].setAttribute('aria-label', label(p) + ' dice');
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); inp.blur(); }
    });
  });

  // ---------------------------------------------------------------- controls
  function onSeg(seg, apply) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || state.rolling) return;
      if (e.detail) b.blur();
      apply(b.dataset.v);
    });
  }
  onSeg(segs.mode, function (v) {
    if (v === state.mode) return;
    if (v === 'settle') {
      state.playersTarget = series.target;
      state.mode = 'settle';
      series = newSeries(2);          // Settle it defaults to Best of 3
    } else {
      state.mode = 'players';
      series = newSeries(state.playersTarget);
    }
    rematch();
    if (state.mode === 'settle' && !state.options[0] && !state.options[1]) optInputs[0].focus();
  });
  onSeg(segs.dice, function (v) {
    v = +v;
    if (v === state.diceCount) return;
    state.diceCount = v;
    state.values = [[], []];
    buildDice();
    rematch();
  });
  onSeg(segs.series, function (v) {
    v = +v;
    if (v === series.target && !series.over) return;
    series = newSeries(v);
    rematch();
  });

  // ---------------------------------------------------------------- input
  rollBtn.addEventListener('click', function (e) {
    if (e.detail) rollBtn.blur(); // mouse/touch click: keep Space free for the next roll
    trigger();
  });
  copyBtn.addEventListener('click', function (e) { if (e.detail) copyBtn.blur(); copyResult(); });

  board.addEventListener('click', function () { trigger(); });

  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return; // shell consumed it
    var t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(t.tagName)) return; // let native activation run
    e.preventDefault();
    trigger();
  });

  // Shake to roll. iOS Safari only delivers motion events after DeviceMotionEvent.requestPermission()
  // is called from a tap, hence the "Enable shake" button. Current Chrome also exposes that function
  // (it resolves 'granted' with no prompt), so: listen straight away everywhere, offer the button
  // only on touch devices where the function exists, and hide it as soon as real motion data arrives
  // (which proves no permission step is needed on this device).
  var lastShake = 0;
  var motionSeen = false;
  function onMotion(e) {
    var a = e.acceleration;
    if (!a || a.x == null) a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    if (!motionSeen) { motionSeen = true; shakeBtn.hidden = true; }
    var mag = Math.sqrt(a.x * a.x + a.y * a.y + (a.z || 0) * (a.z || 0));
    var t = Date.now();
    if (mag > SHAKE_THRESHOLD && t - lastShake > SHAKE_DEBOUNCE) {
      lastShake = t;
      trigger();
    }
  }
  if (typeof window.DeviceMotionEvent !== 'undefined') {
    window.addEventListener('devicemotion', onMotion);
    if (typeof window.DeviceMotionEvent.requestPermission === 'function' && A.touch.isCoarse()) {
      shakeBtn.hidden = false;
      shakeBtn.addEventListener('click', function () {
        window.DeviceMotionEvent.requestPermission().then(function (res) {
          if (res === 'granted') {
            shakeBtn.hidden = true;
            A.ui.toast('Shake to roll is on');
          } else {
            A.ui.toast('Motion access was declined');
          }
        }, function () { A.ui.toast('Motion access is not available'); });
      });
    }
  }

  // ---------------------------------------------------------------- start
  buildDice();
  renderAll();
})();
