// Finds the buttons that other mods add to the two top toolbars and positions them.
//
// The buttons are never moved to another parent: each one only receives inline styles (position, left or
// right, top, margins and, when needed, width and height). The original inline values are kept and put
// back when the mod is turned off. All positions are in rem, counted from the game's fixed buttons.
//
// Each bar has a collapse button next to the game's fixed buttons. A collapsed bar keeps every button in
// its slot and only sends it far above the screen ("top"), where it is neither drawn nor reachable by the
// mouse; expanding brings it back to the same slot.
//
// Everything relevant is written to the complete log (bindings.log): what was found, how each button was
// identified, where it was placed, the tooltip decision and every click on a managed button.

import { log, resolveProbe } from "./bindings";
import {
    componentChain,
    ComponentChain,
    computedPosition,
    describe,
    findButton,
    iconLabel,
    iconUrls,
    isOpaque,
    modImagePath,
    stickingOut,
    tooltipInfo,
    visualState,
    VisualState,
} from "./identify";
import {
    clampColumns,
    compareNames,
    defaultLayout,
    Layout,
    ModIndexData,
    MORE_COLUMNS_MAX,
    MORE_COLUMNS_MIN,
    ProbeIndex,
    Side,
} from "./model";

/** Size of the game's floating buttons (--floatingToggleSize) and the space between them, in rem. */
const STD = 40;
const GAP = 6;

/** A child of a bar is treated as a button when both sides are inside this range, in rem. */
const MIN_ITEM = 20;
const MAX_ITEM = 80;

const POLL_MS = 1000;
const SEARCH_MS = 5000;
const SETTLE_MS = 4000;
const STD_GIVE_UP_MS = 1500;
const VISUAL_CHECK_MS = 1500;
const CHAIN_RETRY_MS = 3000;
const PROBE_TIMEOUT_MS = 10000;

/** Time the mouse stays over a button before the mod decides to show its own tooltip. The game shows its
 *  tooltips after 300 ms; this leaves room for them, and for tooltips made by the mods, to appear first. */
const HOVER_DELAY_MS = 650;
const MAX_FOLLOW_UPS = 6;
const MOVE_TOLERANCE = 0.25;
const SIZE_TOLERANCE = 0.75;

/** How many component functions, counted from the game's hook, are searched inside the mods. */
const TOP_FUNCTIONS = 6;
const PROBE_MIN = 12;
const PROBE_MAX = 400;

/** Class name prefixes of the game; the suffix after "_" changes with game updates. */
const LEFT_BAR = "info-menu-layout";
const RIGHT_BAR = "pause-menu-layout";
const RIGHT_HORIZONTAL = "horizontal";
const FIXED_CHILDREN = ["infoview-menu-toggle", "pause-menu-toggle"];

const POSITION_PROPS = ["position", "left", "right", "top", "marginLeft", "marginRight", "marginTop", "marginBottom"];
const SIZE_PROPS = ["width", "height"];
/** How far above the screen, in rem, the buttons of a collapsed bar are sent. */
const HIDDEN_SHIFT = 10000;

/** A bar takes at most this share of the screen width, counted from the screen edge where it starts; the
 *  icons that do not fit go to the next row. */
const MAX_BAR_SHARE = 0.8;
/** Rows a bar may have; the last one is not broken any more. */
const MAX_ROWS = 3;
/** Distance between the rows of a bar, in rem. */
const ROW_PITCH = STD + GAP;
/** Panel opened by the "+" button: icons side by side, MORE_COLUMNS_MIN per row as the standard, growing
 *  downwards. However few the icons, the panel is never shorter than this many rows. */
const MORE_MIN_ROWS = 3;
/** Space between the border of that panel and its icons, in rem. */
const MORE_PAD = 8;
/** Width of the edge of that panel that the user drags to change its number of columns, in rem. */
const MORE_GRIP = 12;

/** The icons of the two bars cover each other when one runs into the other by more than this, in rem. */
const OVERLAP_TOLERANCE = 0.5;
/** The answer about the overlap is used only after it stays the same for this long (the page settles). */
const OVERLAP_SETTLE_MS = 500;

type Route = "component" | "icon" | "none";
type SavedStyle = Record<string, string>;

interface Managed {
    /** Direct child of the bar: the element that is positioned. */
    el: HTMLElement;
    /** The visible button: the child itself or the first button inside it. */
    btn: HTMLElement;
    side: Side;
    adoptedAt: number;

    saved: SavedStyle;
    savedBtn: SavedStyle | null;
    /** Sent off the screen by a collapsed bar before its first placement (see applyHidden). */
    parked: boolean;
    resizedAt: number;
    resizeFailed: boolean;

    rect: DOMRect;
    btnRect: DOMRect;
    visible: boolean;

    chain: ComponentChain | null;
    probes: string[];
    module: string | null;
    route: Route;
    pending: boolean;
    pendingSince: number;
    label: string;
    key: string;
    name: string | null;
    reported: string;

    placed: boolean;
    x: number;
    y: number;

    visual: VisualState | null;
    overlay: HTMLElement | null;
    legend: string;

    onEnter: () => void;
    onLeave: () => void;
    onDown: () => void;
}

/** State kept while the mouse is over a button that has no tooltip of the game. */
interface Hover {
    m: Managed;
    timer: number;
    observer: MutationObserver | null;
    /** Elements added to the page since the mouse arrived. */
    added: Element[];
    /** Parts of the item already outside the button when the mouse arrived. */
    before: Element[];
    /** The mod's own tooltip is on the screen. */
    shown: boolean;
}

interface BarScan {
    container: HTMLElement;
    /** Width taken by the game's fixed buttons and by anything else left in the row, in rem. */
    fixed: number;
    fixedCount: number;
    items: Managed[];
    ignored: number;
}

/** What the menu side needs to draw the "+" button of a bar and the panel it opens. In rem from the root. */
export interface OverflowView {
    /** Place of the "+" button. */
    plusX: number;
    plusY: number;
    /** Icons that do not fit in the rows, and the grid that holds them in the panel. */
    count: number;
    columns: number;
    /** Rows of the panel: the ones the icons need, never less than MORE_MIN_ROWS. */
    rows: number;
    /** The panel: its box and the pieces of its background. The background is drawn around the places of
     *  the icons, never over them: the icons are the real buttons of the other mods and must stay on top
     *  and keep receiving the mouse. */
    boxX: number;
    boxY: number;
    boxWidth: number;
    boxHeight: number;
    pieces: { x: number; y: number; w: number; h: number }[];
    /** Edge dragged to change the number of columns: the side of the panel that is free to grow. */
    gripSide: Side;
    gripX: number;
    gripY: number;
    gripWidth: number;
    gripHeight: number;
}

/** Measures of a bar and of the screen, in rem across the screen, used to place its icons. */
interface Frame {
    /** Screen edge where the bar starts to the corner the icons are counted from. */
    edge: number;
    /** Top of the bar. */
    top: number;
    screenWidth: number;
    screenHeight: number;
    /** Corner of the root (mod button): the "+" button and the names are drawn inside it. */
    rootX: number;
    rootY: number;
}

export interface EngineStats {
    /** False while the bars are untouched (not found, or the mod index has not arrived). */
    active: boolean;
    left: number;
    right: number;
    unnamedLeft: number;
    unnamedRight: number;
    /** Rows taken by the icons of each bar (1 to 3). */
    leftRows: number;
    rightRows: number;
    /** "+" button and list of each bar; null when every icon fits in the rows. */
    moreLeft: OverflowView | null;
    moreRight: OverflowView | null;
    /**
     * True when the icons of the two bars would cover each other with both bars expanded. Measured on the
     * screen as it is (any resolution or interface scale): each bar ends exactly at its last icon.
     */
    overlap: boolean;
}

export const EMPTY_STATS: EngineStats = {
    active: false,
    left: 0,
    right: 0,
    unnamedLeft: 0,
    unnamedRight: 0,
    leftRows: 1,
    rightRows: 1,
    moreLeft: null,
    moreRight: null,
    overlap: false,
};

function classOf(el: Element): string {
    return el.getAttribute("class") || "";
}

