/*
 * game.js — Dice Roller for the alikonainofficial arcade.
 * A DOM game on top of js/arcade-shell.js (loaded first): the shell supplies the stage chrome,
 * store, sfx, share, rng, overlay and toast; the dice themselves are plain <img> elements.
 */
(function () {
  'use strict';

  var A = window.Arcade;

  // ---------------------------------------------------------------- constants
  var FACE_MS = 60;            // a tumbling die shows a new face this often
  var LAND_MS = [750, 1000];   // Player 1 lands at 750 ms, Player 2 at 1,000 ms
  var VERDICT_DELAY = 200;     // verdict follows the last landing bounce
  var WOBBLE_DEG = 28;         // starting wobble, eases out to 0 at landing
  var SHAKE_THRESHOLD = 18;    // m/s²
  var SHAKE_DEBOUNCE = 1500;   // ms

  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ---------------------------------------------------------------- state
  var state = {
    names: ['Player 1', 'Player 2'],
    diceCount: 2,
    rolling: false,
    values: [[], []]           // last landed faces per player
  };

  // ---------------------------------------------------------------- shell + DOM
  A.init({
    game: 'dice',
    title: 'Dice Roller',
    onRestart: function () { /* R key: nothing to restart yet */ },
    // The shell's P/Escape pause overlay has no meaning for a dice roll: undo it at once.
    onPauseChange: function (paused) { if (paused) A.pause(false); }
  });

  var app = document.getElementById('dice-app');
  var frame = document.querySelector('.arcade-frame');
  frame.style.aspectRatio = '';
  frame.appendChild(app);

  var board = document.getElementById('board');
  var cols = [board.querySelector('.die[data-p="0"]'), board.querySelector('.die[data-p="1"]')];
  var nameBtns = [app.querySelector('.name[data-p="0"]'), app.querySelector('.name[data-p="1"]')];
  var verdictEl = app.querySelector('.verdict');
  var rollBtn = document.getElementById('roll');
  var shakeBtn = document.getElementById('shake');

  // Preload the six faces so the tumble never flashes a blank image.
  for (var f = 1; f <= 6; f++) { new Image().src = faceSrc(f); }

  // ---------------------------------------------------------------- helpers
  function faceSrc(n) { return 'images/dice' + n + '.png'; }
  function rollValue() { return A.rng.secureInt(6) + 1; }
  function sum(arr) { return arr.reduce(function (s, v) { return s + v; }, 0); }
  function restartAnim(elm, cls) { elm.classList.remove(cls); void elm.offsetWidth; elm.classList.add(cls); }

  function wakeAudio() {
    var c = A.sfx.context();
    if (c && c.state === 'suspended' && c.resume) c.resume();
  }

  // ---------------------------------------------------------------- render
  function renderNames() {
    nameBtns.forEach(function (b, p) { b.textContent = state.names[p]; });
    cols.forEach(function (c, p) { c.setAttribute('aria-label', state.names[p] + ' dice'); });
  }

  function buildDice() {
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
      col.classList.remove('land', 'win', 'lose');
    });
  }

  function setVerdict(text) { verdictEl.textContent = text; }

  // ---------------------------------------------------------------- the roll
  function trigger() {
    if (state.rolling) return;
    roll();
  }

  function roll() {
    state.rolling = true;
    wakeAudio();
    rollBtn.disabled = true;
    setVerdict('');
    cols.forEach(function (c) { c.classList.remove('land', 'win', 'lose'); });

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
    if (winner === null) {
      setVerdict("It's a draw");
      A.sfx.play('tick');
    } else {
      cols[winner].classList.add('win');
      cols[1 - winner].classList.add('lose');
      setVerdict('🚩 ' + state.names[winner] + ' wins!');
      A.sfx.play('score');
    }
    state.rolling = false;
    rollBtn.disabled = false;
  }

  // ---------------------------------------------------------------- input
  rollBtn.addEventListener('click', function (e) {
    if (e.detail) rollBtn.blur(); // mouse/touch click: keep Space free for the next roll
    trigger();
  });

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
  renderNames();
  buildDice();
})();
