/* ==========================================================================
   Nebulactyl — nebula.js
   Shared front-end fx: starfield background, synthesized sound effects
   (WebAudio, no audio files needed), toast notifications and a small
   confetti burst for reward celebrations.
   ========================================================================== */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ *
   * Starfield canvas
   * ------------------------------------------------------------------ */

  function initStarfield() {
    var canvas = document.getElementById("nebula-canvas");
    if (!canvas || reduceMotion) return;
    var ctx = canvas.getContext("2d");
    var stars = [];
    var shootingStars = [];
    var w, h, dpr;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    }

    function buildStars() {
      var count = Math.min(160, Math.floor((w * h) / 9000));
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.3 + 0.2,
          baseAlpha: Math.random() * 0.6 + 0.2,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
          phase: Math.random() * Math.PI * 2,
          hue: Math.random() > 0.85 ? "168,130,255" : "255,255,255"
        });
      }
    }

    function maybeSpawnShootingStar() {
      if (Math.random() < 0.003 && shootingStars.length < 2) {
        var startX = Math.random() * w * 0.6;
        shootingStars.push({
          x: startX,
          y: Math.random() * h * 0.4,
          vx: 6 + Math.random() * 5,
          vy: 3 + Math.random() * 2,
          life: 1
        });
      }
    }

    var t = 0;
    function frame() {
      t++;
      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var alpha = s.baseAlpha + Math.sin(t * s.twinkleSpeed + s.phase) * 0.25;
        if (alpha < 0) alpha = 0;
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + s.hue + "," + alpha.toFixed(2) + ")";
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      maybeSpawnShootingStar();
      for (var j = shootingStars.length - 1; j >= 0; j--) {
        var sh = shootingStars[j];
        ctx.beginPath();
        var grad = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 8, sh.y - sh.vy * 8);
        grad.addColorStop(0, "rgba(255,255,255,0.9)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx * 8, sh.y - sh.vy * 8);
        ctx.stroke();
        sh.x += sh.vx;
        sh.y += sh.vy;
        sh.life -= 0.02;
        if (sh.life <= 0 || sh.x > w + 50 || sh.y > h + 50) shootingStars.splice(j, 1);
      }

      requestAnimationFrame(frame);
    }

    window.addEventListener("resize", resize);
    resize();
    requestAnimationFrame(frame);
  }

  function initBlobs() {
    if (document.querySelector(".nebula-blobs")) return;
    var wrap = document.createElement("div");
    wrap.className = "nebula-blobs";
    wrap.innerHTML = "<span></span><span></span><span></span>";
    document.body.insertBefore(wrap, document.body.firstChild);
  }

  /* ------------------------------------------------------------------ *
   * Sound effects — synthesized with WebAudio so no external audio
   * files (and no copyright/licensing concerns) are needed.
   * ------------------------------------------------------------------ */

  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var actx = null;
  function getCtx() {
    if (!actx && AudioCtx) actx = new AudioCtx();
    return actx;
  }

  function soundEnabled() {
    return localStorage.getItem("nebula-sound") !== "off";
  }

  function setSoundEnabled(on) {
    localStorage.setItem("nebula-sound", on ? "on" : "off");
  }

  function tone(freq, start, duration, type, gainPeak) {
    var ctx = getCtx();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.06, ctx.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + duration + 0.05);
  }

  var sfx = {
    click: function () {
      if (!soundEnabled()) return;
      tone(520, 0, 0.08, "sine", 0.04);
    },
    success: function () {
      if (!soundEnabled()) return;
      tone(523.25, 0, 0.14, "triangle", 0.05);
      tone(659.25, 0.08, 0.16, "triangle", 0.05);
      tone(783.99, 0.16, 0.22, "triangle", 0.05);
    },
    coin: function () {
      if (!soundEnabled()) return;
      tone(880, 0, 0.09, "square", 0.03);
      tone(1318.5, 0.05, 0.14, "square", 0.03);
    },
    error: function () {
      if (!soundEnabled()) return;
      tone(200, 0, 0.18, "sawtooth", 0.05);
      tone(140, 0.1, 0.22, "sawtooth", 0.05);
    },
    notify: function () {
      if (!soundEnabled()) return;
      tone(660, 0, 0.1, "sine", 0.04);
      tone(880, 0.09, 0.12, "sine", 0.04);
    }
  };

  /* ------------------------------------------------------------------ *
   * Toasts
   * ------------------------------------------------------------------ */

  function toastWrap() {
    var wrap = document.querySelector(".n-toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "n-toast-wrap";
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function toast(message, kind) {
    var wrap = toastWrap();
    var el = document.createElement("div");
    el.className = "n-toast";
    el.textContent = message;
    wrap.appendChild(el);

    if (kind === "success") sfx.success();
    else if (kind === "coin") sfx.coin();
    else if (kind === "error") sfx.error();
    else sfx.notify();

    setTimeout(function () {
      el.classList.add("n-toast-out");
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 260);
    }, 3400);
  }

  /* ------------------------------------------------------------------ *
   * Confetti burst (canvas-based, lightweight, self-cleaning)
   * ------------------------------------------------------------------ */

  function confetti() {
    if (reduceMotion) return;
    var c = document.createElement("canvas");
    c.style.position = "fixed";
    c.style.inset = "0";
    c.style.width = "100%";
    c.style.height = "100%";
    c.style.zIndex = "70";
    c.style.pointerEvents = "none";
    document.body.appendChild(c);
    var ctx = c.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var colors = ["#a855f7", "#22d3ee", "#f472b6", "#fbbf24", "#34d399"];
    var pieces = [];
    for (var i = 0; i < 80; i++) {
      pieces.push({
        x: w / 2,
        y: h * 0.3,
        vx: (Math.random() - 0.5) * 12,
        vy: Math.random() * -8 - 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1
      });
    }

    var frames = 0;
    function step() {
      frames++;
      ctx.clearRect(0, 0, w, h);
      var alive = false;
      for (var i = 0; i < pieces.length; i++) {
        var p = pieces[i];
        if (p.life <= 0) continue;
        alive = true;
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 0.012;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive && frames < 240) {
        requestAnimationFrame(step);
      } else {
        c.remove();
      }
    }
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ *
   * Sound toggle button
   * ------------------------------------------------------------------ */

  function initSoundToggle() {
    if (document.querySelector(".n-sound-toggle")) return;
    var btn = document.createElement("div");
    btn.className = "n-sound-toggle";
    btn.title = "Toggle sound effects";
    function render() {
      btn.innerHTML = soundEnabled()
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 1 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z"/><path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 0 0 1.06 1.06L19.5 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 0 0-1.06-1.06L19.5 10.94l-1.72-1.72Z"/></svg>';
    }
    render();
    btn.addEventListener("click", function () {
      setSoundEnabled(!soundEnabled());
      render();
      sfx.click();
    });
    document.body.appendChild(btn);
  }

  /* ------------------------------------------------------------------ *
   * Ambient click feedback on buttons/links
   * ------------------------------------------------------------------ */

  function initClickSfx() {
    document.addEventListener("click", function (e) {
      var target = e.target.closest("a, button");
      if (!target) return;
      if (target.closest(".n-sound-toggle")) return;
      sfx.click();
    });
  }

  window.NebulaFX = {
    toast: toast,
    confetti: confetti,
    sfx: sfx,
    soundEnabled: soundEnabled,
    setSoundEnabled: setSoundEnabled
  };

  document.addEventListener("DOMContentLoaded", function () {
    initBlobs();
    initStarfield();
    initSoundToggle();
    initClickSfx();
  });
})();
