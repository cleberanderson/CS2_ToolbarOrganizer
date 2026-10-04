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
// In the edit mode a click on a button of another mod does not reach the mod: a click selects the item (to
// edit its name) and a drag moves it, inside its bar (manual order) or to the other bar. An item moved to
// the other bar stays a child of its own bar and is only drawn at a place of the other one.
//
// Groups: a group is shown on a bar by a button of the mod itself, which takes a place among the icons. The
// items of a group are not on the bar: they are drawn inside the panel of the group while it is open and
// stay off the screen otherwise. They never change parent either.
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
    addToGroup,
    barOf,
    clampColumns,
    compareNames,
    defaultLayout,
    GROUP_ITEMS_MAX,
    groupById,
    groupKey,
    GroupLayout,
    groupOf,
    Layout,
    leaveGroups,
    ModIndexData,
    MORE_COLUMNS_MAX,
    MORE_COLUMNS_MIN,
    moveGroupToBar,
    moveToBar,
    OrderMode,
    otherSide,
    PANEL_COLUMNS_MAX,
    PANEL_COLUMNS_NAMED,
    PANEL_COLUMNS_PLAIN,
    PANEL_ROWS_MAX,
    PANEL_ROWS_STANDARD,
    placeGroupInBar,
    placeInBar,
    placeInGroup,
    ProbeIndex,
    pruneLayout,
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
/** Time the mouse stays over a button whose name was edited by the user before that name is shown. It is
 *  the user's own choice, so there is nothing to wait for; the time is the one of the game's tooltips. */
const NAMED_DELAY_MS = 300;
/** A box taller than this, in rem, is a panel and not a tooltip. */
const PANEL_HEIGHT = 80;
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

const POSITION_PROPS = ["position", "left", "right", "top", "marginLeft", "marginRight", "marginTop", "marginBottom", "zIndex"];
/** Mouse events of a button of another mod that do not reach the mod while the edit mode is on (the press
 *  itself is handled apart: it selects the item or starts a drag). */
const BLOCKED_IN_EDIT = ["mouseup", "click", "dblclick", "contextmenu"];
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

/** Edit mode: the mouse has to move this far, in rem, with the button held, for a click to become a drag. */
const DRAG_START = 4;
/** Edit mode: room, in rem, around the collapse button that receives a dragged item. */
const EDGE_PAD = 3;
/** Edit mode: from the icons of a bar to the outer side of the dashed line drawn around them, in rem (the
 *  line is 2rem thick and stays 4rem away from the icons, as in the sketch). */
const OUTLINE_PAD = 6;
/** Edit mode: time a dragged item stays over the collapse button of the other bar, collapsed, before that
 *  bar is expanded, so the item can be taken to a chosen place of it. */
const EXPAND_DWELL_MS = 600;
/** Edit mode: width, in rem, of the frame drawn around the item while the mouse holds it. */
const DRAG_FRAME = 2;

/** Attribute of the button of a group (its value is the id of the group) and of the parts of that button
 *  that hold its name and its quantity; the buttons are drawn by the mod's own part of the screen. */
const GROUP_ATTR = "data-to-group";
const GROUP_TEXT_ATTR = "data-to-group-text";
/** Panel of a group, as in screen 17 of the sketch, in rem: the line around it, the paddings, the header and
 *  the space under it. The line is part of the size of the panel, as in the sketch: what is inside starts
 *  after it. */
const PANEL_BORDER = 1;
const PANEL_PAD_X = 14;
const PANEL_PAD_TOP = 12;
const PANEL_PAD_BOTTOM = 16;
const PANEL_HEAD = 44;
const PANEL_HEAD_GAP = 14;
/** Header of the panel: the handle, each of its two buttons and the space between its parts. */
const PANEL_HANDLE = 10;
const PANEL_HEAD_BUTTON = 44;
const PANEL_HEAD_SPACE = 8;
/** The title of the panel is written with 16rem and the button of the group with 14rem. */
const TITLE_SCALE = 16 / 14;
/** Quantity of the group (screen 38): a circle this wide at least, this far from the end of the name. */
const COUNT_SIZE = 18;
const COUNT_GAP = 4;
/** Panel with the names under the icons: width of a column, space between columns, from the icon to its
 *  name, room for the name (two lines) and space between rows. Without the names the icons are side by
 *  side, as on the bar. */
const CELL_WIDTH = 100;
const CELL_GAP_X = 10;
const CELL_LABEL_GAP = 6;
/** Height of one line of a name; a name takes two lines at most. A row is as tall as its tallest name. */
const CELL_LINE = 15;
const CELL_LINES = 2;
const CELL_GAP_Y = 14;
/** Panel without its title bar (screen 43): the handle sits in a tab this wide, outside the left edge of the
 *  panel, at the height of the first row of icons. */
const PANEL_EAR = 19;
/** A panel that sits under the button of its group opens this much further down in the edit mode (screen
 *  33), clear of the dashed line drawn around the bar. */
const EDIT_DROP = 14;
/** Space between such a panel and the menu it opens beside (screen 36), and between it and the notice of the
 *  edit mode it opens under (screen 41). */
const MENU_GAP = 8;
const NOTICE_GAP = 8;
/** Edit mode: the two ends of the button of a group, this wide, are places of the row (before and after
 *  it); the middle receives the item into the group. */
const GROUP_DROP_INSET = 10;
/** Time the "panel full" warning stays in the middle of a panel. */
const FULL_WARNING_MS = 2500;
/**
 * Drawing order. Each bar of the game is a closed layer (it has a transform), drawn by the game in its own
 * order: the left bar first, the windows of the game after it, the right bar after them. The mod leaves
 * that as it is: nothing of the mod is put over the windows of the game or of the other mods.
 *
 * The orders below only sort what is inside one bar. The root of the mod lives in the left bar, so they sort
 * the mod's own elements and the buttons of the left bar: the panel of a "+" button at MORE_Z (its icons
 * one step above, the buttons of groups inside it two), the first open panel of a group at PANEL_Z and each
 * following one PANEL_Z_STEP above: at each level the background of the panel, then its icons, then the
 * warning shown over them. The notice of the edit mode, the menu, the marks of the edit mode and the tooltip
 * are above every panel (style sheet); what the mouse holds is above everything.
 */
const MORE_Z = 14;
const PANEL_Z = 20;
const PANEL_Z_STEP = 3;
const DRAG_Z = "2000";
/** The mod's own buttons on the bars are drawn at this order (style sheet); an item with a higher order of
 *  its own, or raised into a panel, gets its "?" mark one step above it. */
const BAR_Z = 10;
/**
 * The one exception: the lists of a panel (its list of options and the list of its handle) must be over
 * every icon of the panel. An icon that comes from the right bar still belongs to the layer of that bar,
 * which the game draws after the left one, so it would be drawn over the list. While such a list is open,
 * the right bar gets this order and is drawn before the left bar; when the list closes it is put back. The
 * left bar is never touched, so nothing of the mod goes over a window.
 */
const RIGHT_UNDER = "-1";

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
    /** Bar that holds the element (where its mod puts it); never changes. */
    home: Side;
    /** Bar where the item is shown: the one the user moved it to, else its home. */
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
    /** Drawing order last written to the element; null while none was written. */
    z: string | null;

    visual: VisualState | null;
    overlay: HTMLElement | null;
    legend: string;

    onEnter: () => void;
    onLeave: () => void;
    onDown: (event: MouseEvent) => void;
    onBlock: (event: Event) => void;
}

/** An element of a bar: the button of another mod ("m") or the button of a group ("group"). */
interface Entry {
    /** Key of the item, or of the button of the group ("g:" + id). */
    key: string;
    m: Managed | null;
    group: GroupLayout | null;
    /** Name used for the order; null for an item without a name. */
    name: string | null;
    /** Width along the bar, in rem. */
    width: number;
}

/** A place of a row of a bar, as last arranged. "x" is in rem from the bar's own corner, along the bar. */
interface Slot {
    e: Entry;
    x: number;
    row: number;
    width: number;
}

/**
 * Where a dragged element would go if released now:
 *  - "bar": to the other bar (over its collapse button);
 *  - "slot": to a place of a row, right before the element "beforeKey" (null: after the last one);
 *  - "group": into a group, without choosing a place (over the button of the group or the header of its panel);
 *  - "panel": to a place of the open panel of a group, right before the item "beforeKey";
 *  - "full": nowhere, because the group under the mouse has no room.
 * "button" tells the button of the group from its panel.
 */
type DropTarget =
    | { kind: "bar"; side: Side }
    | { kind: "slot"; side: Side; beforeKey: string | null }
    | { kind: "group"; id: string; button: boolean }
    | { kind: "panel"; id: string; beforeKey: string | null }
    | { kind: "full"; id: string; button: boolean };

/** Size and place of an open panel, in rem across the screen. */
interface PanelGeometry {
    x: number;
    y: number;
    w: number;
    h: number;
    columns: number;
    rows: number;
    named: boolean;
    /** Title bar shown. */
    head: boolean;
    cellW: number;
    pitchX: number;
    gapY: number;
    /** Top of the first row of icons, and the top and the height of every row, from the top of the panel. */
    gridTop: number;
    rowTops: number[];
    rowHeights: number[];
    /** Under the button of its group (true) or where the user left it (false). */
    attached: boolean;
    /** Where it is, for the log. */
    where: string;
}

interface PanelPlan {
    group: GroupLayout;
    /** Items in the order shown, the place opened for a dragged item included. */
    list: Managed[];
    /** Items the group really has on the screen. */
    real: number;
    geo: PanelGeometry | null;
}

/** An item or the button of a group held by the mouse in the edit mode; it is a drag only after the mouse
 *  moves away ("active"). */
interface Drag {
    key: string;
    m: Managed | null;
    groupId: string | null;
    /** Element that follows the mouse. */
    el: HTMLElement;
    /** Bar where the element was when it was grabbed. */
    side: Side;
    startX: number;
    startY: number;
    /** From the corner of the button to the point where it was grabbed, in px. */
    grabX: number;
    grabY: number;
    active: boolean;
    target: DropTarget | null;
    /** Inline z-index the element had before the drag; while dragged it is drawn over the other icons. */
    zIndex: string;
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
    /** The item has a name edited by the user: that name is shown and the original tooltip is hidden. */
    named: boolean;
    /** Original tooltips hidden during this hover, with the value each one had, to put back at the end. */
    hidden: { node: HTMLElement; prop: "display" | "visibility"; old: string }[];
    frame: number;
    /** The button was pressed: nothing else is hidden (the click may open a panel of the mod), and what was
     *  hidden stays so until the mouse leaves the button. */
    frozen: boolean;
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

/** A rectangle in rem from the corner of the root (mod button). */
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** A piece of the background of a panel. "top" and "bottom" carry the round corners of the panel. */
export interface PanelPiece extends Box {
    part: "top" | "mid" | "bottom";
}

/** Name written under an icon of a panel: the corner of its box (one column wide), in rem from the root. */
export interface PanelLabel {
    key: string;
    text: string;
    x: number;
    y: number;
    /** Width of the column and height of the name (one or two lines). */
    w: number;
    h: number;
}

/** An open panel of a group, for the mod's own part of the screen to draw. */
export interface PanelView {
    id: string;
    name: string;
    /** Items of the group that are on the screen. */
    count: number;
    box: Box;
    /** Background, drawn around the places of the icons and never over them. */
    pieces: PanelPiece[];
    labels: PanelLabel[];
    /** Names under the icons. */
    named: boolean;
    columns: number;
    rows: number;
    /** Under the button of its group (true) or where the user left it (false). */
    attached: boolean;
    /** Title bar shown (false: the icons alone, with the handle in a tab outside the left edge). */
    head: boolean;
    /** From the top of the panel to its first row of icons, and the height taken by the rows. */
    gridTop: number;
    gridHeight: number;
    mode: OrderMode;
    /** Drawing order of the panel; its icons are one step above and its warning two. */
    z: number;
    /** The "panel full" warning is to be shown. */
    full: boolean;
}

/** The item selected in the edit mode, for the field that edits its name. */
export interface SelectedView {
    key: string;
    /** Name in use (the edited one, else the official one); "" when the item has none. */
    name: string;
    /** Official name of the mod; null when the mod of the item was not identified. */
    official: string | null;
    edited: boolean;
    /** Bar where the item is shown and bar where its mod puts it. */
    side: Side;
    home: Side;
    /** False when the other bar is not handled: the item cannot be sent there. */
    canMove: boolean;
    /** The visible button. */
    box: Box;
    /** Group the item is in (null: it is on a bar) and the box of the open panel of that group. */
    group: string | null;
    panel: Box | null;
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
    /** Area taken by the icons of each bar, for the lines drawn around it in the edit mode; null for a
     *  collapsed bar. */
    outlineLeft: Box | null;
    outlineRight: Box | null;
    /** Item selected in the edit mode; null when none. */
    selected: SelectedView | null;
    /** Open panels of groups, in drawing order. */
    panels: PanelView[];
    /** Group id -> items of the group that are on the screen. */
    groupCounts: Record<string, number>;
    /** Group being edited in the list of the menu, and the place of its button while it is on the screen
     *  (from the corner of the root), for the lines drawn around it. */
    editGroup: string | null;
    editGroupBox: Box | null;
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
    outlineLeft: null,
    outlineRight: null,
    selected: null,
    panels: [],
    groupCounts: {},
    editGroup: null,
    editGroupBox: null,
};

/** The elements and the callbacks the engine receives from the mod's own part of the screen. */
export interface EngineParts {
    root: HTMLElement;
    tip: HTMLElement;
    overlays: HTMLElement;
    overlayClass: string;
    /** Holder of the collapse button of the right bar; it lives inside the root and is placed from here. */
    rightToggle: HTMLElement;
    /** Edit mode: mark of the place opened for a dragged item, and frame around the collapse button that
     *  would receive it. */
    dropLine: HTMLElement;
    dropBox: HTMLElement;
    /** Edit mode: frame that follows the item held by the mouse. */
    dragFrame: HTMLElement;
    onStats: (stats: EngineStats) => void;
    /** A change made by dragging; "what" describes it for the log. */
    onSave: (layout: Layout, what: string) => void;
    /** A dragged item was held over the collapse button of a collapsed bar: that bar is to be expanded. */
    onExpand: (side: Side) => void;
}

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
    private readonly rightToggle: HTMLElement;
    private readonly dropLine: HTMLElement;
    private readonly dropBox: HTMLElement;
    private readonly dragFrame: HTMLElement;
    private readonly onStats: (stats: EngineStats) => void;
    private readonly onSave: (layout: Layout, what: string) => void;
    private readonly onExpand: (side: Side) => void;

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

