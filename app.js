// macos-clean web landing page & interactive preview
// Faithfully ports Bubbl (App/Mascot/*), 26 categories (CleanupCategory.swift),
// and the 5-section SwiftUI window experience.

const BUBBL_HUES = [
  [255, 45, 85],   // pink
  [255, 149, 0],   // orange
  [255, 204, 0],   // yellow
  [0, 199, 190],   // mint
  [50, 173, 230],  // cyan
  [88, 86, 214],   // indigo
  [175, 82, 222],  // purple
  [255, 45, 85],   // pink
];

const SPARKLE_COLORS = [
  '255, 204, 0',   // yellow
  '255, 45, 85',   // pink
  '0, 199, 190',   // mint
  '50, 173, 230',  // cyan
  '255, 149, 0',   // orange
];

const GB = 1_000_000_000;
const MB = 1_000_000;

function formatBytes(bytes) {
  if (bytes <= 0) return '0 B';
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

// MARK: - Bubbl Math & Pose Engine (ported from BubblPose.swift & MascotMood.swift)

const BubblMotion = {
  floatSpeed: 1.1,
  driftSpeed: 1.2,
  wobbleSpeed: 2.0,
  shimmerSpeed: 25.0,
  glintPeriod: 1.8,

  hash(n) {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296;
  },

  clamp(x) {
    return Math.min(1, Math.max(0, x));
  },

  easeOut(x) {
    return 1 - Math.pow(1 - this.clamp(x), 3);
  },

  easeIn(x) {
    return Math.pow(this.clamp(x), 2);
  },

  easeInOut(x) {
    const c = this.clamp(x);
    return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
  },

  backOut(x) {
    const c = this.clamp(x);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
  },

  blink(t) {
    const period = 8.0;
    const length = 0.16;
    const cycle = Math.floor(t / period);
    for (const index of [cycle - 1, cycle]) {
      const start = index * period + 1 + this.hash(index) * 2;
      const elapsed = t - start;
      if (elapsed >= 0 && elapsed < length) {
        return Math.sin((elapsed / length) * Math.PI);
      }
    }
    return 0;
  },
};

function puffScale(bytes) {
  const low = Math.log(100e6);
  const high = Math.log(200e9);
  const value = Math.log(Math.max(bytes, 100e6));
  const frac = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return 1.0 + frac * 0.35;
}

function poseForMood(mood, moodBytes = 0) {
  const pose = {
    scale: 1.0,
    squashX: 1.0,
    squashY: 1.0,
    offsetX: 0.0,
    floatAmp: 3.0,
    wobbleAmp: 0.025,
    driftAmp: 0.0,
    cloud: 0.0,
    clarity: 0.0,
    eyeOpen: 1.0,
    eyeLookX: 0.0,
    pane: 0.0,
    glint: 0.0,
    trail: 0.0,
    dust: 0.0,
    zzz: 0.0,
    mouth: 0.0,
  };

  switch (mood) {
    case 'idle':
      break;
    case 'scanning':
      pose.driftAmp = 12;
      pose.floatAmp = 2;
      pose.glint = 1;
      pose.trail = 1;
      pose.wobbleAmp = 0.03;
      break;
    case 'junkFound':
      pose.scale = puffScale(moodBytes || 26 * GB);
      pose.eyeOpen = 1.1;
      pose.wobbleAmp = 0.03;
      break;
    case 'cleaning':
      pose.scale = 0.95;
      pose.cloud = 1;
      pose.dust = 1;
      pose.eyeOpen = 0.55;
      pose.wobbleAmp = 0.045;
      break;
    case 'nothingToClean':
      pose.scale = 0.8;
      pose.clarity = 1;
      pose.eyeOpen = 0.3;
      pose.floatAmp = 2;
      pose.wobbleAmp = 0.012;
      pose.zzz = 1;
      break;
    case 'blocked':
      pose.squashX = 1.12;
      pose.squashY = 0.88;
      pose.offsetX = -10;
      pose.floatAmp = 1;
      pose.wobbleAmp = 0.01;
      pose.eyeLookX = 3;
      pose.pane = 1;
      break;
    case 'whoa':
      pose.scale = puffScale(moodBytes || 42 * GB);
      pose.eyeOpen = 1.35;
      pose.mouth = 1;
      pose.wobbleAmp = 0.04;
      break;
  }
  return pose;
}

function mixPoses(a, b, f) {
  const out = {};
  for (const key of Object.keys(a)) {
    out[key] = a[key] + (b[key] - a[key]) * f;
  }
  return out;
}

function reactionDuration(kind) {
  switch (kind) {
    case 'gulp': return 0.45;
    case 'bigGulp': return 0.8;
    case 'spit': return 0.4;
    case 'dive':
    case 'surface': return 0.7;
    case 'glance': return 1.2;
    default: return 0;
  }
}

function computeReaction(kind, elapsed) {
  const out = { scaleX: 1, scaleY: 1, offsetY: 0, squint: 0, look: 0 };
  if (!kind || elapsed == null || elapsed < 0) return out;
  const len = reactionDuration(kind);
  if (elapsed >= len) return out;
  const p = elapsed / len;
  const bump = Math.sin(p * Math.PI);

  switch (kind) {
    case 'gulp':
      out.scaleX = 1 + 0.1 * bump;
      out.scaleY = 1 - 0.07 * bump;
      out.squint = bump;
      break;
    case 'bigGulp': {
      const wave = Math.abs(Math.sin(p * Math.PI * 2)) * (1 - p * 0.5);
      out.scaleX = 1 + 0.2 * wave;
      out.scaleY = 1 - 0.13 * wave;
      out.squint = wave;
      break;
    }
    case 'spit':
      out.scaleX = 1 - 0.08 * bump;
      out.scaleY = 1 - 0.08 * bump;
      break;
    case 'dive':
      out.offsetY = 16 * bump;
      out.scaleX = 1 - 0.05 * bump;
      out.scaleY = 1 + 0.08 * bump;
      break;
    case 'surface':
      out.offsetY = -14 * bump;
      out.scaleX = 1 - 0.04 * bump;
      out.scaleY = 1 + 0.06 * bump;
      break;
    case 'glance':
      out.look = Math.min(1, p * 5) * Math.min(1, (1 - p) * 4);
      break;
  }
  return out;
}

function computePopScale(elapsed) {
  const duration = 1.3;
  const reformStart = 0.7;
  if (elapsed == null || elapsed >= duration) return 1.0;
  if (elapsed < 0.18) return 1 + 0.15 * BubblMotion.easeOut(elapsed / 0.18);
  if (elapsed < 0.26) return 1.15 * (1 - (elapsed - 0.18) / 0.08);
  if (elapsed < reformStart) return 0;
  return BubblMotion.backOut((elapsed - reformStart) / 0.55);
}

function computeSplitPhase(elapsed) {
  const duration = 1.7;
  if (elapsed == null || elapsed >= duration) {
    return { mainScale: 1, miniScale: 0, distance: 0, isActive: false };
  }
  let mainScale = 1;
  if (elapsed < 0.2) mainScale = 1 - elapsed / 0.2;
  else if (elapsed < 1.45) mainScale = 0;
  else mainScale = BubblMotion.backOut((elapsed - 1.45) / 0.25);

  let miniScale = 0;
  if (elapsed < 0.1) miniScale = 0;
  else if (elapsed < 0.3) miniScale = BubblMotion.easeOut((elapsed - 0.1) / 0.2);
  else if (elapsed < 1.4) miniScale = 1;
  else if (elapsed < 1.5) miniScale = 1 - (elapsed - 1.4) / 0.1;

  const reach = 30;
  let distance = 0;
  if (elapsed < 0.15) distance = 0;
  else if (elapsed < 0.45) distance = reach * BubblMotion.easeOut((elapsed - 0.15) / 0.3);
  else if (elapsed < 1.15) distance = reach + 3 * Math.sin((elapsed - 0.45) * 14);
  else distance = reach * (1 - BubblMotion.easeInOut((elapsed - 1.15) / 0.3));

  return { mainScale, miniScale, distance, isActive: miniScale > 0.001 };
}

// MARK: - Bubbl Canvas Renderer

class BubblEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.logicalWidth = options.logicalWidth || 150;
    this.logicalHeight = options.logicalHeight || 124;
    this.radius = options.radius || 38;
    this.mood = options.mood || 'idle';
    this.moodBytes = options.moodBytes || 0;
    this.selectionShare = 0;
    this.leftoverCount = options.leftoverCount || 0;
    this.lookToward = options.lookToward || { dx: -1, dy: -1 };
    this.carriedAppLabel = null;

    this.epoch = performance.now() / 1000;
    this.blend = null;
    this.shareBlend = null;
    this.pop = null;
    this.splitAt = null;
    this.pokeAt = null;
    this.reaction = null;
    this.taps = [];
    this.manualReduceMotion = false;
    this.systemReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onTapBlocked = options.onTapBlocked || null;
    this.onSplit = options.onSplit || null;

    this.lastFrameTime = 0;
    this.rafId = null;

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.systemReduceMotion = e.matches;
      this.drawFrame(performance.now() / 1000);
    });
  }

  get reduceMotion() {
    return this.manualReduceMotion || this.systemReduceMotion;
  }

  setReduceMotion(val) {
    this.manualReduceMotion = val;
    this.drawFrame(performance.now() / 1000);
  }

  setMood(mood, bytes = 0) {
    if (this.mood === mood && this.moodBytes === bytes) return;
    const now = performance.now() / 1000;
    if (!this.reduceMotion) {
      const currentPose = this.blendedPose(now);
      this.blend = { from: currentPose, at: now };
    }
    this.mood = mood;
    this.moodBytes = bytes;
    this.drawFrame(now);
  }

  setSelectionShare(share) {
    const clamped = Math.min(1, Math.max(0, share));
    if (clamped === this.selectionShare) return;
    const now = performance.now() / 1000;
    if (!this.reduceMotion) {
      this.shareBlend = { from: this.displayedShare(now), at: now };
    }
    this.selectionShare = clamped;
  }

  triggerReaction(kind) {
    if (this.reduceMotion) return;
    this.reaction = { kind, at: performance.now() / 1000 };
  }

  triggerPop(freedBytes) {
    this.pop = { bytes: freedBytes, at: performance.now() / 1000 };
    this.drawFrame(performance.now() / 1000);
  }

  clearPop() {
    this.pop = null;
    this.drawFrame(performance.now() / 1000);
  }

  triggerSplit() {
    if (this.reduceMotion) return;
    this.splitAt = performance.now() / 1000;
    this.taps = [];
    if (this.onSplit) this.onSplit();
  }

  pokeOrTap() {
    if (this.mood === 'blocked' && this.onTapBlocked) {
      this.onTapBlocked();
      return;
    }
    if (this.reduceMotion) return;
    const now = performance.now() / 1000;
    this.pokeAt = now;
    this.taps = this.taps.filter((t) => now - t < 2).concat(now);
    const splitIsOver = this.splitAt == null || now - this.splitAt >= 1.7;
    if (this.taps.length >= 5 && splitIsOver) {
      this.triggerSplit();
    }
  }

  blendedPose(now) {
    const target = poseForMood(this.mood, this.moodBytes);
    if (this.reduceMotion || !this.blend) return target;
    const frac = BubblMotion.easeInOut((now - this.blend.at) / 0.6);
    if (frac >= 1) return target;
    return mixPoses(this.blend.from, target, frac);
  }

  displayedShare(now) {
    if (this.reduceMotion || !this.shareBlend) return this.selectionShare;
    const frac = BubblMotion.easeOut((now - this.shareBlend.at) / 0.45);
    return this.shareBlend.from + (this.selectionShare - this.shareBlend.from) * frac;
  }

  start() {
    if (this.rafId) return;
    const tick = (ms) => {
      this.rafId = requestAnimationFrame(tick);
      if (this.reduceMotion) {
        if (this.lastFrameTime === 0) {
          this.drawFrame(this.epoch);
          this.lastFrameTime = ms;
        }
        return;
      }
      // 20 fps target (50 ms) matching SwiftUI TimelineView(.animation(minimumInterval: 1.0 / 20))
      if (ms - this.lastFrameTime < 46) return;
      this.lastFrameTime = ms;
      this.drawFrame(ms / 1000);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  drawFrame(now) {
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(this.logicalWidth * dpr);
    const targetH = Math.round(this.logicalHeight * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);

    const t = this.reduceMotion ? 0 : now - this.epoch;
    const r = this.radius;
    const pose = this.blendedPose(now);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const inkColor = isLight ? '15, 23, 42' : '241, 245, 249';

    const popElapsed = this.pop ? (this.reduceMotion ? 1.25 : now - this.pop.at) : null;
    const popScale = this.pop
      ? (this.reduceMotion ? 1 : computePopScale(popElapsed))
      : 1;
    const split = this.splitAt && !this.reduceMotion
      ? computeSplitPhase(now - this.splitAt)
      : { mainScale: 1, miniScale: 0, distance: 0, isActive: false };

    let poke = 0;
    if (this.pokeAt && !this.reduceMotion) {
      const pe = now - this.pokeAt;
      if (pe >= 0 && pe < 0.35) {
        poke = Math.sin((pe / 0.35) * Math.PI * 2) * (1 - pe / 0.35) * 0.08;
      }
    }

    const react = this.reaction && !this.reduceMotion
      ? computeReaction(this.reaction.kind, now - this.reaction.at)
      : { scaleX: 1, scaleY: 1, offsetY: 0, squint: 0, look: 0 };

    const grow = 1 + 0.12 * this.displayedShare(now);
    const base = { x: this.logicalWidth / 2 + pose.offsetX, y: this.logicalHeight / 2 };
    const center = {
      x: base.x + Math.sin(t * BubblMotion.driftSpeed) * pose.driftAmp,
      y: base.y + Math.sin(t * BubblMotion.floatSpeed) * pose.floatAmp + react.offsetY,
    };
    const wobble = Math.sin(t * BubblMotion.wobbleSpeed) * pose.wobbleAmp + poke;
    const scale = pose.scale * popScale * split.mainScale * grow;

    let labelProgress = null;
    if (this.pop) {
      if (this.reduceMotion) {
        labelProgress = 1;
      } else if (popElapsed >= 0.7 && popElapsed < 4.5) {
        labelProgress = BubblMotion.easeOut((popElapsed - 0.7) / 1.1);
      } else if (popElapsed >= 4.5) {
        this.pop = null;
      }
    }

    // 1. Particles
    if (!this.reduceMotion) {
      this.drawParticles(ctx, t, pose, base, center, r * pose.scale, popElapsed);
    }

    // 2. M7: Frosted glass pane + padlock
    if (pose.pane > 0.01) {
      this.drawGlassPane(ctx, this.logicalWidth / 2 + pose.offsetX + r * pose.squashX + 7, this.logicalHeight / 2, r * 2.3, pose.pane, inkColor);
    }

    // 3. M9: 3 Split mini-bubbles
    if (split.isActive) {
      for (let i = 0; i < 3; i++) {
        const angle = ((-90 + i * 120) * Math.PI) / 180;
        const jiggle = Math.sin(t * 9 + i * 2) * 0.07;
        const mx = center.x + Math.cos(angle) * split.distance;
        const my = center.y + Math.sin(angle) * split.distance;
        ctx.save();
        ctx.translate(mx, my);
        ctx.scale(split.miniScale * (1 + jiggle), split.miniScale * (1 - jiggle));
        this.drawBubbleBody(ctx, r * 0.42, t * BubblMotion.shimmerSpeed + i * 60, 0, 0, 0, 0, inkColor);
        this.drawEyes(ctx, r * 0.84, 1, 0, 0, false, -r * 0.06, inkColor);
        ctx.restore();
      }
    }

    // 4. Main Bubble
    const sx = Math.max(0.001, scale * pose.squashX * react.scaleX * (1 + wobble));
    const sy = Math.max(0.001, scale * pose.squashY * react.scaleY * (1 - wobble));
    if (sx > 0.01 && sy > 0.01) {
      const happy = labelProgress != null;
      const glintPhase = (t % BubblMotion.glintPeriod) / BubblMotion.glintPeriod;
      const lookX =
        pose.eyeLookX +
        (pose.driftAmp / 12) * 3 * Math.cos(t * BubblMotion.driftSpeed) +
        react.look * this.lookToward.dx * 5;
      const carrying = this.carriedAppLabel && this.mood === 'cleaning' && !happy;
      const whoaBytes = this.mood === 'whoa' && !happy && !carrying ? (this.moodBytes || 42 * GB) : null;
      const eyesY = happy ? -r * 0.32 : carrying ? -r * 0.5 : pose.mouth > 0.5 ? -r * 0.28 : -r * 0.12;
      const blink = this.reduceMotion ? 0 : Math.max(BubblMotion.blink(t), react.squint * 0.85);

      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.scale(sx, sy);

      this.drawBubbleBody(
        ctx,
        r,
        t * BubblMotion.shimmerSpeed,
        pose.cloud,
        pose.clarity,
        pose.glint,
        glintPhase * 2 - 1,
        inkColor
      );

      this.drawEyes(
        ctx,
        r * 2,
        pose.eyeOpen,
        blink,
        lookX,
        happy,
        eyesY + react.look * this.lookToward.dy * 3,
        inkColor
      );

      // Whoa mouth
      if (pose.mouth > 0.05 && !happy && !carrying) {
        ctx.save();
        ctx.fillStyle = `rgba(${inkColor}, 0.78)`;
        ctx.beginPath();
        ctx.ellipse(0, r * 0.04, r * 0.1 * pose.mouth, r * 0.13 * pose.mouth, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (whoaBytes) {
        ctx.save();
        ctx.fillStyle = `rgba(${inkColor}, 0.92)`;
        ctx.font = `700 ${Math.round(r * 0.27)}px -apple-system, BlinkMacSystemFont, "SF Pro Rounded", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatBytes(whoaBytes), 0, r * 0.42);
        ctx.restore();
      }

      if (carrying) {
        ctx.save();
        ctx.font = `${Math.round(r * 0.65)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.carriedAppLabel, 0, r * 0.18 + Math.sin(t * 3) * 2);
        ctx.restore();
      }

      if (labelProgress != null && this.pop) {
        const shown = Math.round(this.pop.bytes * labelProgress);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(${inkColor}, 0.95)`;
        ctx.font = `700 ${Math.round(r * 0.32)}px -apple-system, BlinkMacSystemFont, "SF Pro Rounded", sans-serif`;
        ctx.fillText(formatBytes(shown), 0, r * 0.12);
        ctx.fillStyle = `rgba(${inkColor}, 0.65)`;
        ctx.font = `600 ${Math.round(r * 0.22)}px -apple-system, BlinkMacSystemFont, "SF Pro Rounded", sans-serif`;
        ctx.fillText('freed', 0, r * 0.42);
        ctx.restore();
      }

      ctx.restore();
    }

    ctx.restore();
  }

  drawBubbleBody(ctx, r, shimmerDeg, cloud, clarity, glint, glintX, inkColor) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    // 1. Faint tinted fill (BubblFill)
    const fillGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.3, 0, 0, 0, r);
    fillGrad.addColorStop(0, 'rgba(45, 212, 191, 0.04)');
    fillGrad.addColorStop(1, 'rgba(56, 189, 248, 0.16)');
    ctx.fillStyle = fillGrad;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    // 2. Iridescent rim band (BubblIridescence)
    const iridStrength = 0.32 + clarity * 0.18;
    if (typeof ctx.createConicGradient === 'function') {
      const angleRad = (shimmerDeg * Math.PI) / 180;
      const conic = ctx.createConicGradient(angleRad, 0, 0);
      BUBBL_HUES.forEach((rgb, i) => {
        conic.addColorStop(i / (BUBBL_HUES.length - 1), `rgba(${rgb.join(',')}, ${iridStrength})`);
      });
      ctx.save();
      ctx.fillStyle = conic;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.restore();
    }

    // 3. Cloudy fill while cleaning
    if (cloud > 0.01) {
      const cloudGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      cloudGrad.addColorStop(0, `rgba(148, 163, 184, ${0.44 * cloud})`);
      cloudGrad.addColorStop(1, `rgba(148, 163, 184, ${0.22 * cloud})`);
      ctx.fillStyle = cloudGrad;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }

    // 4. Sweeping magnifier glint while scanning
    if (glint > 0.01) {
      ctx.save();
      ctx.translate(glintX * r * 1.5, 0);
      ctx.rotate((20 * Math.PI) / 180);
      const glintGrad = ctx.createLinearGradient(-r * 0.25, 0, r * 0.25, 0);
      glintGrad.addColorStop(0, 'rgba(255,255,255,0)');
      glintGrad.addColorStop(0.5, `rgba(255,255,255,${0.62 * glint})`);
      glintGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glintGrad;
      ctx.fillRect(-r * 0.25, -r * 1.4, r * 0.5, r * 2.8);
      ctx.restore();
    }

    // 5. Specular highlights (BubblHighlights)
    ctx.save();
    ctx.translate(-r * 0.4, -r * 0.48);
    ctx.rotate((-35 * Math.PI) / 180);
    const hiGrad = ctx.createLinearGradient(0, -r * 0.15, 0, r * 0.15);
    hiGrad.addColorStop(0, 'rgba(255,255,255,0.92)');
    hiGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hiGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.27, r * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(r * 0.52, r * 0.5, r * 0.055, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 6. Iridescent Rim Stroke (BubblRim)
    ctx.save();
    if (typeof ctx.createConicGradient === 'function') {
      const rimConic = ctx.createConicGradient((-shimmerDeg * 0.7 * Math.PI) / 180, 0, 0);
      BUBBL_HUES.forEach((rgb, i) => {
        rimConic.addColorStop(i / (BUBBL_HUES.length - 1), `rgba(${rgb.join(',')}, 0.65)`);
      });
      ctx.strokeStyle = rimConic;
    } else {
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.7)';
    }
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(${inkColor}, 0.12)`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();
  }

  drawEyes(ctx, diameter, open, blink, lookX, happy, offsetY, inkColor) {
    const spacing = diameter * 0.24;
    const positions = [-spacing / 2 + lookX, spacing / 2 + lookX];
    ctx.save();
    ctx.translate(0, offsetY);

    for (const ex of positions) {
      if (happy) {
        const w = diameter * 0.12;
        const h = diameter * 0.06;
        ctx.strokeStyle = `rgba(${inkColor}, 0.88)`;
        ctx.lineWidth = Math.max(1.5, diameter * 0.032);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - w / 2, h / 2);
        ctx.quadraticCurveTo(ex, -h, ex + w / 2, h / 2);
        ctx.stroke();
      } else {
        const ew = diameter * 0.085 * Math.max(1, open);
        const eh = diameter * 0.12 * Math.max(0.08, open * (1 - blink * 0.92));
        ctx.fillStyle = `rgba(${inkColor}, 0.85)`;
        ctx.beginPath();
        ctx.roundRect(ex - ew / 2, -eh / 2, ew, eh, Math.min(ew, eh) / 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawGlassPane(ctx, x, y, height, opacity, inkColor) {
    ctx.save();
    ctx.globalAlpha = opacity;
    const w = 9;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.strokeStyle = `rgba(${inkColor}, 0.22)`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - height / 2, w, height, 4);
    ctx.fill();
    ctx.stroke();

    // Padlock badge at top
    const ly = y - height / 2 - 4;
    ctx.fillStyle = 'rgba(249, 115, 22, 0.22)';
    ctx.beginPath();
    ctx.arc(x, ly, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔒', x, ly + 0.5);
    ctx.restore();
  }

  drawParticles(ctx, t, pose, base, center, r, popElapsed) {
    // M2: Trail bubbles while scanning
    if (pose.trail > 0.01) {
      const count = 7;
      const life = 1.4;
      for (let i = 0; i < count; i++) {
        const age = (t + (i * life) / count) % life;
        const born = t - age;
        const gen = Math.floor((t + (i * life) / count) / life);
        const seed = i * 997 + gen;
        const heading = Math.cos(born * BubblMotion.driftSpeed) >= 0 ? 1 : -1;
        const bornX = base.x + Math.sin(born * BubblMotion.driftSpeed) * pose.driftAmp;
        const bornY = base.y + Math.sin(born * BubblMotion.floatSpeed) * pose.floatAmp;
        const x = bornX - heading * r * (0.85 + BubblMotion.hash(seed) * 0.2) + Math.sin(age * 4 + i) * 2;
        const y = bornY + r * (BubblMotion.hash(seed + 1) - 0.3) * 0.7 - age * 14;
        const pr = 1.5 + BubblMotion.hash(seed + 2) * 2.5;
        const opacity = (1 - age / life) * pose.trail;
        ctx.strokeStyle = `rgba(50, 173, 230, ${0.8 * opacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // M4: Dust spiraling into Bubbl
    if (pose.dust > 0.01) {
      const count = 10;
      const period = 1.5;
      for (let i = 0; i < count; i++) {
        const p = (t / period + BubblMotion.hash(i + 50)) % 1;
        const start = r * 1.75;
        const end = r * 0.45;
        const dist = start - (start - end) * BubblMotion.easeIn(p);
        const angle = BubblMotion.hash(i) * Math.PI * 2 + p * 2.2;
        const x = center.x + Math.cos(angle) * dist;
        const y = center.y + Math.sin(angle) * dist;
        const pr = 1.2 + BubblMotion.hash(i + 7) * 1.4;
        ctx.fillStyle = `rgba(148, 163, 184, ${0.85 * Math.sin(p * Math.PI) * pose.dust})`;
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // M6: Sleepy zZ bubbles
    if (pose.zzz > 0.01) {
      const count = 3;
      const period = 3.0;
      for (let i = 0; i < count; i++) {
        const p = (t / period + i / count) % 1;
        const x = center.x + r * 0.6 + p * 16 + Math.sin(p * 6) * 3;
        const y = center.y - r * 0.6 - p * 30;
        const pr = 4.5 + p * 4;
        const opacity = Math.sin(p * Math.PI) * pose.zzz;
        ctx.strokeStyle = `rgba(50, 173, 230, ${0.6 * opacity})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(148, 163, 184, ${opacity})`;
        ctx.font = `600 ${Math.round(pr * 1.3)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('z', x, y - pr * 0.08);
      }
    }

    // M5: Pop burst ring & sparkles
    if (popElapsed != null) {
      const elapsed = popElapsed - 0.22;
      if (elapsed >= 0 && elapsed < 0.95) {
        const q = elapsed / 0.95;
        const ringR = r * (1 + q * 0.35);
        ctx.strokeStyle = `rgba(50, 173, 230, ${0.5 * (1 - q)})`;
        ctx.lineWidth = 1.5 * (1 - q) + 0.3;
        ctx.beginPath();
        ctx.arc(base.x, base.y, ringR, 0, Math.PI * 2);
        ctx.stroke();

        const count = 12;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + BubblMotion.hash(i + 300) * 0.4;
          const dist = r * 0.5 + BubblMotion.easeOut(q) * (r * 0.6 + BubblMotion.hash(i + 400) * 10);
          const px = base.x + Math.cos(angle) * dist;
          const py = base.y + Math.sin(angle) * dist;
          const size = (3 + BubblMotion.hash(i + 500) * 3) * (1 - q * 0.6);
          const rgb = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
          ctx.fillStyle = `rgba(${rgb}, ${1 - q * q})`;
          this.drawSparkle(ctx, px, py, size);
        }
      }
    }

    // M8: Leftover bubbles drifting down toward chip
    if (this.leftoverCount > 0) {
      const count = 3;
      const period = 2.4;
      const start = { x: center.x, y: center.y + r * 0.85 };
      const end = { x: this.logicalWidth / 2, y: this.logicalHeight - 2 };
      for (let i = 0; i < count; i++) {
        const p = (t / period + i / count) % 1;
        const x = start.x + (end.x - start.x) * p + Math.sin(p * 5 + i * 2) * 6;
        const y = start.y + (end.y - start.y) * p;
        const pr = 2 + BubblMotion.hash(i + 900) * 2;
        ctx.strokeStyle = `rgba(45, 212, 191, ${0.75 * Math.sin(p * Math.PI)})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  drawSparkle(ctx, cx, cy, s) {
    const k = s * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.quadraticCurveTo(cx + k, cy - k, cx + s, cy);
    ctx.quadraticCurveTo(cx + k, cy + k, cx, cy + s);
    ctx.quadraticCurveTo(cx - k, cy + k, cx - s, cy);
    ctx.quadraticCurveTo(cx - k, cy - k, cx, cy - s);
    ctx.closePath();
    ctx.fill();
  }
}

// MARK: - All 26 Categories from CleanupCategory.swift

const ALL_CATEGORIES = [
  { id: 'user-caches', name: 'User Application Caches', safety: 'safe', group: 'apps', paths: ['~/Library/Caches'], details: 'Cached data from installed apps. Safe to delete; apps regenerate as needed.' },
  { id: 'user-logs', name: 'User Logs', safety: 'safe', group: 'apps', paths: ['~/Library/Logs'], details: 'Application log files written by macOS apps. Safe to delete.' },
  { id: 'trash', name: 'Trash', safety: 'safe', group: 'apps', paths: ['~/.Trash'], details: 'Files already in the Trash. Empty it, or pick items to delete for good.' },
  { id: 'xcode-derived', name: 'Xcode DerivedData', safety: 'safe', group: 'apple', paths: ['~/Library/Developer/Xcode/DerivedData'], details: 'Xcode build intermediates and indexes. Often 20–50 GB. Rebuilds on next compile.' },
  { id: 'xcode-archives', name: 'Xcode Archives', safety: 'caution', group: 'apple', paths: ['~/Library/Developer/Xcode/Archives'], details: 'Archived builds for distribution. Review before deleting — needed for symbolication of shipped releases.' },
  { id: 'xcode-device-support', name: 'Xcode iOS DeviceSupport', safety: 'safe', group: 'apple', paths: ['~/Library/Developer/Xcode/iOS DeviceSupport', 'watchOS/tvOS/visionOS DeviceSupport'], details: 'Symbols copied from connected iPhones, iPads, Watches, TVs and Vision Pros. Copies again on connect.' },
  { id: 'simulator-caches', name: 'iOS Simulator Caches', safety: 'safe', group: 'apple', paths: ['~/Library/Developer/CoreSimulator/Caches'], details: 'Cached data for the iOS Simulator. Safe to delete.' },
  { id: 'simulators', name: 'Simulator Runtimes & Devices', safety: 'caution', group: 'apple', paths: ['simctl runtimes & devices'], details: 'Removed with Xcode’s simctl — cannot be restored from Trash. Re-download via Xcode › Settings › Components.' },
  { id: 'xcode-previews', name: 'SwiftUI Previews Data', safety: 'safe', group: 'apple', paths: ['~/Library/Developer/Xcode/UserData/Previews'], details: 'Simulator devices and builds Xcode creates for SwiftUI previews. Recreated automatically.' },
  { id: 'spm-cache', name: 'Swift Package Manager Cache', safety: 'safe', group: 'apple', paths: ['~/Library/Caches/org.swift.swiftpm', '~/Library/org.swift.swiftpm'], details: 'Resolved Swift packages. Safe to delete; re-resolves on next build.' },
  { id: 'cocoapods-cache', name: 'CocoaPods Cache', safety: 'safe', group: 'apple', paths: ['~/Library/Caches/CocoaPods'], details: 'Cached CocoaPods downloads. Safe to delete.' },
  { id: 'npm-cache', name: 'npm Cache', safety: 'safe', group: 'toolchain', paths: ['~/.npm'], details: 'npm download cache. Safe to delete (or run npm cache clean --force).' },
  { id: 'yarn-cache', name: 'Yarn Cache', safety: 'safe', group: 'toolchain', paths: ['~/Library/Caches/Yarn', '~/.yarn/cache'], details: 'Yarn v1 global cache. Safe to delete.' },
  { id: 'pnpm-store', name: 'pnpm Store', safety: 'safe', group: 'toolchain', paths: ['~/.pnpm-store', '~/Library/pnpm/store', '~/.local/share/pnpm/store'], details: 'pnpm content-addressable store. Safe to delete or prune.' },
  { id: 'pip-cache', name: 'pip Cache', safety: 'safe', group: 'toolchain', paths: ['~/Library/Caches/pip', '~/.cache/pip'], details: 'Python pip download/wheel cache. Safe to delete.' },
  { id: 'poetry-cache', name: 'Poetry Cache', safety: 'safe', group: 'toolchain', paths: ['~/Library/Caches/pypoetry'], details: 'Python Poetry cache. Safe to delete.' },
  { id: 'homebrew-cache', name: 'Homebrew Cache', safety: 'safe', group: 'toolchain', paths: ['~/Library/Caches/Homebrew', '/Library/Caches/Homebrew'], details: 'Downloaded bottles and source archives. Safe to delete (or brew cleanup).' },
  { id: 'gradle-cache', name: 'Gradle Cache', safety: 'safe', group: 'toolchain', paths: ['~/.gradle/caches'], details: 'Gradle build cache and downloaded dependencies. Safe to delete.' },
  { id: 'cargo-cache', name: 'Cargo Registry Cache', safety: 'safe', group: 'toolchain', paths: ['~/.cargo/registry/cache', '~/.cargo/registry/src', '~/.cargo/git/db'], details: 'Rust crate download cache. Safe to delete.' },
  { id: 'docker-data', name: 'Docker Desktop Data', safety: 'caution', group: 'toolchain', paths: ['~/Library/Containers/com.docker.docker/Data/vms', '~/Library/Group Containers/group.com.docker'], details: 'Docker images, containers and volumes. Use docker system prune -a for a safe clean.' },
  { id: 'claude-data', name: 'Claude Caches & History', safety: 'caution', group: 'apps', paths: ['~/Library/Application Support/Claude/*', '~/.claude/projects', '~/.claude/todos'], details: 'Regenerable caches, logs, and local chat/session history for Claude Desktop & CLI. Keeps sign-in intact.' },
  { id: 'ios-backups', name: 'iOS Device Backups', safety: 'caution', group: 'apple', paths: ['~/Library/Application Support/MobileSync/Backup'], details: 'Local backups of iPhones/iPads via Finder. Review carefully before deleting.' },
  { id: 'ios-updates', name: 'iOS Software Updates', safety: 'safe', group: 'apple', paths: ['~/Library/iTunes/iPhone Software Updates', 'iPad/iPod Software Updates'], details: 'iPhone and iPad software files (.ipsw) Finder downloaded. Finder downloads again when needed.' },
  { id: 'app-caches', name: 'App Caches (Popular Apps)', safety: 'safe', group: 'apps', paths: ['app_junk_db.json (Slack, Discord, VS Code, Chrome, Adobe, Steam)'], details: 'Cache folders popular apps hide outside ~/Library/Caches. Quit the app before cleaning; everything regenerates.' },
  { id: 'dev-projects', name: 'Developer Project Leftovers', safety: 'caution', group: 'toolchain', paths: ['node_modules', 'target', '__pycache__', '.gradle', 'Pods', '.next', 'dist'], details: 'Regenerable build output and dependency folders inside your code projects. Review before deleting.' },
  { id: 'system-downloads', name: 'Old Downloads', safety: 'caution', group: 'apps', paths: ['~/Downloads'], details: 'Items in ~/Downloads. Review carefully before deleting.' },
];

// MARK: - Interactive Demo State & Data

function createInitialDemoState() {
  return {
    section: 'storage',
    fdaGranted: true,
    isScanning: false,
    liveScanBytes: 0,
    expandedCats: new Set(['xcode-derived']),
    volume: { total: 500 * GB, used: 286.4 * GB, available: 213.6 * GB },

    storageCategories: [
      {
        id: 'xcode-derived',
        name: 'Xcode DerivedData',
        safety: 'safe',
        details: 'Xcode build intermediates and indexes. Rebuilds on next compile.',
        children: [
          { id: 'dd-1', name: 'macos-clean-fjkq9w', path: '~/Library/Developer/Xcode/DerivedData/macos-clean', bytes: 9.4 * GB, selected: true },
          { id: 'dd-2', name: 'ClientApp-cxdl20p', path: '~/Library/Developer/Xcode/DerivedData/ClientApp', bytes: 6.1 * GB, selected: true },
          { id: 'dd-3', name: 'ModuleCache.noindex', path: '~/Library/Developer/Xcode/DerivedData/ModuleCache.noindex', bytes: 3.1 * GB, selected: true },
        ],
      },
      {
        id: 'user-caches',
        name: 'User Application Caches',
        safety: 'safe',
        details: 'Cached data from installed apps. Safe to delete; apps regenerate as needed.',
        children: [
          { id: 'uc-1', name: 'Google (Chrome Cache)', path: '~/Library/Caches/Google', bytes: 3.2 * GB, selected: true },
          { id: 'uc-2', name: 'Homebrew', path: '~/Library/Caches/Homebrew', bytes: 1.6 * GB, selected: true },
        ],
      },
      {
        id: 'app-caches',
        name: 'App Caches (Popular Apps)',
        safety: 'safe',
        details: 'Electron & browser Code Caches (Slack, Discord, VS Code, Steam).',
        children: [
          { id: 'ac-1', name: 'Code Cache (VS Code)', path: '~/Library/Application Support/Code/Cache', bytes: 1.7 * GB, selected: true },
          { id: 'ac-2', name: 'Slack & Discord GPUCache', path: '~/Library/Application Support/Slack/Cache', bytes: 1.2 * GB, selected: true },
        ],
      },
      {
        id: 'dev-projects',
        name: 'Developer Project Leftovers',
        safety: 'caution',
        details: 'Regenerable node_modules, Rust target, and .next folders in ~/Projects.',
        children: [
          { id: 'dp-1', name: 'target (Rust build)', path: '~/Projects/reference-clean/src-tauri/target', bytes: 4.9 * GB, selected: false },
          { id: 'dp-2', name: 'node_modules', path: '~/Projects/marketing-site/node_modules', bytes: 2.5 * GB, selected: false },
        ],
      },
      {
        id: 'simulators',
        name: 'Simulator Runtimes & Devices',
        safety: 'caution',
        details: 'Removed with Xcode’s simctl — cannot be restored from Trash.',
        isSimctl: true,
        children: [
          { id: 'sim-1', name: 'iOS 26.0 Simulator Runtime', path: 'simctl runtime delete iOS-26-0', bytes: 3.5 * GB, selected: false },
        ],
      },
      {
        id: 'claude-data',
        name: 'Claude Caches & History',
        safety: 'caution',
        details: 'Regenerable caches and local session history for Claude Desktop & CLI.',
        children: [
          { id: 'cl-1', name: 'Claude Desktop GPU & WebCache', path: '~/Library/Application Support/Claude/Cache', bytes: 1.2 * GB, selected: false },
        ],
      },
    ],

    largeThresholdMB: 100,
    largeSortKey: 'sizeBytes',
    largeSortAsc: false,
    focusedLargeId: null,
    largeFiles: [
      { id: 'lf-1', name: 'Xcode_26_SDK_Archive.xip', sizeBytes: 14.2 * GB, kind: 'Xcode Archive', modified: 'Nov 12, 2026', location: '~/Downloads', selected: false },
      { id: 'lf-2', name: 'Demo-Walkthrough-4K.mov', sizeBytes: 3.8 * GB, kind: 'QuickTime Movie', modified: 'Nov 20, 2026', location: '~/Movies/ScreenCaptures', selected: false },
      { id: 'lf-3', name: 'Ubuntu-ARM64-Base.iso', sizeBytes: 2.4 * GB, kind: 'Disk Image', modified: 'Oct 28, 2026', location: '~/Downloads/ISOs', selected: false },
      { id: 'lf-4', name: 'LLM-Weights-Q4.gguf', sizeBytes: 640 * MB, kind: 'Model Binary', modified: 'Nov 18, 2026', location: '~/Models', selected: false },
      { id: 'lf-5', name: 'Podcast-Master.wav', sizeBytes: 310 * MB, kind: 'WAVE Audio', modified: 'Sep 30, 2026', location: '~/Desktop', selected: false },
    ],

    browserPath: ['~', 'Library', 'Developer'],
    browserSelected: '~/Library/Developer/Xcode',

    uninstallerSelectedId: 'removed-docker',
    removedApps: [
      {
        id: 'removed-docker',
        name: 'Docker Desktop',
        bundleID: 'com.docker.docker',
        removedAt: '2 days ago',
        glyph: '🐳',
        groups: [
          {
            id: 'g-vm', title: 'Containers & VM Data', mayContainUserData: true,
            entries: [
              { id: 'dk-1', path: '~/Library/Containers/com.docker.docker/Data/vms', bytes: 8.6 * GB, selected: true },
              { id: 'dk-2', path: '~/Library/Group Containers/group.com.docker', bytes: 1.4 * GB, selected: true },
            ],
          },
          {
            id: 'g-cache', title: 'Caches & Logs', mayContainUserData: false,
            entries: [
              { id: 'dk-3', path: '~/Library/Caches/com.docker.docker', bytes: 320 * MB, selected: true },
            ],
          },
        ],
      },
      {
        id: 'removed-sketch',
        name: 'Sketch Beta',
        bundleID: 'com.bohemiancoding.sketch3',
        removedAt: '5 days ago',
        glyph: '💎',
        groups: [
          {
            id: 'g-sk', title: 'Application Support', mayContainUserData: true,
            entries: [
              { id: 'sk-1', path: '~/Library/Application Support/com.bohemiancoding.sketch3', bytes: 640 * MB, selected: true },
            ],
          },
        ],
      },
    ],
    installedApps: [
      {
        id: 'app-vscode',
        name: 'Visual Studio Code',
        version: '1.104',
        bundleID: 'com.microsoft.VSCode',
        bytes: 490 * MB,
        glyph: '💠',
        canUninstall: true,
        includeApp: true,
        groups: [
          {
            id: 'vsc-c', title: 'Caches & Code Cache', mayContainUserData: false,
            entries: [
              { id: 'vsc-1', path: '~/Library/Caches/com.microsoft.VSCode', bytes: 1.7 * GB, selected: true },
            ],
          },
          {
            id: 'vsc-s', title: 'Application Support', mayContainUserData: true,
            entries: [
              { id: 'vsc-2', path: '~/Library/Application Support/Code', bytes: 620 * MB, selected: false },
            ],
          },
        ],
      },
      {
        id: 'app-safari',
        name: 'Safari',
        version: '26.0',
        bundleID: 'com.apple.Safari',
        bytes: 185 * MB,
        glyph: '🧭',
        canUninstall: false,
        groups: [],
      },
    ],

    trashFilter: 'all',
    trashItems: [
      { id: 'tr-1', name: 'Old-Xcode-Beta.app', bytes: 1.4 * GB, kind: 'Application', daysAgo: 42, dateLabel: '42 days ago', selected: false },
      { id: 'tr-2', name: 'build-cache-oct.tar.gz', bytes: 420 * MB, kind: 'Gzip Archive', daysAgo: 12, dateLabel: '12 days ago', selected: false },
    ],
  };
}

const BROWSER_TREE = {
  '~': [
    { name: 'Applications', path: '~/Applications', isDir: true, bytes: 18.4 * GB },
    { name: 'Desktop', path: '~/Desktop', isDir: true, bytes: 2.1 * GB },
    { name: 'Downloads', path: '~/Downloads', isDir: true, bytes: 16.9 * GB },
    { name: 'Library', path: '~/Library', isDir: true, bytes: 61.2 * GB },
    { name: 'Projects', path: '~/Projects', isDir: true, bytes: 129.0 * GB },
  ],
  '~/Library': [
    { name: 'Application Support', path: '~/Library/Application Support', isDir: true, bytes: 19.6 * GB },
    { name: 'Caches', path: '~/Library/Caches', isDir: true, bytes: 4.8 * GB },
    { name: 'Containers', path: '~/Library/Containers', isDir: true, bytes: 12.1 * GB },
    { name: 'Developer', path: '~/Library/Developer', isDir: true, bytes: 24.7 * GB },
    { name: 'Logs', path: '~/Library/Logs', isDir: true, bytes: 410 * MB },
  ],
  '~/Library/Developer': [
    { name: 'CoreSimulator', path: '~/Library/Developer/CoreSimulator', isDir: true, bytes: 6.1 * GB },
    { name: 'Xcode', path: '~/Library/Developer/Xcode', isDir: true, bytes: 18.6 * GB },
  ],
  '~/Library/Developer/Xcode': [
    { name: 'DerivedData', path: '~/Library/Developer/Xcode/DerivedData', isDir: true, bytes: 18.6 * GB },
    { name: 'iOS DeviceSupport', path: '~/Library/Developer/Xcode/iOS DeviceSupport', isDir: true, bytes: 3.4 * GB },
    { name: 'Archives', path: '~/Library/Developer/Xcode/Archives', isDir: true, bytes: 2.2 * GB },
  ],
  '~/Library/Developer/Xcode/DerivedData': [
    { name: 'macos-clean-fjkq9w', path: '~/Library/Developer/Xcode/DerivedData/macos-clean', isDir: true, bytes: 9.4 * GB },
    { name: 'ClientApp-cxdl20p', path: '~/Library/Developer/Xcode/DerivedData/ClientApp', isDir: true, bytes: 6.1 * GB },
    { name: 'ModuleCache.noindex', path: '~/Library/Developer/Xcode/DerivedData/ModuleCache.noindex', isDir: true, bytes: 3.1 * GB },
  ],
  '~/Projects': [
    { name: 'macos-clean', path: '~/Projects/macos-clean', isDir: true, bytes: 1.4 * GB },
    { name: 'reference-clean', path: '~/Projects/reference-clean', isDir: true, bytes: 5.2 * GB },
    { name: 'demo-archive.zip', path: '~/Projects/demo-archive.zip', isDir: false, bytes: 890 * MB },
  ],
  '~/Downloads': [
    { name: 'Xcode_26_SDK_Archive.xip', path: '~/Downloads/Xcode_26_SDK_Archive.xip', isDir: false, bytes: 14.2 * GB },
    { name: 'Ubuntu-ARM64-Base.iso', path: '~/Downloads/Ubuntu-ARM64-Base.iso', isDir: false, bytes: 2.4 * GB },
  ],
};

// MARK: - App Initialization

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initCopyButtons();
  initCategoryExplorer();

  const heroCanvas = document.getElementById('hero-bubbl-canvas');
  const heroBubbl = new BubblEngine(heroCanvas, {
    logicalWidth: 150,
    logicalHeight: 124,
    radius: 36,
    mood: 'junkFound',
    moodBytes: 26.3 * GB,
    leftoverCount: 2,
  });
  heroBubbl.start();

  const pgCanvas = document.getElementById('playground-bubbl-canvas');
  const pgBubbl = new BubblEngine(pgCanvas, {
    logicalWidth: 240,
    logicalHeight: 194,
    radius: 54,
    mood: 'idle',
  });
  pgBubbl.start();

  initPlayground(pgBubbl);
  initMacWindowDemo(heroBubbl);
});

// MARK: - Theme Toggle

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');

  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('macos-clean-theme', theme);
    if (theme === 'light') {
      icon.textContent = '☀';
      label.textContent = 'Light';
    } else {
      icon.textContent = '☾';
      label.textContent = 'Dark';
    }
  };

  const saved = localStorage.getItem('macos-clean-theme');
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
  }

  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
}

// MARK: - Copy Buttons

function initCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy || '';
      try {
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1600);
      } catch {
        btn.textContent = 'Copy manually';
      }
    });
  });
}

// MARK: - "What it cleans" chip cloud

function initCategoryExplorer() {
  const grid = document.getElementById('categories-grid');
  const filterBtns = document.querySelectorAll('#category-filters .filter-pill');
  if (!grid) return;
  let activeFilter = 'all';

  const render = () => {
    const filtered = ALL_CATEGORIES.filter(
      (cat) => activeFilter === 'all' || cat.group === activeFilter
    );
    grid.innerHTML = filtered
      .map(
        (cat) => `<span class="cat-chip" title="${escapeHtml(cat.details)}"><i class="dot-${cat.safety}"></i>${escapeHtml(cat.name)}</span>`
      )
      .join('');
  };

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeFilter = btn.dataset.filter;
      render();
    });
  });

  render();
}

// MARK: - Meet Bubbl Playground

function initPlayground(pgBubbl) {
  const moodButtons = document.querySelectorAll('#pg-mood-buttons button');
  const reactionButtons = document.querySelectorAll('#pg-reaction-buttons button');
  const moodLabel = document.getElementById('pg-mood-label');
  const reduceToggle = document.getElementById('pg-reduce-motion');
  const canvas = document.getElementById('playground-bubbl-canvas');

  const labels = {
    idle: 'Idle',
    scanning: 'Scanning…',
    junkFound: 'Found 42 GB of junk',
    cleaning: 'Moving to Trash…',
    pop: 'Freed 14.8 GB!',
    nothingToClean: 'All clean',
    blocked: 'Needs Full Disk Access',
    whoa: 'Whoa, a 10 GB file!',
  };

  moodButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      moodButtons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const m = btn.dataset.mood;
      moodLabel.textContent = labels[m] || m;
      if (m === 'pop') {
        pgBubbl.clearPop();
        pgBubbl.setMood('junkFound', 14.8 * GB);
        pgBubbl.triggerPop(14.8 * GB);
      } else {
        pgBubbl.clearPop();
        pgBubbl.setMood(m, m === 'whoa' || m === 'junkFound' ? 42 * GB : 0);
      }
    });
  });

  reactionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = btn.dataset.reaction;
      if (r === 'split') {
        pgBubbl.triggerSplit();
        moodLabel.textContent = 'Split!';
      } else {
        pgBubbl.triggerReaction(r);
      }
    });
  });

  canvas.addEventListener('click', () => {
    pgBubbl.pokeOrTap();
  });

  pgBubbl.onSplit = () => {
    moodLabel.textContent = 'Split!';
  };

  reduceToggle?.addEventListener('change', (e) => {
    pgBubbl.setReduceMotion(e.target.checked);
  });
}

// MARK: - Interactive macOS 26 Window Controller

function initMacWindowDemo(heroBubbl) {
  let state = createInitialDemoState();
  let toastTimer = null;

  const sidebarItems = document.querySelectorAll('.sidebar-item[data-section]');
  const fdaToggleBtn = document.getElementById('window-fda-toggle');
  const fdaToggleLabel = document.getElementById('window-fda-label');
  const uninstallerBadge = document.getElementById('uninstaller-badge');
  const sidebarTrashMeta = document.getElementById('sidebar-trash-meta');
  const navTitle = document.getElementById('mac-nav-title');
  const navSubtitle = document.getElementById('mac-nav-subtitle');
  const toolbarActions = document.getElementById('mac-toolbar-actions');
  const contentPane = document.getElementById('mac-section-content');
  const selectionBar = document.getElementById('window-selection-bar');
  const bubblOverlay = document.getElementById('hero-bubbl-overlay');
  const bubblCanvas = document.getElementById('hero-bubbl-canvas');
  const leftoversChip = document.getElementById('hero-leftovers-chip');
  const toastEl = document.getElementById('celebration-toast');
  const modalBackdrop = document.getElementById('mac-modal-backdrop');
  const modalDialog = document.getElementById('mac-modal-dialog');
  const resetDemoBtn = document.getElementById('reset-demo-btn');

  heroBubbl.onTapBlocked = () => openFDAModal();
  leftoversChip.addEventListener('click', (e) => {
    e.stopPropagation();
    switchSection('uninstaller');
  });

  // Draggable corner Bubbl snapping
  initDraggableCorner(bubblOverlay, document.getElementById('mac-detail-area'), heroBubbl);

  document.getElementById('toast-close-btn').addEventListener('click', () => {
    toastEl.hidden = true;
  });
  document.getElementById('toast-empty-btn').addEventListener('click', () => {
    toastEl.hidden = true;
    switchSection('trash');
  });

  sidebarItems.forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  fdaToggleBtn.addEventListener('click', () => {
    if (state.fdaGranted) {
      state.fdaGranted = false;
      renderAll();
    } else {
      openFDAModal();
    }
  });

  resetDemoBtn.addEventListener('click', () => {
    state = createInitialDemoState();
    toastEl.hidden = true;
    heroBubbl.clearPop();
    renderAll();
  });

  // Keyboard shortcut Cmd+R inside preview when focused
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
      const rect = document.getElementById('app-window').getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        e.preventDefault();
        runScanSimulation();
      }
    }
  });

  function switchSection(sec) {
    state.section = sec;
    renderAll();
  }

  function storageTotals() {
    let found = 0;
    let selected = 0;
    let selectedCount = 0;
    const selectedPaths = [];
    let hasSimctl = false;
    for (const cat of state.storageCategories) {
      for (const ch of cat.children) {
        found += ch.bytes;
        if (ch.selected) {
          selected += ch.bytes;
          selectedCount++;
          selectedPaths.push(ch);
          if (cat.isSimctl) hasSimctl = true;
        }
      }
    }
    return { found, selected, selectedCount, selectedPaths, hasSimctl };
  }

  function trashTotals() {
    let total = 0;
    let pickedBytes = 0;
    const picked = [];
    for (const item of state.trashItems) {
      total += item.bytes;
      if (item.selected) {
        pickedBytes += item.bytes;
        picked.push(item);
      }
    }
    return { total, pickedBytes, picked };
  }

  function updateBubblForScene(hasBottomBar) {
    bubblOverlay.classList.toggle('no-bottom-bar', !hasBottomBar);
    const removedCount = state.removedApps.length;
    heroBubbl.leftoverCount = removedCount;
    leftoversChip.hidden = removedCount === 0;
    if (removedCount > 0) {
      leftoversChip.querySelector('span').textContent =
        removedCount === 1
          ? '✨ 1 removed app left files behind'
          : `✨ ${removedCount} removed apps left files behind`;
    }

    if (state.isScanning) {
      heroBubbl.setMood('scanning');
      heroBubbl.carriedAppLabel = null;
      return;
    }

    if (!state.fdaGranted && state.section === 'storage') {
      heroBubbl.setMood('blocked');
      heroBubbl.setSelectionShare(0);
      return;
    }

    if (state.section === 'storage') {
      const { found, selected } = storageTotals();
      if (found < 50 * MB) {
        heroBubbl.setMood('nothingToClean');
        heroBubbl.setSelectionShare(0);
      } else {
        heroBubbl.setMood('junkFound', found);
        heroBubbl.setSelectionShare(found > 0 ? selected / found : 0);
      }
      heroBubbl.carriedAppLabel = null;
    } else if (state.section === 'largeFiles') {
      const visible = state.largeFiles.filter((f) => f.sizeBytes >= state.largeThresholdMB * MB);
      const total = visible.reduce((a, f) => a + f.sizeBytes, 0);
      const checked = visible.filter((f) => f.selected).reduce((a, f) => a + f.sizeBytes, 0);
      const largest = visible.reduce((max, f) => Math.max(max, f.sizeBytes), 0);
      if (largest >= 10 * GB) {
        heroBubbl.setMood('whoa', largest);
      } else if (total < 50 * MB) {
        heroBubbl.setMood('nothingToClean');
      } else {
        heroBubbl.setMood('junkFound', total);
      }
      heroBubbl.setSelectionShare(total > 0 ? checked / total : 0);
      heroBubbl.carriedAppLabel = null;
    } else if (state.section === 'fileBrowser') {
      const entries = Object.values(BROWSER_TREE).flat();
      const sel = entries.find((e) => e.path === state.browserSelected);
      if (sel && !sel.isDir && sel.bytes >= 10 * GB) {
        heroBubbl.setMood('whoa', sel.bytes);
      } else {
        heroBubbl.setMood('idle');
      }
      heroBubbl.setSelectionShare(0);
      heroBubbl.carriedAppLabel = null;
    } else if (state.section === 'uninstaller') {
      const item = findSelectedUninstallItem();
      if (!item) {
        heroBubbl.setMood('idle');
        heroBubbl.setSelectionShare(0);
      } else {
        const { totalBytes, selectedBytes } = uninstallItemMetrics(item);
        if (totalBytes >= 10 * GB) heroBubbl.setMood('whoa', totalBytes);
        else if (totalBytes > 0) heroBubbl.setMood('junkFound', totalBytes);
        else heroBubbl.setMood('nothingToClean');
        heroBubbl.setSelectionShare(totalBytes > 0 ? selectedBytes / totalBytes : 0);
      }
      heroBubbl.carriedAppLabel = null;
    } else if (state.section === 'trash') {
      const { total, pickedBytes } = trashTotals();
      if (!state.fdaGranted) {
        heroBubbl.setMood('blocked');
      } else if (total === 0) {
        heroBubbl.setMood('nothingToClean');
      } else {
        heroBubbl.setMood('junkFound', total);
      }
      heroBubbl.setSelectionShare(total > 0 ? pickedBytes / total : 0);
      heroBubbl.carriedAppLabel = null;
    }
  }

  function renderAll() {
    sidebarItems.forEach((btn) => {
      const active = btn.dataset.section === state.section;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    uninstallerBadge.textContent = state.removedApps.length > 0 ? String(state.removedApps.length) : '';
    const tTotals = trashTotals();
    sidebarTrashMeta.textContent = state.trashItems.length > 0 ? formatBytes(tTotals.total) : 'Empty';

    fdaToggleBtn.classList.toggle('is-granted', state.fdaGranted);
    fdaToggleLabel.textContent = state.fdaGranted ? 'Full Disk Access is on' : 'Full Disk Access is off';

    renderToolbar();
    const hasBottomBar = renderSectionBody();
    updateBubblForScene(hasBottomBar);
  }

  function renderToolbar() {
    if (state.section === 'storage') {
      const { found } = storageTotals();
      navTitle.textContent = 'Storage Manager';
      navSubtitle.textContent = state.isScanning
        ? `Scanning… ${formatBytes(state.liveScanBytes)} so far`
        : `${formatBytes(found)} found`;
      toolbarActions.innerHTML = `
        <button type="button" class="mac-tb-btn" id="tb-select-all">Select All</button>
        <button type="button" class="mac-tb-btn" id="tb-select-none">Deselect All</button>
        <button type="button" class="mac-tb-btn" id="tb-rescan" ${state.isScanning ? 'disabled' : ''}>↻ ${state.isScanning ? 'Scanning…' : 'Rescan All ⌘R'}</button>
      `;
      document.getElementById('tb-select-all').onclick = () => {
        state.storageCategories.forEach((c) => c.children.forEach((ch) => (ch.selected = true)));
        heroBubbl.triggerReaction('bigGulp');
        renderAll();
      };
      document.getElementById('tb-select-none').onclick = () => {
        state.storageCategories.forEach((c) => c.children.forEach((ch) => (ch.selected = false)));
        heroBubbl.triggerReaction('spit');
        renderAll();
      };
      document.getElementById('tb-rescan').onclick = () => runScanSimulation();
    } else if (state.section === 'largeFiles') {
      const visible = state.largeFiles.filter((f) => f.sizeBytes >= state.largeThresholdMB * MB);
      const total = visible.reduce((a, f) => a + f.sizeBytes, 0);
      navTitle.textContent = 'Large Files';
      navSubtitle.textContent = `${visible.length} files · ${formatBytes(total)}`;
      toolbarActions.innerHTML = `
        <select class="mac-tb-select" id="tb-threshold" aria-label="Minimum file size">
          <option value="100" ${state.largeThresholdMB === 100 ? 'selected' : ''}>≥ 100 MB</option>
          <option value="250" ${state.largeThresholdMB === 250 ? 'selected' : ''}>≥ 250 MB</option>
          <option value="500" ${state.largeThresholdMB === 500 ? 'selected' : ''}>≥ 500 MB</option>
          <option value="1000" ${state.largeThresholdMB === 1000 ? 'selected' : ''}>≥ 1 GB</option>
        </select>
        <button type="button" class="mac-tb-btn" id="tb-lf-rescan">↻ Scan Again</button>
      `;
      document.getElementById('tb-threshold').onchange = (e) => {
        state.largeThresholdMB = Number(e.target.value);
        renderAll();
      };
      document.getElementById('tb-lf-rescan').onclick = () => runScanSimulation();
    } else if (state.section === 'fileBrowser') {
      navTitle.textContent = 'File Browser';
      navSubtitle.textContent = '~ · 286.4 GB';
      toolbarActions.innerHTML = `
        <button type="button" class="mac-tb-btn" id="tb-fb-home">🏠 Home</button>
        <button type="button" class="mac-tb-btn" id="tb-fb-reload">↻ Reload</button>
      `;
      document.getElementById('tb-fb-home').onclick = () => {
        const oldLen = state.browserPath.length;
        state.browserPath = ['~'];
        state.browserSelected = '~/Library';
        if (oldLen > 1) heroBubbl.triggerReaction('surface');
        renderAll();
      };
      document.getElementById('tb-fb-reload').onclick = () => runScanSimulation();
    } else if (state.section === 'uninstaller') {
      navTitle.textContent = 'Uninstaller';
      navSubtitle.textContent = `${state.installedApps.filter((a) => a.canUninstall).length} apps · ${state.removedApps.length} removed with leftovers`;
      toolbarActions.innerHTML = `
        <button type="button" class="mac-tb-btn" id="tb-un-refresh">↻ Refresh</button>
      `;
      document.getElementById('tb-un-refresh').onclick = () => runScanSimulation();
    } else if (state.section === 'trash') {
      const { total } = trashTotals();
      navTitle.textContent = 'Trash';
      navSubtitle.textContent = !state.fdaGranted
        ? 'No access'
        : state.trashItems.length === 0
          ? 'Empty'
          : `${state.trashItems.length} items · ${formatBytes(total)}`;
      toolbarActions.innerHTML = `
        <select class="mac-tb-select" id="tb-trash-filter" aria-label="Filter Trash">
          <option value="all" ${state.trashFilter === 'all' ? 'selected' : ''}>All Items</option>
          <option value="old30" ${state.trashFilter === 'old30' ? 'selected' : ''}>Trashed &gt; 30 Days Ago</option>
          <option value="gt1gb" ${state.trashFilter === 'gt1gb' ? 'selected' : ''}>Larger Than 1 GB</option>
        </select>
        <button type="button" class="mac-tb-btn is-danger" id="tb-empty-trash" ${state.trashItems.length === 0 || !state.fdaGranted ? 'disabled' : ''}>Empty Trash…</button>
      `;
      document.getElementById('tb-trash-filter').onchange = (e) => {
        state.trashFilter = e.target.value;
        renderAll();
      };
      document.getElementById('tb-empty-trash').onclick = () => requestEmptyTrash();
    }
  }

  function renderSectionBody() {
    if (state.section === 'storage') return renderStorageView();
    if (state.section === 'largeFiles') return renderLargeFilesView();
    if (state.section === 'fileBrowser') return renderFileBrowserView();
    if (state.section === 'uninstaller') return renderUninstallerView();
    return renderTrashView();
  }

  function renderStorageView() {
    const { found, selected, selectedCount } = storageTotals();
    const otherUsed = Math.max(0, state.volume.used - found);
    const total = state.volume.total;
    const wOther = (otherUsed / total) * 100;
    const wCleanable = (Math.max(0, found - selected) / total) * 100;
    const wSelected = (selected / total) * 100;

    let html = `
      <div class="storage-summary">
        <p class="storage-big-number">${state.isScanning ? `Scanning… ${formatBytes(state.liveScanBytes)}` : formatBytes(found)}</p>
        <p class="storage-lead">Found in caches, logs, developer files and downloads. Safe items are ticked for you; review the ones marked Caution.</p>
        <div class="storage-bar-track" aria-label="Disk usage breakdown">
          <div class="seg-used" style="width:${wOther.toFixed(1)}%"></div>
          <div class="seg-cleanable" style="width:${wCleanable.toFixed(1)}%"></div>
          <div class="seg-selected" style="width:${wSelected.toFixed(1)}%"></div>
        </div>
        <div class="storage-legend">
          <span class="legend-item"><i class="legend-dot" style="background:rgba(148,163,184,.55)"></i> Used ${formatBytes(otherUsed)}</span>
          ${found - selected > 0 ? `<span class="legend-item"><i class="legend-dot" style="background:rgba(249,115,22,.75)"></i> Cleanable ${formatBytes(found - selected)}</span>` : ''}
          ${selected > 0 ? `<span class="legend-item"><i class="legend-dot" style="background:var(--teal-400)"></i> Selected ${formatBytes(selected)}</span>` : ''}
          <span class="legend-item"><i class="legend-dot" style="background:rgba(148,163,184,.25)"></i> Free ${formatBytes(state.volume.available)}</span>
        </div>
      </div>
    `;

    if (!state.fdaGranted) {
      html += `
        <div class="fda-inline-banner">
          <div>
            <strong>macOS blocked access to 3 folders</strong>
            <p>Give macos-clean Full Disk Access in System Settings to inspect ~/Library/Caches and ~/.Trash.</p>
          </div>
          <button type="button" class="mac-tb-btn" id="inline-open-fda">Open System Settings</button>
        </div>
      `;
    }

    if (state.storageCategories.length === 0) {
      html += `<div style="padding:36px 0;text-align:center;color:var(--text-secondary);">✨ Nothing left to clean here! Click <strong>Reset Demo</strong> above to restore sample items.</div>`;
    } else {
      html += `<div class="category-list">`;
      for (const cat of state.storageCategories) {
        const catTotal = cat.children.reduce((s, c) => s + c.bytes, 0);
        const catSel = cat.children.filter((c) => c.selected).reduce((s, c) => s + c.bytes, 0);
        const selCount = cat.children.filter((c) => c.selected).length;
        const checkState = selCount === 0 ? 'off' : selCount === cat.children.length ? 'on' : 'mixed';
        const isOpen = state.expandedCats.has(cat.id);

        html += `
          <div class="cat-card">
            <div class="cat-row">
              <button type="button" class="cat-expand-btn ${isOpen ? 'is-open' : ''}" data-expand="${cat.id}" aria-label="Expand ${escapeHtml(cat.name)}">▶</button>
              <button type="button" class="tri-checkbox" data-cat-check="${cat.id}" data-state="${checkState}" aria-label="Select ${escapeHtml(cat.name)}">
                ${checkState === 'on' ? '✓' : checkState === 'mixed' ? '–' : ''}
              </button>
              <div class="cat-info">
                <div class="cat-title-line">
                  <span class="cat-title">${escapeHtml(cat.name)}</span>
                  <span class="safety-badge ${cat.safety === 'safe' ? 'badge-safe' : 'badge-caution'}">${cat.safety}</span>
                </div>
                <p class="cat-desc">${escapeHtml(cat.details)}</p>
              </div>
              <div class="cat-size-col">
                <div class="cat-size-total">${formatBytes(catTotal)}</div>
                ${catSel > 0 ? `<div class="cat-size-selected">${formatBytes(catSel)} selected</div>` : ''}
              </div>
            </div>
            ${
              isOpen
                ? `<div class="cat-children">
                    ${cat.children
                      .map(
                        (ch) => `
                      <div class="cat-child-row">
                        <button type="button" class="tri-checkbox" data-child-check="${cat.id}:${ch.id}" data-state="${ch.selected ? 'on' : 'off'}" aria-label="Select ${escapeHtml(ch.name)}">
                          ${ch.selected ? '✓' : ''}
                        </button>
                        <div class="cat-child-name">
                          <span>${escapeHtml(ch.name)}</span>
                          <span class="cat-child-path">${escapeHtml(ch.path)}</span>
                        </div>
                        <span class="cat-child-size">${formatBytes(ch.bytes)}</span>
                      </div>`
                      )
                      .join('')}
                  </div>`
                : ''
            }
          </div>
        `;
      }
      html += `</div>`;
    }

    contentPane.innerHTML = html;

    if (!state.fdaGranted) {
      document.getElementById('inline-open-fda').onclick = () => openFDAModal();
    }

    contentPane.querySelectorAll('[data-expand]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.expand;
        if (state.expandedCats.has(id)) state.expandedCats.delete(id);
        else state.expandedCats.add(id);
        renderAll();
      };
    });

    contentPane.querySelectorAll('[data-cat-check]').forEach((btn) => {
      btn.onclick = () => {
        const cat = state.storageCategories.find((c) => c.id === btn.dataset.catCheck);
        if (!cat) return;
        const allOn = cat.children.every((c) => c.selected);
        cat.children.forEach((c) => (c.selected = !allOn));
        heroBubbl.triggerReaction(allOn ? 'spit' : 'gulp');
        renderAll();
      };
    });

    contentPane.querySelectorAll('[data-child-check]').forEach((btn) => {
      btn.onclick = () => {
        const [cid, chid] = btn.dataset.childCheck.split(':');
        const cat = state.storageCategories.find((c) => c.id === cid);
        const ch = cat?.children.find((c) => c.id === chid);
        if (!ch) return;
        ch.selected = !ch.selected;
        heroBubbl.triggerReaction(ch.selected ? 'gulp' : 'spit');
        renderAll();
      };
    });

    if (selectedCount > 0) {
      selectionBar.hidden = false;
      selectionBar.innerHTML = `
        <div>
          <div class="sel-title">${formatBytes(selected)} selected</div>
          <div class="sel-detail">${selectedCount} ${selectedCount === 1 ? 'item' : 'items'} will move to the Trash</div>
        </div>
        <div class="sel-actions">
          <button type="button" class="mac-tb-btn" id="sb-deselect">Deselect All</button>
          <button type="button" class="glass-prominent" id="sb-trash-btn" style="padding:7px 14px;font-size:0.8rem;">Move to Trash…</button>
        </div>
      `;
      document.getElementById('sb-deselect').onclick = () => {
        state.storageCategories.forEach((c) => c.children.forEach((ch) => (ch.selected = false)));
        heroBubbl.triggerReaction('spit');
        renderAll();
      };
      document.getElementById('sb-trash-btn').onclick = () => requestStorageTrash();
      return true;
    }

    selectionBar.hidden = true;
    return false;
  }

  function renderLargeFilesView() {
    const visible = state.largeFiles
      .filter((f) => f.sizeBytes >= state.largeThresholdMB * MB)
      .sort((a, b) => {
        const va = a[state.largeSortKey];
        const vb = b[state.largeSortKey];
        const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return state.largeSortAsc ? cmp : -cmp;
      });

    const selected = visible.filter((f) => f.selected);
    const selBytes = selected.reduce((s, f) => s + f.sizeBytes, 0);

    contentPane.innerHTML = `
      <div class="mac-table-wrap">
        <table class="mac-table">
          <thead>
            <tr>
              <th style="width:28px"></th>
              <th data-sort="name">Name</th>
              <th data-sort="sizeBytes" class="num">Size</th>
              <th data-sort="kind">Kind</th>
              <th data-sort="modified">Modified</th>
              <th data-sort="location">Location</th>
            </tr>
          </thead>
          <tbody>
            ${
              visible.length
                ? visible
                    .map(
                      (f) => `
                  <tr data-lf-row="${f.id}" class="${state.focusedLargeId === f.id ? 'is-focused' : ''}">
                    <td>
                      <button type="button" class="tri-checkbox" data-lf-check="${f.id}" data-state="${f.selected ? 'on' : 'off'}" aria-label="Select ${escapeHtml(f.name)}">${f.selected ? '✓' : ''}</button>
                    </td>
                    <td><strong>${escapeHtml(f.name)}</strong></td>
                    <td class="num">${formatBytes(f.sizeBytes)}</td>
                    <td style="color:var(--text-secondary)">${escapeHtml(f.kind)}</td>
                    <td style="color:var(--text-secondary)">${escapeHtml(f.modified)}</td>
                    <td class="mono-muted">${escapeHtml(f.location)}</td>
                  </tr>`
                    )
                    .join('')
                : `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-secondary)">No files ≥ ${state.largeThresholdMB >= 1000 ? '1 GB' : state.largeThresholdMB + ' MB'}.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;

    contentPane.querySelectorAll('[data-sort]').forEach((th) => {
      th.onclick = () => {
        const k = th.dataset.sort;
        if (state.largeSortKey === k) state.largeSortAsc = !state.largeSortAsc;
        else {
          state.largeSortKey = k;
          state.largeSortAsc = k === 'name';
        }
        renderAll();
      };
    });

    contentPane.querySelectorAll('[data-lf-check]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const file = state.largeFiles.find((f) => f.id === btn.dataset.lfCheck);
        if (!file) return;
        file.selected = !file.selected;
        heroBubbl.triggerReaction(file.selected ? 'gulp' : 'spit');
        renderAll();
      };
    });

    contentPane.querySelectorAll('[data-lf-row]').forEach((tr) => {
      tr.onclick = () => {
        state.focusedLargeId = tr.dataset.lfRow;
        heroBubbl.triggerReaction('glance');
        renderAll();
      };
    });

    if (selected.length > 0) {
      selectionBar.hidden = false;
      selectionBar.innerHTML = `
        <div>
          <div class="sel-title">${formatBytes(selBytes)} selected</div>
          <div class="sel-detail">${selected.length} ${selected.length === 1 ? 'file' : 'files'} will move to the Trash</div>
        </div>
        <div class="sel-actions">
          <button type="button" class="mac-tb-btn" id="lf-deselect">Deselect All</button>
          <button type="button" class="glass-prominent" id="lf-trash" style="padding:7px 14px;font-size:0.8rem;">Move to Trash…</button>
        </div>
      `;
      document.getElementById('lf-deselect').onclick = () => {
        state.largeFiles.forEach((f) => (f.selected = false));
        heroBubbl.triggerReaction('spit');
        renderAll();
      };
      document.getElementById('lf-trash').onclick = () => {
        const items = visible.filter((f) => f.selected);
        confirmAndRun({
          title: `Move ${items.length} ${items.length === 1 ? 'file' : 'files'} (${formatBytes(selBytes)}) to the Trash?`,
          message: 'You can restore them from the Trash until you empty it.',
          confirmText: 'Move to Trash',
          danger: false,
          bytes: selBytes,
          count: items.length,
          onConfirm: () => {
            items.forEach((it) => {
              state.trashItems.unshift({
                id: 'tr-' + Date.now() + '-' + it.id,
                name: it.name,
                bytes: it.sizeBytes,
                kind: it.kind,
                daysAgo: 0,
                dateLabel: 'Just now',
                selected: false,
              });
            });
            const ids = new Set(items.map((i) => i.id));
            state.largeFiles = state.largeFiles.filter((f) => !ids.has(f.id));
          },
        });
      };
      return true;
    }

    selectionBar.hidden = true;
    return false;
  }

  function renderFileBrowserView() {
    const cols = state.browserPath.map((folderKey, colIdx) => {
      const entries = BROWSER_TREE[folderKey] || [];
      const activeInNextCol = state.browserPath[colIdx + 1];
      return `
        <div class="miller-col">
          ${entries
            .map((entry) => {
              const isSelected = activeInNextCol === entry.path || state.browserSelected === entry.path;
              return `
              <button type="button" class="miller-row ${isSelected ? 'is-selected' : ''}" data-col="${colIdx}" data-path="${escapeHtml(entry.path)}" data-dir="${entry.isDir}">
                <span aria-hidden="true">${entry.isDir ? '📁' : '📄'}</span>
                <span class="miller-name">${escapeHtml(entry.name)}</span>
                <span class="miller-size">${formatBytes(entry.bytes)}</span>
                <span style="opacity:${entry.isDir ? 0.5 : 0}">›</span>
              </button>`;
            })
            .join('')}
        </div>
      `;
    });

    contentPane.innerHTML = `<div class="miller-columns">${cols.join('')}</div>`;

    contentPane.querySelectorAll('.miller-row').forEach((row) => {
      row.onclick = () => {
        const colIdx = Number(row.dataset.col);
        const path = row.dataset.path;
        const isDir = row.dataset.dir === 'true';
        const prevLen = state.browserPath.length;
        state.browserSelected = path;

        if (isDir && BROWSER_TREE[path]) {
          state.browserPath = state.browserPath.slice(0, colIdx + 1).concat(path);
          if (state.browserPath.length > prevLen) heroBubbl.triggerReaction('dive');
          else if (state.browserPath.length < prevLen) heroBubbl.triggerReaction('surface');
        } else {
          state.browserPath = state.browserPath.slice(0, colIdx + 1);
          if (state.browserPath.length < prevLen) heroBubbl.triggerReaction('surface');
          else heroBubbl.triggerReaction('glance');
        }
        renderAll();
      };
    });

    const entries = Object.values(BROWSER_TREE).flat();
    const sel = entries.find((e) => e.path === state.browserSelected) || { name: 'Home', path: '~', bytes: 286.4 * GB };
    selectionBar.hidden = false;
    selectionBar.innerHTML = `
      <div>
        <div class="sel-title">${escapeHtml(sel.name)}</div>
        <div class="sel-detail">${formatBytes(sel.bytes)} · <span style="font-family:var(--font-mono)">${escapeHtml(sel.path)}</span></div>
      </div>
      <div class="sel-actions">
        <button type="button" class="mac-tb-btn" id="fb-ql">Quick Look</button>
        <button type="button" class="glass-prominent" id="fb-trash-one" style="padding:7px 14px;font-size:0.8rem;">Move to Trash…</button>
      </div>
    `;
    document.getElementById('fb-ql').onclick = () => heroBubbl.triggerReaction('glance');
    document.getElementById('fb-trash-one').onclick = () => {
      showToast(`${sel.name} (${formatBytes(sel.bytes)}) previewed for Trash`, 'In the live app, this moves the selected folder or file straight to Finder’s Trash.');
    };
    return true;
  }

  function findSelectedUninstallItem() {
    return (
      state.removedApps.find((r) => r.id === state.uninstallerSelectedId) ||
      state.installedApps.find((a) => a.id === state.uninstallerSelectedId) ||
      state.removedApps[0] ||
      state.installedApps[0]
    );
  }

  function uninstallItemMetrics(item) {
    let totalBytes = item.canUninstall ? item.bytes : 0;
    let selectedBytes = item.canUninstall && item.includeApp ? item.bytes : 0;
    let selectedCount = item.canUninstall && item.includeApp ? 1 : 0;

    for (const grp of item.groups || []) {
      for (const e of grp.entries) {
        totalBytes += e.bytes;
        if (e.selected) {
          selectedBytes += e.bytes;
          selectedCount++;
        }
      }
    }
    return { totalBytes, selectedBytes, selectedCount };
  }

  function renderUninstallerView() {
    const selectedItem = findSelectedUninstallItem();
    const firstRemoved = state.removedApps[0];

    let listHtml = '';
    if (firstRemoved) {
      listHtml += `
        <div class="removed-banner">
          <strong>${escapeHtml(firstRemoved.name)} was removed</strong>
          <p>It may have left files behind.</p>
          <button type="button" class="mac-tb-btn" id="banner-show-removed">Clean Up Leftovers</button>
        </div>
      `;
    }

    if (state.removedApps.length > 0) {
      listHtml += `<div class="sidebar-group-label" style="padding-left:4px">Recently Removed</div>`;
      listHtml += state.removedApps
        .map(
          (r) => `
          <button type="button" class="app-list-btn ${selectedItem?.id === r.id ? 'is-selected' : ''}" data-un-id="${r.id}">
            <span>${r.glyph}</span>
            <span class="app-list-meta"><strong>${escapeHtml(r.name)}</strong><small>Removed ${escapeHtml(r.removedAt)}</small></span>
          </button>`
        )
        .join('');
    }

    listHtml += `<div class="sidebar-group-label" style="padding-left:4px;margin-top:4px">Applications</div>`;
    listHtml += state.installedApps
      .map(
        (a) => `
        <button type="button" class="app-list-btn ${selectedItem?.id === a.id ? 'is-selected' : ''} ${!a.canUninstall ? 'is-locked' : ''}" data-un-id="${a.id}">
          <span>${a.glyph}</span>
          <span class="app-list-meta"><strong>${escapeHtml(a.name)}</strong><small>Version ${escapeHtml(a.version)}</small></span>
          <span style="font-size:0.75rem;color:var(--text-secondary)">${a.canUninstall ? formatBytes(a.bytes) : '🔒'}</span>
        </button>`
      )
      .join('');

    let detailHtml = '';
    if (selectedItem) {
      const { totalBytes } = uninstallItemMetrics(selectedItem);
      detailHtml = `
        <div class="app-detail-head">
          <div class="app-glyph">${selectedItem.glyph}</div>
          <div>
            <h4 style="margin:0;font-size:1.05rem">${escapeHtml(selectedItem.name)}</h4>
            <div style="font-size:0.77rem;color:var(--text-secondary)">
              ${escapeHtml(selectedItem.bundleID)} · ${selectedItem.removedAt ? `removed ${escapeHtml(selectedItem.removedAt)}` : formatBytes(totalBytes)}
            </div>
          </div>
        </div>
      `;
      if (selectedItem.canUninstall === false) {
        detailHtml += `<p style="font-size:0.84rem;color:var(--text-secondary)">🔒 This app is part of macOS and can’t be removed.</p>`;
      } else {
        detailHtml += (selectedItem.groups || [])
          .map((grp) => {
            const grpBytes = grp.entries.reduce((s, e) => s + e.bytes, 0);
            const allOn = grp.entries.every((e) => e.selected);
            return `
              <div class="leftover-group">
                <div class="leftover-group-head">
                  <button type="button" class="tri-checkbox" data-un-grp="${grp.id}" data-state="${allOn ? 'on' : 'off'}">${allOn ? '✓' : ''}</button>
                  <span style="flex:1">${escapeHtml(grp.title)}</span>
                  <span style="color:var(--text-secondary);font-variant-numeric:tabular-nums">${formatBytes(grpBytes)}</span>
                </div>
                ${grp.mayContainUserData ? `<div class="leftover-warn">⚠️ May contain your documents or settings. Review before removing.</div>` : ''}
                <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
                  ${grp.entries
                    .map(
                      (e) => `
                    <div style="display:flex;align-items:center;gap:8px;font-size:0.76rem">
                      <button type="button" class="tri-checkbox" data-un-entry="${grp.id}:${e.id}" data-state="${e.selected ? 'on' : 'off'}">${e.selected ? '✓' : ''}</button>
                      <span class="mono-muted" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.path)}</span>
                      <span style="font-variant-numeric:tabular-nums">${formatBytes(e.bytes)}</span>
                    </div>`
                    )
                    .join('')}
                </div>
              </div>
            `;
          })
          .join('');
      }
    }

    contentPane.innerHTML = `
      <div class="uninstaller-split">
        <div class="uninstaller-list">${listHtml}</div>
        <div class="uninstaller-detail">${detailHtml}</div>
      </div>
    `;

    const bannerBtn = document.getElementById('banner-show-removed');
    if (bannerBtn && firstRemoved) {
      bannerBtn.onclick = () => {
        state.uninstallerSelectedId = firstRemoved.id;
        heroBubbl.triggerReaction('glance');
        renderAll();
      };
    }

    contentPane.querySelectorAll('[data-un-id]').forEach((btn) => {
      btn.onclick = () => {
        state.uninstallerSelectedId = btn.dataset.unId;
        heroBubbl.triggerReaction('glance');
        renderAll();
      };
    });

    contentPane.querySelectorAll('[data-un-grp]').forEach((btn) => {
      btn.onclick = () => {
        const grp = selectedItem.groups.find((g) => g.id === btn.dataset.unGrp);
        if (!grp) return;
        const allOn = grp.entries.every((e) => e.selected);
        grp.entries.forEach((e) => (e.selected = !allOn));
        heroBubbl.triggerReaction(allOn ? 'spit' : 'gulp');
        renderAll();
      };
    });

    contentPane.querySelectorAll('[data-un-entry]').forEach((btn) => {
      btn.onclick = () => {
        const [gid, eid] = btn.dataset.unEntry.split(':');
        const grp = selectedItem.groups.find((g) => g.id === gid);
        const entry = grp?.entries.find((e) => e.id === eid);
        if (!entry) return;
        entry.selected = !entry.selected;
        heroBubbl.triggerReaction(entry.selected ? 'gulp' : 'spit');
        renderAll();
      };
    });

    if (selectedItem && selectedItem.canUninstall !== false) {
      const { selectedBytes, selectedCount } = uninstallItemMetrics(selectedItem);
      if (selectedCount > 0) {
        const removesApp = Boolean(selectedItem.canUninstall && selectedItem.includeApp);
        selectionBar.hidden = false;
        selectionBar.innerHTML = `
          <div>
            <div class="sel-title">${formatBytes(selectedBytes)} selected</div>
            <div class="sel-detail">${selectedCount} ${selectedCount === 1 ? 'item' : 'items'} will move to the Trash</div>
          </div>
          <div class="sel-actions">
            <button type="button" class="glass-prominent" id="un-trash-btn" style="padding:7px 14px;font-size:0.8rem;">${removesApp ? 'Uninstall…' : 'Remove Leftovers…'}</button>
          </div>
        `;
        document.getElementById('un-trash-btn').onclick = () => {
          confirmAndRun({
            title: `${removesApp ? 'Uninstall' : 'Remove leftovers for'} ${selectedItem.name} (${formatBytes(selectedBytes)})?`,
            message: 'App bundle and selected leftovers move to the Trash first.',
            confirmText: 'Move to Trash',
            danger: false,
            bytes: selectedBytes,
            count: selectedCount,
            carriedGlyph: selectedItem.glyph,
            onConfirm: () => {
              state.trashItems.unshift({
                id: 'tr-' + Date.now(),
                name: `${selectedItem.name} Leftovers`,
                bytes: selectedBytes,
                kind: 'App & Leftovers',
                daysAgo: 0,
                dateLabel: 'Just now',
                selected: false,
              });
              state.removedApps = state.removedApps.filter((r) => r.id !== selectedItem.id);
              state.installedApps = state.installedApps.filter((a) => a.id !== selectedItem.id);
              state.uninstallerSelectedId = state.removedApps[0]?.id || state.installedApps[0]?.id;
            },
          });
        };
        return true;
      }
    }

    selectionBar.hidden = true;
    return false;
  }

  function renderTrashView() {
    if (!state.fdaGranted) {
      contentPane.innerHTML = `
        <div style="text-align:center;padding:56px 20px">
          <div style="font-size:2rem;margin-bottom:8px">🔒</div>
          <h3 style="margin:0 0 6px">Can’t see inside the Trash</h3>
          <p style="color:var(--text-secondary);max-width:380px;margin:0 auto 16px;font-size:0.85rem">
            macOS only shows the Trash to apps with Full Disk Access. You can still empty it in Finder.
          </p>
          <button type="button" class="glass-prominent" id="trash-allow-fda">Allow Full Disk Access…</button>
        </div>
      `;
      document.getElementById('trash-allow-fda').onclick = () => openFDAModal();
      selectionBar.hidden = true;
      return false;
    }

    const { total, pickedBytes, picked } = trashTotals();
    const visible = state.trashItems.filter((it) => {
      if (state.trashFilter === 'old30') return it.daysAgo > 30;
      if (state.trashFilter === 'gt1gb') return it.bytes >= 1 * GB;
      return true;
    });

    contentPane.innerHTML = `
      <div class="trash-header">
        <div class="trash-top-row">
          <div class="trash-icon-box" aria-hidden="true">🗑️</div>
          <div>
            <div style="font-family:var(--font-display);font-size:1.7rem;font-weight:700;font-variant-numeric:tabular-nums">${formatBytes(total)}</div>
            <div style="font-size:0.82rem;color:var(--text-secondary)">${state.trashItems.length === 0 ? 'Nothing in the Trash' : `${state.trashItems.length} items in the Trash`}</div>
          </div>
        </div>
        <div class="trash-warning-box">
          ⚠️ Deleting here is permanent and can’t be undone. To get something back, use Put Back in Finder first.
        </div>
      </div>

      <div class="mac-table-wrap">
        <table class="mac-table">
          <thead>
            <tr>
              <th style="width:28px"></th>
              <th>Name</th>
              <th class="num">Size</th>
              <th>Kind</th>
              <th>Date Trashed</th>
            </tr>
          </thead>
          <tbody>
            ${
              visible.length
                ? visible
                    .map(
                      (it) => `
                  <tr>
                    <td>
                      <button type="button" class="tri-checkbox" data-tr-check="${it.id}" data-state="${it.selected ? 'on' : 'off'}">${it.selected ? '✓' : ''}</button>
                    </td>
                    <td><strong>${escapeHtml(it.name)}</strong></td>
                    <td class="num" style="color:${it.selected ? 'var(--danger)' : 'inherit'}">${formatBytes(it.bytes)}</td>
                    <td style="color:var(--text-secondary)">${escapeHtml(it.kind)}</td>
                    <td style="color:var(--text-secondary)">${escapeHtml(it.dateLabel)}</td>
                  </tr>`
                    )
                    .join('')
                : `<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--text-secondary)">The Trash is empty.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;

    contentPane.querySelectorAll('[data-tr-check]').forEach((btn) => {
      btn.onclick = () => {
        const it = state.trashItems.find((t) => t.id === btn.dataset.trCheck);
        if (!it) return;
        it.selected = !it.selected;
        heroBubbl.triggerReaction(it.selected ? 'gulp' : 'spit');
        renderAll();
      };
    });

    if (picked.length > 0) {
      selectionBar.hidden = false;
      selectionBar.innerHTML = `
        <div>
          <div class="sel-title">${formatBytes(pickedBytes)} selected</div>
          <div class="sel-detail">${picked.length} ${picked.length === 1 ? 'item' : 'items'} will be deleted permanently</div>
        </div>
        <div class="sel-actions">
          <button type="button" class="mac-tb-btn" id="tr-deselect">Deselect All</button>
          <button type="button" class="sel-btn-danger" id="tr-erase-btn">Delete Permanently…</button>
        </div>
      `;
      document.getElementById('tr-deselect').onclick = () => {
        state.trashItems.forEach((t) => (t.selected = false));
        heroBubbl.triggerReaction('spit');
        renderAll();
      };
      document.getElementById('tr-erase-btn').onclick = () => {
        confirmAndRun({
          title: `Delete ${picked.length} ${picked.length === 1 ? 'item' : 'items'} (${formatBytes(pickedBytes)}) permanently?`,
          message: 'This can’t be undone. TrashEmptier verifies all paths are inside ~/.Trash.',
          confirmText: 'Delete Permanently',
          danger: true,
          bytes: pickedBytes,
          count: picked.length,
          onConfirm: () => {
            const ids = new Set(picked.map((p) => p.id));
            state.trashItems = state.trashItems.filter((t) => !ids.has(t.id));
            state.volume.used = Math.max(0, state.volume.used - pickedBytes);
            state.volume.available += pickedBytes;
          },
        });
      };
      return true;
    }

    selectionBar.hidden = true;
    return false;
  }

  function requestStorageTrash() {
    const { selected, selectedCount, selectedPaths, hasSimctl } = storageTotals();
    if (selectedCount === 0) return;

    confirmAndRun({
      title: `Move ${selectedCount} ${selectedCount === 1 ? 'item' : 'items'} (${formatBytes(selected)}) to the Trash?`,
      message: hasSimctl
        ? 'Caches move to the Trash where you can restore them. Simulator runtimes are removed with Xcode’s simctl.'
        : 'You can restore them from the Trash until you empty it.',
      confirmText: 'Move to Trash',
      danger: false,
      bytes: selected,
      count: selectedCount,
      onConfirm: () => {
        for (const cat of state.storageCategories) {
          const picked = cat.children.filter((c) => c.selected);
          if (!cat.isSimctl) {
            for (const p of picked) {
              state.trashItems.unshift({
                id: 'tr-' + Date.now() + '-' + p.id,
                name: p.name,
                bytes: p.bytes,
                kind: cat.name,
                daysAgo: 0,
                dateLabel: 'Just now',
                selected: false,
              });
            }
          }
          cat.children = cat.children.filter((c) => !c.selected);
        }
        state.storageCategories = state.storageCategories.filter((c) => c.children.length > 0);
      },
    });
  }

  function requestEmptyTrash() {
    const { total } = trashTotals();
    if (state.trashItems.length === 0) return;
    confirmAndRun({
      title: 'Empty the Trash?',
      message: `${state.trashItems.length} items (${formatBytes(total)}) will be deleted permanently. This can’t be undone.`,
      confirmText: 'Empty Trash',
      danger: true,
      bytes: total,
      count: state.trashItems.length,
      onConfirm: () => {
        state.trashItems = [];
        state.volume.used = Math.max(0, state.volume.used - total);
        state.volume.available += total;
      },
    });
  }

  function confirmAndRun({ title, message, confirmText, danger, bytes, count, carriedGlyph, onConfirm }) {
    modalBackdrop.hidden = false;
    modalDialog.innerHTML = `
      <h3 id="mac-modal-title">${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="mac-modal-actions">
        <button type="button" class="mac-tb-btn" id="modal-cancel">Cancel</button>
        <button type="button" class="${danger ? 'sel-btn-danger' : 'glass-prominent'}" id="modal-confirm" style="${danger ? '' : 'padding:7px 14px;font-size:0.8rem;'}">${escapeHtml(confirmText)}</button>
      </div>
    `;
    document.getElementById('modal-cancel').onclick = () => {
      modalBackdrop.hidden = true;
    };
    document.getElementById('modal-confirm').onclick = () => {
      modalBackdrop.hidden = true;
      heroBubbl.carriedAppLabel = carriedGlyph || null;
      heroBubbl.setMood('cleaning');
      setTimeout(() => {
        onConfirm();
        renderAll();
        heroBubbl.triggerPop(bytes);
        showToast(
          `${formatBytes(bytes)} ${danger ? 'freed' : 'moved to the Trash'}`,
          danger
            ? `${count} ${count === 1 ? 'item' : 'items'} deleted permanently.`
            : `${count} ${count === 1 ? 'item' : 'items'}. Empty the Trash to get the space back.`,
          !danger
        );
      }, 650);
    };
  }

  function openFDAModal() {
    modalBackdrop.hidden = false;
    modalDialog.innerHTML = `
      <h3 id="mac-modal-title">Allow Full Disk Access</h3>
      <p>macOS hides many caches, logs and app leftovers from apps without Full Disk Access. In this interactive preview, click below to simulate granting access.</p>
      <ol style="margin:0 0 12px 18px;padding:0;font-size:0.8rem;color:var(--text-secondary)">
        <li>Click <strong>Open System Settings</strong>.</li>
        <li>Turn on <code>macos-clean</code> in Full Disk Access.</li>
        <li>Choose <strong>Quit &amp; Reopen</strong> when macOS asks.</li>
      </ol>
      <div class="mac-modal-actions">
        <button type="button" class="mac-tb-btn" id="fda-not-now">Not Now</button>
        <button type="button" class="glass-prominent" id="fda-grant-btn" style="padding:7px 14px;font-size:0.8rem;">Simulate Grant Access</button>
      </div>
    `;
    document.getElementById('fda-not-now').onclick = () => {
      modalBackdrop.hidden = true;
    };
    document.getElementById('fda-grant-btn').onclick = () => {
      modalBackdrop.hidden = true;
      state.fdaGranted = true;
      renderAll();
    };
  }

  function showToast(title, detail, showEmptyBtn = false) {
    document.getElementById('toast-title').textContent = title;
    document.getElementById('toast-detail').textContent = detail;
    document.getElementById('toast-icon').textContent = showEmptyBtn ? '🗑️' : '✨';
    document.getElementById('toast-empty-btn').style.display = showEmptyBtn ? 'inline-block' : 'none';
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 5000);
  }

  function runScanSimulation() {
    if (state.isScanning) return;
    state.isScanning = true;
    state.liveScanBytes = 0;
    const targetBytes = storageTotals().found || 38.4 * GB;
    renderAll();

    const start = performance.now();
    const timer = setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / 1300);
      state.liveScanBytes = Math.round(targetBytes * p);
      navSubtitle.textContent = `Scanning… ${formatBytes(state.liveScanBytes)} so far`;
      if (state.section === 'storage') {
        const big = contentPane.querySelector('.storage-big-number');
        if (big) big.textContent = `Scanning… ${formatBytes(state.liveScanBytes)}`;
      }
      if (p >= 1) {
        clearInterval(timer);
        state.isScanning = false;
        renderAll();
      }
    }, 110);
  }

  bubblCanvas.addEventListener('click', () => {
    heroBubbl.pokeOrTap();
  });

  renderAll();
}

// MARK: - Draggable Corner Snapping (MascotOverlay port)

function initDraggableCorner(overlay, container, bubblEngine) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  const corners = ['corner-topLeading', 'corner-topTrailing', 'corner-bottomLeading', 'corner-bottomTrailing'];
  const lookMap = {
    'corner-topLeading': { dx: 1, dy: 1 },
    'corner-topTrailing': { dx: -1, dy: 1 },
    'corner-bottomLeading': { dx: 1, dy: -1 },
    'corner-bottomTrailing': { dx: -1, dy: -1 },
  };

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const ovRect = overlay.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    origLeft = ovRect.left - cRect.left;
    origTop = ovRect.top - cRect.top;
    overlay.setPointerCapture(e.pointerId);
  });

  overlay.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    moved = true;
    overlay.classList.add('is-dragging');
    overlay.style.right = 'auto';
    overlay.style.bottom = 'auto';
    overlay.style.left = `${origLeft + dx}px`;
    overlay.style.top = `${origTop + dy}px`;
  });

  overlay.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    overlay.classList.remove('is-dragging');
    overlay.style.left = '';
    overlay.style.top = '';
    overlay.style.right = '';
    overlay.style.bottom = '';

    if (!moved) return;
    const cRect = container.getBoundingClientRect();
    const relX = e.clientX - cRect.left;
    const relY = e.clientY - cRect.top;
    const isLeading = relX < cRect.width / 2;
    const isBottom = relY > cRect.height / 2;
    const nextCorner = isBottom
      ? (isLeading ? 'corner-bottomLeading' : 'corner-bottomTrailing')
      : (isLeading ? 'corner-topLeading' : 'corner-topTrailing');

    corners.forEach((c) => overlay.classList.remove(c));
    overlay.classList.add(nextCorner);
    bubblEngine.lookToward = lookMap[nextCorner];
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
