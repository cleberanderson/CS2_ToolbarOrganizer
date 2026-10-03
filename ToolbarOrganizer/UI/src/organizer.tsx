// The mod's own elements: the mod button and its menu (left toolbar) and the collapse button of each bar.
// Stage 1: order of each bar (A-Z / Z-A), reorder shortcut and full reset.
// Stage 2: collapse and expand each bar, by its button or by the "Hide" switch of the menu. The two bars
// never cover each other: when they would, the one clicked last stays expanded and the other collapses;
// without a click in the session (game just loaded, new mod, other resolution) both collapse.
// A bar longer than 80% of the screen continues on the next row (up to 3); the menu opens under the last one.
// What does not fit in 3 rows goes to the panel of the "+" button at the end of the last row: the icons side
// by side, in alphabetical order. The panel is 3 columns by 3 rows as the standard and gets one more row at a
// time; dragging its free edge changes the number of columns (3 to 10) and the rows follow.
// Stage 3: edit mode (turned on in the menu, ended by "Done" in the notice under the bars or in the menu). With
// it on, a click on a button of another mod selects the item, to edit its name or send it to the other bar,
// and a drag moves it: to another place of a bar (manual order) or to the other bar. "Restore" of each bar.
// Still in the edit mode: a dragged item held over the collapse button of the other bar expands that bar, and
// a click outside the bars and outside the mod's own elements ends the edit mode.
// The menu has every part of screen 17 of the project sketch, in its place and with its look. The parts
// that belong to later stages (list of groups, new group, restore of the panels, resize mark) are drawn
// and do nothing yet.

import { Component, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useValue } from "cs2/api";
import { useLocalization } from "cs2/l10n";
import { Tooltip } from "cs2/ui";
import { enabled$, layout$, log, modIndex$, probeIndex$, requestModIndex, resetAll, saveLayout } from "./bindings";
import { Box, EMPTY_STATS, Engine, EngineStats, OverflowView, SelectedView } from "./engine";
import {
    Layout,
    MORE_COLUMNS_MAX,
    MORE_COLUMNS_MIN,
    moveToBar,
    NAME_MAX,
    OrderMode,
    otherSide,
    parseLayout,
    parseModIndex,
    parseProbeIndex,
    restoreBar,
    serializeLayout,
    Side,
    TEXT_PREFIX,
    withName,
} from "./model";
import icon from "./images/ToolbarOrganizer_34x34.png";
import chevronLeft from "./images/ToolbarOrganizer_chevron_left.svg";
import chevronRight from "./images/ToolbarOrganizer_chevron_right.svg";
import resizeMark from "./images/ToolbarOrganizer_resize.svg";
import styles from "./organizer.module.scss";

function classes(...names: (string | false | undefined)[]): string {
    return names.filter((name) => !!name).join(" ");
}

/** Keeps a failure of the mod's own elements from reaching the game UI; the failure goes to the log. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown, info: { componentStack?: string }) {
        const anyError = error as any;
        log(
            "ERROR in the mod's own elements; they were removed from the screen.\n" +
            (anyError && anyError.stack ? String(anyError.stack) : String(error)) +
            (info && info.componentStack ? "\n" + info.componentStack : "")
        );
    }

    render() {
        return this.state.failed ? null : this.props.children;
    }
}

/** Renders nothing while the mod is turned off in the game options; the toolbars stay as the game draws them. */
export const Organizer = () => {
    const enabled = useValue(enabled$);

    useEffect(() => {
        log("Organizer " + (enabled ? "enabled" : "disabled") + " in the left toolbar");
    }, [enabled]);

    return enabled ? (
        <Boundary>
            <ActiveOrganizer />
        </Boundary>
    ) : null;
};

/** Edit mode, as in screen 8 of the sketch: the notice starts at this distance from the left of the screen,
 *  in rem; its height and the width of the field of the selected item. */
const BANNER_LEFT = 760;
const BANNER_HEIGHT = 52;
const FIELD_WIDTH = 360;
/** Room inside the menu, between its paddings, in rem (screen 17: 480 wide, 18 of padding on each side). */
const MENU_INNER = 444;
/** Length of the pieces of a dashed line and of the space between them, in rem. */
const DASH = 6;
const DASH_GAP = 4;

interface Piece {
    x: number;
    y: number;
    w: number;
    h: number;
}

const pieces = (box: Box, list: Piece[], className: string, prefix: string) =>
    list.map((piece, i) => (
        <div
            key={prefix + i}
            className={className}
            style={{
                left: box.x + piece.x + "rem",
                top: box.y + piece.y + "rem",
                width: piece.w + "rem",
                height: piece.h + "rem",
            }}
        />
    ));

/** Four lines around a rectangle (rem from the root). Lines, not a box, so nothing lies over what is inside. */
const edges = (box: Box, className: string, thick: number, prefix: string) =>
    pieces(
        box,
        [
            { x: 0, y: 0, w: box.w, h: thick },
            { x: 0, y: box.h - thick, w: box.w, h: thick },
            { x: 0, y: 0, w: thick, h: box.h },
            { x: box.w - thick, y: 0, w: thick, h: box.h },
        ],
        className,
        prefix
    );

