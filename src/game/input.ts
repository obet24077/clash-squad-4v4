// Shared keyboard/mouse state.
// Edge-triggered sets are cleared by endFrame() once per tick.

export class Input {
  // Physical keyboard state
  private down = new Set<string>();
  private pressed = new Set<string>();

  // Physical mouse state
  private mouse = new Set<number>();
  private mousePressed = new Set<number>();

  // Virtual keyboard state (touchscreen)
  private virtualDown = new Set<string>();
  private virtualPressed = new Set<string>();

  // Virtual mouse state (touchscreen)
  private virtualMouse = new Set<number>();
  private virtualMousePressed = new Set<number>();

  // Mouse / camera movement
  lookDX = 0;
  lookDY = 0;
  wheel = 0;

  /**
   * Any key, mouse move / button / wheel since the last endFrame().
   * Used by awayChecker.ts.
   */
  private activity = false;

  /**
   * The battle chat field is open.
   * Game keyboard, mouse and virtual controls are ignored.
   */
  chatOpen = false;

  /**
   * Touch play mode. Mobile browsers never grant Pointer Lock, but the game gates
   * look / fire / chat on `input.locked`. While touch play is on, `locked` is true
   * so the touch controls can drive the game. Set by VirtualKeyMapping.
   */
  private touchLock = false;

  private abort = new AbortController();

  constructor(private lockTarget: HTMLElement = document.body) {
    const signal = this.abort.signal;

    // ----------------------------------------
    // Physical keyboard
    // ----------------------------------------

    window.addEventListener(
      "keydown",
      (e) => {
        if (this.chatOpen) return;

        // Prevent browser shortcuts used by the game.
        if (
          e.code === "Tab" ||
          e.code === "Space" ||
          (this.locked && (e.ctrlKey || /^F[159]$/.test(e.code)))
        ) {
          e.preventDefault();
        }

        // Check combined physical + virtual state.
        // Avoid duplicate pressed events when a virtual key is already held.
        if (!this.key(e.code)) {
          this.pressed.add(e.code);
        }

        this.down.add(e.code);
        this.activity = true;
      },
      { signal }
    );

    window.addEventListener(
      "keyup",
      (e) => {
        this.down.delete(e.code);
      },
      { signal }
    );

    // ----------------------------------------
    // Window blur
    // ----------------------------------------

    window.addEventListener(
      "blur",
      () => {
        this.down.clear();
        this.pressed.clear();

        this.mouse.clear();
        this.mousePressed.clear();

        this.releaseVirtual();

        this.lookDX = 0;
        this.lookDY = 0;
        this.wheel = 0;
      },
      { signal }
    );

    // ----------------------------------------
    // Physical mouse movement
    // ----------------------------------------

    document.addEventListener(
      "mousemove",
      (e) => {
        if (e.movementX || e.movementY) {
          this.activity = true;
        }

        if (!this.pointerLocked || this.chatOpen) return;

        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      },
      { signal }
    );

    // ----------------------------------------
    // Physical mouse buttons
    // ----------------------------------------

    document.addEventListener(
      "mousedown",
      (e) => {
        this.activity = true;

        if (!this.pointerLocked || this.chatOpen) return;

        // Avoid duplicate edge events if virtual button is already held.
        if (!this.button(e.button)) {
          this.mousePressed.add(e.button);
        }

        this.mouse.add(e.button);
      },
      { signal }
    );

    document.addEventListener(
      "mouseup",
      (e) => {
        this.mouse.delete(e.button);
      },
      { signal }
    );

    document.addEventListener(
      "contextmenu",
      (e) => {
        e.preventDefault();
      },
      { signal }
    );

    // ----------------------------------------
    // Mouse wheel
    // ----------------------------------------

    document.addEventListener(
      "wheel",
      (e) => {
        this.activity = true;

        if (this.pointerLocked && !this.chatOpen) {
          this.wheel += Math.sign(e.deltaY);
        }
      },
      {
        passive: true,
        signal,
      }
    );
  }

  // ==========================================
  // VIRTUAL KEYBOARD
  // ==========================================

  /**
   * Press or release a virtual keyboard key.
   *
   * Example:
   * input.setVirtualKey("KeyW", true);
   * input.setVirtualKey("KeyW", false);
   */
  setVirtualKey(code: string, isDown: boolean): void {
    if (this.chatOpen) return;

    if (isDown) {
      // Only create a new edge if the combined key was not already down.
      if (!this.key(code)) {
        this.virtualPressed.add(code);
      }

      this.virtualDown.add(code);
      this.activity = true;
    } else {
      this.virtualDown.delete(code);
    }
  }

  // ==========================================
  // VIRTUAL MOUSE
  // ==========================================