function saveStyle(el: HTMLElement, props: string[]): SavedStyle {
    const saved: SavedStyle = {};
    const style = el.style as any;
    for (const prop of props) {
        saved[prop] = style[prop] || "";
    }
    return saved;
}

function restoreStyle(el: HTMLElement, saved: SavedStyle): void {
    const style = el.style as any;
    for (const prop of Object.keys(saved)) {
        style[prop] = saved[prop];
    }
}

function round(value: number): number {
    return Math.round(value * 10) / 10;
}

/** Short stable id for a piece of text (FNV-1a), so the same code always gets the same probe id. */
function hashOf(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return "h" + (hash >>> 0).toString(16) + "_" + text.length;
}

function errorText(e: unknown): string {
    const anyError = e as any;
    return anyError && anyError.stack ? String(anyError.stack) : String(e);
}

export class Engine {
    private readonly root: HTMLElement;
    private readonly tip: HTMLElement;
    private readonly overlays: HTMLElement;
    private readonly overlayClass: string;
    /** Holder of the collapse button of the right bar; it lives inside the root and is placed from here. */
    private readonly rightToggle: HTMLElement;
    private readonly onStats: (stats: EngineStats) => void;

    private layout: Layout = defaultLayout();
    private index: ModIndexData | null = null;
    private probes: ProbeIndex = new Map();

    private readonly items = new Map<Element, Managed>();
    private readonly sentProbes = new Set<string>();
    private readonly ignoredReasons = new WeakMap<Element, string>();

    private observer: MutationObserver | null = null;
    private observed: Element[] = [];
    private timer: number | null = null;
    private frame: number | null = null;
    private framesLeft = 0;
    private streak = 0;

    private hover: Hover | null = null;
    private rightBar: HTMLElement | null = null;
    private lastSearch = 0;
    private lastBars = "";

    private stopped = true;
    private applied = false;
    private pendingSince = 0;
    private rootPlaced = false;
    private rootX = -1;
    private rightToggleShown = false;
    private rightToggleX = 0;
    private rightToggleY = 0;
    private rightToggleSeenX = NaN;
    private rightToggleSeenY = NaN;
    /** Last state written to the log for each bar ("collapsed" or "expanded"). */
    private barState: Record<Side, string> = { left: "", right: "" };
    /** Where the icons of each row of each bar end, in rem from the bar's own corner (set by arrange). A
     *  bar without icons ends at its collapse button. */
    private extent: Record<Side, number[]> = { left: [0], right: [0] };
    /** "+" button and list of each bar, as last arranged; null when every icon fits in the rows. */
    private more: Record<Side, OverflowView | null> = { left: null, right: null };
    /** Bar whose "+" list is open; null when none. */
    private moreOpen: Side | null = null;
    /** Columns shown while the edge of a "+" panel is being dragged, before the change is saved. */
    private moreColumns: { side: Side; columns: number } | null = null;
    /** Overlap of the two bars: last measure, since when it holds, and the settled answer. */
    private overlapSeen: boolean | null = null;
    private overlapSince = 0;
    private overlap = false;
    private lastStats = "";
    private lastSummary = "";
    private lastWait = "";
    private failed = false;

    constructor(
        root: HTMLElement,
        tip: HTMLElement,
        overlays: HTMLElement,
        overlayClass: string,
        rightToggle: HTMLElement,
        onStats: (stats: EngineStats) => void
    ) {
        this.root = root;
        this.tip = tip;
        this.overlays = overlays;
        this.overlayClass = overlayClass;
        this.rightToggle = rightToggle;
        this.onStats = onStats;
    }

    start(): void {
        if (!this.stopped) {
            return;
        }

        this.stopped = false;
        log(
            "Engine start: window " + window.innerWidth + "x" + window.innerHeight + ", rem=" + round(this.rem()) +
            ", observer=" + (typeof MutationObserver === "function")
        );
        if (typeof MutationObserver === "function") {
            this.observer = new MutationObserver(() => this.kick(3));
        }
        this.timer = window.setInterval(this.reconcile, POLL_MS);
        this.reconcile();
    }

    /** Puts every button back exactly as it was and stops watching the bars. */
    stop(): void {
        log("Engine stop: restoring " + this.items.size + " buttons");
        this.stopped = true;

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.observed = [];
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
        if (this.frame !== null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }

        this.endHover("engine stopped");
        this.releaseAll("engine stopped");
    }

    setData(layout: Layout, index: ModIndexData | null, probes: ProbeIndex): void {
        this.layout = layout;
        this.index = index;
        this.probes = probes;
        if (!this.stopped) {
            this.reconcile();
            this.kick(2);
        }
    }

    /** Opens or closes the list of the "+" button of a bar (the icons that do not fit in its rows). */
    setMoreOpen(side: Side | null): void {
        if (side === this.moreOpen) {
            return;
        }
        this.moreOpen = side;
        log('"+" list: ' + (side ? "opened on the " + side + " bar" : "closed"));
        if (!this.stopped) {
            this.reconcile();
            this.kick(2);
        }
    }