    /** Edit mode: on or off, the selected item, and the item being dragged. */
    private editing = false;
    private selectedKey: string | null = null;
    private drag: Drag | null = null;
    private expandTimer = 0;
    /** Each bar as last arranged: its measures, the items in order (from the fixed buttons outwards, the
     *  ones of the "+" panel included), the places of its rows, and where a row starts and may end, in rem
     *  from the bar's own corner. */
    private frames: Record<Side, Frame | null> = { left: null, right: null };
    private outward: Record<Side, Entry[]> = { left: [], right: [] };
    /** Keys of each bar in its real order. While an item is dragged, "outward" and "slots" hold the bar as
     *  it would be if the item were released now; this one does not change. */
    private baseOrder: Record<Side, string[]> = { left: [], right: [] };
    private slots: Record<Side, Slot[]> = { left: [], right: [] };
    private rowStart: Record<Side, number> = { left: 0, right: 0 };
    private rowLimit: Record<Side, number> = { left: 0, right: 0 };
    /** Groups. The buttons, as found on the screen, and where each one was placed (rem across the screen;
     *  "shown" is false for a button sent off the screen). */
    private readonly groupEls = new Map<string, HTMLElement>();
    private readonly groupSpots = new Map<string, { sx: number; sy: number; width: number; shown: boolean }>();
    private readonly groupPlaced = new Map<string, { el: HTMLElement; left: string; top: string; z: string }>();
    /** Ids of the groups whose panel is open, in the order they were opened or dragged. It belongs to the
     *  session: every panel starts closed when the game is loaded. */
    private openPanels: string[] = [];
    /** Columns and rows of a panel while an edge is dragged, and its place while its handle is dragged. */
    private panelPreview: { id: string; columns: number | null; rows: number | null } | null = null;
    private panelMove: { id: string; x: number; y: number } | null = null;
    private fullWarning: { id: string; until: number } | null = null;
    /** The open menu of the mod and the notice of the edit mode, in rem from the corner of the root; null
     *  while they are not on the screen. A panel that sits under the button of its group keeps clear of them. */
    private menuBox: Box | null = null;
    private noticeBox: Box | null = null;
    /** Group whose panel shows its title bar for now, although it is hidden (its name is being edited there). */
    private headShown: string | null = null;
    /** Group being edited in the list of the menu, and whether its panel was opened for that. */
    private groupEdit: string | null = null;
    private groupEditOpened = false;
    /** The right bar while it is drawn before the left one (a list of a panel is open): the element and the
     *  order it had before. */
    private rightUnder: { el: HTMLElement; saved: string } | null = null;
    /** A list of a panel is open (told by the mod's own part of the screen). */
    private listOpen = false;
    /** Width of each name written under an icon, in rem, as measured on the screen, and the element used
     *  to measure them. */
    private readonly labelWidths = new Map<string, number>();
    private measureEl: HTMLElement | null = null;
    /** As last arranged: the open panels, the items of each group in their real order, the items of each
     *  open panel as shown (a place opened for a dragged item included) and the geometry of each open panel. */
    private panelViews: PanelView[] = [];
    private readonly panelOrder = new Map<string, string[]>();
    private readonly panelKeys = new Map<string, string[]>();
    private readonly panelGeo = new Map<string, PanelGeometry>();
    private memberCounts: Record<string, number> = {};
    private lastPanels = "";
    /** Overlap of the two bars: last measure, since when it holds, and the settled answer. */
    private overlapSeen: boolean | null = null;
    private overlapSince = 0;
    private overlap = false;
    private lastStats = "";
    private lastSummary = "";
    private lastWait = "";
    private failed = false;

