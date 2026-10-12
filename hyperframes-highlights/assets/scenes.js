/*
 * @realiracing highlights - scene timelines (GSAP).
 *
 * Port of the Remotion components Intro / VideoClip / ClipTitle / Outro. Each
 * builder returns ONE paused timeline in the scene's local time (0 = first
 * frame of the scene), exactly like the `useCurrentFrame()` inside a
 * <Sequence>. The generated compositions/*.html files register the result:
 *
 *   window.__timelines["clip-1"] = HLScenes.clip({ n: 1, frames: 90, ... });
 *
 * Every `interpolate(frame, [a, b], [x, y])` became one tween that starts at
 * a/30 s and lasts (b-a)/30 s; `Easing.out(Easing.cubic)` is power3.out; the
 * Intro `spring()` is its closed-form solution, so the bounce is the curve
 * Remotion computed rather than an approximation. Nothing reads a clock, the
 * network or layout: same time in, same pixels out.
 */
window.HLScenes = (function () {
  var FPS = 30;
  var F = function (frames) {
    return frames / FPS;
  };

  /* Remotion spring({ damping, stiffness, mass }) from 0 to 1 at rest.
     Underdamped closed form; sampled at t = frame / fps it equals Remotion's
     frame-by-frame solver. `totalFrames` is the tween length it is stretched over. */
  function springEase(cfg, totalFrames) {
    var w0 = Math.sqrt(cfg.stiffness / cfg.mass);
    var zeta = cfg.damping / (2 * Math.sqrt(cfg.stiffness * cfg.mass));
    var wd = w0 * Math.sqrt(1 - zeta * zeta);
    var k = zeta * w0;
    var seconds = totalFrames / FPS;
    return function (p) {
      var t = p * seconds;
      return 1 - Math.exp(-k * t) * (Math.cos(wd * t) + (k / wd) * Math.sin(wd * t));
    };
  }

  /* o: { width, frames } */
  function intro(o) {
    var tl = gsap.timeline({ paused: true });
    // accent bar slides in from the left edge
    tl.fromTo("#intro-bar", { x: -o.width }, { x: 0, duration: F(20), ease: "power3.out" }, 0);
    // channel name: fade + slide up
    tl.fromTo("#intro-channel", { opacity: 0 }, { opacity: 1, duration: F(15), ease: "none" }, F(15));
    tl.fromTo("#intro-channel", { y: 30 }, { y: 0, duration: F(15), ease: "power3.out" }, F(15));
    // race name: fade + spring bounce-in (damping 12, stiffness 180, mass 0.8)
    var springFrames = Math.max(1, o.frames - 25);
    tl.fromTo("#intro-race", { opacity: 0 }, { opacity: 1, duration: F(15), ease: "none" }, F(25));
    tl.fromTo(
      "#intro-race",
      { scale: 0 },
      {
        scale: 1,
        duration: F(springFrames),
        ease: springEase({ damping: 12, stiffness: 180, mass: 0.8 }, springFrames),
      },
      F(25)
    );
    // white flash on the first frames
    tl.fromTo("#intro-flash", { opacity: 0.6 }, { opacity: 0, duration: F(8), ease: "none" }, 0);
    return tl;
  }

  /* o: { n, frames, hasTitle, centered } */
  function clip(o) {
    var tl = gsap.timeline({ paused: true });
    var n = o.n;

    // slow 1.00 -> 1.04 push-in over the whole clip
    tl.fromTo("#zoom-" + n, { scale: 1 }, { scale: 1.04, duration: F(o.frames), ease: "none" }, 0);
    // cut flash (0.5 -> 0 over 12 frames, ease-out cubic)
    tl.fromTo("#flash-" + n, { opacity: 0.5 }, { opacity: 0, duration: F(12), ease: "power3.out" }, 0);

    if (!o.hasTitle) return tl;

    var box = "#title-" + n;
    // lower-third slides in 40px over 18 frames (not for the centred layout)
    if (!o.centered) {
      tl.fromTo(box, { x: 40 }, { x: 0, duration: F(18), ease: "power3.out" }, 0);
    }
    // opacity = min(fadeIn over 0-18, fadeOut over show-15..show), piecewise linear
    var show = Math.max(1, Math.min(90, o.frames - 10));
    var keys =
      show - 15 >= 18
        ? [[0, 0], [18, 1], [show - 15, 1], [show, 0]]
        : [[0, 0], [(18 * show) / 33, show / 33], [show, 0]];
    for (var k = 0; k < keys.length - 1; k++) {
      var a = keys[k];
      var b = keys[k + 1];
      if (a[1] === b[1]) continue; // hold segment: the previous tween already left the value
      tl.fromTo(
        box,
        { opacity: a[1] },
        { opacity: b[1], duration: F(b[0] - a[0]), ease: "none", immediateRender: k === 0 },
        F(a[0])
      );
    }
    return tl;
  }

  /* o: { width, underline } */
  function outro(o) {
    var tl = gsap.timeline({ paused: true });
    tl.fromTo("#outro-inner", { opacity: 0 }, { opacity: 1, duration: F(20), ease: "none" }, 0);
    // speed lines and underline expand outward (frames 10-40, ease-out cubic)
    var lines = document.querySelectorAll(".speed-line");
    for (var i = 0; i < lines.length; i++) {
      tl.fromTo(lines[i], { width: 0 }, { width: o.width * 1.5, duration: F(30), ease: "power3.out" }, F(10));
    }
    tl.fromTo("#outro-underline", { width: 0 }, { width: o.underline, duration: F(30), ease: "power3.out" }, F(10));
    // CTA: fade + slide up (frames 30-50)
    tl.fromTo("#outro-cta", { opacity: 0 }, { opacity: 1, duration: F(20), ease: "none" }, F(30));
    tl.fromTo("#outro-cta", { y: 20 }, { y: 0, duration: F(20), ease: "power3.out" }, F(30));
    return tl;
  }

  return { intro: intro, clip: clip, outro: outro };
})();