    /**
     * Columns of the "+" panel of a bar while its edge is being dragged; null when no drag is going on, and
     * the saved number is used again.
     */
    setMoreColumns(preview: { side: Side; columns: number } | null): void {
        const before = this.moreColumns;
        if (
            (preview === null && before === null) ||
            (preview !== null && before !== null && preview.side === before.side && preview.columns === before.columns)
        ) {
            return;
        }
        this.moreColumns = preview;
        if (!this.stopped) {
            this.reconcile();
            this.kick(2);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Scheduling

    private kick(frames: number): void {
        if (this.stopped) {
            return;
        }
        this.framesLeft = Math.max(this.framesLeft, frames);
        if (this.frame === null) {
            this.frame = requestAnimationFrame(this.onFrame);
        }
    }

    private onFrame = (): void => {
        this.frame = null;
        if (this.stopped) {
            return;
        }
        this.framesLeft--;
        this.reconcile();
        if (this.framesLeft > 0 && this.frame === null) {
            this.frame = requestAnimationFrame(this.onFrame);
        }
    };

    private reconcile = (): void => {
        if (this.stopped || this.failed) {
            return;
        }

        try {
            const wrote = this.run();
            if (wrote) {
                // The game UI engine applies style changes on the next frame, so measure again after it.
                this.streak++;
                if (this.streak <= MAX_FOLLOW_UPS) {
                    this.kick(2);
                }
            } else {
                this.streak = 0;
            }
        } catch (e) {
            // Any unexpected failure leaves the bars as the game draws them.
            this.failed = true;
            log("ERROR engine stopped after a failure; the toolbars are left as in the game.\n" + errorText(e));
            try {
                this.releaseAll("engine failure");
            } catch (inner) {
                log("ERROR while restoring the buttons.\n" + errorText(inner));
            }
        }
    };

    // ---------------------------------------------------------------------------------------------
    // One pass: find, identify, order, position

    private run(): boolean {
        const rem = this.rem();
        const leftContainer = this.findLeft();
        const rightContainer = this.findRight();
        this.observe(leftContainer, rightContainer);

        const bars =
            "left=" + (leftContainer ? '"' + classOf(leftContainer) + '"' : "not found") +
            " right=" + (rightContainer ? '"' + classOf(rightContainer) + '"' : "not found") +
            " index=" + (this.index ? this.index.names.size + " mods" : "waiting");
        if (bars !== this.lastBars) {
            this.lastBars = bars;
            log("Bars: " + bars);
        }

        if (!leftContainer || !this.index || rem <= 0) {
            this.releaseAll("bars or index not available");
            return false;
        }

        const now = Date.now();
        const left = this.scan(leftContainer, "left", rem, now);
        const right = rightContainer ? this.scan(rightContainer, "right", rem, now) : null;

        // Without the game's own fixed buttons the structure is not the expected one: do nothing there.
        if (left.fixedCount === 0) {
            this.releaseAll("the game's fixed button was not found in the left bar");
            return false;
        }
        // The fixed button exists but has no size yet: the page is still being laid out. Try again
        // on the next frames instead of arranging from wrong measures.
        if (left.fixed <= 0) {
            this.kick(2);
            return false;
        }
        const rightOk = right !== null && right.fixedCount > 0;

        const live = new Set<Element>();
        for (const m of left.items) {
            live.add(m.el);
        }
        if (rightOk) {
            for (const m of right!.items) {
                live.add(m.el);
            }
        }
        for (const m of Array.from(this.items.values())) {
            if (!live.has(m.el)) {
                this.release(m, m.el.parentElement !== null, "no longer in a bar");
            }
        }

        // A collapsed bar hides its buttons from the first pass on, before they are identified and placed.
        this.applyHidden("left", left.items);
        if (rightOk) {
            this.applyHidden("right", right!.items);
        }

        const all = left.items.concat(rightOk ? right!.items : []);
        let pending = 0;
        for (const m of all) {
            this.identify(m, now);
            if (m.pending) {
                pending++;
            }
        }

        // On the first application, wait a moment for the code search so the buttons move only once.
        if (pending > 0 && !this.applied) {
            if (this.pendingSince === 0) {
                this.pendingSince = now;
            }
            if (now - this.pendingSince < SETTLE_MS) {
                const wait = "Waiting for the identification of " + pending + " of " + all.length + " buttons";
                if (wait !== this.lastWait) {
                    this.lastWait = wait;
                    log(wait);
                }
                return false;
            }
            log("Identification still pending for " + pending + " buttons after " + SETTLE_MS + " ms; arranging now");
        } else {
            this.pendingSince = 0;
        }

        this.assignKeys(all);

        // Left bar, from the game's fixed button: mod button, collapse button, then the icons.
        // Right bar, from the game's fixed buttons: collapse button, then the icons.
        const rootMoved = this.placeRoot(left.fixed);
        let wrote = rootMoved;
        // Every row of a bar starts at the place of its first icon: after the mod button and the collapse
        // button on the left bar, after the collapse button on the right bar.
        const leftBox = left.container.getBoundingClientRect();
        const frame = {
            screenWidth: window.innerWidth / rem,
            screenHeight: window.innerHeight / rem,
            rootX: leftBox.left / rem + round(left.fixed),
            rootY: leftBox.top / rem,
        };
        const leftFrame: Frame = { ...frame, edge: leftBox.left / rem, top: leftBox.top / rem };
        wrote = this.arrange("left", left.items, left.fixed + 2 * ROW_PITCH, leftFrame, rem, now) || wrote;
        if (rightOk) {
            const rightBox = right!.container.getBoundingClientRect();
            const rightFrame: Frame = { ...frame, edge: (window.innerWidth - rightBox.right) / rem, top: rightBox.top / rem };
            wrote = this.arrange("right", right!.items, right!.fixed + ROW_PITCH, rightFrame, rem, now) || wrote;
        } else {
            this.extent.right = [0];
            this.more.right = null;
        }
        this.placeRightToggle(rightOk ? right : null, rem, rootMoved);
        this.trackOverlap(left, rightOk ? right : null, rem, now);
        this.applied = true;

        this.updateOverlays(all, rem, now);
        this.updateLegends(all);
        this.report(left, rightOk ? right : null, pending);
        return wrote;
    }

    private rem(): number {
        const width = this.root.getBoundingClientRect().width;
        return width > 1 ? width / STD : window.innerWidth / 1920;
    }

    private findLeft(): HTMLElement | null {
        const parent = this.root.parentElement;
        return parent && classOf(parent).indexOf(LEFT_BAR) >= 0 ? parent : null;
    }

    private findRight(): HTMLElement | null {
        let bar = this.rightBar;
        if (!bar || !document.body.contains(bar) || classOf(bar).indexOf(RIGHT_BAR) < 0) {
            bar = this.searchRight();
            this.rightBar = bar;
        }
        // The game also has a vertical arrangement of this bar; only the horizontal one is handled.
        return bar && classOf(bar).indexOf(RIGHT_HORIZONTAL) >= 0 ? bar : null;
    }

    private searchRight(): HTMLElement | null {
        try {
            const found = document.querySelector('[class*="' + RIGHT_BAR + '"]');
            if (found) {
                return found as HTMLElement;
            }
        } catch (e) {
            // Selector not supported: fall through to the plain search.
        }

        // Plain search, at most once every few seconds: it walks every div of the page.
        const now = Date.now();
        if (now - this.lastSearch < SEARCH_MS) {
            return null;
        }
        this.lastSearch = now;

        const divs = document.getElementsByTagName("div");
        for (let i = 0; i < divs.length; i++) {
            if (classOf(divs[i]).indexOf(RIGHT_BAR) >= 0) {
                return divs[i] as HTMLElement;
            }
        }
        return null;
    }

    private observe(left: HTMLElement | null, right: HTMLElement | null): void {
        if (!this.observer) {
            return;
        }

        const wanted: Element[] = [];
        if (left) {
            wanted.push(left);
        }
        if (right) {
            wanted.push(right);
        }
        if (wanted.length === this.observed.length && wanted.every((el, i) => el === this.observed[i])) {
            return;
        }

        this.observer.disconnect();
        for (const el of wanted) {
            this.observer.observe(el, { childList: true });
        }
        this.observed = wanted;
    }

    private scan(container: HTMLElement, side: Side, rem: number, now: number): BarScan {
        const result: BarScan = { container, fixed: 0, fixedCount: 0, items: [], ignored: 0 };
        const children = Array.from(container.children) as HTMLElement[];

        for (const child of children) {
            if (child === this.root) {
                continue;
            }

            const rect = child.getBoundingClientRect();
            const cls = classOf(child);
            if (FIXED_CHILDREN.some((name) => cls.indexOf(name) >= 0)) {
                result.fixedCount++;
                if (rect.width > 1) {
                    result.fixed += rect.width / rem + GAP;
                }
                this.noteIgnored(child, side, "fixed button of the game, " + round(rect.width / rem) + "rem wide");
                continue;
            }

            let m = this.items.get(child);
            if (m && m.side !== side) {
                this.release(m, true, "moved to the other bar");
                m = undefined;
            }

            if (!m) {
                const w = rect.width / rem;
                const h = rect.height / rem;
                const sized = w >= MIN_ITEM && w <= MAX_ITEM && h >= MIN_ITEM && h <= MAX_ITEM;
                const position = sized || rect.width > 1 ? computedPosition(child) : null;
                const floating = position === "absolute" || position === "fixed";

                if (!sized || floating) {
                    // Something that stays in the row (not a button, not floating) keeps its room.
                    const keepsRoom = !floating && position !== null && rect.width > 1;
                    if (keepsRoom) {
                        result.fixed += w + GAP;
                    }
                    result.ignored++;
                    this.noteIgnored(
                        child,
                        side,
                        "not a button: " + round(w) + "x" + round(h) + "rem, position=" + (position || "?") +
                        (keepsRoom ? ", keeps its room in the row" : "")
                    );
                    continue;
                }

                m = this.adopt(child, side, now, rect, rem);
            }

            m.rect = rect;
            m.btnRect = m.btn === m.el ? rect : m.btn.getBoundingClientRect();
            m.visible = rect.width > 1 && rect.height > 1;
            result.items.push(m);
        }

        return result;
    }

    private noteIgnored(el: Element, side: Side, reason: string): void {
        if (this.ignoredReasons.get(el) === reason) {
            return;
        }
        this.ignoredReasons.set(el, reason);
        log("Child left alone (" + side + "): " + describe(el) + " - " + reason);
    }

    private adopt(el: HTMLElement, side: Side, now: number, rect: DOMRect, rem: number): Managed {
        const btn = findButton(el, STD * rem);
        const inner = btn === el ? null : btn;

        const m: Managed = {
            el,
            btn,
            side,
            adoptedAt: now,
            saved: saveStyle(el, POSITION_PROPS),
            savedBtn: null,
            parked: false,
            resizedAt: 0,
            resizeFailed: false,
            rect,
            btnRect: rect,
            visible: false,
            chain: null,
            probes: [],
            module: null,
            route: "none",
            pending: false,
            pendingSince: 0,
            label: "?",
            key: "",
            name: null,
            reported: "",
            placed: false,
            x: 0,
            y: 0,
            visual: null,
            overlay: null,
            legend: "",
            onEnter: () => this.beginHover(m),
            onLeave: () => this.leave(m),
            onDown: () => this.onPress(m),
        };

        btn.addEventListener("mouseenter", m.onEnter);
        btn.addEventListener("mouseleave", m.onLeave);
        el.addEventListener("mousedown", m.onDown, true);
        this.items.set(el, m);
        this.ignoredReasons.delete(el);

        log(
            "Adopt (" + side + "): " + describe(el) + (inner ? " button inside " + describe(inner) : "") +
            " size " + round(rect.width / rem) + "x" + round(rect.height / rem) + "rem at x=" + Math.round(rect.left) +
            " original style " + JSON.stringify(m.saved)
        );
        return m;
    }

    private release(m: Managed, restore: boolean, reason: string): void {
        if (this.hover && this.hover.m === m) {
            this.endHover("button released");
        }
        m.btn.removeEventListener("mouseenter", m.onEnter);
        m.btn.removeEventListener("mouseleave", m.onLeave);
        m.el.removeEventListener("mousedown", m.onDown, true);

        if (restore) {
            if (m.placed) {
                restoreStyle(m.el, m.saved);
            }
            if (m.savedBtn) {
                restoreStyle(m.btn, m.savedBtn);
            }
        }

        if (m.overlay && m.overlay.parentElement) {
            m.overlay.parentElement.removeChild(m.overlay);
        }
        m.overlay = null;
        this.items.delete(m.el);
        log("Release " + (m.key || describe(m.el)) + ": " + reason + (restore ? ", styles restored" : ", element gone"));
    }

    private releaseAll(reason: string): void {
        for (const m of Array.from(this.items.values())) {
            this.release(m, m.el.parentElement !== null, reason);
        }

        if (this.rootPlaced) {
            const style = this.root.style;
            style.position = "";
            style.left = "";
            style.top = "";
            style.marginLeft = "";
            style.marginRight = "";
            style.marginTop = "";
            style.marginBottom = "";
            this.rootPlaced = false;
            this.rootX = -1;
        }
        this.hideRightToggle(reason);
        this.barState = { left: "", right: "" };
        this.overlapSeen = null;
        this.overlap = false;
        this.more = { left: null, right: null };

        this.applied = false;
        this.pendingSince = 0;
        this.lastSummary = "";
        this.emitStats(EMPTY_STATS);
    }

    // ---------------------------------------------------------------------------------------------
    // Identification

    /** Registers a piece of component code to be searched inside the mods; returns its id. */
    private probe(source: string): string | null {
        const text = source.length <= PROBE_MAX ? source : source.substring(0, PROBE_MAX);
        if (text.length < PROBE_MIN) {
            return null;
        }

        const id = hashOf(text);
        if (!this.sentProbes.has(id)) {
            this.sentProbes.add(id);
            resolveProbe(id, text);
        }
        return id;
    }

    private identify(m: Managed, now: number): void {
        if (m.module || !this.index) {
            return;
        }

        // Route 1: the code of the component that draws the button exists in the UI module of one mod.
        if (m.chain === null || (m.chain.sources.length === 0 && now - m.adoptedAt < CHAIN_RETRY_MS)) {
            m.chain = componentChain(m.btn);
            m.probes = [];
            for (const source of m.chain.sources.slice(0, TOP_FUNCTIONS)) {
                const id = this.probe(source);
                if (id) {
                    m.probes.push(id);
                }
            }
            m.label = iconLabel(m.el);
        }

        m.pending = false;
        for (const id of m.probes) {
            const owners = this.probes.get(id);
            if (owners === undefined) {
                // The answers are read in order, from the game's hook down: wait for this one,
                // but not forever.
                if (m.pendingSince === 0) {
                    m.pendingSince = now;
                }
                if (now - m.pendingSince < PROBE_TIMEOUT_MS) {
                    m.pending = true;
                    return;
                }
                continue;
            }
            if (owners.length === 1 && this.index.names.has(owners[0])) {
                m.module = owners[0];
                m.route = "component";
                this.reportIdentity(m, "component code " + id);
                return;
            }
        }

        // Route 2: the icon file exists in the folder of exactly one mod.
        const urls = iconUrls(m.el);
        for (const url of urls) {
            const path = modImagePath(url);
            const owners = path ? this.index.byPath.get(path) : undefined;
            if (owners && owners.length === 1) {
                m.module = owners[0];
                m.route = "icon";
                this.reportIdentity(m, "icon " + path);
                return;
            }
        }

        m.route = "none";
        this.reportIdentity(
            m,
            m.chain.sources.length + " component functions, hook " +
            (m.chain.hookFound ? "found" : "NOT found") + " at depth " + m.chain.depth +
            ", icons [" + urls.map((url) => url.substring(0, 80)).join(", ") + "]"
        );
    }

    private reportIdentity(m: Managed, detail: string): void {
        const official = m.module && this.index ? this.index.names.get(m.module) || m.module : null;
        const text = m.module ? "mod " + m.module + ' "' + official + '" by ' + detail : "NOT identified (" + detail + ")";
        if (text === m.reported) {
            return;
        }
        m.reported = text;
        log("Identify (" + m.side + ") " + describe(m.btn) + ": " + text);
    }

    private assignKeys(all: Managed[]): void {
        const names = this.index ? this.index.names : new Map<string, string>();
        const seen = new Map<string, number>();

        for (const m of all) {
            const base = m.module ? "m:" + m.module : "u:" + m.label;
            const count = (seen.get(base) || 0) + 1;
            seen.set(base, count);

            m.key = count === 1 ? base : base + "#" + count;

            const edited = this.layout.names[m.key];
            m.name = edited ? edited : m.module ? names.get(m.module) || m.module : null;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Positioning

    private placeRoot(x: number): boolean {
        const target = round(x);
        if (this.rootPlaced && Math.abs(target - this.rootX) <= MOVE_TOLERANCE) {
            return false;
        }

        const style = this.root.style;
        style.position = "absolute";
        style.marginLeft = "0";
        style.marginRight = "0";
        style.marginTop = "0";
        style.marginBottom = "0";
        style.left = target + "rem";
        style.top = "0";
        this.rootPlaced = true;
        this.rootX = target;
        log("Mod button placed at left=" + target + "rem");
        return true;
    }

    /**
     * Left bar, left to right: named icons in the chosen order, then the ones without a name.
     * Right bar, left to right: the ones without a name, then named icons in the chosen order.
     * In both, the icons without a name stay at the outer end, away from the game's fixed buttons.
     *
     * A bar takes at most MAX_BAR_SHARE of the screen width, counted from the screen edge where it starts.
     * The icon that would pass that limit starts a new row. Every row starts at "start", the place of the
     * first icon of the bar. There are at most MAX_ROWS rows. The icons that still do not fit stay off the screen and are
     * listed, in alphabetical order, by the "+" button that takes the last place of the last row.
     */
    private arrange(
        side: Side,
        items: Managed[],
        start: number,
        frame: Frame,
        rem: number,
        now: number
    ): boolean {
        const visible = items.filter((m) => m.visible);
        const named = visible
            .filter((m) => m.name !== null)
            .sort((a, b) => compareNames(a.name as string, a.key, b.name as string, b.key));
        if (this.layout[side].mode === "za") {
            named.reverse();
        }
        const unnamed = visible.filter((m) => m.name === null);

        // Slots are filled from the fixed buttons outwards.
        const outward = side === "left" ? named.concat(unnamed) : named.slice().reverse().concat(unnamed.slice().reverse());

        const limit = MAX_BAR_SHARE * frame.screenWidth - frame.edge;
        const hidden = this.layout[side].hidden;
        let wrote = false;

        // 1. Which icon goes to which row; what does not fit in the last row is left over.
        const slots: { m: Managed; x: number; row: number }[] = [];
        const ends: number[] = [];
        let x = start;
        let row = 0;
        let inRow = 0;
        let rest: Managed[] = [];
        for (let i = 0; i < outward.length; i++) {
            const m = outward[i];
            wrote = this.resize(m, rem, now) || wrote;
            const width = m.resizeFailed ? m.btnRect.width / rem : STD;
            if (inRow > 0 && x + width > limit + MOVE_TOLERANCE) {
                if (row === MAX_ROWS - 1) {
                    rest = outward.slice(i);
                    break;
                }
                ends[row] = x - GAP;
                row++;
                x = start;
                inRow = 0;
            }
            slots.push({ m, x, row });
            x += width + GAP;
            inRow++;
        }

        // 2. With icons left over, the "+" button takes the last place of the last row.
        let plus: number | null = null;
        if (rest.length > 0) {
            if (x + STD > limit + MOVE_TOLERANCE && inRow > 1) {
                const last = slots.pop() as { m: Managed; x: number; row: number };
                rest.unshift(last.m);
                x = last.x;
            }
            plus = x;
            x += STD + GAP;
            for (const m of rest) {
                wrote = this.resize(m, rem, now) || wrote;
            }
        }
        // Each row ends exactly at its last icon; a bar without icons ends at its collapse button.
        ends[row] = x - GAP;
        this.extent[side] = ends;

        // 3. Icons of the rows.
        for (const slot of slots) {
            wrote = this.place(slot.m, side, slot.x, slot.row * ROW_PITCH, hidden, rem) || wrote;
        }

        // 4. Icons left over: in the panel of the "+" button while it is open, off the screen otherwise.
        let view: OverflowView | null = null;
        let listed: Managed[] = [];
        let dragged: number | null = null;
        let chosen = MORE_COLUMNS_MIN;
        if (plus !== null) {
            const across = (bar: number, width: number) =>
                side === "left" ? frame.edge + bar : frame.screenWidth - frame.edge - bar - width;
            const plusX = across(plus, STD);
            const plusY = frame.top + row * ROW_PITCH;

            // Always in alphabetical order, whatever the order chosen for the bar; no name, at the end.
            listed = rest
                .slice()
                .sort((a, b) =>
                    a.name === null || b.name === null
                        ? (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
                        : compareNames(a.name, a.key, b.name, b.key)
                );

            // Panel under the "+" button. The standard is MORE_COLUMNS_MIN icons per row, one row after the
            // other downwards; the user changes the number of columns (up to MORE_COLUMNS_MAX) by dragging
            // the free edge of the panel, and the rows follow. The panel is never shorter than
            // MORE_MIN_ROWS rows. With so many icons that the rows would pass the bottom of the screen, the
            // panel takes more columns than the chosen ones, so every icon stays reachable.
            const panelY = plusY + ROW_PITCH;
            // The panel opens towards the middle of the screen; the edge on that side is the one dragged.
            const growsLeft = plusX + STD / 2 > frame.screenWidth / 2;
            const padLeft = growsLeft ? MORE_GRIP : MORE_PAD;
            const padRight = growsLeft ? MORE_PAD : MORE_GRIP;
            const fitRows = Math.max(1, Math.floor((frame.screenHeight - panelY - GAP - 2 * MORE_PAD + GAP) / ROW_PITCH));
            const fitColumns = Math.floor((frame.screenWidth - 2 * GAP - MORE_PAD - MORE_GRIP + GAP) / ROW_PITCH);
            const maxColumns = Math.max(MORE_COLUMNS_MIN, Math.min(MORE_COLUMNS_MAX, fitColumns));
            dragged = this.moreColumns !== null && this.moreColumns.side === side ? this.moreColumns.columns : null;
            chosen = Math.min(clampColumns(dragged !== null ? dragged : this.layout[side].moreColumns), maxColumns);
            let columns = chosen;
            while (Math.ceil(listed.length / columns) > fitRows && columns < maxColumns) {
                columns++;
            }
            const panelRows = Math.max(MORE_MIN_ROWS, Math.ceil(listed.length / columns));
            const panelWidth = padLeft + columns * STD + (columns - 1) * GAP + padRight;
            const panelHeight = 2 * MORE_PAD + panelRows * STD + (panelRows - 1) * GAP;
            // Lined up with the "+" button on the side that does not grow, and always inside the screen.
            let panelX = growsLeft ? plusX + STD - panelWidth : plusX;
            panelX = Math.max(GAP, Math.min(panelX, frame.screenWidth - panelWidth - GAP));
            const open = this.moreOpen === side && !hidden;

            const ox = panelX - frame.rootX;
            const oy = panelY - frame.rootY;
            const pieces: { x: number; y: number; w: number; h: number }[] = [];
            const piece = (x: number, y: number, w: number, h: number) =>
                pieces.push({ x: round(ox + x), y: round(oy + y), w: round(w), h: round(h) });
            // Full-width strips: above the first row, between the rows and under the last one.
            piece(0, 0, panelWidth, MORE_PAD);
            for (let r = 0; r < panelRows; r++) {
                const y = MORE_PAD + r * ROW_PITCH;
                piece(0, y + STD, panelWidth, r === panelRows - 1 ? MORE_PAD : GAP);
                // In each row: the two sides, the gaps between the icons and the places without an icon.
                // They enter the strips above and below by half a rem so no seam shows between them.
                piece(0, y - 0.5, padLeft, STD + 1);
                piece(panelWidth - padRight, y - 0.5, padRight, STD + 1);
                for (let c = 0; c < columns; c++) {
                    const x = padLeft + c * ROW_PITCH;
                    if (c < columns - 1) {
                        piece(x + STD, y - 0.5, GAP, STD + 1);
                    }
                    if (r * columns + c >= listed.length) {
                        piece(x, y - 0.5, STD, STD + 1);
                    }
                }
            }

            view = {
                plusX: round(plusX - frame.rootX),
                plusY: round(plusY - frame.rootY),
                count: listed.length,
                columns,
                rows: panelRows,
                boxX: round(ox),
                boxY: round(oy),
                boxWidth: round(panelWidth),
                boxHeight: round(panelHeight),
                pieces,
                gripSide: growsLeft ? "left" : "right",
                gripX: round(ox + (growsLeft ? 0 : panelWidth - MORE_GRIP)),
                gripY: round(oy),
                gripWidth: MORE_GRIP,
                gripHeight: round(panelHeight),
            };
            for (let i = 0; i < listed.length; i++) {
                const m = listed[i];
                const width = m.resizeFailed ? m.btnRect.width / rem : STD;
                const iconX = panelX + padLeft + (i % columns) * ROW_PITCH;
                const iconY = panelY + MORE_PAD + Math.floor(i / columns) * ROW_PITCH;
                // Back to the bar's own corner: from its left for the left bar, from its right for the right bar.
                const bar = side === "left" ? iconX - frame.edge : frame.screenWidth - frame.edge - iconX - width;
                wrote = this.place(m, side, bar, iconY - frame.top, !open, rem) || wrote;
            }
        }
        const before = JSON.stringify(this.more[side]);
        this.more[side] = view;
        if (JSON.stringify(view) !== before) {
            log(
                '"+" button of the ' + side + " bar: " +
                (view
                    ? rest.length + " icons do not fit in " + MAX_ROWS + " rows; button at " + view.plusX + "," + view.plusY +
                      "rem from the mod button, panel of " + view.columns + " column(s) x " + view.rows + " row(s) (saved " +
                      this.layout[side].moreColumns + " column(s)" + (dragged !== null ? ", being dragged to " + dragged : "") +
                      (view.columns !== chosen ? ", raised to fit the height of the screen" : "") + "), " +
                      view.boxWidth + "x" + view.boxHeight + "rem at " + view.boxX + "," +
                      view.boxY + ", " + (this.moreOpen === side && !hidden ? "open" : "closed") + ": " +
                      listed.map((m) => (m.name === null ? "[" + m.key + "]" : m.name)).join("; ")
                    : "not needed, every icon fits in the rows")
            );
        }

        if (wrote) {
            const rowOf = new Map<Managed, number>();
            for (const slot of slots) {
                rowOf.set(slot.m, slot.row);
            }
            log(
                "Arrange " + side + " (" + this.layout[side].mode + ", from the fixed buttons outwards, " + ends.length +
                " row(s), limit " + round(limit) + "rem" + (rest.length > 0 ? ", " + rest.length + ' in the "+" list' : "") + "): " +
                slots
                    .map((slot) => {
                        const m = slot.m;
                        return (m.name === null ? "[" + m.key + "]" : m.name) + "@" + m.x + (slot.row > 0 ? "/row" + (slot.row + 1) : "");
                    })
                    .join("; ")
            );
        }
        return wrote;
    }

    /** Brings the button to the game's standard size when it differs. */
    private resize(m: Managed, rem: number, now: number): boolean {
        const w = m.btnRect.width / rem;
        const h = m.btnRect.height / rem;
        const off = Math.abs(w - STD) > SIZE_TOLERANCE || Math.abs(h - STD) > SIZE_TOLERANCE;

        // An item that is not a button and holds other elements is a wrapper (it may contain the panels
        // of its mod): its size is left alone and it is placed by its real width.
        if (off && !m.savedBtn && m.btn === m.el && m.el.tagName !== "BUTTON" && m.el.children.length > 0) {
            if (!m.resizeFailed) {
                m.resizeFailed = true;
                log("Resize " + (m.key || describe(m.btn)) + " skipped: the item is a wrapper of " + round(w) + "x" + round(h) + "rem");
            }
            return false;
        }

        if (off && !m.savedBtn) {
            m.savedBtn = saveStyle(m.btn, SIZE_PROPS);
            m.btn.style.width = STD + "rem";
            m.btn.style.height = STD + "rem";
            m.resizedAt = now;
            log(
                "Resize " + (m.key || describe(m.btn)) + ": " + round(w) + "x" + round(h) + "rem -> " + STD + "x" + STD +
                "rem, original " + JSON.stringify(m.savedBtn)
            );
            return true;
        }

        if (m.savedBtn) {
            // A button that keeps its own size after the change is positioned by its real width.
            const failed = off && now - m.resizedAt > STD_GIVE_UP_MS;
            if (failed && !m.resizeFailed) {
                log("Resize " + m.key + " had no effect: the button stays " + round(w) + "x" + round(h) + "rem");
            }
            m.resizeFailed = failed;
        }
        return false;
    }

    /**
     * Puts the visible button of an item at "slot" (rem from the bar's own corner, along the bar) and
     * "top" (rem below the top of the bar). "away" sends it far above the screen instead, keeping the
     * slot: the icons of a collapsed bar and the ones of a closed "+" list.
     */
    private place(m: Managed, side: Side, slot: number, top: number, away: boolean, rem: number): boolean {
        // The visible button may sit inside a wrapper; the wrapper is shifted so the button lands on the slot.
        const inset =
            side === "left" ? (m.btnRect.left - m.rect.left) / rem : (m.rect.right - m.btnRect.right) / rem;
        const x = round(slot - inset);
        const y = round(-(m.btnRect.top - m.rect.top) / rem + top - (away ? HIDDEN_SHIFT : 0));

        if (m.placed && !m.parked && Math.abs(x - m.x) <= MOVE_TOLERANCE && Math.abs(y - m.y) <= MOVE_TOLERANCE) {
            return false;
        }

        const style = m.el.style;
        style.position = "absolute";
        style.marginLeft = "0";
        style.marginRight = "0";
        style.marginTop = "0";
        style.marginBottom = "0";
        if (side === "left") {
            style.left = x + "rem";
        } else {
            style.right = x + "rem";
        }
        style.top = y + "rem";

        m.placed = true;
        m.parked = false;
        m.x = x;
        m.y = y;
        return true;
    }

    // ---------------------------------------------------------------------------------------------
    // Collapsed bars

    /**
     * A collapsed bar sends its buttons off the screen: each item keeps its slot and its size and only its
     * "top" goes far above the screen, so it is neither drawn nor reachable by the mouse. Making a button
     * invisible is not enough in the game UI engine: an invisible button still answers to the mouse and
     * still shows its tooltip. The whole item goes, with whatever its mod keeps inside it. No other
     * property of the item is touched, and the original values return when the mod is turned off.
     *
     * Items already placed are moved by place(). This part handles the ones not placed yet (first pass
     * after loading, or a mod that has just appeared): they leave the screen at once, before they are
     * identified, and return untouched if the bar is expanded before the first arrangement.
     */
    private applyHidden(side: Side, items: Managed[]): void {
        const hidden = this.layout[side].hidden;
        let parked = 0;
        let returned = 0;

        for (const m of items) {
            if (hidden && !m.placed) {
                m.el.style.position = "absolute";
                m.el.style.top = -HIDDEN_SHIFT + "rem";
                m.placed = true;
                m.parked = true;
                parked++;
            } else if (!hidden && m.parked) {
                restoreStyle(m.el, m.saved);
                m.placed = false;
                m.parked = false;
                returned++;
            }
        }

        if (hidden && this.hover && this.hover.m.side === side) {
            this.endHover("bar collapsed");
        }

        const state = hidden ? "collapsed" : "expanded";
        if (state !== this.barState[side]) {
            this.barState[side] = state;
            log(
                "Bar " + side + " " + state + ": " + items.length + " buttons " +
                (hidden ? "sent off the screen (top -" + HIDDEN_SHIFT + "rem)" : "on the screen")
            );
        }
        if (parked > 0 || returned > 0) {
            log(
                "Bar " + side + ": " + (parked > 0 ? parked + " buttons not placed yet sent off the screen" : "") +
                (returned > 0 ? returned + " buttons not placed yet brought back" : "")
            );
        }
    }

    /**
     * The collapse button of the right bar takes the first slot next to the game's fixed buttons of that
     * bar. Its holder is a child of the root (left bar), so the place is given from the root's corner.
     */
    private placeRightToggle(right: BarScan | null, rem: number, rootMoved: boolean): void {
        if (!right) {
            this.hideRightToggle("right bar not handled");
            return;
        }
        // The root has just been moved: its new place is only measurable on the next frame.
        if (rootMoved) {
            return;
        }

        const origin = this.root.getBoundingClientRect();
        const box = right.container.getBoundingClientRect();
        const x = round((box.right - origin.left) / rem - right.fixed - STD);
        const y = round((box.top - origin.top) / rem);
        if (
            this.rightToggleShown &&
            Math.abs(x - this.rightToggleX) <= MOVE_TOLERANCE &&
            Math.abs(y - this.rightToggleY) <= MOVE_TOLERANCE
        ) {
            return;
        }
        // Shown or moved only when two passes in a row give the same place: while the page is still
        // being laid out the measures change from one frame to the next.
        const settled =
            Math.abs(x - this.rightToggleSeenX) <= MOVE_TOLERANCE && Math.abs(y - this.rightToggleSeenY) <= MOVE_TOLERANCE;
        this.rightToggleSeenX = x;
        this.rightToggleSeenY = y;
        if (!settled) {
            this.kick(2);
            return;
        }

        const style = this.rightToggle.style;
        style.left = x + "rem";
        style.top = y + "rem";
        style.display = "flex";
        this.rightToggleShown = true;
        this.rightToggleX = x;
        this.rightToggleY = y;
        log(
            "Collapse button of the right bar placed at left=" + x + "rem top=" + y + "rem from the mod button (" +
            round(right.fixed) + "rem from the right end of the bar)"
        );
    }

    private hideRightToggle(reason: string): void {
        if (!this.rightToggleShown) {
            return;
        }
        this.rightToggle.style.display = "none";
        this.rightToggleShown = false;
        this.rightToggleSeenX = NaN;
        this.rightToggleSeenY = NaN;
        log("Collapse button of the right bar hidden: " + reason);
    }

    // ---------------------------------------------------------------------------------------------
    // Generic icon and tooltip

    /** A button that shows nothing at all receives a "?" drawn over it; the button itself is not changed. */
    private updateOverlays(all: Managed[], rem: number, now: number): void {
        const origin = this.root.getBoundingClientRect();

        for (const m of all) {
            if (m.visual === null && m.visible && now - m.adoptedAt > VISUAL_CHECK_MS) {
                m.visual = visualState(m.btn);
                if (m.visual === "no") {
                    const overlay = document.createElement("div");
                    overlay.className = this.overlayClass;
                    overlay.textContent = "?";
                    this.overlays.appendChild(overlay);
                    m.overlay = overlay;
                }
                if (m.visual !== "yes") {
                    log("Icon " + m.key + ": visual content " + m.visual + (m.visual === "no" ? ', generic "?" drawn' : ""));
                }
            }

            if (!m.overlay) {
                continue;
            }

            const style = m.overlay.style;
            if (!m.visible || this.layout[m.side].hidden) {
                style.display = "none";
                continue;
            }
            style.display = "flex";
            style.left = (m.btnRect.left - origin.left) / rem + "rem";
            style.top = (m.btnRect.top - origin.top) / rem + "rem";
            style.width = m.btnRect.width / rem + "rem";
            style.height = m.btnRect.height / rem + "rem";
        }
    }

    private noteLegend(m: Managed, decision: string): void {
        if (decision !== m.legend) {
            m.legend = decision;
            log("Tooltip " + m.key + ": " + decision);
        }
    }

    /**
     * Who shows the tooltip of the button:
     *  - "game": the game's own tooltip component wraps the button; it always shows, nothing is added;
     *  - "screen": no tooltip component, or one made by a mod (whose result cannot be assumed): the
     *    answer comes from watching the screen while the mouse is over the button;
     *  - "wait": the search that tells the game's component from a mod's one has not answered yet;
     *  - "unknown": the internal data could not be read.
     */
    private tooltipKind(m: Managed): { kind: "game" | "screen" | "wait" | "unknown"; detail: string } {
        const info = tooltipInfo(m.btn);
        if (info.state === "unknown") {
            return { kind: "unknown", detail: info.where };
        }
        if (info.state === "open") {
            return { kind: "screen", detail: "no tooltip component" };
        }

        const id = info.source ? this.probe(info.source) : null;
        if (id === null) {
            return { kind: "game", detail: "tooltip component " + info.where };
        }

        const owners = this.probes.get(id);
        if (owners === undefined) {
            return { kind: "wait", detail: "tooltip component " + info.where + ", origin being checked" };
        }
        if (owners.length === 0) {
            return { kind: "game", detail: "tooltip component of the game " + info.where };
        }
        return { kind: "screen", detail: "tooltip component of the mod " + owners.join(", ") + " " + info.where };
    }

    /** Records what is already known about the tooltip of every button, without waiting for the mouse. */
    private updateLegends(all: Managed[]): void {
        for (const m of all) {
            if (!m.placed || m.pending) {
                continue;
            }
            if (m.legend !== "" && m.legend.indexOf("origin being checked") < 0) {
                continue;
            }

            const kind = this.tooltipKind(m);
            if (kind.kind === "game") {
                this.noteLegend(m, "original kept (" + kind.detail + ")");
            } else if (kind.kind === "unknown") {
                this.noteLegend(m, "not created (" + kind.detail + ")");
            } else if (kind.kind === "wait") {
                this.noteLegend(m, "waiting (" + kind.detail + ")");
            } else if (!m.name) {
                this.noteLegend(m, "none: the mod of the button is not identified");
            } else {
                this.noteLegend(m, "to be decided on the screen when the mouse is over the button (" + kind.detail + ")");
            }
        }
    }

    private onPress(m: Managed): void {
        log("Click on " + m.side + " button " + (m.key || "?") + ' "' + (m.name || "") + '" ' + describe(m.btn));
        // Like the game's tooltips, the mod's tooltip goes away when the button is pressed.
        if (this.hover && this.hover.m === m) {
            this.endHover("button pressed");
        }
    }

    /** The mouse left a button. Only the button being watched ends the watch (events may arrive late). */
    private leave(m: Managed): void {
        if (this.hover && this.hover.m === m) {
            this.endHover("mouse left");
        }
    }

    /**
     * The mouse is over a button. The original tooltip always has priority:
     *  - a button wrapped by a tooltip of the game keeps it, and nothing else is done;
     *  - otherwise the mod waits a moment and looks at the screen: if a tooltip made by the mod that
     *    owns the button appeared right next to it, nothing is added; if nothing appeared, the mod shows
     *    its own tooltip with the official name of the mod.
     * This does not depend on how each mod builds its tooltip. The decision is taken again every time.
     */
    private beginHover(m: Managed): void {
        this.endHover("another button");
        if (this.stopped || this.failed || !m.placed) {
            return;
        }

        try {
            const kind = this.tooltipKind(m);
            if (kind.kind === "game") {
                this.noteLegend(m, "original kept (" + kind.detail + ")");
                return;
            }
            if (kind.kind === "unknown") {
                this.noteLegend(m, "not created (" + kind.detail + ")");
                return;
            }
            if (kind.kind === "wait") {
                this.noteLegend(m, "waiting (" + kind.detail + ")");
                return;
            }
            if (!m.name) {
                this.noteLegend(m, "none: the mod of the button is not identified");
                return;
            }

            const hover: Hover = {
                m,
                timer: 0,
                observer: null,
                added: [],
                before: stickingOut(m.el, m.btn, this.rem() * GAP),
                shown: false,
            };

            if (typeof MutationObserver === "function") {
                try {
                    hover.observer = new MutationObserver((records) => this.onPageChange(hover, records));
                    hover.observer.observe(document.body, { childList: true, subtree: true });
                } catch (e) {
                    hover.observer = null;
                }
            }

            hover.timer = window.setTimeout(() => this.decideTip(hover), HOVER_DELAY_MS);
            this.hover = hover;
        } catch (e) {
            log("ERROR while preparing the tooltip of " + m.key + ".\n" + errorText(e));
        }
    }

    private onPageChange(hover: Hover, records: MutationRecord[]): void {
        if (this.hover !== hover) {
            return;
        }

        for (const record of records) {
            for (let i = 0; i < record.addedNodes.length; i++) {
                const node = record.addedNodes[i];
                if (node.nodeType === 1 && !this.root.contains(node)) {
                    hover.added.push(node as Element);
                }
            }
        }

        // The original tooltip arrived after the mod's own one was shown: the original wins.
        if (hover.shown) {
            const foreign = this.foreignTooltip(hover);
            if (foreign) {
                this.noteLegend(hover.m, "original kept (appeared late next to the button: " + this.describeForeign(foreign) + ")");
                this.endHover("original tooltip appeared");
            }
        }
    }

    private decideTip(hover: Hover): void {
        if (this.hover !== hover || this.stopped || this.failed) {
            return;
        }

        const m = hover.m;
        try {
            const foreign = this.foreignTooltip(hover);
            if (foreign) {
                this.noteLegend(m, "original kept (appeared next to the button: " + this.describeForeign(foreign) + ")");
                this.endHover("original tooltip present");
                return;
            }

            if (!m.name) {
                this.endHover("no name");
                return;
            }

            this.showTip(m, m.name);
            hover.shown = true;
            this.noteLegend(m, 'created "' + m.name + '" (nothing appeared next to the button in ' + HOVER_DELAY_MS + " ms)");

            // What was really drawn, read two frames later: place, size and what is on top of it.
            requestAnimationFrame(() => requestAnimationFrame(() => this.reportTip(hover)));
        } catch (e) {
            log("ERROR while deciding the tooltip of " + m.key + ".\n" + errorText(e));
            this.endHover("error");
        }
    }

    /**
     * A tooltip made by the mod that owns the button, shown while the mouse is over it:
     *  - a new element of the page that touches the button or sits within a small gap of it. Elements
     *    inside the two toolbars do not count (other buttons change all the time), nor anything large;
     *  - a part of the item itself that now sticks out of the button.
     */
    private foreignTooltip(hover: Hover): Element | null {
        const m = hover.m;
        const rem = this.rem();
        const box = m.btn.getBoundingClientRect();
        const reach = 24 * rem;
        const leftBar = this.root.parentElement;
        const rightBar = this.rightBar;

        // Next to the button, of a sensible size and really visible.
        const qualifies = (node: Element): boolean => {
            const rect = node.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2 || rect.width > 600 * rem || rect.height > 300 * rem) {
                return false;
            }
            const dx = Math.max(rect.left - box.right, box.left - rect.right, 0);
            const dy = Math.max(rect.top - box.bottom, box.top - rect.bottom, 0);
            return dx <= reach && dy <= reach && isOpaque(node);
        };

        for (const node of hover.added) {
            if (!document.body.contains(node) || node.contains(m.el)) {
                continue;
            }
            const inItem = m.el.contains(node);
            if (!inItem && ((leftBar && leftBar.contains(node)) || (rightBar && rightBar.contains(node)))) {
                continue;
            }
            if (inItem && m.btn.contains(node)) {
                // Something redrawn inside the button itself (an icon changing on hover).
                continue;
            }
            if (qualifies(node)) {
                return node;
            }
        }

        for (const node of stickingOut(m.el, m.btn, rem * GAP)) {
            if (hover.before.indexOf(node) < 0 && qualifies(node)) {
                return node;
            }
        }

        return null;
    }

    private describeForeign(node: Element): string {
        const rect = node.getBoundingClientRect();
        const parent = node.parentElement;
        const text = (node.textContent || "").trim().substring(0, 40);
        return (
            describe(node) + " in " + (parent ? describe(parent) : "?") + " at " + Math.round(rect.left) + "," +
            Math.round(rect.top) + " " + Math.round(rect.width) + "x" + Math.round(rect.height) +
            (text ? ' text "' + text + '"' : "")
        );
    }

    /** Shows the mod's own tooltip under the button. */
    private showTip(m: Managed, text: string): void {
        const rem = this.rem();
        const rect = m.btn.getBoundingClientRect();
        const origin = this.root.getBoundingClientRect();
        const style = this.tip.style;

        this.tip.textContent = text;
        style.top = (rect.bottom - origin.top) / rem + GAP + "rem";
        if (rect.left + rect.width / 2 > window.innerWidth / 2) {
            style.left = "auto";
            style.right = (origin.right - rect.right) / rem + "rem";
        } else {
            style.right = "auto";
            style.left = (rect.left - origin.left) / rem + "rem";
        }
        style.display = "flex";
    }

    /** Writes to the log where the mod's tooltip really is and what is drawn on top of it. */
    private reportTip(hover: Hover): void {
        if (this.hover !== hover || !hover.shown) {
            return;
        }

        try {
            const m = hover.m;
            const box = m.btn.getBoundingClientRect();
            const rect = this.tip.getBoundingClientRect();
            let top = "?";
            if (typeof document.elementFromPoint === "function") {
                const found = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                top = found ? describe(found) + (this.tip === found || this.tip.contains(found) ? " (the tooltip itself)" : "") : "nothing";
            }
            log(
                "Tooltip " + m.key + " on screen: button at " + Math.round(box.left) + "," + Math.round(box.top) +
                ", tooltip at " + Math.round(rect.left) + "," + Math.round(rect.top) + " size " + Math.round(rect.width) + "x" +
                Math.round(rect.height) + ", display=" + this.tip.style.display + ", left=" + this.tip.style.left +
                ", right=" + this.tip.style.right + ", element at its centre: " + top
            );
        } catch (e) {
            log("ERROR while measuring the tooltip.\n" + errorText(e));
        }
    }

    private hideTip(): void {
        this.tip.style.display = "none";
    }

    private endHover(reason: string): void {
        const hover = this.hover;
        this.hover = null;
        if (hover) {
            window.clearTimeout(hover.timer);
            if (hover.observer) {
                hover.observer.disconnect();
            }
            if (hover.shown) {
                log("Tooltip " + hover.m.key + " hidden: " + reason);
            }
        }
        this.hideTip();
    }

    // ---------------------------------------------------------------------------------------------
    // Feedback to the menu and to the log

    private emitStats(stats: EngineStats): void {
        const text = JSON.stringify(stats);
        if (text !== this.lastStats) {
            this.lastStats = text;
            this.onStats(stats);
        }
    }

    /**
     * Where the icons of each row of each bar end, in rem across the screen. Each row ends exactly at its
     * last icon (the first row of a bar without icons, at its collapse button). The slots are the same
     * whether the bar is collapsed or not, so this tells what would happen with both bars expanded.
     */
    private measureExtents(left: BarScan, right: BarScan, rem: number): { leftEnd: number[]; rightStart: number[] } {
        const leftEdge = left.container.getBoundingClientRect().left / rem;
        const rightEdge = right.container.getBoundingClientRect().right / rem;
        return {
            leftEnd: this.extent.left.map((end) => leftEdge + end),
            rightStart: this.extent.right.map((end) => rightEdge - end),
        };
    }

    /** How much the two bars run into each other, in rem: the worst row that both bars use. */
    private overlapOf(extents: { leftEnd: number[]; rightStart: number[] }): number {
        let worst = 0;
        const shared = Math.min(extents.leftEnd.length, extents.rightStart.length);
        for (let row = 0; row < shared; row++) {
            worst = Math.max(worst, extents.leftEnd[row] - extents.rightStart[row]);
        }
        return worst;
    }

    private extentsText(extents: { leftEnd: number[]; rightStart: number[] }): string {
        return (
            "rows of the left bar end at " + extents.leftEnd.map((v) => Math.round(v)).join("/") +
            "rem, rows of the right bar start at " + extents.rightStart.map((v) => Math.round(v)).join("/") + "rem"
        );
    }

    /**
     * Keeps the answer to "would the two bars cover each other with both expanded?". The measure is taken
     * on every pass, from the screen as it is, so it follows the resolution, the interface scale and the
     * number of buttons. It is only used after it stays the same for a moment: while the page is being
     * laid out the bars are measured in places where they will not stay.
     */
    private trackOverlap(left: BarScan, right: BarScan | null, rem: number, now: number): void {
        const extents = right ? this.measureExtents(left, right, rem) : null;
        const raw = extents !== null && this.overlapOf(extents) > OVERLAP_TOLERANCE;

        if (raw !== this.overlapSeen) {
            this.overlapSeen = raw;
            this.overlapSince = now;
            window.setTimeout(this.reconcile, OVERLAP_SETTLE_MS + 50);
            return;
        }
        if (raw !== this.overlap && now - this.overlapSince >= OVERLAP_SETTLE_MS) {
            this.overlap = raw;
            log(
                "Overlap of the two bars with both expanded: " + (raw ? "YES" : "no") +
                (extents ? " (" + this.extentsText(extents) + ", window " + round(window.innerWidth / rem) + "rem wide)" : "")
            );
        }
    }

    private describeExtents(left: BarScan, right: BarScan | null): string {
        if (!right) {
            return "";
        }
        const extents = this.measureExtents(left, right, this.rem());
        const overlap = Math.round(this.overlapOf(extents));
        return "; " + this.extentsText(extents) + " across the screen: " + (overlap > 0 ? "overlap of " + overlap + "rem" : "no overlap");
    }

    private report(left: BarScan, right: BarScan | null, pending: number): void {
        const count = (scan: BarScan | null) => (scan ? scan.items.filter((m) => m.visible).length : 0);
        const unnamed = (scan: BarScan | null) =>
            scan ? scan.items.filter((m) => m.visible && m.name === null).length : 0;
        const hidden = (scan: BarScan | null) => (scan ? scan.items.filter((m) => !m.visible).length : 0);

        this.emitStats({
            active: true,
            left: count(left),
            right: count(right),
            unnamedLeft: unnamed(left),
            unnamedRight: unnamed(right),
            leftRows: this.extent.left.length,
            rightRows: right ? this.extent.right.length : 1,
            moreLeft: this.more.left,
            moreRight: right ? this.more.right : null,
            overlap: this.overlap,
        });

        const summary =
            "Summary: left " + count(left) + " buttons (" + unnamed(left) + " without name, " + hidden(left) + " hidden), " +
            left.ignored + " other children, fixed width " + round(left.fixed) + "rem; right " +
            (right
                ? count(right) + " buttons (" + unnamed(right) + " without name, " + hidden(right) + " hidden), " +
                  right.ignored + " other children, fixed width " + round(right.fixed) + "rem"
                : "not handled") +
            "; identification pending " + pending + this.describeExtents(left, right);
        if (summary !== this.lastSummary) {
            this.lastSummary = summary;
            log(summary);
        }
    }
}
