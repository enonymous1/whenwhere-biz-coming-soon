/**
 * Email signup (launch list).
 *
 * Own IIFE, deliberately separate from the sky canvas below:
 * a failure in the decorative canvas must never take the
 * signup form down with it (and vice versa).
 *
 * Flow: validate locally (same regex as the server — keep them
 * in sync) → POST url-encoded to the Apps Script endpoint →
 * show "You're on the list" only when the body is exactly
 * "ok". Apps Script always answers HTTP 200, so the status
 * cannot distinguish accept from reject; the body is the
 * verdict. Double-submit is blocked client-side (inFlight +
 * disabled button) and server-side (dedup in Code.gs).
 */
(function () {
  "use strict";

  // Keep byte-identical to the regex in apps-script/Code.gs.
  // It knowingly rejects a few valid addresses (1-char TLDs,
  // quoted local parts, non-ASCII) — the price of one regex
  // both sides can share. Loosen one side only and the page
  // will promise signups the server then rejects.
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  // Apps Script can stall for minutes (its own 6-minute limit);
  // without a timeout the button stays disabled and the visitor
  // is stuck with no way to retry. 15 s is generous for a
  // one-row Sheet append and short enough to feel responsive.
  var FETCH_TIMEOUT_MS = 15000;

  var form = document.getElementById("signup");
  var emailInput = document.getElementById("email");
  var error = document.getElementById("error");
  var thanks = document.getElementById("thanks");
  var submitBtn = form.querySelector('button[type="submit"]');
  var endpoint = (window.WHENWHERE_CONFIG && window.WHENWHERE_CONFIG.LAUNCH_LIST_ENDPOINT) || "";
  var inFlight = false;

  function showError(msg) {
    error.textContent = msg;
    error.classList.add("show");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (inFlight) return; // double-click / double-Enter while sending
    var email = emailInput.value.trim();
    var valid = EMAIL_RE.test(email);

    if (!valid) {
      showError("Please enter a valid email address.");
      emailInput.focus();
      return;
    }
    error.classList.remove("show");

    if (!endpoint) {
      // The backend isn't wired yet — say so plainly instead of
      // silently dropping the visitor's email.
      showError("Signups aren't open just yet — please check back soon.");
      return;
    }

    // Live mode: POST to the Apps Script endpoint, which appends
    // the email to the private launch-list Sheet (deduped, so a
    // double-submit never adds the same address twice).
    inFlight = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding…";
    var params = new URLSearchParams();
    params.append("email", email);
    // No headers are set on purpose: a URLSearchParams body
    // makes this a CORS "simple request". A JSON Content-Type
    // would trigger a preflight Apps Script never answers.
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    fetch(endpoint, { method: "POST", body: params, signal: controller.signal })
      .then(function (res) { return res.text().then(function (text) { return { ok: res.ok, text: text }; }); })
      .then(function (result) {
        // Apps Script always answers HTTP 200, even when doPost
        // rejects the submission — so the body is the verdict,
        // not the status. The endpoint answers plain 'ok'.
        if (!result.ok || result.text.trim() !== "ok") throw new Error("Launch-list endpoint rejected the signup");
        form.style.display = "none";
        thanks.classList.add("show");
        thanks.focus(); // form is gone; don't strand keyboard focus on <body>
      })
      .catch(function (err) {
        // A timeout gets its own message: the signup may or may
        // not have landed, so "try again" is honest — the
        // server dedups, so a retry cannot create a second row.
        // Other failures are deliberately generic to the
        // visitor; the detail goes to the console for debugging.
        if (err && err.name === "AbortError") {
          showError("That’s taking too long — please try again in a moment.");
        } else {
          console.error("Launch-list signup failed:", err);
          showError("Something went wrong — please try again in a moment.");
        }
      })
      .finally(function () {
        clearTimeout(timer);
        inFlight = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Notify Me";
      });
  });

  emailInput.addEventListener("input", function () {
    error.classList.remove("show");
  });
})();