/** A dashed line around a rectangle, made of small pieces: the game UI engine draws only solid borders. */
const dashes = (box: Box, className: string, thick: number, prefix: string) => {
    const list: Piece[] = [];
    for (let x = 0; x < box.w; x += DASH + DASH_GAP) {
        const w = Math.min(DASH, box.w - x);
        list.push({ x, y: 0, w, h: thick });
        list.push({ x, y: box.h - thick, w, h: thick });
    }
    for (let y = 0; y < box.h; y += DASH + DASH_GAP) {
        const h = Math.min(DASH, box.h - y);
        list.push({ x: 0, y, w: thick, h });
        list.push({ x: box.w - thick, y, w: thick, h });
    }
    return pieces(box, list, className, prefix);
};

/**
 * Information mark: a small circle with "i" (or "?") that shows a text while the mouse is over it. Used
 * where a note would take room or attention if it were always written out.
 */
const InfoMark = ({ tip, symbol }: { tip: string; symbol?: string }) => (
    <Tooltip tooltip={tip}>
        <div className={styles.infoMark}>{symbol || "i"}</div>
    </Tooltip>
);

interface NameFieldProps {
    view: SelectedView;
    left: number;
    top: number;
    text: (key: string, fallback: string) => string;
    /** The text of the field changed; it is saved when the field closes. */
    onChange: (value: string) => void;
    /** "Confirm" or the Enter key: saves the name and closes the field. */
    onEnter: (value: string) => void;
    onMove: () => void;
}

/**
 * Field of the item selected in the edit mode, with the look of screen 8 of the sketch: its name with
 * "Clear" and "Confirm" on the same line, and under them the button that sends the item to the other bar.
 * "Confirm" or the Enter key saves the name and closes the field; the name is also saved when the field
 * closes in any other way (a click outside, another item selected, end of the edit mode). An empty field
 * gives the item its official name back.
 */