    constructor(parts: EngineParts) {
        this.root = parts.root;
        this.tip = parts.tip;
        this.overlays = parts.overlays;
        this.overlayClass = parts.overlayClass;
        this.rightToggle = parts.rightToggle;
        this.dropLine = parts.dropLine;
        this.dropBox = parts.dropBox;
        this.dragFrame = parts.dragFrame;
        this.onStats = parts.onStats;
        this.onSave = parts.onSave;
        this.onExpand = parts.onExpand;
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

        this.cancelDrag("engine stopped");
        this.endHover("engine stopped");
        this.releaseAll("engine stopped");
        this.groupEdit = null;
        this.groupEditOpened = false;
        if (this.measureEl && this.measureEl.parentElement) {
            this.measureEl.parentElement.removeChild(this.measureEl);
        }
        this.measureEl = null;
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

    /** Turns the edit mode on or off. Turning it off drops the selection and any drag going on. */
    setEditing(on: boolean): void {
        if (on === this.editing) {
            return;
        }
        this.editing = on;
        log("Edit mode " + (on ? "on: a click on a button selects it and a drag moves it" : "off"));
        if (!on) {
            this.cancelDrag("edit mode off");
            this.selectedKey = null;
        }
        this.endHover("edit mode " + (on ? "on" : "off"));
        if (!this.stopped) {
            this.reconcile();
            this.kick(2);
        }
    }

    /** Selects an item of the bars (edit mode) or clears the selection. */
    select(key: string | null): void {
        if (key === this.selectedKey) {
            return;
        }
        this.selectedKey = key;
        log("Edit mode: " + (key ? "item " + key + " selected" : "selection cleared"));
        if (!this.stopped) {
            this.reconcile();
        }
    }

    /**
     * True when a point of the screen (px) or the element under it belongs to the bars: an element inside
     * one of the two bars, the area of the icons of an expanded bar (the space between them included), or
     * an open "+" panel. Used in the edit mode to tell a click on the bars from a click anywhere else.
     */
    inBars(node: Node, px: number, py: number): boolean {
        const leftBar = this.root.parentElement;
        if ((leftBar && leftBar.contains(node)) || (this.rightBar && this.rightBar.contains(node))) {
            return true;
        }
        const origin = this.frames.left;
        const rem = this.rem();
        if (!origin || rem <= 0) {
            return false;
        }
        const x = px / rem - origin.rootX;
        const y = py / rem - origin.rootY;
        const inside = (box: Box | null) => box !== null && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
        for (const side of ["left", "right"] as Side[]) {
            const view = this.moreOpen === side ? this.more[side] : null;
            if (
                inside(this.areaOf(side)) ||
                (view !== null && inside({ x: view.boxX, y: view.boxY, w: view.boxWidth, h: view.boxHeight }))
            ) {
                return true;
            }
        }
        return false;
    }

    /** The layout in use: the saved one, plus any change of the edit mode that is still on its way back. */
    getLayout(): Layout {
        return this.layout;
    }

    /** Keys of the items and of the groups of a bar in the order they are on the screen, from the fixed
     *  buttons outwards. */
    orderOf(side: Side): string[] {
        return this.outward[side].map((e) => e.key);
    }

    /**
     * Applies and saves a change of the layout made in the edit mode. The change is used at once, without
     * waiting for the saved layout to come back, so nothing jumps back for a moment.
     */
    commit(layout: Layout, what: string): void {
        const next = pruneLayout(layout, this.index);
        this.layout = next;
        this.onSave(next, what);
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
        // A collapsed bar hides its buttons from the first pass on, before they are identified and placed.
        // Each item counts for the bar where it was shown last (its own bar, for one just found).
        this.applyHidden("left", all.filter((m) => m.side === "left"));
        if (rightOk) {
            this.applyHidden("right", all.filter((m) => m.side === "right"));
        }

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

        this.scanGroups();

        // The bar where each item is shown: the one the user moved it to, when that bar is handled; else
        // the bar where its mod puts it. An item that belongs to a group is not on a bar: it is drawn
        // inside the panel of its group, and that bar is the one it returns to when it leaves the group.
        const groupOfKey = new Map<string, string>();
        for (const group of this.layout.groups) {
            for (const key of group.items) {
                groupOfKey.set(key, group.id);
            }
        }
        const members = new Map<string, Managed[]>();
        const shown: Record<Side, Managed[]> = { left: [], right: [] };
        for (const m of all) {
            const target = barOf(this.layout, m.key, m.home);
            const side = target === "right" && !rightOk ? m.home : target;
            if (side !== m.side) {
                log("Item " + m.key + " shown on the " + side + " bar (its own bar is the " + m.home + " one)");
                m.side = side;
            }
            const id = groupOfKey.get(m.key);
            if (id === undefined) {
                shown[side].push(m);
            } else {
                const list = members.get(id);
                if (list) {
                    list.push(m);
                } else {
                    members.set(id, [m]);
                }
            }
        }

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
        let rightFrame: Frame | null = null;
        if (rightOk) {
            const rightBox = right!.container.getBoundingClientRect();
            rightFrame = { ...frame, edge: (window.innerWidth - rightBox.right) / rem, top: rightBox.top / rem };
        }
        // An item shown on the other bar is placed from the corner of its own bar: both are needed first.
        this.frames = { left: leftFrame, right: rightFrame };
        this.groupSpots.clear();
        const groupsOf = (side: Side) => this.layout.groups.filter((group) => this.sideOfGroup(group) === side);
        wrote = this.arrange("left", shown.left, groupsOf("left"), left.fixed + 2 * ROW_PITCH, leftFrame, rem, now) || wrote;
        if (rightFrame) {
            wrote = this.arrange("right", shown.right, groupsOf("right"), right!.fixed + ROW_PITCH, rightFrame, rem, now) || wrote;
        } else {
            this.extent.right = [0];
            this.more.right = null;
            this.outward.right = [];
            this.slots.right = [];
        }
        this.placeRightToggle(rightOk ? right : null, rem, rootMoved);
        wrote = this.layoutPanels(members, rem, now) || wrote;
        this.orderRight(rightOk ? right!.container : null, "");
        // The bars as shown during a drag are a preview: the overlap is judged on the real arrangement.
        if (!(this.drag && this.drag.active)) {
            this.trackOverlap(left, rightOk ? right : null, rem, now);
        }
        this.applied = true;

        this.updateOverlays(all, rem, now);
        this.updateLegends(all);
        this.report(left, rightOk ? right : null, pending, shown, all, rem);
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
            if (m && m.home !== side) {
                this.release(m, true, "element moved to the other bar by its mod");
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
            home: side,
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
            z: null,
            visual: null,
            overlay: null,
            legend: "",
            onEnter: () => this.beginHover(m),
            onLeave: () => this.leave(m),
            onDown: (event: MouseEvent) => this.onPress(m, event),
            onBlock: (event: Event) => this.blockInEdit(m, event),
        };

        btn.addEventListener("mouseenter", m.onEnter);
        btn.addEventListener("mouseleave", m.onLeave);
        el.addEventListener("mousedown", m.onDown, true);
        for (const type of BLOCKED_IN_EDIT) {
            el.addEventListener(type, m.onBlock, true);
        }
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
        if (this.drag && this.drag.m === m) {
            this.cancelDrag("button released");
        }
        m.btn.removeEventListener("mouseenter", m.onEnter);
        m.btn.removeEventListener("mouseleave", m.onLeave);
        m.el.removeEventListener("mousedown", m.onDown, true);
        for (const type of BLOCKED_IN_EDIT) {
            m.el.removeEventListener(type, m.onBlock, true);
        }

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
        this.orderRight(null, reason);
        this.barState = { left: "", right: "" };
        this.overlapSeen = null;
        this.overlap = false;
        this.more = { left: null, right: null };
        this.cancelDrag(reason);
        this.frames = { left: null, right: null };
        this.outward = { left: [], right: [] };
        this.slots = { left: [], right: [] };
        this.groupSpots.clear();
        this.groupPlaced.clear();
        this.panelViews = [];
        this.panelGeo.clear();
        this.panelKeys.clear();
        this.lastPanels = "";

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
     * Left bar, left to right: the buttons of the groups by name, the named icons in the chosen order, then
     * the icons without a name. Right bar, left to right: the icons without a name, the named icons in the
     * chosen order, then the buttons of the groups by name. In both, the groups stay next to the game's
     * fixed buttons and the icons without a name at the outer end.
     *
     * A bar takes at most MAX_BAR_SHARE of the screen width, counted from the screen edge where it starts.
     * The element that would pass that limit starts a new row. Every row starts at "start", the place of the
     * first element of the bar. There are at most MAX_ROWS rows. What still does not fit stays off the screen
     * and is shown by the "+" button that takes the last place of the last row: the buttons of the groups
     * one per line, then the icons in alphabetical order.
     *
     * In manual mode the order is the one left by the user and the bar is a single free list: groups and
     * icons mixed, the icons without a name where the user put them.
     */
    private arrange(
        side: Side,
        items: Managed[],
        groups: GroupLayout[],
        start: number,
        frame: Frame,
        rem: number,
        now: number
    ): boolean {
        let wrote = false;
        const visible = items.filter((m) => m.visible);
        for (const m of visible) {
            wrote = this.resize(m, rem, now) || wrote;
        }
        const itemEntries = visible.map((m) => this.itemEntry(m, rem));
        const groupEntries = groups.map((group) => this.groupEntry(group, rem));
        const byName = (list: Entry[]) =>
            list.filter((e) => e.name !== null).sort((a, b) => compareNames(a.name as string, a.key, b.name as string, b.key));

        // Slots are filled from the fixed buttons outwards.
        let outward: Entry[];
        if (this.layout[side].mode === "manual") {
            // The order left by the user, kept as it is on the screen (from the fixed buttons outwards). What
            // is not in the list (a new mod, a new group, or something that has just come from the other bar)
            // goes after the listed ones: groups by name, icons with a name by name, then the ones without.
            const order = new Map<string, number>();
            this.layout[side].order.forEach((key, i) => order.set(key, i));
            const every = groupEntries.concat(itemEntries);
            const listed = every
                .filter((e) => order.has(e.key))
                .sort((a, b) => (order.get(a.key) as number) - (order.get(b.key) as number));
            const fresh = every.filter((e) => !order.has(e.key));
            outward = listed.concat(
                byName(fresh.filter((e) => e.group !== null)),
                byName(fresh.filter((e) => e.group === null)),
                fresh.filter((e) => e.name === null)
            );
        } else {
            const named = byName(itemEntries);
            const sorted = byName(groupEntries);
            if (this.layout[side].mode === "za") {
                named.reverse();
                sorted.reverse();
            }
            const unnamed = itemEntries.filter((e) => e.name === null);
            outward =
                side === "left"
                    ? sorted.concat(named, unnamed)
                    : sorted.slice().reverse().concat(named.slice().reverse(), unnamed.slice().reverse());
        }
        this.baseOrder[side] = outward.map((e) => e.key);

        // While something is dragged, the bars are shown as they would be if it were released now: it leaves
        // the place it had and the whole place it would take is opened, the other elements moving aside.
        // Released outside the bars it returns, so its own place stays open. It stays open too while the
        // element is over a group: nothing of the bar moves under the mouse.
        const drag = this.drag;
        const target = drag && drag.active ? drag.target : null;
        if (drag && target && (target.kind === "slot" || target.kind === "bar")) {
            for (let i = 0; i < outward.length; i++) {
                if (outward[i].key === drag.key) {
                    outward.splice(i, 1);
                    break;
                }
            }
            if (target.kind === "slot" && target.side === side) {
                const entry = this.dragEntry(drag, rem);
                let at = -1;
                for (let i = 0; i < outward.length && target.beforeKey !== null; i++) {
                    if (outward[i].key === target.beforeKey) {
                        at = i;
                        break;
                    }
                }
                if (entry && at < 0) {
                    outward.push(entry);
                } else if (entry) {
                    outward.splice(at, 0, entry);
                }
            }
        }
        this.outward[side] = outward;
        this.rowStart[side] = start;

        const limit = MAX_BAR_SHARE * frame.screenWidth - frame.edge;
        this.rowLimit[side] = limit;
        const hidden = this.layout[side].hidden;
        // From a place along the bar to a place across the screen.
        const across = (bar: number, width: number) =>
            side === "left" ? frame.edge + bar : frame.screenWidth - frame.edge - bar - width;

        // 1. Which element goes to which row; what does not fit in the last row is left over.
        const slots: Slot[] = [];
        const ends: number[] = [];
        let x = start;
        let row = 0;
        let inRow = 0;
        let rest: Entry[] = [];
        for (let i = 0; i < outward.length; i++) {
            const e = outward[i];
            const width = e.width;
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
            slots.push({ e, x, row, width });
            x += width + GAP;
            inRow++;
        }

        // 2. With something left over, the "+" button takes the last place of the last row.
        let plus: number | null = null;
        if (rest.length > 0) {
            while (x + STD > limit + MOVE_TOLERANCE && inRow > 1) {
                const last = slots.pop() as Slot;
                rest.unshift(last.e);
                x = last.x;
                inRow--;
            }
            plus = x;
            x += STD + GAP;
        }
        // Each row ends exactly at its last element; a bar without any ends at its collapse button.
        ends[row] = x - GAP;
        this.extent[side] = ends;
        this.slots[side] = slots;

        // The place opened for the dragged element is marked; nothing is marked when it would go to the "+" list.
        if (drag && target && target.kind === "slot" && target.side === side) {
            let open: Slot | null = null;
            for (const slot of slots) {
                if (slot.e.key === drag.key) {
                    open = slot;
                    break;
                }
            }
            const mark = this.dropLine.style;
            if (open && !hidden) {
                mark.left = round(across(open.x, open.width) - frame.rootX) + "rem";
                mark.top = round(frame.top + open.row * ROW_PITCH - frame.rootY) + "rem";
                mark.width = round(open.width) + "rem";
                mark.display = "flex";
            } else {
                mark.display = "none";
            }
        }

        // 3. Elements of the rows.
        for (const slot of slots) {
            const sx = across(slot.x, slot.width);
            const sy = frame.top + slot.row * ROW_PITCH;
            if (slot.e.m) {
                wrote = this.place(slot.e.m, sx, sy, slot.width, hidden, rem) || wrote;
                this.setZ(slot.e.m, null);
            } else if (slot.e.group) {
                wrote = this.placeGroup(slot.e.group.id, sx, sy, slot.width, hidden) || wrote;
            }
        }

        // 4. What is left over: in the panel of the "+" button while it is open, off the screen otherwise.
        let view: OverflowView | null = null;
        let listed: Managed[] = [];
        let listedGroups: Entry[] = [];
        let dragged: number | null = null;
        let chosen = MORE_COLUMNS_MIN;
        if (plus !== null) {
            const plusX = across(plus, STD);
            const plusY = frame.top + row * ROW_PITCH;

            // Always in alphabetical order, whatever the order chosen for the bar; no name, at the end. The
            // buttons of the groups come first, one per line.
            listedGroups = byName(rest.filter((e) => e.group !== null));
            listed = rest
                .filter((e) => e.m !== null)
                .map((e) => e.m as Managed)
                .sort((a, b) =>
                    a.name === null || b.name === null
                        ? (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
                        : compareNames(a.name, a.key, b.name, b.key)
                );
            const groupRows = listedGroups.length;
            let widest = 0;
            for (const e of listedGroups) {
                widest = Math.max(widest, e.width);
            }

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
            const fitRows = Math.max(
                1,
                Math.floor((frame.screenHeight - panelY - GAP - 2 * MORE_PAD + GAP) / ROW_PITCH) - groupRows
            );
            const fitColumns = Math.floor((frame.screenWidth - 2 * GAP - MORE_PAD - MORE_GRIP + GAP) / ROW_PITCH);
            const maxColumns = Math.max(MORE_COLUMNS_MIN, Math.min(MORE_COLUMNS_MAX, fitColumns));
            dragged = this.moreColumns !== null && this.moreColumns.side === side ? this.moreColumns.columns : null;
            chosen = Math.min(clampColumns(dragged !== null ? dragged : this.layout[side].moreColumns), maxColumns);
            let columns = chosen;
            while (Math.ceil(listed.length / columns) > fitRows && columns < maxColumns) {
                columns++;
            }
            const iconRows = Math.max(listed.length > 0 || groupRows === 0 ? MORE_MIN_ROWS : 0, Math.ceil(listed.length / columns));
            const panelRows = groupRows + iconRows;
            const gridWidth = columns * STD + (columns - 1) * GAP;
            // A button of a group is wider than an icon: the panel is at least as wide as the widest one.
            const innerWidth = Math.max(gridWidth, widest);
            const panelWidth = padLeft + innerWidth + padRight;
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
                if (r < groupRows) {
                    // The button of a group is an element of the mod itself, drawn over the background.
                    piece(0, y - 0.5, panelWidth, STD + 1);
                    continue;
                }
                // In each row of icons: the two sides, the gaps between the icons and the places without an
                // icon. They enter the strips above and below by half a rem so no seam shows between them.
                piece(0, y - 0.5, padLeft, STD + 1);
                piece(padLeft + gridWidth, y - 0.5, panelWidth - padLeft - gridWidth, STD + 1);
                for (let c = 0; c < columns; c++) {
                    const x = padLeft + c * ROW_PITCH;
                    if (c < columns - 1) {
                        piece(x + STD, y - 0.5, GAP, STD + 1);
                    }
                    if ((r - groupRows) * columns + c >= listed.length) {
                        piece(x, y - 0.5, STD, STD + 1);
                    }
                }
            }

            view = {
                plusX: round(plusX - frame.rootX),
                plusY: round(plusY - frame.rootY),
                count: listed.length + groupRows,
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
            for (let i = 0; i < listedGroups.length; i++) {
                const e = listedGroups[i];
                const group = e.group as GroupLayout;
                wrote =
                    this.placeGroup(group.id, panelX + padLeft, panelY + MORE_PAD + i * ROW_PITCH, e.width, !open, open ? String(MORE_Z + 2) : "") ||
                    wrote;
            }
            for (let i = 0; i < listed.length; i++) {
                const m = listed[i];
                const width = this.widthOf(m, rem);
                const iconX = panelX + padLeft + (i % columns) * ROW_PITCH;
                const iconY = panelY + MORE_PAD + (groupRows + Math.floor(i / columns)) * ROW_PITCH;
                wrote = this.place(m, iconX, iconY, width, !open, rem) || wrote;
                // Drawn with the open panel, over its background.
                this.setZ(m, open ? String(MORE_Z + 1) : null);
            }
        }
        const before = JSON.stringify(this.more[side]);
        this.more[side] = view;
        if (JSON.stringify(view) !== before) {
            log(
                '"+" button of the ' + side + " bar: " +
                (view
                    ? rest.length + " elements do not fit in " + MAX_ROWS + " rows (" + listedGroups.length + " group(s), " +
                      listed.length + " icon(s)); button at " + view.plusX + "," + view.plusY +
                      "rem from the mod button, panel of " + view.columns + " column(s) x " + view.rows + " row(s) (saved " +
                      this.layout[side].moreColumns + " column(s)" + (dragged !== null ? ", being dragged to " + dragged : "") +
                      (view.columns !== chosen ? ", raised to fit the height of the screen" : "") + "), " +
                      view.boxWidth + "x" + view.boxHeight + "rem at " + view.boxX + "," +
                      view.boxY + ", " + (this.moreOpen === side && !hidden ? "open" : "closed") + ": " +
                      listedGroups.map((e) => "{" + e.name + "}").concat(listed.map((m) => (m.name === null ? "[" + m.key + "]" : m.name))).join("; ")
                    : "not needed, everything fits in the rows")
            );
        }

        if (wrote) {
            log(
                "Arrange " + side + " (" + this.layout[side].mode + ", from the fixed buttons outwards, " + ends.length +
                " row(s), limit " + round(limit) + "rem" + (rest.length > 0 ? ", " + rest.length + ' in the "+" list' : "") + "): " +
                slots
                    .map((slot) => {
                        const e = slot.e;
                        const text = e.group ? "{" + e.name + "}" : e.name === null ? "[" + e.key + "]" : e.name;
                        return text + "@" + round(slot.x) + (slot.row > 0 ? "/row" + (slot.row + 1) : "");
                    })
                    .join("; ")
            );
        }
        return wrote;
    }

    /** An item as an element of a bar. */
    private itemEntry(m: Managed, rem: number): Entry {
        return { key: m.key, m, group: null, name: m.name, width: this.widthOf(m, rem) };
    }

    /** The button of a group as an element of a bar. */
    private groupEntry(group: GroupLayout, rem: number): Entry {
        return { key: groupKey(group.id), m: null, group, name: group.name, width: this.groupWidth(group, rem) };
    }

    /** The element held by the mouse, as an element of a bar. */
    private dragEntry(drag: Drag, rem: number): Entry | null {
        if (drag.m) {
            return this.itemEntry(drag.m, rem);
        }
        const group = drag.groupId ? groupById(this.layout, drag.groupId) : null;
        return group ? this.groupEntry(group, rem) : null;
    }

    /**
     * The buttons of the groups are elements of the mod itself, drawn by its own part of the screen as direct
     * children of the root. They are found here by their attribute, measured, and placed like the icons.
     */
    private scanGroups(): void {
        this.groupEls.clear();
        const children = this.root.children;
        for (let i = 0; i < children.length; i++) {
            const id = children[i].getAttribute(GROUP_ATTR);
            if (id) {
                this.groupEls.set(id, children[i] as HTMLElement);
            }
        }
    }

    /** Width of the button of a group, in rem: the one on the screen, or an estimate until it is drawn. */
    private groupWidth(group: GroupLayout, rem: number): number {
        const el = this.groupEls.get(group.id);
        const width = el ? el.getBoundingClientRect().width / rem : 0;
        if (width > 1) {
            return Math.round(width * 10) / 10;
        }
        // Not drawn yet: an estimate now, the real measure on the next frames.
        this.kick(3);
        return 60 + (group.name.length + 2) * 8.5;
    }

    /**
     * Width of the title of the panel of a group, in rem, taken from its button: the name, written larger in
     * the panel than on the button (16 against 14), the space after it and the quantity in its circle, which
     * has the same size in both.
     */
    private titleWidth(group: GroupLayout, rem: number): number {
        const el = this.groupEls.get(group.id);
        let name = 0;
        let count = 0;
        if (el) {
            for (let i = 0; i < el.children.length; i++) {
                const child = el.children[i];
                const kind = child.getAttribute(GROUP_TEXT_ATTR);
                if (kind === "name") {
                    name = child.getBoundingClientRect().width / rem;
                } else if (kind === "count") {
                    count = child.getBoundingClientRect().width / rem;
                }
            }
        }
        return name > 1 ? name * TITLE_SCALE + COUNT_GAP + Math.max(COUNT_SIZE, count) : group.name.length * 9.5 + COUNT_GAP + COUNT_SIZE + 6;
    }

    /** Bar where the button of a group is shown: its own, or the left one when the right bar is not handled. */
    private sideOfGroup(group: GroupLayout): Side {
        return group.side === "right" && this.frames.right === null ? "left" : group.side;
    }

    /**
     * Puts the button of a group at a place of the screen (rem across the screen). "away" sends it far above
     * the screen instead: the groups of a collapsed bar and the ones of a closed "+" list. The button being
     * dragged is left where the mouse holds it.
     */
    private placeGroup(id: string, sx: number, sy: number, width: number, away: boolean, z: string = ""): boolean {
        this.groupSpots.set(id, { sx, sy, width, shown: !away });
        if (this.drag && this.drag.active && this.drag.groupId === id) {
            return false;
        }
        const el = this.groupEls.get(id);
        const origin = this.frames.left;
        if (!el || !origin) {
            return false;
        }
        const left = round(sx - origin.rootX) + "rem";
        const top = round(sy - origin.rootY - (away ? HIDDEN_SHIFT : 0)) + "rem";
        // What was written last is remembered here: the value read back from the element may come in another form.
        const last = this.groupPlaced.get(id);
        if (last && last.el === el && last.left === left && last.top === top && last.z === z) {
            return false;
        }
        el.style.left = left;
        el.style.top = top;
        // Its own order on a bar (style sheet); raised with the open "+" panel it is inside of.
        el.style.zIndex = z;
        this.groupPlaced.set(id, { el, left, top, z });
        return !(last && last.el === el && last.left === left && last.top === top);
    }

    /** Drawing order of an item among the buttons of the bars: its own on a bar, raised inside a panel. */
    private setZ(m: Managed, z: string | null): void {
        if (this.drag && this.drag.active && this.drag.m === m) {
            return;
        }
        const value = z === null ? m.saved.zIndex || "" : z;
        if (m.z !== value) {
            m.el.style.zIndex = value;
            m.z = value;
        }
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

    /** Width of an item along a bar, in rem: the standard one, or its own when it could not be changed. */
    private widthOf(m: Managed, rem: number): number {
        return m.resizeFailed ? m.btnRect.width / rem : STD;
    }

    /**
     * Puts the visible button of an item at a place of the screen: "sx" and "sy" are the left and the top of
     * the button, in rem across the screen. "away" sends it far above the screen instead, keeping the
     * place along the bar: the icons of a collapsed bar and the ones of a closed "+" list. The item being
     * dragged is left where the mouse holds it.
     */
    private place(m: Managed, sx: number, sy: number, width: number, away: boolean, rem: number): boolean {
        if (this.drag && this.drag.active && this.drag.m === m) {
            return false;
        }
        return this.put(m, sx, sy, width, away, rem);
    }

    /**
     * Writes the place of an item. The element stays a child of its own bar ("home") and is placed from the
     * corner of that bar (its left for the left bar, its right for the right bar), whatever the bar where
     * the item is shown.
     */
    private put(m: Managed, sx: number, sy: number, width: number, away: boolean, rem: number): boolean {
        const frame = this.frames[m.home];
        if (!frame) {
            return false;
        }
        // The visible button may sit inside a wrapper; the wrapper is shifted so the button lands on the place.
        const along = m.home === "left" ? sx - frame.edge : frame.screenWidth - frame.edge - sx - width;
        const inset =
            m.home === "left" ? (m.btnRect.left - m.rect.left) / rem : (m.rect.right - m.btnRect.right) / rem;
        const x = round(along - inset);
        const y = round(sy - frame.top - (m.btnRect.top - m.rect.top) / rem - (away ? HIDDEN_SHIFT : 0));

        if (m.placed && !m.parked && Math.abs(x - m.x) <= MOVE_TOLERANCE && Math.abs(y - m.y) <= MOVE_TOLERANCE) {
            return false;
        }

        const style = m.el.style;
        style.position = "absolute";
        style.marginLeft = "0";
        style.marginRight = "0";
        style.marginTop = "0";
        style.marginBottom = "0";
        if (m.home === "left") {
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

        const state = hidden ? "collapsed" : "expanded";
        if (state !== this.barState[side]) {
            this.barState[side] = state;
            if (hidden && this.hover && this.hover.m.side === side) {
                this.endHover("bar collapsed");
            }
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
            // Nothing is drawn over a button that is off the screen (collapsed bar, closed panel).
            if (!m.visible || m.btnRect.bottom < 0) {
                style.display = "none";
                continue;
            }
            style.display = "flex";
            // Right over its button: one step above an icon that has an order of its own or is inside a panel.
            const z = Number(m.z || 0);
            style.zIndex = z > BAR_Z && z < Number(DRAG_Z) ? String(z + 1) : "";
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
            // A name edited by the user is what the tooltip shows, whatever the button had before.
            const edited = this.layout.names[m.key];
            if (edited) {
                this.noteLegend(m, 'edited name "' + edited + '" shown in place of the original tooltip');
                continue;
            }
            if (m.legend.indexOf("edited name") === 0) {
                m.legend = "";
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

    /** True when a mouse event happened on the visible button of an item (not on a panel its mod keeps inside it). */
    private onButton(m: Managed, event: Event): boolean {
        const target = event.target as Node | null;
        return target !== null && (target === m.btn || m.btn.contains(target));
    }

    /** Edit mode: the mouse events of a button do not reach its mod. */
    private blockInEdit(m: Managed, event: Event): void {
        if (this.editing && this.onButton(m, event)) {
            event.stopPropagation();
            event.preventDefault();
        }
    }

    /**
     * A button of another mod was pressed. Outside the edit mode the press only goes to the log. In the edit
     * mode it does not reach the mod: released without moving, it selects the item; moved with the button
     * held, it drags the item.
     */
    private onPress(m: Managed, event: MouseEvent): void {
        // Like the game's tooltips, the mod's tooltip goes away when the button is pressed.
        if (this.hover && this.hover.m === m) {
            if (this.hover.named) {
                this.freezeHover(this.hover);
            } else {
                this.endHover("button pressed");
            }
        }
        if (!this.editing || !this.onButton(m, event)) {
            log("Click on " + m.side + " button " + (m.key || "?") + ' "' + (m.name || "") + '" ' + describe(m.btn));
            return;
        }

        event.stopPropagation();
        event.preventDefault();
        if (event.button !== 0 || this.drag || !m.placed || !m.key) {
            return;
        }

        const box = m.btn.getBoundingClientRect();
        this.drag = {
            key: m.key,
            m,
            groupId: null,
            el: m.el,
            side: m.side,
            startX: event.clientX,
            startY: event.clientY,
            grabX: event.clientX - box.left,
            grabY: event.clientY - box.top,
            active: false,
            target: null,
            zIndex: m.el.style.zIndex || "",
        };
        document.addEventListener("mousemove", this.onDragMove, true);
        document.addEventListener("mouseup", this.onDragEnd, true);
        log("Edit mode: press on " + m.side + " item " + m.key + ' "' + (m.name || "") + '" (not sent to the mod)');
    }

    /**
     * The button of a group was pressed. Outside the edit mode nothing is done here: the click opens or
     * closes the panel. In the edit mode, released without moving it opens or closes the panel; moved with
     * the mouse button held, it drags the group to another place of a bar.
     */
    pressGroup(id: string, event: { button: number; clientX: number; clientY: number; preventDefault(): void }): void {
        if (!this.editing) {
            return;
        }
        event.preventDefault();
        const el = this.groupEls.get(id);
        const group = groupById(this.layout, id);
        if (event.button !== 0 || this.drag || !el || !group) {
            return;
        }
        const box = el.getBoundingClientRect();
        this.drag = {
            key: groupKey(id),
            m: null,
            groupId: id,
            el,
            side: this.sideOfGroup(group),
            startX: event.clientX,
            startY: event.clientY,
            grabX: event.clientX - box.left,
            grabY: event.clientY - box.top,
            active: false,
            target: null,
            zIndex: el.style.zIndex || "",
        };
        document.addEventListener("mousemove", this.onDragMove, true);
        document.addEventListener("mouseup", this.onDragEnd, true);
        log('Edit mode: press on the button of group "' + group.name + '"');
    }

    /** Width, in rem, of what is being dragged. */
    private dragWidth(drag: Drag, rem: number): number {
        return drag.m ? this.widthOf(drag.m, rem) : drag.el.getBoundingClientRect().width / rem;
    }

    private onDragMove = (event: MouseEvent): void => {
        const drag = this.drag;
        if (!drag) {
            return;
        }

        try {
            const rem = this.rem();
            if (!drag.active) {
                const far =
                    Math.abs(event.clientX - drag.startX) >= DRAG_START * rem ||
                    Math.abs(event.clientY - drag.startY) >= DRAG_START * rem;
                if (!far) {
                    return;
                }
                drag.active = true;
                drag.el.style.zIndex = DRAG_Z;
                this.selectedKey = null;
                this.endHover("drag started");
                log("Edit mode: drag of " + drag.key + " started on the " + drag.side + " bar");
                this.reconcile();
            }

            const sx = (event.clientX - drag.grabX) / rem;
            const sy = (event.clientY - drag.grabY) / rem;
            const width = this.dragWidth(drag, rem);
            const origin = this.frames.left;
            if (drag.m) {
                this.put(drag.m, sx, sy, width, false, rem);
            } else if (origin) {
                drag.el.style.left = round(sx - origin.rootX) + "rem";
                drag.el.style.top = round(sy - origin.rootY) + "rem";
                if (drag.groupId) {
                    this.groupPlaced.delete(drag.groupId);
                }
            }
            if (origin) {
                const frame = this.dragFrame.style;
                frame.left = round(sx - origin.rootX - DRAG_FRAME) + "rem";
                frame.top = round(sy - origin.rootY - DRAG_FRAME) + "rem";
                frame.width = round(width + 2 * DRAG_FRAME) + "rem";
                frame.display = "flex";
            }
            this.showTarget(drag, this.dropTarget(drag, event.clientX / rem, event.clientY / rem));
        } catch (e) {
            log("ERROR while dragging " + drag.key + ".\n" + errorText(e));
            this.cancelDrag("error");
            this.reconcile();
        }
    };

    private onDragEnd = (): void => {
        const drag = this.drag;
        if (!drag) {
            return;
        }
        this.endDrag();

        try {
            const m = drag.m;
            if (!drag.active) {
                if (m) {
                    this.select(m.key);
                } else if (drag.groupId) {
                    this.togglePanel(drag.groupId, "a click on the button of the group (edit mode)");
                }
                return;
            }

            const target = drag.target;
            let next: Layout | null = null;
            let what = "";
            if (target && target.kind === "full") {
                this.warnFull(target.id, "item " + drag.key + " was dropped on it");
                return;
            }
            if (m && target) {
                const from = groupOf(this.layout, m.key);
                const out = leaveGroups(this.layout, m.key);
                const origin = from ? ' (it came from group "' + from.name + '")' : "";
                if (target.kind === "bar") {
                    next = moveToBar(out, m.key, m.home, target.side);
                    what =
                        "item " + m.key + " dropped on the collapse button of the " + target.side + " bar: moved to it (" +
                        (this.layout[target.side].mode === "manual" ? "at the end of its manual order" : "by its name") + ")" + origin;
                } else if (target.kind === "slot") {
                    const before = this.baseOrder[target.side];
                    const after = before.filter((key) => key !== m.key);
                    const at = target.beforeKey === null ? -1 : after.indexOf(target.beforeKey);
                    if (at < 0) {
                        after.push(m.key);
                    } else {
                        after.splice(at, 0, m.key);
                    }
                    // Released on the place where it already was: nothing changes and the bar keeps its order mode.
                    if (from || target.side !== m.side || after.join("\n") !== before.join("\n")) {
                        next = placeInBar(out, m.key, m.home, target.side, before, target.beforeKey);
                        what =
                            "item " + m.key + " dropped on the " + target.side + " bar " +
                            (target.beforeKey ? "before " + target.beforeKey : "at the end") +
                            (target.side !== m.side ? " (it came from the " + m.side + " bar)" : "") + origin +
                            "; the bar is in manual order: " + after.join(", ");
                    }
                } else if (target.kind === "group") {
                    const group = groupById(this.layout, target.id);
                    const added = addToGroup(this.layout, m.key, target.id);
                    if (added === null) {
                        this.warnFull(target.id, "item " + m.key + " was dropped on its button");
                        return;
                    }
                    if (group && added !== this.layout) {
                        next = added;
                        what =
                            "item " + m.key + ' dropped on the button of group "' + group.name + '": it enters the group (' +
                            (group.mode === "manual" ? "at the end of its manual order" : "by its name") + ")" + origin;
                    }
                } else if (target.kind === "panel") {
                    const group = groupById(this.layout, target.id);
                    const before = this.panelOrder.get(target.id) || [];
                    const after = before.filter((key) => key !== m.key);
                    const at = target.beforeKey === null ? -1 : after.indexOf(target.beforeKey);
                    if (at < 0) {
                        after.push(m.key);
                    } else {
                        after.splice(at, 0, m.key);
                    }
                    if (group && (!from || from.id !== target.id || after.join("\n") !== before.join("\n"))) {
                        const placed = placeInGroup(this.layout, m.key, target.id, before, target.beforeKey);
                        if (placed === null) {
                            this.warnFull(target.id, "item " + m.key + " was dropped on its panel");
                            return;
                        }
                        next = placed;
                        what =
                            "item " + m.key + ' dropped on the panel of group "' + group.name + '" ' +
                            (target.beforeKey ? "before " + target.beforeKey : "at the end") +
                            (from && from.id === target.id ? "" : origin || " (it came from the " + m.side + " bar)") +
                            "; the group is in manual order: " + after.join(", ");
                    }
                }
            } else if (drag.groupId && target) {
                const group = groupById(this.layout, drag.groupId);
                if (group && target.kind === "bar") {
                    next = moveGroupToBar(this.layout, group.id, target.side);
                    what =
                        'group "' + group.name + '" dropped on the collapse button of the ' + target.side + " bar: moved to it (" +
                        (this.layout[target.side].mode === "manual" ? "with the groups of its manual order, before the icons" : "by its name") + ")";
                } else if (group && target.kind === "slot") {
                    const before = this.baseOrder[target.side];
                    const after = before.filter((key) => key !== drag.key);
                    const at = target.beforeKey === null ? -1 : after.indexOf(target.beforeKey);
                    if (at < 0) {
                        after.push(drag.key);
                    } else {
                        after.splice(at, 0, drag.key);
                    }
                    if (target.side !== drag.side || after.join("\n") !== before.join("\n")) {
                        next = placeGroupInBar(this.layout, group.id, target.side, before, target.beforeKey);
                        what =
                            'group "' + group.name + '" dropped on the ' + target.side + " bar " +
                            (target.beforeKey ? "before " + target.beforeKey : "at the end") +
                            (target.side !== drag.side ? " (it came from the " + drag.side + " bar)" : "") +
                            "; the bar is in manual order: " + after.join(", ");
                    }
                }
            }

            if (next) {
                this.commit(next, what);
            } else {
                log("Edit mode: drag of " + drag.key + " ended " + (target ? "on its own place" : "outside the bars and the groups") + ": nothing changes");
                this.reconcile();
                this.kick(2);
            }
        } catch (e) {
            log("ERROR while ending the drag of " + drag.key + ".\n" + errorText(e));
            this.reconcile();
        }
    };

    /** Stops following the mouse and hides the marks of the drag; the element goes back on the next pass. */
    private endDrag(): void {
        document.removeEventListener("mousemove", this.onDragMove, true);
        document.removeEventListener("mouseup", this.onDragEnd, true);
        if (this.drag && this.drag.active) {
            this.drag.el.style.zIndex = this.drag.zIndex;
            if (this.drag.m) {
                this.drag.m.z = null;
            }
        }
        window.clearTimeout(this.expandTimer);
        this.expandTimer = 0;
        this.drag = null;
        this.dropLine.style.display = "none";
        this.dropBox.style.display = "none";
        this.dragFrame.style.display = "none";
    }

    private cancelDrag(reason: string): void {
        if (!this.drag) {
            return;
        }
        log("Edit mode: " + (this.drag.active ? "drag" : "press") + " of " + this.drag.key + " cancelled: " + reason);
        this.endDrag();
    }

    /** The element of a bar that comes right after another one, from the fixed buttons outwards; null at the end. */
    private after(side: Side, key: string): Entry | null {
        const list = this.outward[side];
        for (let i = 0; i < list.length; i++) {
            if (list[i].key === key) {
                return i + 1 < list.length ? list[i + 1] : null;
            }
        }
        return null;
    }

    /**
     * Where the dragged element would go if released at this point (rem across the screen):
     *  - an item on an open panel of a group: to that place of the panel (on its header: into the group,
     *    by its name); on the button of a group: into that group. A group without room refuses it;
     *  - on the collapse button of the other bar: it goes to that bar, expanded or not;
     *  - on a row of an expanded bar: it goes to that place of the row, before the element whose middle is
     *    past the mouse, or after the last element of the row;
     *  - anywhere else: nowhere, and it returns to its place.
     */
    private dropTarget(drag: Drag, px: number, py: number): DropTarget | null {
        const origin = this.frames.left;
        if (!origin) {
            return null;
        }

        // Panels, the one drawn on top first.
        const views = this.panelViews.slice().sort((a, b) => b.z - a.z);
        for (const view of views) {
            const geo = this.panelGeo.get(view.id);
            const group = groupById(this.layout, view.id);
            if (!geo || !group || px < geo.x || px > geo.x + geo.w || py < geo.y || py > geo.y + geo.h) {
                continue;
            }
            if (!drag.m) {
                // A group does not go into a group.
                return null;
            }
            const member = group.items.indexOf(drag.key) >= 0;
            if (!member && group.items.length >= GROUP_ITEMS_MAX) {
                return { kind: "full", id: view.id, button: false };
            }
            // With the title bar: over it, the item enters the group without choosing a place.
            if (geo.head && py < geo.y + geo.gridTop - GAP) {
                return member ? null : { kind: "group", id: view.id, button: false };
            }
            const gapX = geo.pitchX - geo.cellW;
            const column = Math.max(
                0,
                Math.min(geo.columns - 1, Math.floor((px - geo.x - PANEL_BORDER - PANEL_PAD_X + gapX / 2) / geo.pitchX))
            );
            // The rows may differ in height: the row is the first one that ends, with half of the space
            // under it, below the mouse.
            let row = geo.rows - 1;
            for (let r = 0; r < geo.rows; r++) {
                if (py < geo.y + geo.rowTops[r] + geo.rowHeights[r] + geo.gapY / 2) {
                    row = r;
                    break;
                }
            }
            // The places are the ones on the screen now, the one opened for the dragged item included.
            const keys = this.panelKeys.get(view.id) || [];
            const index = row * geo.columns + column;
            let before: string | null = index < keys.length ? keys[index] : null;
            if (before === drag.key) {
                before = index + 1 < keys.length ? keys[index + 1] : null;
            }
            return { kind: "panel", id: view.id, beforeKey: before };
        }

        // Buttons of the groups: the middle of the button receives an item; its two ends are places of the row.
        if (drag.m) {
            for (const group of this.layout.groups) {
                const spot = this.groupSpots.get(group.id);
                if (
                    !spot || !spot.shown ||
                    px < spot.sx + GROUP_DROP_INSET || px > spot.sx + spot.width - GROUP_DROP_INSET ||
                    py < spot.sy || py > spot.sy + STD
                ) {
                    continue;
                }
                if (group.items.indexOf(drag.key) >= 0) {
                    return null;
                }
                return group.items.length >= GROUP_ITEMS_MAX
                    ? { kind: "full", id: group.id, button: true }
                    : { kind: "group", id: group.id, button: true };
            }
        }

        const other = otherSide(drag.side);
        if (this.frames[other] && (other === "left" || this.rightToggleShown)) {
            const bx = origin.rootX + (other === "left" ? ROW_PITCH : this.rightToggleX);
            const by = origin.rootY + (other === "left" ? 0 : this.rightToggleY);
            if (px >= bx - EDGE_PAD && px <= bx + STD + EDGE_PAD && py >= by - EDGE_PAD && py <= by + STD + EDGE_PAD) {
                return { kind: "bar", side: other };
            }
        }

        // The row of a bar may run up to MAX_BAR_SHARE of the screen, so the rows of the two bars share most
        // of it. A point belongs to the bar whose icons are under it; outside both, to the bar whose last
        // icon is nearer; with nothing to tell them apart, to the bar the element is on.
        const reach: { side: Side; row: number; along: number; past: number }[] = [];
        for (const side of [drag.side, other]) {
            const frame = this.frames[side];
            if (!frame || this.layout[side].hidden) {
                continue;
            }
            const row = Math.floor((py - frame.top + GAP / 2) / ROW_PITCH);
            const along = side === "left" ? px - frame.edge : frame.screenWidth - frame.edge - px;
            if (
                row < 0 ||
                row >= this.extent[side].length ||
                along < this.rowStart[side] - GAP ||
                along > this.rowLimit[side] + GAP
            ) {
                continue;
            }
            reach.push({ side, row, along, past: Math.max(0, along - this.extent[side][row] - GAP) });
        }
        let nearest = reach.length > 0 ? reach[0] : null;
        for (const candidate of reach) {
            if (nearest && candidate.past < nearest.past) {
                nearest = candidate;
            }
        }
        for (const { side, row, along } of nearest ? [nearest] : []) {
            // The places are the ones on the screen now, the one opened for the dragged element included.
            const inRow = this.slots[side].filter((slot) => slot.row === row);
            let before: Entry | null;
            let hit: Slot | null = null;
            for (const slot of inRow) {
                if (slot.x + slot.width / 2 > along) {
                    hit = slot;
                    break;
                }
            }
            if (hit) {
                before = hit.e;
            } else if (inRow.length > 0) {
                before = this.after(side, inRow[inRow.length - 1].e.key);
            } else {
                before = this.outward[side].length > 0 ? this.outward[side][0] : null;
            }
            // Before the dragged element itself (its open place) is the same as before the one that follows it.
            if (before !== null && before.key === drag.key) {
                before = this.after(side, drag.key);
            }
            return { kind: "slot", side, beforeKey: before ? before.key : null };
        }

        return null;
    }

    /**
     * The place where the dragged element would go changed. Over the collapse button of the other bar or
     * over the button of a group, a frame goes around that button; over a row or over a panel, everything
     * is arranged again with the place of the element open.
     */
    private showTarget(drag: Drag, target: DropTarget | null): void {
        if (JSON.stringify(target) === JSON.stringify(drag.target)) {
            return;
        }
        drag.target = target;

        const box = this.dropBox.style;
        box.display = "none";
        if (!target || (target.kind !== "slot" && target.kind !== "panel")) {
            this.dropLine.style.display = "none";
        }
        window.clearTimeout(this.expandTimer);
        this.expandTimer = 0;
        const origin = this.frames.left;
        if (target && target.kind === "bar") {
            box.left = (target.side === "left" ? ROW_PITCH : this.rightToggleX) - EDGE_PAD + "rem";
            box.top = (target.side === "left" ? 0 : this.rightToggleY) - EDGE_PAD + "rem";
            box.width = STD + 2 * EDGE_PAD + "rem";
            box.display = "flex";

            // Held there with that bar collapsed: the bar is expanded, as by a click on its button, so the
            // element can be taken to a chosen place of it. Released on the button, it just goes to the bar.
            const side = target.side;
            if (this.layout[side].hidden) {
                this.expandTimer = window.setTimeout(() => {
                    this.expandTimer = 0;
                    const now = this.drag;
                    if (now !== drag || !now.target || now.target.kind !== "bar" || now.target.side !== side || !this.layout[side].hidden) {
                        return;
                    }
                    log("Edit mode: " + drag.key + " held over the collapse button of the " + side + " bar for " + EXPAND_DWELL_MS + " ms: the bar is expanded");
                    this.onExpand(side);
                }, EXPAND_DWELL_MS);
            }
        } else if (target && (target.kind === "group" || target.kind === "full") && origin) {
            const spot = this.groupSpots.get(target.id);
            if (target.button && spot && spot.shown) {
                box.left = round(spot.sx - origin.rootX - EDGE_PAD) + "rem";
                box.top = round(spot.sy - origin.rootY - EDGE_PAD) + "rem";
                box.width = round(spot.width + 2 * EDGE_PAD) + "rem";
                box.display = "flex";
            }
            if (target.kind === "full" && this.openPanels.indexOf(target.id) >= 0) {
                // The group has no room: its open panel says so while the item is held over it.
                this.fullWarning = { id: target.id, until: Date.now() + FULL_WARNING_MS };
                window.setTimeout(this.reconcile, FULL_WARNING_MS + 50);
            }
        }
        const groupName = (id: string) => {
            const group = groupById(this.layout, id);
            return group ? '"' + group.name + '"' : id;
        };
        log(
            "Edit mode: " + drag.key + " would go " +
            (target === null
                ? "nowhere (outside the bars and the groups)"
                : target.kind === "bar"
                  ? "to the " + target.side + " bar (over its collapse button)"
                  : target.kind === "slot"
                    ? "to the " + target.side + " bar, " + (target.beforeKey ? "before " + target.beforeKey : "at the end")
                    : target.kind === "group"
                      ? "into group " + groupName(target.id) + " (by its name, or at the end of a manual order)"
                      : target.kind === "panel"
                        ? "to the panel of group " + groupName(target.id) + ", " + (target.beforeKey ? "before " + target.beforeKey : "at the end")
                        : "nowhere: group " + groupName(target.id) + " is full")
        );
        this.reconcile();
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
        // No tooltip of the mod while an item is held by the mouse in the edit mode.
        if (this.stopped || this.failed || !m.placed || this.drag) {
            return;
        }

        try {
            if (m.name && this.layout.names[m.key]) {
                this.beginNamedHover(m, m.name);
                return;
            }

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
                named: false,
                hidden: [],
                frame: 0,
                frozen: false,
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

        if (hover.named) {
            if (!hover.frozen) {
                this.hideOriginal(hover);
            }
            return;
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
        const found = this.foreignNodes(hover, true);
        return found.length > 0 ? found[0].node : null;
    }

    /**
     * Every candidate described above. "visible" asks for the ones really visible (not transparent); without
     * it, a tooltip that is still fading in counts too. "part" tells a part of the item itself from an
     * element added to the page.
     */
    private foreignNodes(hover: Hover, visible: boolean): { node: Element; part: boolean }[] {
        const m = hover.m;
        const rem = this.rem();
        const box = m.btn.getBoundingClientRect();
        const reach = 24 * rem;
        const leftBar = this.root.parentElement;
        const rightBar = this.rightBar;
        const found: { node: Element; part: boolean }[] = [];

        // Next to the button and of a sensible size.
        const qualifies = (node: Element): boolean => {
            const rect = node.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2 || rect.width > 600 * rem || rect.height > 300 * rem) {
                return false;
            }
            const dx = Math.max(rect.left - box.right, box.left - rect.right, 0);
            const dy = Math.max(rect.top - box.bottom, box.top - rect.bottom, 0);
            return dx <= reach && dy <= reach && (!visible || isOpaque(node));
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
                found.push({ node, part: false });
            }
        }

        for (const node of stickingOut(m.el, m.btn, rem * GAP)) {
            if (hover.before.indexOf(node) < 0 && qualifies(node)) {
                found.push({ node, part: true });
            }
        }

        return found;
    }

    /**
     * The mouse is over a button whose name was edited by the user: the tooltip shows that name, in place of
     * any original one. The original is not prevented from being created (each mod makes its tooltip in its
     * own way, and the game's own tooltip listens to the button directly); it is hidden as soon as it shows
     * up next to the button, on every frame while the mouse stays there, and put back as it was at the end.
     * A press on the button ends this, so a panel opened by the click is never touched.
     */
    private beginNamedHover(m: Managed, name: string): void {
        const hover: Hover = {
            m,
            timer: 0,
            observer: null,
            added: [],
            before: stickingOut(m.el, m.btn, this.rem() * GAP),
            shown: false,
            named: true,
            hidden: [],
            frame: 0,
            frozen: false,
        };

        if (typeof MutationObserver === "function") {
            try {
                hover.observer = new MutationObserver((records) => this.onPageChange(hover, records));
                hover.observer.observe(document.body, { childList: true, subtree: true });
            } catch (e) {
                hover.observer = null;
            }
        }

        hover.timer = window.setTimeout(() => {
            if (this.hover !== hover || hover.frozen || this.stopped || this.failed) {
                return;
            }
            this.showTip(m, name);
            hover.shown = true;
            log('Tooltip ' + m.key + ': edited name "' + name + '" shown');
        }, NAMED_DELAY_MS);

        const watch = () => {
            if (this.hover !== hover || hover.frozen) {
                return;
            }
            this.hideOriginal(hover);
            hover.frame = requestAnimationFrame(watch);
        };
        hover.frame = requestAnimationFrame(watch);
        this.hover = hover;
    }

    /**
     * The button of a renamed item was pressed: its tooltip goes away, as the game's ones do, and nothing
     * more is hidden, because what appears next may be the panel the click opens. What was already hidden
     * stays hidden until the mouse leaves the button.
     */
    private freezeHover(hover: Hover): void {
        hover.frozen = true;
        window.clearTimeout(hover.timer);
        if (hover.observer) {
            hover.observer.disconnect();
            hover.observer = null;
        }
        if (hover.frame) {
            cancelAnimationFrame(hover.frame);
            hover.frame = 0;
        }
        if (hover.shown) {
            hover.shown = false;
            log("Tooltip " + hover.m.key + " hidden: button pressed");
        }
        this.hideTip();
    }

    /**
     * True when an element belongs to something that is not a tooltip: it sits inside a box that was already
     * on the screen before the mouse arrived (a panel, a list), and not just inside a layer that covers the
     * screen or a holder without a size of its own. Inside the item itself only a tall box counts. Such
     * elements are never hidden.
     */
    private insidePanel(node: Element, hover: Hover, rem: number): boolean {
        const m = hover.m;
        for (let up = node.parentElement; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
            if (up === m.el || up.contains(m.el)) {
                break;
            }
            if (hover.added.indexOf(up) >= 0) {
                continue;
            }
            const rect = up.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) {
                continue;
            }
            if (rect.width >= 0.9 * window.innerWidth && rect.height >= 0.9 * window.innerHeight) {
                continue;
            }
            if (!m.el.contains(up) || rect.height > PANEL_HEIGHT * rem) {
                return true;
            }
        }
        return false;
    }

    /** Hides every original tooltip that is next to the button now and was not hidden yet. */
    private hideOriginal(hover: Hover): void {
        try {
            const rem = this.rem();
            for (const found of this.foreignNodes(hover, false)) {
                const node = found.node as HTMLElement;
                if (this.insidePanel(node, hover, rem)) {
                    continue;
                }
                if (found.part && node.getBoundingClientRect().height > PANEL_HEIGHT * rem) {
                    continue;
                }
                let known = false;
                for (const entry of hover.hidden) {
                    if (entry.node === node) {
                        known = true;
                        break;
                    }
                }
                if (known || !node.style) {
                    continue;
                }
                const what = this.describeForeign(node);
                // An element added to the page leaves the layout; a part of the item only stops being drawn,
                // so the item keeps its measures.
                const prop = found.part ? "visibility" : "display";
                hover.hidden.push({ node, prop, old: (node.style as any)[prop] || "" });
                (node.style as any)[prop] = found.part ? "hidden" : "none";
                log("Tooltip " + hover.m.key + ": original hidden, the edited name takes its place (" + what + ")");
            }
        } catch (e) {
            log("ERROR while hiding the original tooltip of " + hover.m.key + ".\n" + errorText(e));
        }
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
            if (hover.frame) {
                cancelAnimationFrame(hover.frame);
            }
            // What was hidden goes back exactly as it was (a tooltip made by a part of the item is reused
            // by its mod; one added to the page is usually removed by its owner).
            for (const entry of hover.hidden) {
                (entry.node.style as any)[entry.prop] = entry.old;
            }
            if (hover.shown) {
                log("Tooltip " + hover.m.key + " hidden: " + reason);
            }
        }
        this.hideTip();
    }

    // ---------------------------------------------------------------------------------------------
    // Panels of the groups

    /** The items of a group that are on the screen, in the order of the group. */
    private membersInOrder(group: GroupLayout, list: Managed[]): Managed[] {
        const visible = list.filter((m) => m.visible);
        const byName = (items: Managed[]) =>
            items.filter((m) => m.name !== null).sort((a, b) => compareNames(a.name as string, a.key, b.name as string, b.key));
        const unnamed = (items: Managed[]) => items.filter((m) => m.name === null);
        if (group.mode === "manual") {
            const order = new Map<string, number>();
            group.order.forEach((key, i) => order.set(key, i));
            const listed = visible
                .filter((m) => order.has(m.key))
                .sort((a, b) => (order.get(a.key) as number) - (order.get(b.key) as number));
            const fresh = visible.filter((m) => !order.has(m.key));
            return listed.concat(byName(fresh), unnamed(fresh));
        }
        const named = byName(visible);
        if (group.mode === "za") {
            named.reverse();
        }
        return named.concat(unnamed(visible));
    }

    /**
     * Where the panel of a group starts, down the screen, while it sits under the button of the group: under
     * the last row of the bar. For a button that is inside the open "+" panel of the bar: under that panel.
     */
    private underButton(side: Side, buttonY: number): number {
        const frame = this.frames[side] || this.frames.left;
        if (!frame) {
            return 0;
        }
        const rows = frame.top + this.extent[side].length * ROW_PITCH;
        const view = this.moreOpen === side ? this.more[side] : null;
        return view && buttonY >= rows - GAP ? frame.rootY + view.boxY + view.boxHeight + GAP : rows;
    }

    /**
     * Lines taken by a name written under an icon, in a column "width" rem wide: one, or two when it does
     * not fit in one. The width of each name is measured on the screen, once.
     */
    private labelLines(text: string, width: number, rem: number): number {
        if (!text) {
            return 1;
        }
        let measured = this.labelWidths.get(text);
        if (measured === undefined) {
            if (!this.measureEl) {
                // Same letters as the names of the panels (style sheet: 12rem); never seen, never in the way.
                const el = document.createElement("div");
                el.style.position = "absolute";
                el.style.left = "0";
                el.style.top = -HIDDEN_SHIFT + "rem";
                el.style.whiteSpace = "nowrap";
                el.style.fontSize = "12rem";
                el.style.pointerEvents = "none";
                this.overlays.appendChild(el);
                this.measureEl = el;
            }
            this.measureEl.textContent = text;
            const px = this.measureEl.getBoundingClientRect().width;
            if (px > 0) {
                measured = px / rem;
                this.labelWidths.set(text, measured);
            } else {
                // Not measurable yet: an estimate now, the real measure on the next frames.
                this.kick(3);
                measured = text.length * 6.5;
            }
        }
        return measured > width + 0.5 ? CELL_LINES : 1;
    }

    /**
     * Size and place of the panel of a group. "names" has one entry for each place of the panel (the items in
     * the order shown, and the place opened for a dragged item): the name written under the icon.
     *
     * Size: the panel always shows every item and never scrolls. Untouched, it has the standard columns (3
     * with the names under the icons, 5 without) and at least 3 rows. The user sets the columns (dragging
     * the right edge), the rows (the bottom edge) or both (the corner); what was not set follows the number
     * of items. With the title bar, the least width is the one that keeps the whole name of the group in it;
     * without it, one column. The least height is one row. Without the names the most is 30 columns and 15
     * rows; with them, and in any case, what fits on the screen. With the names, the columns share the width
     * of the panel and each row is as tall as its tallest name (one line or two).
     *
     * Place: under the button of the group, lined up with it and under the last row of its bar (further down
     * in the edit mode), until the user moves the panel; then where the user left it. Always inside the
     * screen. A panel under its button keeps clear of two things of the mod, without being moved for good:
     * the open menu (it opens beside it, at the height of its top) and the notice of the edit mode (it opens
     * under it). A panel moved by the user stays where the user left it.
     */
    private panelGeometry(group: GroupLayout, names: string[], rem: number): PanelGeometry | null {
        const frame = this.frames.left;
        if (!frame) {
            return null;
        }
        const count = names.length;
        const named = group.labels;
        const head = group.head || this.headShown === group.id;
        const nominal = named ? CELL_WIDTH : STD;
        const gapX = named ? CELL_GAP_X : GAP;
        const gapY = named ? CELL_GAP_Y : GAP;
        const tallest = named ? STD + CELL_LABEL_GAP + CELL_LINES * CELL_LINE : STD;
        const gridTop = PANEL_BORDER + PANEL_PAD_TOP + (head ? PANEL_HEAD + PANEL_HEAD_GAP : 0);
        const under = PANEL_PAD_BOTTOM + PANEL_BORDER;
        const widthOf = (columns: number) => 2 * PANEL_PAD_X + columns * nominal + (columns - 1) * gapX;
        const minWidth = head
            ? Math.ceil(
                  2 * (PANEL_BORDER + PANEL_PAD_X) + PANEL_HANDLE + PANEL_HEAD_SPACE + this.titleWidth(group, rem) +
                  2 * (PANEL_HEAD_SPACE + PANEL_HEAD_BUTTON)
              )
            : widthOf(1);
        // Without the title bar the tab of the handle sticks out at the left. It is part of the panel: it stays
        // inside the screen and clear of the menu too (screen 46).
        const ear = head ? 0 : PANEL_EAR - PANEL_BORDER;
        const leftMost = GAP + (head ? 0 : PANEL_EAR);

        const moving = this.panelMove !== null && this.panelMove.id === group.id ? this.panelMove : null;
        const pos = moving ? { x: moving.x, y: moving.y } : group.pos;
        const spot = this.groupSpots.get(group.id);
        if (pos === null && !spot) {
            return null;
        }
        const attached = pos === null;
        const preview = this.panelPreview !== null && this.panelPreview.id === group.id ? this.panelPreview : null;
        const wantColumns = preview ? preview.columns : group.columns;
        const wantRows = preview ? preview.rows : group.rows;
        const standard = named ? PANEL_COLUMNS_NAMED : PANEL_COLUMNS_PLAIN;

        const build = (startX: number, startY: number, where: string): PanelGeometry => {
            const minColumns = Math.max(1, Math.floor((minWidth - 2 * PANEL_PAD_X + gapX) / (nominal + gapX)));
            const fitColumns = Math.max(1, Math.floor((frame.screenWidth - 2 * GAP - 2 * PANEL_PAD_X + gapX) / (nominal + gapX)));
            const maxColumns = Math.max(minColumns, named ? fitColumns : Math.min(PANEL_COLUMNS_MAX, fitColumns));
            const room = attached ? frame.screenHeight - startY - GAP : frame.screenHeight - 2 * GAP;
            const fitRows = Math.max(1, Math.floor((room - gridTop - under + gapY) / (tallest + gapY)));
            const maxRows = named ? fitRows : Math.min(PANEL_ROWS_MAX, fitRows);

            let columns =
                wantColumns !== null ? wantColumns : wantRows !== null ? Math.ceil(count / Math.max(1, wantRows)) : standard;
            columns = Math.max(minColumns, Math.min(maxColumns, columns));
            while (Math.ceil(count / columns) > maxRows && columns < maxColumns) {
                columns++;
            }
            const need = Math.max(1, Math.ceil(count / columns));
            const wished = wantRows !== null ? wantRows : wantColumns !== null ? 1 : PANEL_ROWS_STANDARD;
            const rows = Math.max(need, Math.min(wished, maxRows));

            const w = Math.max(minWidth, widthOf(columns));
            // With the names, the columns share what is inside the line of the panel, as in the sketch; without
            // them the icons are side by side from the left, as on the bar.
            const inside = w - 2 * (PANEL_BORDER + PANEL_PAD_X);
            const cellW = named ? (inside - (columns - 1) * gapX) / columns : STD;
            const rowTops: number[] = [];
            const rowHeights: number[] = [];
            let down = gridTop;
            for (let r = 0; r < rows; r++) {
                let lines = 1;
                for (let c = 0; named && c < columns && r * columns + c < count; c++) {
                    lines = Math.max(lines, this.labelLines(names[r * columns + c], cellW, rem));
                }
                const height = named ? STD + CELL_LABEL_GAP + lines * CELL_LINE : STD;
                rowTops.push(down);
                rowHeights.push(height);
                down += height + gapY;
            }
            const h = down - gapY + under;
            const x = Math.max(leftMost, Math.min(startX, frame.screenWidth - w - GAP));
            const y = attached ? startY : Math.max(GAP, Math.min(startY, frame.screenHeight - h - GAP));
            return { x, y, w, h, columns, rows, named, head, cellW, pitchX: cellW + gapX, gapY, gridTop, rowTops, rowHeights, attached, where };
        };

        if (pos !== null) {
            return build(pos.x, pos.y, "where the user left it");
        }

        const at = spot as { sx: number; sy: number };
        const baseY = this.underButton(this.sideOfGroup(group), at.sy) + (this.editing ? EDIT_DROP : 0);
        let geo = build(at.sx, baseY, "under the button of the group");
        const across = (box: Box) => ({ x: frame.rootX + box.x, y: frame.rootY + box.y, w: box.w, h: box.h });
        const meets = (g: PanelGeometry, box: Box) =>
            g.x - ear < box.x + box.w && box.x < g.x + g.w && g.y < box.y + box.h && box.y < g.y + g.h;
        if (this.menuBox) {
            const menu = across(this.menuBox);
            if (meets(geo, menu)) {
                geo = build(
                    menu.x + menu.w + MENU_GAP + ear,
                    menu.y,
                    "beside the open menu (under the button of the group it would be hidden by it)" + (ear > 0 ? ", the tab of its handle next to the menu" : "")
                );
            }
        }
        if (this.editing && this.noticeBox) {
            const notice = across(this.noticeBox);
            if (meets(geo, notice)) {
                geo = build(geo.x, notice.y + notice.h + NOTICE_GAP, "under the notice of the edit mode (it would meet it " + geo.where.split(" (")[0] + ")");
            }
        }
        return geo;
    }

    /**
     * The items of the groups. Each one is drawn inside the panel of its group while that panel is open and
     * stays off the screen otherwise. The panel itself (header, background, names) is drawn by the mod's own
     * part of the screen from what is computed here; its background is made of pieces around the places of
     * the icons, never over them, so the icons stay the real buttons of their mods.
     *
     * Open and closed: a panel opens and closes by the button of its group and closes by its "x". A panel
     * that sits under the button of its group ("attached") also closes when that button leaves the screen
     * (its bar is collapsed). Nothing automatic puts a panel over another one: opening an attached panel
     * closes the attached ones it would cover. A panel moved by the user stays open and may lie over anything.
     */
    private layoutPanels(members: Map<string, Managed[]>, rem: number, now: number): boolean {
        const origin = this.frames.left;
        if (!origin) {
            return false;
        }
        let wrote = false;
        const drag = this.drag;
        const target = drag && drag.active ? drag.target : null;

        // 1. Panels that cannot stay open.
        this.openPanels = this.openPanels.filter((id) => {
            const group = groupById(this.layout, id);
            if (!group) {
                log("Panel of group " + id + " closed: the group does not exist any more");
                return false;
            }
            const moving = this.panelMove !== null && this.panelMove.id === id;
            const spot = this.groupSpots.get(id);
            if (group.pos === null && !moving && (!spot || !spot.shown)) {
                log('Panel of group "' + group.name + '" closed: it sits under the button of the group, and that button left the screen');
                return false;
            }
            return true;
        });
        if (this.fullWarning && now >= this.fullWarning.until) {
            this.fullWarning = null;
        }

        // 2. Order of the items of every group and, for the open ones, size and place of the panel.
        const plans: PanelPlan[] = [];
        this.panelOrder.clear();
        this.panelKeys.clear();
        const counts: Record<string, number> = {};
        for (const group of this.layout.groups) {
            const list = this.membersInOrder(group, members.get(group.id) || []);
            const real = list.map((m) => m.key);
            this.panelOrder.set(group.id, real);
            counts[group.id] = list.length;
            // While an item is dragged, the panel is shown as it would be if the item were released now. Over
            // the button of a group, or over a full one, nothing moves.
            if (drag && drag.m && target && target.kind !== "group" && target.kind !== "full") {
                const from = list.indexOf(drag.m);
                if (from >= 0) {
                    list.splice(from, 1);
                }
                if (target.kind === "panel" && target.id === group.id) {
                    let at = -1;
                    for (let i = 0; i < list.length && target.beforeKey !== null; i++) {
                        if (list[i].key === target.beforeKey) {
                            at = i;
                            break;
                        }
                    }
                    if (at < 0) {
                        list.push(drag.m);
                    } else {
                        list.splice(at, 0, drag.m);
                    }
                }
            }
            const open = this.openPanels.indexOf(group.id) >= 0;
            plans.push({
                group,
                list,
                real: real.length,
                geo: open ? this.panelGeometry(group, list.map((m) => m.name || ""), rem) : null,
            });
        }
        this.memberCounts = counts;

        // 3. Nothing automatic puts a panel over another one. Among the panels that sit under the button of
        //    their group, the one opened last stays and the ones it would cover are closed: when a panel is
        //    opened, and also when panels meet for any other reason (a group that changed place, panels sent
        //    back to their groups).
        const attached = plans
            .filter((plan) => plan.geo !== null && plan.geo.attached)
            .sort((a, b) => this.openPanels.indexOf(b.group.id) - this.openPanels.indexOf(a.group.id));
        const kept: PanelPlan[] = [];
        for (const plan of attached) {
            const b = plan.geo as PanelGeometry;
            let cover: PanelPlan | null = null;
            for (const other of kept) {
                const a = other.geo as PanelGeometry;
                // The tab of the handle of a panel without title bar is part of it.
                const ax = a.x - (a.head ? 0 : PANEL_EAR - PANEL_BORDER);
                const bx = b.x - (b.head ? 0 : PANEL_EAR - PANEL_BORDER);
                if (ax < b.x + b.w && bx < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
                    cover = other;
                    break;
                }
            }
            if (cover) {
                log('Panel of group "' + plan.group.name + '" closed: the panel of group "' + cover.group.name + '", opened after it, would cover it');
                this.openPanels = this.openPanels.filter((id) => id !== plan.group.id);
                plan.geo = null;
            } else {
                kept.push(plan);
            }
        }

        // 4. Drawing order: the attached panels first, then the moved ones in the order they were opened or
        //    dragged, the last one on top.
        const open = plans.filter((plan) => plan.geo !== null);
        const rank = (plan: PanelPlan) => ((plan.geo as PanelGeometry).attached ? 0 : 1000) + this.openPanels.indexOf(plan.group.id);
        open.sort((a, b) => rank(a) - rank(b));

        // 5. Items and views.
        const views: PanelView[] = [];
        this.panelGeo.clear();
        for (const plan of plans) {
            const geo = plan.geo;
            if (!geo) {
                // Closed: every item of the group stays off the screen.
                for (const m of plan.list) {
                    wrote = this.place(m, origin.rootX, origin.rootY, this.widthOf(m, rem), true, rem) || wrote;
                    this.setZ(m, null);
                }
                continue;
            }

            const level = PANEL_Z + open.indexOf(plan) * PANEL_Z_STEP;
            const itemZ = String(level + 1);
            const padLeft = PANEL_BORDER + PANEL_PAD_X;
            const ox = geo.x - origin.rootX;
            const oy = geo.y - origin.rootY;
            const pieces: PanelPiece[] = [];
            const piece = (x: number, y: number, w: number, h: number, part: "top" | "mid" | "bottom") => {
                if (w > 0.05 && h > 0.05) {
                    pieces.push({ x: round(ox + x), y: round(oy + y), w: round(w), h: round(h), part });
                }
            };
            const labels: PanelLabel[] = [];

            piece(0, 0, geo.w, geo.gridTop, "top");
            for (let r = 0; r < geo.rows; r++) {
                const y0 = geo.rowTops[r];
                const rowHeight = geo.rowHeights[r];
                let cursor = 0;
                for (let c = 0; c < geo.columns; c++) {
                    const i = r * geo.columns + c;
                    if (i >= plan.list.length) {
                        break;
                    }
                    const m = plan.list[i];
                    const width = this.widthOf(m, rem);
                    const cx = padLeft + c * geo.pitchX + (geo.cellW - width) / 2;
                    const held = drag !== null && drag.active && drag.m === m;
                    if (held) {
                        // The place opened for the item held by the mouse: marked, with no icon in it.
                        if (target && target.kind === "panel" && target.id === plan.group.id) {
                            const mark = this.dropLine.style;
                            mark.left = round(ox + cx) + "rem";
                            mark.top = round(oy + y0) + "rem";
                            mark.width = round(width) + "rem";
                            mark.display = "flex";
                        }
                    } else {
                        // The background goes around the icon: up to it, and on from its other side.
                        piece(cursor, y0 - 0.5, cx - cursor, STD + 1, "mid");
                        cursor = cx + width;
                        wrote = this.place(m, geo.x + cx, geo.y + y0, width, false, rem) || wrote;
                        this.setZ(m, itemZ);
                    }
                    if (geo.named) {
                        labels.push({
                            key: m.key,
                            text: m.name || "",
                            x: round(ox + padLeft + c * geo.pitchX),
                            y: round(oy + y0 + STD + CELL_LABEL_GAP),
                            w: round(geo.cellW),
                            h: this.labelLines(m.name || "", geo.cellW, rem) * CELL_LINE,
                        });
                    }
                }
                piece(cursor, y0 - 0.5, geo.w - cursor, STD + 1, "mid");
                const last = r === geo.rows - 1;
                piece(0, y0 + STD, geo.w, last ? geo.h - y0 - STD : rowHeight - STD + geo.gapY, last ? "bottom" : "mid");
            }

            const lastRow = geo.rows - 1;
            this.panelKeys.set(plan.group.id, plan.list.map((m) => m.key));
            this.panelGeo.set(plan.group.id, geo);
            views.push({
                id: plan.group.id,
                name: plan.group.name,
                count: plan.real,
                box: { x: round(ox), y: round(oy), w: round(geo.w), h: round(geo.h) },
                pieces,
                labels,
                named: geo.named,
                columns: geo.columns,
                rows: geo.rows,
                attached: geo.attached,
                head: geo.head,
                gridTop: geo.gridTop,
                gridHeight: round(geo.rowTops[lastRow] + geo.rowHeights[lastRow] - geo.gridTop),
                mode: plan.group.mode,
                z: level,
                full: this.fullWarning !== null && this.fullWarning.id === plan.group.id,
            });
        }

        const whereOf = (id: string) => {
            const geo = this.panelGeo.get(id);
            return geo ? geo.where : "";
        };
        const text = JSON.stringify(
            views.map((view) => [view.id, view.box, view.columns, view.rows, view.named, view.attached, view.count, view.head, whereOf(view.id)])
        );
        if (text !== this.lastPanels) {
            this.lastPanels = text;
            log(
                "Panels of groups open: " +
                (views.length === 0
                    ? "none"
                    : views
                          .map(
                              (view) =>
                                  '"' + view.name + '" ' + view.count + " item(s), " + view.columns + " column(s) x " + view.rows +
                                  " row(s), " + (view.named ? "names under the icons" : "icons only") + ", " +
                                  (view.head ? "" : "title bar hidden, ") + view.box.w + "x" +
                                  view.box.h + "rem at " + view.box.x + "," + view.box.y + " from the mod button, " + whereOf(view.id)
                          )
                          .join("; "))
            );
        }
        this.panelViews = views;
        return wrote;
    }

    /** Opens the panel of a group, or closes it when it is open. */
    togglePanel(id: string, source: string): void {
        const group = groupById(this.layout, id);
        if (!group) {
            return;
        }
        if (this.openPanels.indexOf(id) >= 0) {
            this.closePanel(id, source);
            return;
        }
        this.openPanels.push(id);
        log('Panel of group "' + group.name + '" opened by ' + source);
        this.refresh();
    }

    closePanel(id: string, source: string): void {
        if (this.openPanels.indexOf(id) < 0) {
            return;
        }
        const group = groupById(this.layout, id);
        this.openPanels = this.openPanels.filter((other) => other !== id);
        log('Panel of group "' + (group ? group.name : id) + '" closed by ' + source);
        this.refresh();
    }

    /** Columns and rows of a panel while one of its edges is being dragged; null when no drag is going on. */
    setPanelPreview(preview: { id: string; columns: number | null; rows: number | null } | null): void {
        if (JSON.stringify(preview) === JSON.stringify(this.panelPreview)) {
            return;
        }
        this.panelPreview = preview;
        this.refresh();
    }

    /** Place of a panel while it is being dragged by its handle (rem across the screen); null when it is not. */
    setPanelMove(move: { id: string; x: number; y: number } | null): void {
        if (JSON.stringify(move) === JSON.stringify(this.panelMove)) {
            return;
        }
        this.panelMove = move;
        if (move && this.openPanels[this.openPanels.length - 1] !== move.id && this.openPanels.indexOf(move.id) >= 0) {
            // The panel dragged by the user goes over the others.
            this.openPanels = this.openPanels.filter((id) => id !== move.id).concat(move.id);
        }
        this.refresh();
    }

    /**
     * The open menu of the mod (rem from the corner of the root); null while it is closed. A panel that sits
     * under the button of its group and would be hidden by the menu opens beside it instead.
     */
    setMenuBox(box: Box | null): void {
        if (JSON.stringify(box) === JSON.stringify(this.menuBox)) {
            return;
        }
        this.menuBox = box;
        log("Menu of the mod: " + (box ? "open, " + box.w + "x" + box.h + "rem at " + box.x + "," + box.y + " from the mod button" : "closed"));
        this.refresh();
    }

    /**
     * The notice of the edit mode (rem from the corner of the root); null while it is not on the screen. It
     * never moves: a panel that sits under the button of its group and would meet it opens under it instead.
     */
    setNoticeBox(box: Box | null): void {
        if (JSON.stringify(box) === JSON.stringify(this.noticeBox)) {
            return;
        }
        this.noticeBox = box;
        this.refresh();
    }

    /**
     * Group being edited in the list of the menu (screen 45); null when none. Its panel opens for the edition
     * when it is closed, and closes again when the edition ends; a panel that was already open stays open.
     */
    setGroupEdit(id: string | null): void {
        if (id === this.groupEdit) {
            return;
        }
        const before = this.groupEdit;
        if (before !== null && this.groupEditOpened && this.openPanels.indexOf(before) >= 0) {
            const group = groupById(this.layout, before);
            this.openPanels = this.openPanels.filter((other) => other !== before);
            log('Panel of group "' + (group ? group.name : before) + '" closed: it was opened for the edition of the group in the menu, and the edition ended');
        }
        this.groupEdit = id;
        this.groupEditOpened = false;
        if (id !== null) {
            const group = groupById(this.layout, id);
            if (group && this.openPanels.indexOf(id) < 0) {
                this.openPanels.push(id);
                this.groupEditOpened = true;
                log('Panel of group "' + group.name + '" opened for the edition of the group in the menu');
            } else if (group) {
                log('Panel of group "' + group.name + '" already open: it stays open after the edition of the group in the menu');
            }
        }
        this.refresh();
    }

    /** Place of the button of the group being edited in the menu, from the corner of the root. */
    private editGroupBox(): Box | null {
        const origin = this.frames.left;
        const spot = this.groupEdit !== null ? this.groupSpots.get(this.groupEdit) : undefined;
        if (!origin || !spot || !spot.shown) {
            return null;
        }
        return { x: round(spot.sx - origin.rootX), y: round(spot.sy - origin.rootY), w: round(spot.width), h: STD };
    }

    // ---------------------------------------------------------------------------------------------
    // Order of the two bars

    /** A list of a panel is open (its list of options or the list of its handle); false when none. */
    setListOpen(open: boolean): void {
        if (open === this.listOpen) {
            return;
        }
        this.listOpen = open;
        this.refresh();
    }

    /**
     * While a list of a panel is open, the right bar is drawn before the left one, so the list is over every
     * icon of the panel, the ones that come from the right bar included. In any other moment the right bar
     * has the order the game gave it. "right" is null when the right bar is not handled or the engine stops.
     */
    private orderRight(right: HTMLElement | null, reason: string): void {
        const want = right !== null && this.listOpen && this.panelViews.length > 0;
        const held = this.rightUnder;
        if (held && (!want || held.el !== right)) {
            held.el.style.zIndex = held.saved;
            this.rightUnder = null;
            log("Order of the bars: the right bar is back as in the game" + (reason ? " (" + reason + ")" : ": no list of a panel is open"));
        }
        if (!want || !right) {
            return;
        }
        if (!this.rightUnder) {
            this.rightUnder = { el: right, saved: right.style.zIndex };
            log("Order of the bars: a list of a panel is open, the right bar is drawn before the left one until it closes");
        }
        if (right.style.zIndex !== RIGHT_UNDER) {
            right.style.zIndex = RIGHT_UNDER;
        }
    }

    /** Group whose panel shows its title bar for now, although hidden: its name is being edited there. */
    setHeadShown(id: string | null): void {
        if (id === this.headShown) {
            return;
        }
        this.headShown = id;
        this.refresh();
    }

    /** Shows, in the middle of the panel of a group, that the group has no room for one more item. */
    warnFull(id: string, source: string): void {
        const group = groupById(this.layout, id);
        if (!group) {
            return;
        }
        log('Group "' + group.name + '" is full (' + GROUP_ITEMS_MAX + " items): " + source + "; the item does not enter");
        if (this.openPanels.indexOf(id) < 0) {
            this.openPanels.push(id);
            log('Panel of group "' + group.name + '" opened to show that it is full');
        }
        this.fullWarning = { id, until: Date.now() + FULL_WARNING_MS };
        window.setTimeout(this.reconcile, FULL_WARNING_MS + 50);
        this.refresh();
    }

    /** Keys of the items of a group in the order they are on the screen. */
    panelOrderOf(id: string): string[] {
        return (this.panelOrder.get(id) || []).slice();
    }

    /** Bar where the mod of an item puts it; null for an item that is not on the screen. */
    homeOf(key: string): Side | null {
        let home: Side | null = null;
        this.items.forEach((m) => {
            if (m.key === key) {
                home = m.home;
            }
        });
        return home;
    }

    private refresh(): void {
        if (!this.stopped) {
            this.reconcile();
            this.kick(2);
        }
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

    /** Edit mode: the dashed line around the icons of a bar. */
    private outlineOf(side: Side): Box | null {
        return this.editing ? this.areaOf(side) : null;
    }

    /** The area taken by the icons of an expanded bar, with a small margin, from the corner of the root. */
    private areaOf(side: Side): Box | null {
        const frame = this.frames[side];
        if (!frame || this.layout[side].hidden) {
            return null;
        }
        const ends = this.extent[side];
        const start = this.rowStart[side];
        const end = Math.max(start + STD, ...ends);
        const x = side === "left" ? frame.edge + start : frame.screenWidth - frame.edge - end;
        return {
            x: round(x - OUTLINE_PAD - frame.rootX),
            y: round(frame.top - OUTLINE_PAD - frame.rootY),
            w: round(end - start + 2 * OUTLINE_PAD),
            h: round(ends.length * ROW_PITCH - GAP + 2 * OUTLINE_PAD),
        };
    }

    /** Edit mode: the selected item, while it is on the screen. */
    private selectedView(all: Managed[], rem: number): SelectedView | null {
        if (!this.editing || this.selectedKey === null) {
            return null;
        }
        const origin = this.frames.left;
        let m: Managed | null = null;
        for (const item of all) {
            if (item.key === this.selectedKey) {
                m = item;
                break;
            }
        }
        if (!m || !origin || !m.visible || m.btnRect.bottom < 0) {
            log("Edit mode: selection of " + this.selectedKey + " cleared: the item is not on the screen");
            this.selectedKey = null;
            return null;
        }
        const group = groupOf(this.layout, m.key);
        let panel: Box | null = null;
        for (const view of this.panelViews) {
            if (group && view.id === group.id) {
                panel = view.box;
            }
        }
        return {
            key: m.key,
            name: m.name || "",
            official: m.module && this.index ? this.index.names.get(m.module) || m.module : null,
            edited: !!this.layout.names[m.key],
            side: m.side,
            home: m.home,
            canMove: this.frames[otherSide(m.side)] !== null,
            box: {
                x: round(m.btnRect.left / rem - origin.rootX),
                y: round(m.btnRect.top / rem - origin.rootY),
                w: round(m.btnRect.width / rem),
                h: round(m.btnRect.height / rem),
            },
            group: group ? group.id : null,
            panel,
        };
    }

    private report(
        left: BarScan,
        right: BarScan | null,
        pending: number,
        shown: Record<Side, Managed[]>,
        all: Managed[],
        rem: number
    ): void {
        const count = (list: Managed[]) => list.filter((m) => m.visible).length;
        const unnamed = (list: Managed[]) => list.filter((m) => m.visible && m.name === null).length;
        const hidden = (list: Managed[]) => list.filter((m) => !m.visible).length;
        // The items inside the groups of a bar count for that bar: they leave the screen with it.
        const grouped = (side: Side) => {
            let total = 0;
            for (const group of this.layout.groups) {
                if (this.sideOfGroup(group) === side) {
                    total += this.memberCounts[group.id] || 0;
                }
            }
            return total;
        };

        this.emitStats({
            active: true,
            left: count(shown.left) + grouped("left"),
            right: count(shown.right) + (right ? grouped("right") : 0),
            unnamedLeft: unnamed(shown.left),
            unnamedRight: unnamed(shown.right),
            leftRows: this.extent.left.length,
            rightRows: right ? this.extent.right.length : 1,
            moreLeft: this.more.left,
            moreRight: right ? this.more.right : null,
            overlap: this.overlap,
            outlineLeft: this.outlineOf("left"),
            outlineRight: right ? this.outlineOf("right") : null,
            selected: this.selectedView(all, rem),
            panels: this.panelViews,
            groupCounts: this.memberCounts,
            editGroup: this.groupEdit,
            editGroupBox: this.editGroupBox(),
        });

        const summary =
            "Summary: " + this.layout.groups.length + " group(s) [" +
            this.layout.groups.map((group) => group.name + " " + (this.memberCounts[group.id] || 0) + " " + this.sideOfGroup(group)).join("; ") +
            "]; left " + count(shown.left) + " buttons (" + unnamed(shown.left) + " without name, " + hidden(shown.left) + " hidden), " +
            left.ignored + " other children, fixed width " + round(left.fixed) + "rem; right " +
            (right
                ? count(shown.right) + " buttons (" + unnamed(shown.right) + " without name, " + hidden(shown.right) + " hidden), " +
                  right.ignored + " other children, fixed width " + round(right.fixed) + "rem"
                : "not handled") +
            "; identification pending " + pending + this.describeExtents(left, right);
        if (summary !== this.lastSummary) {
            this.lastSummary = summary;
            log(summary);
        }
    }
}