  /**
   * Press or release a virtual mouse button.
   *
   * Mouse button:
   * 0 = Left click / Fire
   * 1 = Middle click
   * 2 = Right click / Aim
   */
  setVirtualButton(button: number, isDown: boolean): void {
    if (this.chatOpen) return;

    if (isDown) {
      if (!this.button(button)) {
        this.virtualMousePressed.add(button);
      }

      this.virtualMouse.add(button);
      this.activity = true;
    } else {
      this.virtualMouse.delete(button);
    }
  }

  // ==========================================
  // VIRTUAL CAMERA / TOUCH LOOK
  // ==========================================

  /**
   * Add touchscreen camera movement.
   *
   * This does not require Pointer Lock.
   * The game camera must consume lookDX and lookDY
   * even when Input.locked is false.
   */
  addVirtualLook(dx: number, dy: number): void {
    if (this.chatOpen) return;

    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      return;
    }

    this.lookDX += dx;
    this.lookDY += dy;

    if (dx !== 0 || dy !== 0) {
      this.activity = true;
    }
  }

  // ==========================================
  // RELEASE VIRTUAL INPUT
  // ==========================================

  /**
   * Release all virtual keyboard and mouse states.
   *
   * Useful when:
   * - Chat opens
   * - Window loses focus
   * - Controls are disabled
   * - Game stops
   */
  releaseVirtual(): void {
    this.virtualDown.clear();
    this.virtualPressed.clear();

    this.virtualMouse.clear();
    this.virtualMousePressed.clear();
  }

  // ==========================================
  // CHAT STATE
  // ==========================================

  /**
   * Opening chat releases all held keys and buttons.
   * A held W must not keep moving after chat closes.
   */
  setChatOpen(on: boolean): void {
    if (this.chatOpen === on) return;

    this.chatOpen = on;

    this.down.clear();
    this.pressed.clear();

    this.mouse.clear();
    this.mousePressed.clear();

    this.releaseVirtual();

    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
  }

  // ==========================================
  // DISPOSE
  // ==========================================

  /**
   * Remove every event listener.
   * Called when returning to the lobby.
   */
  dispose(): void {
    this.touchLock = false;
    this.releaseVirtual();

    this.down.clear();
    this.pressed.clear();

    this.mouse.clear();
    this.mousePressed.clear();

    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;

    this.abort.abort();
  }

  // ==========================================
  // POINTER LOCK
  // ==========================================

  /** Real browser Pointer Lock (desktop mouse). */
  get pointerLocked(): boolean {
    return document.pointerLockElement === this.lockTarget;
  }

  /** True when the game may read look / fire: Pointer Lock OR touch play mode. */
  get locked(): boolean {
    return this.pointerLocked || this.touchLock;
  }

  /** Enable / disable touch play mode (the touchscreen equivalent of Pointer Lock). */
  setTouchLock(on: boolean): void {
    if (this.touchLock === on) return;

    this.touchLock = on;

    if (!on) {
      this.releaseVirtual();
      this.lookDX = 0;
      this.lookDY = 0;
      this.wheel = 0;
    }
  }

  get touchLocked(): boolean {
    return this.touchLock;
  }

  // ==========================================
  // KEYBOARD ACCESS
  // ==========================================

  /**
   * True if physical OR virtual key is held.
   */
  key(code: string): boolean {
    return (
      this.down.has(code) ||
      this.virtualDown.has(code)
    );
  }

  /**
   * True during the frame the key was first pressed.
   */
  keyPressed(code: string): boolean {
    return (
      this.pressed.has(code) ||
      this.virtualPressed.has(code)
    );
  }

  // ==========================================
  // MOUSE ACCESS
  // ==========================================

  /**
   * True if physical OR virtual mouse button is held.
   */
  button(button: number): boolean {
    return (
      this.mouse.has(button) ||
      this.virtualMouse.has(button)
    );
  }

  /**
   * True during the frame the mouse button was first pressed.
   */
  buttonPressed(button: number): boolean {
    return (
      this.mousePressed.has(button) ||
      this.virtualMousePressed.has(button)
    );
  }

  // ==========================================
  // ACTIVITY CHECK
  // ==========================================

  /**
   * Player input this frame.
   *
   * Includes:
   * - Physical keyboard
   * - Physical mouse
   * - Virtual keyboard
   * - Virtual mouse
   * - Mouse movement
   * - Touch camera movement
   */
  get anyInput(): boolean {
    return (
      this.activity ||
      this.down.size > 0 ||
      this.mouse.size > 0 ||
      this.virtualDown.size > 0 ||
      this.virtualMouse.size > 0
    );
  }

  // ==========================================
  // END FRAME
  // ==========================================

  /**
   * Clear edge-triggered states and mouse movement
   * after the current game tick.
   */
  endFrame(): void {
    this.activity = false;

    this.pressed.clear();
    this.virtualPressed.clear();

    this.mousePressed.clear();
    this.virtualMousePressed.clear();

    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
  }
}