const NameField = ({ view, left, top, text, onChange, onEnter, onMove }: NameFieldProps) => {
    const [value, setValue] = useState(view.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const change = (next: string) => {
        const cut = next.substring(0, NAME_MAX);
        setValue(cut);
        onChange(cut);
    };

    return (
        <div className={styles.nameField} style={{ left: left + "rem", top: top + "rem" }}>
            <div className={styles.nameLabel}>{text("ItemName", "Item name")}</div>
            <div className={styles.nameRow}>
                <input
                    ref={inputRef}
                    className={styles.nameInput}
                    type="text"
                    value={value}
                    maxLength={NAME_MAX}
                    placeholder={view.official || ""}
                    onChange={(event: { target: { value: string } }) => change(event.target.value)}
                    onKeyDown={(event: { key?: string; keyCode?: number }) => {
                        if (event.key === "Enter" || event.keyCode === 13) {
                            onEnter(value);
                        }
                    }}
                />
                <Tooltip
                    tooltip={text(
                        "ClearNameTip",
                        "Clear: empties the field. With the field empty, the item goes back to the official name of its mod."
                    )}
                >
                    <div
                        className={classes(styles.button, styles.nameClear)}
                        onClick={() => {
                            change("");
                            if (inputRef.current) {
                                inputRef.current.focus();
                            }
                        }}
                    >
                        {text("ClearName", "Clear")}
                    </div>
                </Tooltip>
                <div className={classes(styles.button, styles.active, styles.nameClear)} onClick={() => onEnter(value)}>
                    {text("Confirm", "Confirm")}
                </div>
            </div>
            {view.canMove && (
                <Tooltip
                    tooltip={text(
                        "MoveTip",
                        "Moves this button to the other toolbar. In A\u2192Z or Z\u2192A it enters by its name; in Manual, at the end."
                    )}
                >
                    <div className={classes(styles.button, styles.nameMove)} onClick={onMove}>
                        {view.side === "left"
                            ? text("MoveToRight", "Move to the right toolbar")
                            : text("MoveToLeft", "Move to the left toolbar")}
                    </div>
                </Tooltip>
            )}
        </div>
    );
};

const ActiveOrganizer = () => {
    const layoutJson = useValue(layout$);
    const indexJson = useValue(modIndex$);
    const probeJson = useValue(probeIndex$);
    const { translate } = useLocalization();

    const rootRef = useRef<HTMLDivElement>(null);
    const tipRef = useRef<HTMLDivElement>(null);
    const overlaysRef = useRef<HTMLDivElement>(null);
    const rightToggleRef = useRef<HTMLDivElement>(null);
    const dropLineRef = useRef<HTMLDivElement>(null);
    const dropBoxRef = useRef<HTMLDivElement>(null);
    const dragFrameRef = useRef<HTMLDivElement>(null);
    const bannerRef = useRef<HTMLDivElement>(null);
    /** Name typed in the field of the selected item and not saved yet; null when nothing was typed. */
    const draftRef = useRef<{ view: SelectedView; value: string } | null>(null);
    /** The current way of expanding or collapsing a bar, for the engine (it outlives a render). */
    const setHiddenRef = useRef<((side: Side, hidden: boolean, source: string) => void) | null>(null);
    const engineRef = useRef<Engine | null>(null);
    /** Bar that received the last click on expand or collapse in this session; null when none yet. */
    const lastClickedRef = useRef<Side | null>(null);
    /** Saved layout as last received, for the handlers that outlive a render (end of a drag). */
    const layoutJsonRef = useRef<string>("");
    /** Ends the drag of the edge of a "+" panel without saving; null when no drag is going on. */
    const cancelResizeRef = useRef<(() => void) | null>(null);

    const [stats, setStats] = useState<EngineStats>(EMPTY_STATS);
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    /** Bar whose "Restore" is waiting for confirmation; null when none. */
    const [restoring, setRestoring] = useState<Side | null>(null);
    /** Edit mode. It is a state of the session: it stays on when the menu closes and starts off with the game. */
    const [editing, setEditing] = useState(false);
    /** Bar whose "+" list (icons that do not fit in the rows) is open; null when none. */
    const [moreOpen, setMoreOpen] = useState<Side | null>(null);
    /** Columns of a "+" panel while its edge is being dragged, and until the saved change comes back. */
    const [preview, setPreview] = useState<{ side: Side; columns: number } | null>(null);
    const [resizing, setResizing] = useState(false);

    const text = useCallback(
        (key: string, fallback: string) => translate(TEXT_PREFIX + "[" + key + "]", fallback) || fallback,
        [translate]
    );

    // The engine lives while the mod is enabled; stopping it puts every button back.
    useEffect(() => {
        if (
            !rootRef.current ||
            !tipRef.current ||
            !overlaysRef.current ||
            !rightToggleRef.current ||
            !dropLineRef.current ||
            !dropBoxRef.current ||
            !dragFrameRef.current
        ) {
            log("ERROR the mod's own elements were not created; nothing is arranged");
            return;
        }

        const engine = new Engine({
            root: rootRef.current,
            tip: tipRef.current,
            overlays: overlaysRef.current,
            overlayClass: styles.generic,
            rightToggle: rightToggleRef.current,
            dropLine: dropLineRef.current,
            dropBox: dropBoxRef.current,
            dragFrame: dragFrameRef.current,
            onStats: setStats,
            onSave: (next: Layout, what: string) => {
                log("Edit mode: " + what);
                saveLayout(serializeLayout(next));
            },
            onExpand: (side: Side) => {
                if (setHiddenRef.current) {
                    setHiddenRef.current(side, false, "Dragged item held over the collapse button");
                }
            },
        });
        engineRef.current = engine;
        engine.start();
        requestModIndex();

        return () => {
            if (cancelResizeRef.current) {
                cancelResizeRef.current();
            }
            engine.stop();
            engineRef.current = null;
        };
    }, []);

    useEffect(() => {
        const layout = parseLayout(layoutJson);
        const index = parseModIndex(indexJson);
        const probes = parseProbeIndex(probeJson);
        log(
            "Data received: layout " + (layoutJson ? layoutJson : "(default)") + ", index " +
            (index ? index.names.size + " mods" : "not ready") + ", probe answers " + probes.size
        );
        if (engineRef.current) {
            engineRef.current.setData(layout, index, probes);
        }
    }, [layoutJson, indexJson, probeJson]);

    // The columns shown during a drag stay until the saved layout comes back with them.
    useEffect(() => {
        layoutJsonRef.current = layoutJson;
        if (!cancelResizeRef.current) {
            setPreview(null);
        }
    }, [layoutJson]);

    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setMoreColumns(preview);
        }
    }, [preview]);

    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setEditing(editing);
        }
    }, [editing]);

    // Edit mode: the field of the selected item closes on a click outside the mod's own elements; a click on
    // another button of the bars selects that one. Whatever closes the field, the name typed in it is saved.
    const selectedKey = stats.selected ? stats.selected.key : null;
    useEffect(() => {
        if (draftRef.current && draftRef.current.view.key !== selectedKey) {
            saveDraft();
        }
    }, [selectedKey]);

    // Edit mode: a click outside the bars and outside the mod's own elements (a tool of the game, a panel of
    // another mod, the map) is taken as the end of the editing: the edit mode ends, and the name being typed,
    // if any, is saved as always. With the menu open, that click only closes the menu.
    useEffect(() => {
        if (!editing || open) {
            return;
        }

        const onMouseDown = (event: MouseEvent) => {
            const root = rootRef.current;
            const engine = engineRef.current;
            const node = event.target as Node | null;
            if (!root || !engine || !node || root.contains(node) || engine.inBars(node, event.clientX, event.clientY)) {
                return;
            }
            log("Edit mode ended by a click outside the bars and outside the mod's own elements");
            setEditing(false);
        };

        document.addEventListener("mousedown", onMouseDown, true);
        return () => document.removeEventListener("mousedown", onMouseDown, true);
    }, [editing, open]);

    const hasSelection = stats.selected !== null;
    useEffect(() => {
        if (!hasSelection) {
            return;
        }

        const onMouseDown = (event: MouseEvent) => {
            const root = rootRef.current;
            if (root && event.target && root.contains(event.target as Node)) {
                return;
            }
            if (engineRef.current) {
                engineRef.current.select(null);
            }
        };

        document.addEventListener("mousedown", onMouseDown, true);
        return () => document.removeEventListener("mousedown", onMouseDown, true);
    }, [hasSelection]);

    // A drag does not outlive its panel.
    useEffect(() => {
        if (!moreOpen && cancelResizeRef.current) {
            cancelResizeRef.current();
        }
    }, [moreOpen]);

    // The two bars never cover each other. When they would, with both expanded and without a click that
    // already settled it (game just loaded, full reset, new mod, other resolution): the bar clicked last in
    // this session stays expanded and the other collapses; without any click in the session, both collapse.
    useEffect(() => {
        if (!layoutJson) {
            // Nothing saved (first use or full reset): no click counts any more.
            lastClickedRef.current = null;
        }
        if (!stats.active || !stats.overlap) {
            return;
        }
        const current = parseLayout(layoutJson);
        if (current.left.hidden || current.right.hidden) {
            return;
        }

        const keep = lastClickedRef.current;
        log(
            "The two bars cover each other with both expanded: " +
            (keep ? "the " + keep + " bar (clicked last) stays, the other collapses" : "no click in this session, both collapse")
        );
        saveLayout(
            serializeLayout({
                ...current,
                left: { ...current.left, hidden: keep !== "left" },
                right: { ...current.right, hidden: keep !== "right" },
            })
        );
    }, [stats.active, stats.overlap, layoutJson]);

    // The "+" list: the engine brings its icons to the screen while it is open. It closes when its bar is
    // collapsed or when every icon fits in the rows again.
    useEffect(() => {
        const view = moreOpen === "left" ? stats.moreLeft : moreOpen === "right" ? stats.moreRight : null;
        const current = parseLayout(layoutJson);
        if (moreOpen && (!stats.active || !view || current[moreOpen].hidden)) {
            setMoreOpen(null);
            return;
        }
        if (engineRef.current) {
            engineRef.current.setMoreOpen(moreOpen);
        }
    }, [moreOpen, stats.active, stats.moreLeft, stats.moreRight, layoutJson]);

    // The "+" list closes on a click outside the mod's own elements and outside the list itself (its icons
    // belong to the other mods and must receive their clicks).
    useEffect(() => {
        if (!moreOpen) {
            return;
        }

        const onMouseDown = (event: MouseEvent) => {
            const root = rootRef.current;
            if (!root || (event.target && root.contains(event.target as Node))) {
                return;
            }
            const view = moreOpen === "left" ? stats.moreLeft : stats.moreRight;
            if (view) {
                const box = root.getBoundingClientRect();
                const rem = box.width / 40;
                const x = (event.clientX - box.left) / rem;
                const y = (event.clientY - box.top) / rem;
                if (x >= view.boxX && x <= view.boxX + view.boxWidth && y >= view.boxY && y <= view.boxY + view.boxHeight) {
                    return;
                }
            }
            log('"+" list closed by a click outside');
            setMoreOpen(null);
        };

        document.addEventListener("mousedown", onMouseDown, true);
        return () => document.removeEventListener("mousedown", onMouseDown, true);
    }, [moreOpen, stats.moreLeft, stats.moreRight]);

    // The menu closes on a click anywhere outside the mod's own elements.
    useEffect(() => {
        if (!open) {
            return;
        }

        const onMouseDown = (event: MouseEvent) => {
            const root = rootRef.current;
            if (root && event.target && root.contains(event.target as Node)) {
                return;
            }
            log("Menu closed by a click outside");
            setOpen(false);
            setConfirming(false);
            setRestoring(null);
        };

        document.addEventListener("mousedown", onMouseDown, true);
        return () => document.removeEventListener("mousedown", onMouseDown, true);
    }, [open]);

    const layout = parseLayout(layoutJson);

    const setMode = (side: Side, mode: OrderMode, source: string) => {
        log("Menu: " + source + " on the " + side + " bar, order " + layout[side].mode + " -> " + mode);
        if (layout[side].mode === mode) {
            return;
        }
        // "Manual" starts from the order that is on the screen; any other choice discards the manual order.
        const order = mode === "manual" && engineRef.current ? engineRef.current.orderOf(side) : [];
        if (mode === "manual") {
            log("Menu: manual order of the " + side + " bar starts as it is on the screen: " + order.join(", "));
        }
        saveLayout(serializeLayout({ ...layout, [side]: { ...layout[side], mode, order } }));
    };

    /** "Restore" of a bar, after the confirmation. The bar is expanded: it counts as the last click. */
    const confirmRestore = (side: Side) => {
        const engine = engineRef.current;
        setRestoring(null);
        if (!engine) {
            return;
        }
        lastClickedRef.current = side;
        engine.select(null);
        engine.commit(
            restoreBar(engine.getLayout(), side),
            '"Restore" of the ' + side + " bar confirmed: every moved item returns to its own bar, order A-Z, bar expanded, edited names kept"
        );
    };

    /** A part of the menu that belongs to a later stage: it is drawn in its place and does nothing yet. */
    const later = (what: string) => {
        log("Menu: " + what + " clicked; this part of the menu is not in use yet");
    };

    const toggleEditing = (source: string) => {
        log("Edit mode " + (editing ? "ended" : "started") + " by " + source);
        setEditing(!editing);
    };

    /** Saves the name typed for an item; nothing is saved when it is the name the item already has. */
    const commitName = (view: SelectedView, value: string) => {
        const engine = engineRef.current;
        if (!engine) {
            return;
        }
        const current = engine.getLayout();
        const next = withName(current, view.key, value, view.official);
        if ((current.names[view.key] || "") === (next.names[view.key] || "")) {
            log("Edit mode: name of " + view.key + " left as it was");
            return;
        }
        engine.commit(
            next,
            "name of " + view.key + ': "' + view.name + '" -> "' + (next.names[view.key] || view.official || "") + '"' +
            (next.names[view.key] ? "" : " (official name, nothing edited)")
        );
    };

    /** The field closed, for any reason: the name typed in it, if any, is saved. */
    const saveDraft = () => {
        const draft = draftRef.current;
        if (draft) {
            draftRef.current = null;
            commitName(draft.view, draft.value);
        }
    };

    const moveSelected = (view: SelectedView) => {
        const engine = engineRef.current;
        if (!engine) {
            return;
        }
        const target = otherSide(view.side);
        saveDraft();
        engine.select(null);
        engine.commit(
            moveToBar(engine.getLayout(), view.key, view.home, target),
            "item " + view.key + " sent to the " + target + " bar by the button of its field"
        );
    };

    const setHidden = (side: Side, hidden: boolean, source: string) => {
        log(
            source + " of the " + side + " bar: " + (layout[side].hidden ? "collapsed" : "expanded") + " -> " +
            (hidden ? "collapsed" : "expanded")
        );
        lastClickedRef.current = side;
        if (layout[side].hidden === hidden) {
            return;
        }

        const next = { ...layout, [side]: { ...layout[side], hidden } };
        // The bar being expanded would cover the other one: the other collapses in the same change.
        const other: Side = side === "left" ? "right" : "left";
        if (!hidden && stats.overlap && !layout[other].hidden) {
            next[other] = { ...layout[other], hidden: true };
            log("The two bars would cover each other: the " + other + " bar collapses, the " + side + " bar (clicked) stays");
        }
        saveLayout(serializeLayout(next));
    };

    setHiddenRef.current = setHidden;

    /** Collapse button of a bar. Its arrow points to where the buttons go: in when open, out when collapsed. */
    const collapseButton = (side: Side) => {
        const hidden = layout[side].hidden;
        const count = side === "left" ? stats.left : stats.right;
        const pointsLeft = (side === "left") !== hidden;
        return (
            <Tooltip
                tooltip={
                    hidden
                        ? text("ExpandTip", "Expand: shows the buttons and the groups of this toolbar.")
                        : text("CollapseTip", "Collapse: hides the buttons and the groups of this toolbar.")
                }
            >
                <div className={styles.toggle} onClick={() => setHidden(side, !hidden, "Collapse button")}>
                    <img className={styles.chevron} src={pointsLeft ? chevronLeft : chevronRight} />
                    {hidden && count > 0 && (
                        <div className={classes(styles.badge, side === "left" ? styles.badgeLeft : styles.badgeRight)}>
                            {count}
                        </div>
                    )}
                </div>
            </Tooltip>
        );
    };

    // The menu opens under the last row of the left bar that is on the screen, never over its icons.
    const menuTop = 46 * (layout.left.hidden || !stats.active ? 1 : stats.leftRows) + 2;

    const toggle = () => {
        log("Menu " + (open ? "closed" : "opened") + " by the mod button" + (open ? "" : ", " + menuTop + "rem below the top of the bar"));
        setOpen(!open);
        setConfirming(false);
        setRestoring(null);
        setMoreOpen(null);
    };

    /**
     * Drag of the free edge of a "+" panel: each 46rem (one icon and its gap) towards the outside of the
     * panel is one more column, towards the inside one less, between MORE_COLUMNS_MIN and MORE_COLUMNS_MAX.
     * The panel follows the mouse during the drag; the number of columns is saved when the button is released.
     */
    const startResize = (side: Side, view: OverflowView, event: { button: number; clientX: number; preventDefault(): void }) => {
        const root = rootRef.current;
        if (!root || event.button !== 0 || cancelResizeRef.current) {
            return;
        }
        event.preventDefault();

        const rem = root.getBoundingClientRect().width / 40;
        const startX = event.clientX;
        const startColumns = view.columns;
        const outwards = view.gripSide === "left" ? -1 : 1;
        let columns = startColumns;
        log('"+" panel of the ' + side + " bar: drag of the " + view.gripSide + " edge started with " + startColumns + " column(s)");

        const onMove = (move: MouseEvent) => {
            const steps = Math.round((outwards * (move.clientX - startX)) / rem / 46);
            const next = Math.max(MORE_COLUMNS_MIN, Math.min(MORE_COLUMNS_MAX, startColumns + steps));
            if (next !== columns) {
                log('"+" panel of the ' + side + " bar: " + columns + " -> " + next + " column(s) during the drag");
                columns = next;
                setPreview({ side, columns });
            }
        };
        const stop = () => {
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("mouseup", onUp, true);
            cancelResizeRef.current = null;
            setResizing(false);
        };
        const onUp = () => {
            stop();
            const current = parseLayout(layoutJsonRef.current || "");
            if (current[side].moreColumns === columns) {
                log('"+" panel of the ' + side + " bar: drag ended, " + columns + " column(s), nothing to save");
                setPreview(null);
                return;
            }
            log('"+" panel of the ' + side + " bar: drag ended, columns " + current[side].moreColumns + " -> " + columns + ", saved");
            setPreview({ side, columns });
            saveLayout(serializeLayout({ ...current, [side]: { ...current[side], moreColumns: columns } }));
        };

        cancelResizeRef.current = () => {
            stop();
            setPreview(null);
            log('"+" panel of the ' + side + " bar: drag cancelled");
        };
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("mouseup", onUp, true);
        setResizing(true);
    };

    /** "+" button of a bar and, while open, its panel. The icons inside are the real buttons of the mods,
     *  placed by the engine; the background is drawn around their places. */
    const moreButton = (side: Side) => {
        const view = side === "left" ? stats.moreLeft : stats.moreRight;
        if (!stats.active || !view || layout[side].hidden) {
            return null;
        }
        const isOpen = moreOpen === side;
        return (
            <>
                <div className={styles.plusHost} style={{ left: view.plusX + "rem", top: view.plusY + "rem" }}>
                    <Tooltip
                        tooltip={text("MoreTip", "More: shows the mods that do not fit in the rows of the toolbar.")}
                        disabled={isOpen}
                    >
                        <div
                            className={classes(styles.toggle, isOpen && styles.open)}
                            onClick={() => {
                                log('"+" button of the ' + side + " bar: list " + (isOpen ? "closed" : "opened"));
                                setMoreOpen(isOpen ? null : side);
                                setOpen(false);
                                setConfirming(false);
                                setRestoring(null);
                            }}
                        >
                            <div className={styles.plus}>+</div>
                        </div>
                    </Tooltip>
                </div>
                {isOpen &&
                    view.pieces.map((piece, i) => (
                        <div
                            key={i}
                            className={styles.morePiece}
                            style={{ left: piece.x + "rem", top: piece.y + "rem", width: piece.w + "rem", height: piece.h + "rem" }}
                        />
                    ))}
                {isOpen &&
                    // Border of the panel: four lines over the outer strips of the background, so nothing of
                    // the mod lies over an icon.
                    [
                        [0, 0, view.boxWidth, 1],
                        [0, view.boxHeight - 1, view.boxWidth, 1],
                        [0, 0, 1, view.boxHeight],
                        [view.boxWidth - 1, 0, 1, view.boxHeight],
                    ].map((edge, i) => (
                        <div
                            key={"edge" + i}
                            className={styles.moreEdge}
                            style={{
                                left: view.boxX + edge[0] + "rem",
                                top: view.boxY + edge[1] + "rem",
                                width: edge[2] + "rem",
                                height: edge[3] + "rem",
                            }}
                        />
                    ))}
                {isOpen && (
                    <div
                        className={styles.moreGripHost}
                        style={{
                            left: view.gripX + "rem",
                            top: view.gripY + "rem",
                            width: view.gripWidth + "rem",
                            height: view.gripHeight + "rem",
                        }}
                    >
                        <Tooltip
                            tooltip={text("ResizeTip", "Resize: drag to change the number of columns of the panel, from 3 to 10.")}
                            disabled={resizing}
                        >
                            <div
                                className={classes(styles.moreGrip, resizing && styles.dragging)}
                                onMouseDown={(event: { button: number; clientX: number; preventDefault(): void }) =>
                                    startResize(side, view, event)
                                }
                            >
                                <div className={styles.moreGripMark} />
                            </div>
                        </Tooltip>
                    </div>
                )}
            </>
        );
    };

    const askReset = (asking: boolean) => {
        log("Menu: restore everything " + (asking ? "requested, waiting for confirmation" : "cancelled"));
        setConfirming(asking);
    };

    const confirmReset = () => {
        log("Menu: restore everything confirmed");
        resetAll();
        setConfirming(false);
    };

    const bar = (side: Side, title: string) => (
        <div className={styles.section}>
            <div className={styles.sectionHead}>
                <div className={styles.sectionTitle}>{title}</div>
                <Tooltip tooltip={text("HideTip", "Hides the buttons and the groups of this toolbar, like the Collapse button.")}>
                    <div
                        className={styles.hideRow}
                        onClick={() => setHidden(side, !layout[side].hidden, "Hide switch")}
                    >
                        <div className={styles.hideLabel}>{text("Hide", "Hide")}</div>
                        <div className={classes(styles.hideSwitch, layout[side].hidden && styles.on)}>
                            <div className={styles.knob} />
                        </div>
                    </div>
                </Tooltip>
            </div>
            <div className={classes(styles.row, styles.controls)}>
                <div className={styles.segment}>
                    <div
                        className={classes(styles.seg, styles.first, layout[side].mode === "az" && styles.active)}
                        onClick={() => setMode(side, "az", "A-Z")}
                    >
                        {text("OrderAZ", "A\u2192Z")}
                    </div>
                    <div
                        className={classes(styles.seg, layout[side].mode === "za" && styles.active)}
                        onClick={() => setMode(side, "za", "Z-A")}
                    >
                        {text("OrderZA", "Z\u2192A")}
                    </div>
                    <div
                        className={classes(styles.seg, styles.end, layout[side].mode === "manual" && styles.active)}
                        onClick={() => setMode(side, "manual", "Manual")}
                    >
                        {text("OrderManual", "Manual")}
                    </div>
                </div>
                <div className={styles.button} onClick={() => setMode(side, "az", "Reorder")}>
                    {text("Reorder", "Reorder")}
                </div>
                <Tooltip
                    tooltip={text(
                        "RestoreTip",
                        "Restore: the buttons of this toolbar that are on the other one return to it, the buttons of the other toolbar return to theirs, the order goes back to A\u2192Z and the toolbar is expanded. The edited names are kept."
                    )}
                >
                    <div
                        className={classes(styles.button, styles.danger, styles.last)}
                        onClick={() => {
                            log("Menu: restore of the " + side + " bar requested, waiting for confirmation");
                            setRestoring(side);
                            setConfirming(false);
                        }}
                    >
                        {text("Restore", "Restore")}
                    </div>
                </Tooltip>
            </div>
            {restoring === side && (
                <div className={styles.confirm}>
                    <div className={styles.confirmText}>
                        {text(
                            "RestoreConfirm",
                            "This restores this toolbar: its buttons that are on the other toolbar return to it, the buttons of the other toolbar return to theirs, the order goes back to A\u2192Z and the toolbar is expanded. The edited names are kept. Continue?"
                        )}
                    </div>
                    <div className={styles.row}>
                        <div className={styles.spacer} />
                        <div
                            className={styles.button}
                            onClick={() => {
                                log("Menu: restore of the " + side + " bar cancelled");
                                setRestoring(null);
                            }}
                        >
                            {text("Cancel", "Cancel")}
                        </div>
                        <div className={classes(styles.button, styles.danger, styles.last)} onClick={() => confirmRestore(side)}>
                            {text("Confirm", "Confirm")}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // Edit mode, as in screen 8 of the sketch: the notice and the field of the selected item sit right under
    // the rows of the bars that are on the screen (and under an open "+" panel). The notice starts at a fixed
    // place; the field is lined up with its item, always inside the screen, and goes under the notice when
    // the two would meet. Neither lies over an icon of the bars.
    const rootBox = rootRef.current ? rootRef.current.getBoundingClientRect() : null;
    const remPx = rootBox && rootBox.width > 1 ? rootBox.width / 40 : 0;
    const screenWidth = remPx > 0 ? window.innerWidth / remPx : 1920;
    const rootX = remPx > 0 && rootBox ? rootBox.left / remPx : 56;
    const shownRows = Math.max(
        layout.left.hidden || !stats.active ? 1 : stats.leftRows,
        layout.right.hidden || !stats.active ? 1 : stats.rightRows
    );
    const openPanel = moreOpen === "left" ? stats.moreLeft : moreOpen === "right" ? stats.moreRight : null;
    const bandTop = Math.max(46 * shownRows - 6, openPanel ? openPanel.boxY + openPanel.boxHeight : 0);
    const bannerWidth = bannerRef.current && remPx > 0 ? bannerRef.current.getBoundingClientRect().width / remPx : 470;
    const bannerLeft = Math.round(Math.min(BANNER_LEFT, screenWidth - bannerWidth - 6) - rootX);
    const bannerTop = bandTop + 14;
    const selected = stats.selected;
    const fieldLeft = selected
        ? Math.max(6 - rootX, Math.min(selected.box.x, screenWidth - FIELD_WIDTH - 6 - rootX))
        : 0;
    const fieldMeetsBanner = fieldLeft < bannerLeft + bannerWidth + 6 && fieldLeft + FIELD_WIDTH + 6 > bannerLeft;
    const fieldTop = fieldMeetsBanner ? bannerTop + BANNER_HEIGHT + 8 : bandTop + 10;

    return (
        <div ref={rootRef} className={styles.root} data-toolbar-organizer="root">
            <Tooltip tooltip={text("Title", "Toolbar Organizer")} disabled={open}>
                <div className={classes(styles.modButton, open && styles.open, editing && styles.editing)} onClick={toggle}>
                    <img className={styles.modIcon} src={icon} />
                </div>
            </Tooltip>

            {open && (
                <div className={styles.menu} style={{ top: menuTop + "rem" }}>
                    <div className={styles.head}>
                        <div className={styles.title}>{text("Title", "Toolbar Organizer")}</div>
                        <InfoMark tip={text("AutoSaved", "Every change is saved automatically, as soon as it is made.")} />
                    </div>

                    {bar("left", text("LeftBar", "Left toolbar"))}
                    {bar("right", text("RightBar", "Right toolbar"))}

                    <div className={classes(styles.section, styles.groups)}>
                        <div className={styles.sectionTitle}>{text("Groups", "Groups")}</div>
                        <div className={styles.groupList}>
                            <div className={styles.groupRows} />
                            <div className={styles.scrollTrack}>
                                <div className={styles.scrollThumb} />
                            </div>
                        </div>
                        <div className={styles.dashedHost} onClick={() => later("new group")}>
                            {dashes({ x: 0, y: 0, w: MENU_INNER, h: 44 }, styles.dashedPiece, 2, "new")}
                            <div className={styles.dashedLabel}>{text("NewGroup", "+ New group")}</div>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>{text("General", "General")}</div>
                        <Tooltip
                            tooltip={text(
                                "EditModeTip",
                                "Edit mode: lets you drag the buttons of the toolbars and edit their names. While it is on, a click on a button does not open its mod."
                            )}
                        >
                            <div
                                className={classes(styles.button, styles.block, editing && styles.active)}
                                onClick={() => toggleEditing("the menu")}
                            >
                                {text("EditMode", "Edit mode")}
                            </div>
                        </Tooltip>
                        <div className={classes(styles.row, styles.controls)}>
                            <div className={classes(styles.button, styles.half)} onClick={() => later("restore of the position of the panels")}>
                                {text("RestorePanelPositions", "Restore panel positions")}
                            </div>
                            <div
                                className={classes(styles.button, styles.half, styles.last)}
                                onClick={() => later("restore of the size of the panels")}
                            >
                                {text("RestorePanelSizes", "Restore panel sizes")}
                            </div>
                        </div>
                        {!confirming && (
                            <Tooltip
                                tooltip={text(
                                    "RestoreAllDesc",
                                    "Erases all settings of the mod: order, groups, edited names, positions and sizes. The toolbars go back to alphabetical order."
                                )}
                            >
                                <div
                                    className={classes(styles.button, styles.block, styles.danger)}
                                    onClick={() => {
                                        setRestoring(null);
                                        askReset(true);
                                    }}
                                >
                                    {text("RestoreAll", "Reset Settings")}
                                </div>
                            </Tooltip>
                        )}
                        {confirming && (
                            <div className={styles.confirm}>
                                <div className={styles.confirmText}>
                                    {text(
                                        "RestoreAllConfirm",
                                        "This erases all settings of the mod: order, groups, edited names, positions and sizes. Continue?"
                                    )}
                                </div>
                                <div className={styles.row}>
                                    <div className={styles.spacer} />
                                    <div className={styles.button} onClick={() => askReset(false)}>
                                        {text("Cancel", "Cancel")}
                                    </div>
                                    <div className={classes(styles.button, styles.danger, styles.last)} onClick={confirmReset}>
                                        {text("Confirm", "Confirm")}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <img className={styles.menuGrip} src={resizeMark} />
                </div>
            )}

            {stats.active && <div className={styles.toggleHostLeft}>{collapseButton("left")}</div>}
            <div ref={rightToggleRef} className={styles.toggleHostRight}>
                {collapseButton("right")}
            </div>

            {moreButton("left")}
            {moreButton("right")}

            {editing && stats.active && stats.outlineLeft && dashes(stats.outlineLeft, styles.editDash, 2, "left")}
            {editing && stats.active && stats.outlineRight && dashes(stats.outlineRight, styles.editDash, 2, "right")}
            {editing && stats.active && (
                <div ref={bannerRef} className={styles.banner} style={{ left: bannerLeft + "rem", top: bannerTop + "rem" }}>
                    <div className={styles.bannerText}>{text("EditBanner", "Edit mode on: drag to organize")}</div>
                    <div className={styles.bannerDone} onClick={() => toggleEditing('"Done"')}>
                        {text("EditDone", "Done")}
                    </div>
                </div>
            )}
            {editing &&
                stats.active &&
                selected &&
                edges(
                    { x: selected.box.x - 2, y: selected.box.y - 2, w: selected.box.w + 4, h: selected.box.h + 4 },
                    styles.selectEdge,
                    2,
                    "selected"
                )}
            {editing && stats.active && selected && (
                <NameField
                    key={selected.key}
                    view={selected}
                    left={fieldLeft}
                    top={fieldTop}
                    text={text}
                    onChange={(value: string) => {
                        draftRef.current = { view: selected, value };
                    }}
                    onEnter={(value: string) => {
                        draftRef.current = null;
                        commitName(selected, value);
                        if (engineRef.current) {
                            engineRef.current.select(null);
                        }
                    }}
                    onMove={() => moveSelected(selected)}
                />
            )}
            <div ref={dropLineRef} className={styles.dropLine} />
            <div ref={dropBoxRef} className={styles.dropBox} />
            <div ref={dragFrameRef} className={styles.dragFrame} />

            <div ref={overlaysRef} className={styles.overlays} />
            <div ref={tipRef} className={styles.tip} />
        </div>
    );
};