/**
 * Night-sky canvas: drifting, twinkling points of light.
 *
 * Pure decoration — aria-hidden, pointer-events none, and in its
 * own IIFE so a canvas failure cannot affect the signup form.
 * Respects prefers-reduced-motion (one still frame, no drift,
 * no animation loop) and pauses the loop while the tab is
 * hidden, so it costs nothing when nobody is looking at it.
 *
 * Pointer play (mouse only, skipped under reduced motion):
 * moving the mouse eases the field a few px toward the cursor
 * (larger stars shift more, for depth) and brightens the stars
 * near it; clicking or tapping the sky — anywhere that is not
 * the form, the button, or a link — sends a shooting star
 * streaking from that spot.
 *
 * Performance note: twinkle is applied with globalAlpha over a
 * fillStyle set once, not by building an rgba() string per star
 * per frame (the old code called toFixed(3) + string concat
 * ~110× per frame). At ≤110 stars this was never the bottleneck,
 * but the string churn was pure waste.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("sky");
  // getContext() can return null (very old browsers, headless
  // environments, GPU context loss). Without this guard the
  // next line throws and the whole block dies.
  var ctx = canvas ? canvas.getContext("2d") : null;
  if (!ctx) return;

  // The canvas is running — hide the pure-CSS starfield fallback
  // (it shows only when JS is off or the context failed).
  document.documentElement.classList.add("has-sky");

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stars = [];
  var W = 0, H = 0, raf = null;
  // Pointer play (both skipped under prefers-reduced-motion).
  var parTX = 0, parTY = 0, parX = 0, parY = 0; // parallax target + smoothed, -1..1
  var mouseX = -1, mouseY = -1; // cursor in CSS px, -1 when off-screen
  var meteors = []; // {x, y, vx, vy, life} — at most 3 at once
  var lastT = 0;

  function build() {
    // Cap devicePixelRatio at 2: above that the canvas costs
    // 4× the pixels for no visible gain on a field of dots.
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Density-capped star count: ~1 star per 16,000 px²,
    // never more than 110, so a 4K screen costs the same as a
    // laptop. Rebuilt on resize — positions are cheap to
    // re-randomise, and keeping them would need rescaling.
    var count = Math.round(Math.min(110, (W * H) / 16000));
    stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.85, // keep the top band clear of the headline
        r: 0.6 + Math.random() * 1.5,
        base: 0.25 + Math.random() * 0.55,
        speed: 0.4 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        drift: 1.5 + Math.random() * 4
      });
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    // Frame delta, clamped — a hidden tab resumes with a sane step.
    var dt = lastT ? Math.min(t - lastT, 50) : 16;
    lastT = t;
    // Ease the parallax toward its target so the field glides
    // instead of snapping to the cursor.
    parX += (parTX - parX) * 0.06;
    parY += (parTY - parY) * 0.06;
    // Points of light read as twinkling stars on the navy night, and as
    // faint gold dust on the ivory light theme.
    ctx.fillStyle = "#eec887";
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = reduceMotion ? 0.7 : 0.5 + 0.5 * Math.sin(s.phase + t * 0.001 * s.speed);
      var a = s.base * tw;
      var x = s.x + (reduceMotion ? 0 : Math.sin(t * 0.00005 * s.drift + s.phase) * 6);
      var y = s.y;
      var r = s.r;
      if (!reduceMotion) {
        // Parallax: larger (nearer) stars shift more with the cursor.
        x += parX * r * 3;
        y += parY * r * 3;
        // Stars near the cursor brighten and swell slightly.
        if (mouseX >= 0) {
          var dx = x - mouseX, dy = y - mouseY;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            var boost = 1 - d / 120;
            a = Math.min(1, a + boost * 0.5);
            r += boost * 0.5;
          }
        }
      }
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (r > 1.7) {
        // Larger stars get a soft halo, at 12% of the core alpha.
        ctx.fillStyle = "#d9a441";
        ctx.globalAlpha = a * 0.12;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#eec887";
      }
    }
    // Shooting stars: move, fade, draw, drop the spent ones.
    // (At most 3, so the gradient string below is built 3x/frame
    // at most — nothing like the per-star churn avoided above.)
    if (!reduceMotion && meteors.length) {
      for (var j = meteors.length - 1; j >= 0; j--) {
        var m = meteors[j];
        m.x += m.vx * dt / 1000;
        m.y += m.vy * dt / 1000;
        m.life -= dt / 800; // ~0.8 s streak
        if (m.life <= 0) { meteors.splice(j, 1); continue; }
        var tx = m.x - m.vx * 0.12, ty = m.y - m.vy * 0.12;
        var grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
        grad.addColorStop(0, "rgba(238,200,135," + m.life.toFixed(2) + ")");
        grad.addColorStop(1, "rgba(238,200,135,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // Bright head.
        ctx.fillStyle = "#eec887";
        ctx.globalAlpha = m.life;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1; // never leak a partial alpha into the next frame
    if (!reduceMotion) raf = requestAnimationFrame(draw);
  }

  build();
  raf = requestAnimationFrame(draw);

  // Debounced rebuild: resizing fires continuously while the
  // user drags, and rebuilding the star field on every event
  // would thrash layout. 180 ms after the last event is enough.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      build();
      if (reduceMotion) draw(0);
    }, 180);
  });

  if (!reduceMotion) {
    // Mouse parallax: the field eases a few px toward the cursor.
    // Touch has no hover, so only the mouse moves the sky; taps
    // get a shooting star below.
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      mouseX = e.clientX;
      mouseY = e.clientY;
      parTX = (e.clientX / W - 0.5) * 2;
      parTY = (e.clientY / H - 0.5) * 2;
    });
    // Mouse left the window — ease the field back to centre.
    document.addEventListener("pointerout", function (e) {
      if (!e.relatedTarget) {
        mouseX = mouseY = -1;
        parTX = parTY = 0;
      }
    });
    // Click / tap the sky for a shooting star. Clicks on the form,
    // the button, or any link are the visitor doing something else,
    // so they never spawn one.
    window.addEventListener("pointerdown", function (e) {
      if (e.target && e.target.closest &&
          e.target.closest("input, button, a, select, textarea, label")) return;
      if (meteors.length >= 3) meteors.shift(); // cap: drop the oldest
      var angle = (15 + Math.random() * 60) * Math.PI / 180; // 15-75 deg down
      var dir = Math.random() < 0.5 ? 1 : -1;
      var speed = 500 + Math.random() * 200;
      meteors.push({
        x: e.clientX,
        y: e.clientY,
        vx: Math.cos(angle) * speed * dir,
        vy: Math.sin(angle) * speed,
        life: 1
      });
    });
  }

  // Don't burn CPU (and battery) animating a hidden tab.
  document.addEventListener("visibilitychange", function () {
    if (reduceMotion) return;
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    } else if (!raf) {
      raf = requestAnimationFrame(draw);
    }
  });
})();
