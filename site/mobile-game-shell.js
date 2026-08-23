(function (global) {
  'use strict';

  const DEFAULTS = Object.freeze({
    logicalWidth: 384,
    logicalHeight: 224,
    rotatePortraitFallback: true,
    portraitRotation: 90,
    orientationLock: 'landscape',
    orientationHintMs: 3600,
    layout: Object.freeze({
      margin: 12,
      touchGutterMin: 104,
      touchGutterMax: 152,
      touchGutterRatio: 0.16,
      portraitControlBandMin: 144,
      portraitControlBandMax: 196,
      portraitControlBandRatio: 0.24
    }),
    controls: Object.freeze({
      directions: 8,
      deadZone: 0.22,
      sensitivity: 1,
      minimumPressMs: 34,
      compatibilityMouseDelayMs: 720
    })
  });

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function mergeConfig(options) {
    const source = options || {};
    return Object.assign({}, DEFAULTS, source, {
      layout: Object.assign({}, DEFAULTS.layout, source.layout || {}),
      controls: Object.assign({}, DEFAULTS.controls, source.controls || {})
    });
  }

  function buttonKey(button) {
    return `${button.port}:${button.id}`;
  }

  class InputHub {
    constructor(onInput, minimumPressMs) {
      this.onInput = onInput;
      this.minimumPressMs = minimumPressMs;
      this.sources = new Map();
      this.counts = new Map();
      this.states = new Map();
      this.pressedAt = new Map();
      this.releaseTimers = new Map();
      this.buttons = new Map();
      this.history = [];
    }

    setSource(source, buttons, immediateRelease) {
      const previous = this.sources.get(source) || new Set();
      const next = new Set(buttons.map(buttonKey));
      buttons.forEach(button => this.buttons.set(buttonKey(button), button));

      previous.forEach(key => {
        if (!next.has(key)) this.releaseKey(key, Boolean(immediateRelease));
      });
      next.forEach(key => {
        if (!previous.has(key)) this.pressKey(key);
      });

      if (next.size) this.sources.set(source, next);
      else this.sources.delete(source);
    }

    releaseSource(source, immediate) {
      const previous = this.sources.get(source);
      if (!previous) return;
      previous.forEach(key => this.releaseKey(key, Boolean(immediate)));
      this.sources.delete(source);
    }

    releaseAll(immediate) {
      this.sources.clear();
      this.counts.clear();
      this.releaseTimers.forEach(timer => global.clearTimeout(timer));
      this.releaseTimers.clear();
      Array.from(this.states.keys()).forEach(key => this.send(key, false));
    }

    pressKey(key) {
      const timer = this.releaseTimers.get(key);
      if (timer !== undefined) {
        global.clearTimeout(timer);
        this.releaseTimers.delete(key);
      }
      const count = this.counts.get(key) || 0;
      this.counts.set(key, count + 1);
      if (count === 0 && !this.states.get(key)) {
        this.pressedAt.set(key, performance.now());
        this.send(key, true);
      }
    }

    releaseKey(key, immediate) {
      const count = this.counts.get(key) || 0;
      if (count <= 1) this.counts.delete(key);
      else {
        this.counts.set(key, count - 1);
        return;
      }
      if (!this.states.get(key)) return;

      const elapsed = performance.now() - (this.pressedAt.get(key) || 0);
      const delay = immediate ? 0 : Math.max(0, this.minimumPressMs - elapsed);
      if (delay === 0) {
        this.send(key, false);
        return;
      }
      const oldTimer = this.releaseTimers.get(key);
      if (oldTimer !== undefined) global.clearTimeout(oldTimer);
      const timer = global.setTimeout(() => {
        this.releaseTimers.delete(key);
        if (!this.counts.has(key)) this.send(key, false);
      }, delay);
      this.releaseTimers.set(key, timer);
    }

    send(key, pressed) {
      if (Boolean(this.states.get(key)) === pressed) return;
      if (pressed) this.states.set(key, true);
      else {
        this.states.delete(key);
        this.pressedAt.delete(key);
      }
      const button = this.buttons.get(key);
      if (!button) return;
      const transition = {
        port: button.port,
        id: button.id,
        pressed,
        time: performance.now()
      };
      this.history.push(transition);
      if (this.history.length > 160) this.history.splice(0, this.history.length - 160);
      try {
        this.onInput(button.port, button.id, pressed);
      } catch (error) {
        console.error('mobile input bridge failed', error);
      }
    }

    snapshot() {
      return {
        pressed: Array.from(this.states.keys()).sort(),
        sources: Array.from(this.sources.keys()).sort(),
        history: this.history.slice()
      };
    }
  }

  class VirtualControls {
    constructor(root, stick, knob, inputHub, config, rotationProvider) {
      this.root = root;
      this.stick = stick;
      this.knob = knob;
      this.inputHub = inputHub;
      this.config = config;
      this.rotationProvider = rotationProvider;
      this.active = false;
      this.stickPointer = null;
      this.actionPointers = new Map();
      this.lastTouchAt = -Infinity;
      this.fallbackMouseDown = false;
      this.installSuppression();
      if ('PointerEvent' in global) this.installPointerEvents();
      else this.installTouchMouseFallback();
    }

    setActive(active) {
      this.active = Boolean(active);
      this.root.classList.toggle('active', this.active);
      this.root.setAttribute('aria-hidden', this.active ? 'false' : 'true');
      if (!this.active) this.releaseAll(true);
    }

    installSuppression() {
      ['click', 'dblclick', 'contextmenu', 'dragstart'].forEach(type => {
        this.root.addEventListener(type, event => {
          event.preventDefault();
          event.stopPropagation();
        }, true);
      });
    }

    sourceForPointer(pointerId) {
      return `pointer:${pointerId}`;
    }

    actionButton(target) {
      return target && target.closest ? target.closest('[data-input]') : null;
    }

    installPointerEvents() {
      this.stick.addEventListener('pointerdown', event => {
        if (!this.active || this.stickPointer !== null) return;
        event.preventDefault();
        event.stopPropagation();
        this.stickPointer = event.pointerId;
        try { this.stick.setPointerCapture(event.pointerId); } catch (_) {}
        this.updateStick(event.clientX, event.clientY, this.sourceForPointer(event.pointerId));
      });
      this.stick.addEventListener('pointermove', event => {
        if (event.pointerId !== this.stickPointer) return;
        event.preventDefault();
        this.updateStick(event.clientX, event.clientY, this.sourceForPointer(event.pointerId));
      });
      const finishStick = (event, immediate) => {
        if (event.pointerId !== this.stickPointer) return;
        event.preventDefault();
        this.inputHub.releaseSource(this.sourceForPointer(event.pointerId), immediate);
        this.stickPointer = null;
        this.resetKnob();
      };
      this.stick.addEventListener('pointerup', event => finishStick(event, false));
      this.stick.addEventListener('pointercancel', event => finishStick(event, true));
      this.stick.addEventListener('lostpointercapture', event => finishStick(event, true));

      this.root.querySelectorAll('[data-input]').forEach(button => {
        button.addEventListener('pointerdown', event => {
          if (!this.active || this.actionPointers.has(event.pointerId)) return;
          event.preventDefault();
          event.stopPropagation();
          const source = this.sourceForPointer(event.pointerId);
          this.actionPointers.set(event.pointerId, button);
          try { button.setPointerCapture(event.pointerId); } catch (_) {}
          this.inputHub.setSource(source, [this.parseButton(button)], false);
          button.classList.add('pressed');
        });
        button.addEventListener('pointermove', event => {
          if (this.actionPointers.get(event.pointerId) !== button) return;
          const bounds = button.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right ||
              event.clientY < bounds.top || event.clientY > bounds.bottom) {
            this.finishAction(event.pointerId, true);
          }
        });
        button.addEventListener('pointerup', event => {
          event.preventDefault();
          this.finishAction(event.pointerId, false);
        });
        button.addEventListener('pointercancel', event => this.finishAction(event.pointerId, true));
        button.addEventListener('lostpointercapture', event => this.finishAction(event.pointerId, true));
        button.addEventListener('pointerleave', event => {
          if (this.actionPointers.get(event.pointerId) === button &&
              (!button.hasPointerCapture || !button.hasPointerCapture(event.pointerId))) {
            this.finishAction(event.pointerId, true);
          }
        });
      });
    }

    installTouchMouseFallback() {
      this.root.addEventListener('touchstart', event => {
        if (!this.active) return;
        this.lastTouchAt = performance.now();
        event.preventDefault();
        Array.from(event.changedTouches).forEach(touch => {
          const source = `touch:${touch.identifier}`;
          const action = this.actionButton(touch.target);
          if (action) {
            this.actionPointers.set(source, action);
            this.inputHub.setSource(source, [this.parseButton(action)], false);
            action.classList.add('pressed');
          } else if (this.stick.contains(touch.target) && this.stickPointer === null) {
            this.stickPointer = source;
            this.updateStick(touch.clientX, touch.clientY, source);
          }
        });
      }, {passive: false});
      global.addEventListener('touchmove', event => {
        if (!this.active) return;
        let handled = false;
        Array.from(event.changedTouches).forEach(touch => {
          const source = `touch:${touch.identifier}`;
          if (source === this.stickPointer) {
            this.updateStick(touch.clientX, touch.clientY, source);
            handled = true;
          }
          const action = this.actionPointers.get(source);
          if (action) {
            const bounds = action.getBoundingClientRect();
            if (touch.clientX < bounds.left || touch.clientX > bounds.right ||
                touch.clientY < bounds.top || touch.clientY > bounds.bottom) {
              this.finishFallbackAction(source, true);
            }
            handled = true;
          }
        });
        if (handled) event.preventDefault();
      }, {passive: false});
      const finishTouches = (event, immediate) => {
        let handled = false;
        Array.from(event.changedTouches).forEach(touch => {
          const source = `touch:${touch.identifier}`;
          if (source === this.stickPointer) {
            this.inputHub.releaseSource(source, immediate);
            this.stickPointer = null;
            this.resetKnob();
            handled = true;
          }
          if (this.actionPointers.has(source)) {
            this.finishFallbackAction(source, immediate);
            handled = true;
          }
        });
        if (handled) event.preventDefault();
      };
      global.addEventListener('touchend', event => finishTouches(event, false), {passive: false});
      global.addEventListener('touchcancel', event => finishTouches(event, true), {passive: false});

      this.root.addEventListener('mousedown', event => {
        if (!this.active || performance.now() - this.lastTouchAt <
            this.config.compatibilityMouseDelayMs) return;
        const action = this.actionButton(event.target);
        if (!action && !this.stick.contains(event.target)) return;
        event.preventDefault();
        this.fallbackMouseDown = true;
        if (action) {
          this.actionPointers.set('mouse', action);
          this.inputHub.setSource('mouse', [this.parseButton(action)], false);
          action.classList.add('pressed');
        } else {
          this.stickPointer = 'mouse';
          this.updateStick(event.clientX, event.clientY, 'mouse');
        }
      });
      global.addEventListener('mousemove', event => {
        if (!this.fallbackMouseDown) return;
        if (this.stickPointer === 'mouse') this.updateStick(event.clientX, event.clientY, 'mouse');
      });
      global.addEventListener('mouseup', () => {
        if (!this.fallbackMouseDown) return;
        this.fallbackMouseDown = false;
        if (this.stickPointer === 'mouse') {
          this.inputHub.releaseSource('mouse', false);
          this.stickPointer = null;
          this.resetKnob();
        }
        if (this.actionPointers.has('mouse')) this.finishFallbackAction('mouse', false);
      });
    }

    parseButton(element) {
      return {
        port: Number(element.dataset.port || 0),
        id: Number(element.dataset.input)
      };
    }

    finishAction(pointerId, immediate) {
      const button = this.actionPointers.get(pointerId);
      if (!button) return;
      this.actionPointers.delete(pointerId);
      button.classList.remove('pressed');
      this.inputHub.releaseSource(this.sourceForPointer(pointerId), immediate);
    }

    finishFallbackAction(source, immediate) {
      const button = this.actionPointers.get(source);
      if (!button) return;
      this.actionPointers.delete(source);
      button.classList.remove('pressed');
      this.inputHub.releaseSource(source, immediate);
    }

    updateStick(clientX, clientY, source) {
      const bounds = this.stick.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const radius = Math.max(1, Math.min(bounds.width, bounds.height) * 0.36);
      let screenX = (clientX - centerX) / radius;
      let screenY = (clientY - centerY) / radius;
      const rawMagnitude = Math.hypot(screenX, screenY);
      if (rawMagnitude > 1) {
        screenX /= rawMagnitude;
        screenY /= rawMagnitude;
      }
      const magnitude = Math.min(1, rawMagnitude);
      const visualMagnitude = Math.pow(magnitude, this.config.sensitivity);
      const normalizer = magnitude > 0 ? visualMagnitude / magnitude : 0;
      this.root.style.setProperty('--stick-x', `${screenX * normalizer * radius}px`);
      this.root.style.setProperty('--stick-y', `${screenY * normalizer * radius}px`);

      if (magnitude < this.config.deadZone) {
        this.inputHub.setSource(source, [], true);
        return;
      }
      const gameVector = this.screenToGameVector(screenX, screenY);
      const buttons = this.directionButtons(gameVector.x, gameVector.y);
      // Direction changes release the old axis immediately. Pointer-up uses
      // the minimum pulse latch so a very fast tap still reaches one frame.
      this.inputHub.setSource(source, buttons, true);
    }

    screenToGameVector(x, y) {
      const rotation = this.rotationProvider();
      if (rotation === 90) return {x: y, y: -x};
      if (rotation === -90 || rotation === 270) return {x: -y, y: x};
      if (rotation === 180 || rotation === -180) return {x: -x, y: -y};
      return {x, y};
    }

    directionButtons(x, y) {
      let horizontal = 0;
      let vertical = 0;
      if (this.config.directions === 4) {
        if (Math.abs(x) >= Math.abs(y)) horizontal = x < 0 ? -1 : 1;
        else vertical = y < 0 ? -1 : 1;
      } else {
        const sector = Math.round(Math.atan2(y, x) / (Math.PI / 4));
        horizontal = Math.round(Math.cos(sector * Math.PI / 4));
        vertical = Math.round(Math.sin(sector * Math.PI / 4));
      }
      const result = [];
      if (vertical < 0) result.push({port: 0, id: 4});
      if (vertical > 0) result.push({port: 0, id: 5});
      if (horizontal < 0) result.push({port: 0, id: 6});
      if (horizontal > 0) result.push({port: 0, id: 7});
      return result;
    }

    resetKnob() {
      this.root.style.setProperty('--stick-x', '0px');
      this.root.style.setProperty('--stick-y', '0px');
    }

    releaseAll(immediate) {
      this.stickPointer = null;
      this.actionPointers.forEach(button => button.classList.remove('pressed'));
      this.actionPointers.clear();
      this.fallbackMouseDown = false;
      this.resetKnob();
      this.inputHub.releaseAll(immediate);
    }
  }

  class MobileGameShell {
    constructor(options) {
      if (!options || !options.app || !options.stage || !options.canvas || !options.controls) {
        throw new Error('MobileGameShell requires app, stage, canvas and controls elements');
      }
      this.config = mergeConfig(options.config);
      this.app = options.app;
      this.stage = options.stage;
      this.canvas = options.canvas;
      this.controlsRoot = options.controls;
      this.safeProbe = options.safeProbe || null;
      this.orientationHint = options.orientationHint || null;
      this.active = false;
      this.immersiveRequested = false;
      this.orientationLockSucceeded = false;
      this.currentRotation = 0;
      this.layoutFrame = 0;
      this.lastPortraitFallback = false;
      this.touchCapable = this.detectTouchCapability();
      this.inputHub = new InputHub(
        options.onInput || function () {},
        this.config.controls.minimumPressMs
      );
      this.virtualControls = new VirtualControls(
        this.controlsRoot,
        options.stick,
        options.knob,
        this.inputHub,
        this.config.controls,
        () => this.currentRotation
      );
      this.installLayoutListeners();
      this.installSafetyListeners();
      this.layoutNow();
    }

    detectTouchCapability() {
      const coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
      return Boolean(coarse || navigator.maxTouchPoints > 0);
    }

    installLayoutListeners() {
      this.scheduleLayout = this.scheduleLayout.bind(this);
      ['resize', 'orientationchange'].forEach(type => {
        global.addEventListener(type, this.scheduleLayout, {passive: true});
      });
      ['fullscreenchange', 'webkitfullscreenchange'].forEach(type => {
        document.addEventListener(type, this.scheduleLayout, {passive: true});
      });
      if (global.visualViewport) {
        global.visualViewport.addEventListener('resize', this.scheduleLayout, {passive: true});
        global.visualViewport.addEventListener('scroll', this.scheduleLayout, {passive: true});
      }
      this.coarseQuery = global.matchMedia ? global.matchMedia('(pointer: coarse)') : null;
      if (this.coarseQuery) {
        this.pointerChange = () => {
          this.touchCapable = this.detectTouchCapability();
          this.updateControlVisibility();
          this.scheduleLayout();
        };
        if (this.coarseQuery.addEventListener) this.coarseQuery.addEventListener('change', this.pointerChange);
        else if (this.coarseQuery.addListener) this.coarseQuery.addListener(this.pointerChange);
      }
    }

    installSafetyListeners() {
      this.releaseInputs = () => this.virtualControls.releaseAll(true);
      global.addEventListener('blur', this.releaseInputs);
      global.addEventListener('pagehide', this.releaseInputs);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.releaseInputs();
      });
    }

    setActive(active) {
      this.active = Boolean(active);
      this.updateControlVisibility();
      this.scheduleLayout();
    }

    updateControlVisibility() {
      this.virtualControls.setActive(this.active && this.touchCapable);
    }

    scheduleLayout() {
      if (this.layoutFrame) return;
      this.layoutFrame = global.requestAnimationFrame(() => {
        this.layoutFrame = 0;
        this.layoutNow();
      });
    }

    viewport() {
      const visual = global.visualViewport;
      return {
        width: Math.max(1, visual ? visual.width : global.innerWidth),
        height: Math.max(1, visual ? visual.height : global.innerHeight),
        left: visual ? visual.offsetLeft : 0,
        top: visual ? visual.offsetTop : 0
      };
    }

    safeArea() {
      if (!this.safeProbe) return {top: 0, right: 0, bottom: 0, left: 0};
      const style = global.getComputedStyle(this.safeProbe);
      const number = value => Number.parseFloat(value) || 0;
      return {
        top: number(style.paddingTop),
        right: number(style.paddingRight),
        bottom: number(style.paddingBottom),
        left: number(style.paddingLeft)
      };
    }

    layoutNow() {
      const viewport = this.viewport();
      const safe = this.safeArea();
      const margin = this.config.layout.margin;
      const contentWidth = Math.max(1, viewport.width - safe.left - safe.right);
      const contentHeight = Math.max(1, viewport.height - safe.top - safe.bottom);
      const aspect = this.config.logicalWidth / this.config.logicalHeight;
      const portraitFallback = Boolean(
        this.active && this.touchCapable && this.config.rotatePortraitFallback &&
        viewport.height > viewport.width
      );

      this.app.style.setProperty('--viewport-left', `${viewport.left}px`);
      this.app.style.setProperty('--viewport-top', `${viewport.top}px`);
      this.app.style.setProperty('--viewport-width', `${viewport.width}px`);
      this.app.style.setProperty('--viewport-height', `${viewport.height}px`);

      let stageWidth;
      let stageHeight;
      let stageX;
      let stageY;
      if (!this.active) {
        // SDL creates its render target only after the launch click.  Keep the
        // CSS box at the configured logical size until then so CSS viewport
        // dimensions can never feed back into the canvas backing buffer.
        stageWidth = this.config.logicalWidth;
        stageHeight = this.config.logicalHeight;
        stageX = safe.left + contentWidth / 2;
        stageY = safe.top + contentHeight / 2;
        this.currentRotation = 0;
        this.controlsRoot.dataset.layout = 'landscape';
      } else if (portraitFallback) {
        const controlBand = this.touchCapable ? clamp(
          contentHeight * this.config.layout.portraitControlBandRatio,
          this.config.layout.portraitControlBandMin,
          this.config.layout.portraitControlBandMax
        ) : 0;
        const availableHeight = Math.max(1, contentHeight - controlBand - margin);
        // The unrotated logical width becomes the displayed bounding height.
        stageWidth = Math.min(availableHeight, contentWidth * aspect);
        stageHeight = stageWidth / aspect;
        stageX = safe.left + contentWidth / 2;
        stageY = safe.top + availableHeight / 2;
        this.currentRotation = this.config.portraitRotation;
        this.controlsRoot.dataset.layout = 'portrait';
      } else {
        let gutter = 0;
        if (this.active && this.touchCapable) {
          gutter = clamp(
            contentWidth * this.config.layout.touchGutterRatio,
            this.config.layout.touchGutterMin,
            this.config.layout.touchGutterMax
          );
          gutter = Math.min(gutter, Math.max(0, (contentWidth - 192) / 2));
        }
        const availableWidth = Math.max(1, contentWidth - gutter * 2 - margin * 2);
        const availableHeight = Math.max(1, contentHeight - margin * 2);
        stageWidth = Math.min(availableWidth, availableHeight * aspect);
        stageHeight = stageWidth / aspect;
        stageX = safe.left + contentWidth / 2;
        stageY = safe.top + contentHeight / 2;
        this.currentRotation = 0;
        this.controlsRoot.dataset.layout = 'landscape';
      }

      this.stage.style.width = `${Math.max(1, stageWidth)}px`;
      this.stage.style.height = `${Math.max(1, stageHeight)}px`;
      this.stage.style.left = `${stageX}px`;
      this.stage.style.top = `${stageY}px`;
      this.stage.style.transform =
        `translate(-50%, -50%) rotate(${this.currentRotation}deg)`;
      this.stage.dataset.rotation = String(this.currentRotation);
      this.stage.dataset.layout = portraitFallback ? 'portrait-fallback' : 'normal';

      if (portraitFallback && !this.lastPortraitFallback) this.showOrientationHint();
      if (!portraitFallback && this.orientationHint) this.orientationHint.hidden = true;
      this.lastPortraitFallback = portraitFallback;
    }

    showOrientationHint() {
      if (!this.orientationHint) return;
      this.orientationHint.hidden = false;
      global.clearTimeout(this.orientationHintTimer);
      this.orientationHintTimer = global.setTimeout(() => {
        this.orientationHint.hidden = true;
      }, this.config.orientationHintMs);
    }

    enterImmersiveOnce() {
      if (this.immersiveRequested) return;
      this.immersiveRequested = true;
      const target = document.documentElement;
      let fullscreenAttempt;
      try {
        if (target.requestFullscreen) {
          fullscreenAttempt = target.requestFullscreen({navigationUI: 'hide'});
        } else if (target.webkitRequestFullscreen) {
          fullscreenAttempt = target.webkitRequestFullscreen();
        }
      } catch (error) {
        console.info('fullscreen unavailable; continuing with viewport fallback', error);
      }
      Promise.resolve(fullscreenAttempt).catch(error => {
        console.info('fullscreen rejected; continuing with viewport fallback', error);
      }).then(() => this.tryOrientationLock());
    }

    tryOrientationLock() {
      try {
        const orientation = global.screen && global.screen.orientation;
        if (!orientation || typeof orientation.lock !== 'function') return;
        Promise.resolve(orientation.lock(this.config.orientationLock)).then(() => {
          this.orientationLockSucceeded = true;
          this.scheduleLayout();
        }).catch(error => {
          this.orientationLockSucceeded = false;
          console.info('orientation lock rejected; using CSS fallback', error);
          this.scheduleLayout();
        });
      } catch (error) {
        this.orientationLockSucceeded = false;
        console.info('orientation lock unavailable; using CSS fallback', error);
      }
    }

    clientToGame(clientX, clientY) {
      const bounds = this.stage.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return null;
      const viewX = clamp((clientX - bounds.left) / bounds.width, 0, 1);
      const viewY = clamp((clientY - bounds.top) / bounds.height, 0, 1);
      let logicalX = viewX;
      let logicalY = viewY;
      if (this.currentRotation === 90) {
        logicalX = viewY;
        logicalY = 1 - viewX;
      } else if (this.currentRotation === -90 || this.currentRotation === 270) {
        logicalX = 1 - viewY;
        logicalY = viewX;
      } else if (Math.abs(this.currentRotation) === 180) {
        logicalX = 1 - viewX;
        logicalY = 1 - viewY;
      }
      return {
        x: logicalX * this.config.logicalWidth,
        y: logicalY * this.config.logicalHeight
      };
    }

    releaseAllInputs() {
      this.virtualControls.releaseAll(true);
    }

    debugSnapshot() {
      const bounds = this.stage.getBoundingClientRect();
      return {
        active: this.active,
        touchCapable: this.touchCapable,
        rotation: this.currentRotation,
        orientationLockSucceeded: this.orientationLockSucceeded,
        canvas: {width: this.canvas.width, height: this.canvas.height},
        stage: {
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          layout: this.stage.dataset.layout
        },
        input: this.inputHub.snapshot()
      };
    }
  }

  global.MobileGameShell = MobileGameShell;
})(window);
