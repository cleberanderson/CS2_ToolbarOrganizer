// Finds the buttons that other mods add to the two top toolbars and positions them.
//
// The buttons are never moved to another parent: each one only receives inline styles (position, left or
// right, top, margins and, when needed, width and height). The original inline values are kept and put
// back when the mod is turned off. All positions are in rem, counted from the game's fixed buttons.
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
import { compareNames, defaultLayout, Layout, ModIndexData, ProbeIndex, Side } from "./model";

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

export interface EngineStats {
    /** False while the bars are untouched (not found, or the mod index has not arrived). */
    active: boolean;
    left: number;
    right: number;
    unnamedLeft: number;
    unnamedRight: number;
}

export const EMPTY_STATS: EngineStats = { active: false, left: 0, right: 0, unnamedLeft: 0, unnamedRight: 0 };

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
    private lastStats = "";
    private lastSummary = "";
    private lastWait = "";
    private failed = false;

    constructor(
        root: HTMLElement,
        tip: HTMLElement,
        overlays: HTMLElement,
        overlayClass: string,
        onStats: (stats: EngineStats) => void
    ) {
        this.root = root;
        this.tip = tip;
        this.overlays = overlays;
        this.overlayClass = overlayClass;
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

        let wrote = this.placeRoot(left.fixed);
        wrote = this.arrange("left", left.items, left.fixed + STD + GAP, rem, now) || wrote;
        if (rightOk) {
            wrote = this.arrange("right", right!.items, right!.fixed, rem, now) || wrote;
        }
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
     */
    private arrange(side: Side, items: Managed[], start: number, rem: number, now: number): boolean {
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

        let wrote = false;
        let x = start;
        for (const m of outward) {
            wrote = this.resize(m, rem, now) || wrote;
            wrote = this.place(m, side, x, rem) || wrote;
            x += (m.resizeFailed ? m.btnRect.width / rem : STD) + GAP;
        }

        if (wrote) {
            log(
                "Arrange " + side + " (" + this.layout[side].mode + ", from the fixed buttons outwards): " +
                outward.map((m) => (m.name === null ? "[" + m.key + "]" : m.name) + "@" + m.x).join("; ")
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

    private place(m: Managed, side: Side, slot: number, rem: number): boolean {
        // The visible button may sit inside a wrapper; the wrapper is shifted so the button lands on the slot.
        const inset =
            side === "left" ? (m.btnRect.left - m.rect.left) / rem : (m.rect.right - m.btnRect.right) / rem;
        const x = round(slot - inset);
        const y = round(-(m.btnRect.top - m.rect.top) / rem);

        if (m.placed && Math.abs(x - m.x) <= MOVE_TOLERANCE && Math.abs(y - m.y) <= MOVE_TOLERANCE) {
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
        m.x = x;
        m.y = y;
        return true;
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
            if (!m.visible) {
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
        });

        const summary =
            "Summary: left " + count(left) + " buttons (" + unnamed(left) + " without name, " + hidden(left) + " hidden), " +
            left.ignored + " other children, fixed width " + round(left.fixed) + "rem; right " +
            (right
                ? count(right) + " buttons (" + unnamed(right) + " without name, " + hidden(right) + " hidden), " +
                  right.ignored + " other children, fixed width " + round(right.fixed) + "rem"
                : "not handled") +
            "; identification pending " + pending;
        if (summary !== this.lastSummary) {
            this.lastSummary = summary;
            log(summary);
        }
    }
}
