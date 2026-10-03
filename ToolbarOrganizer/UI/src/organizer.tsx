// The mod's own elements: the mod button and its menu (left toolbar) and the collapse button of each bar.
// Stage 1: order of each bar (A-Z / Z-A), reorder shortcut and full reset.
// Stage 2: collapse and expand each bar, by its button or by the "Hide" switch of the menu. The two bars
// never cover each other: when they would, the one clicked last stays expanded and the other collapses;
// without a click in the session (game just loaded, new mod, other resolution) both collapse.
// A bar longer than 80% of the screen continues on the next row (up to 3); the menu opens under the last one.
// What does not fit in 3 rows goes to the panel of the "+" button at the end of the last row: the icons side
// by side, in alphabetical order. The panel is 3 columns by 3 rows as the standard and gets one more row at a
// time; dragging its free edge changes the number of columns (3 to 10) and the rows follow.

import { Component, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useValue } from "cs2/api";
import { useLocalization } from "cs2/l10n";
import { Tooltip } from "cs2/ui";
import { enabled$, layout$, log, modIndex$, probeIndex$, requestModIndex, resetAll, saveLayout } from "./bindings";
import { EMPTY_STATS, Engine, EngineStats, OverflowView } from "./engine";
import {
    MORE_COLUMNS_MAX,
    MORE_COLUMNS_MIN,
    OrderMode,
    parseLayout,
    parseModIndex,
    parseProbeIndex,
    serializeLayout,
    Side,
    TEXT_PREFIX,
} from "./model";
import icon from "./images/ToolbarOrganizer_34x34.png";
import chevronLeft from "./images/ToolbarOrganizer_chevron_left.svg";
import chevronRight from "./images/ToolbarOrganizer_chevron_right.svg";
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

const ActiveOrganizer = () => {
    const layoutJson = useValue(layout$);
    const indexJson = useValue(modIndex$);
    const probeJson = useValue(probeIndex$);
    const { translate } = useLocalization();

    const rootRef = useRef<HTMLDivElement>(null);
    const tipRef = useRef<HTMLDivElement>(null);
    const overlaysRef = useRef<HTMLDivElement>(null);
    const rightToggleRef = useRef<HTMLDivElement>(null);
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
        if (!rootRef.current || !tipRef.current || !overlaysRef.current || !rightToggleRef.current) {
            log("ERROR the mod's own elements were not created; nothing is arranged");
            return;
        }

        const engine = new Engine(
            rootRef.current,
            tipRef.current,
            overlaysRef.current,
            styles.generic,
            rightToggleRef.current,
            setStats
        );
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
        saveLayout(serializeLayout({ ...layout, [side]: { ...layout[side], mode } }));
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
    const menuTop = 46 * (layout.left.hidden || !stats.active ? 1 : stats.leftRows);

    const toggle = () => {
        log("Menu " + (open ? "closed" : "opened") + " by the mod button" + (open ? "" : ", " + menuTop + "rem below the top of the bar"));
        setOpen(!open);
        setConfirming(false);
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

    const bar = (side: Side, title: string, count: number) => (
        <div className={styles.section}>
            <div className={styles.sectionHead}>
                <div className={styles.label}>{title}</div>
                <div className={styles.count}>{stats.active ? count : "-"}</div>
                <div className={styles.spacer} />
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
            <div className={styles.row}>
                <div
                    className={classes(styles.button, layout[side].mode === "az" && styles.active)}
                    onClick={() => setMode(side, "az", "A-Z")}
                >
                    {text("OrderAZ", "A-Z")}
                </div>
                <div
                    className={classes(styles.button, layout[side].mode === "za" && styles.active)}
                    onClick={() => setMode(side, "za", "Z-A")}
                >
                    {text("OrderZA", "Z-A")}
                </div>
                <div className={styles.spacer} />
                <div className={classes(styles.button, styles.last)} onClick={() => setMode(side, "az", "Reorder")}>
                    {text("Reorder", "Reorder")}
                </div>
            </div>
        </div>
    );

    return (
        <div ref={rootRef} className={styles.root} data-toolbar-organizer="root">
            <Tooltip tooltip={text("Title", "Toolbar Organizer")} disabled={open}>
                <div className={classes(styles.modButton, open && styles.open)} onClick={toggle}>
                    <img className={styles.modIcon} src={icon} />
                </div>
            </Tooltip>

            {open && (
                <div className={styles.menu} style={{ top: menuTop + "rem" }}>
                    <div className={styles.title}>{text("Title", "Toolbar Organizer")}</div>
                    <div className={styles.sub}>{text("AutoSaved", "Every change is saved immediately")}</div>

                    {bar("left", text("LeftBar", "Left toolbar"), stats.left)}
                    {bar("right", text("RightBar", "Right toolbar"), stats.right)}

                    <div className={styles.section}>
                        <div className={styles.sectionHead}>
                            <div className={styles.label}>{text("General", "General")}</div>
                        </div>
                        {!confirming && (
                            <div className={styles.row}>
                                <Tooltip
                                    tooltip={text(
                                        "RestoreAllDesc",
                                        "Erases all settings of the mod: order, groups, edited names, positions and sizes. The toolbars go back to alphabetical order."
                                    )}
                                >
                                    <div
                                        className={classes(styles.button, styles.danger, styles.last)}
                                        onClick={() => askReset(true)}
                                    >
                                        {text("RestoreAll", "Reset Settings")}
                                    </div>
                                </Tooltip>
                            </div>
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
                </div>
            )}

            {stats.active && <div className={styles.toggleHostLeft}>{collapseButton("left")}</div>}
            <div ref={rightToggleRef} className={styles.toggleHostRight}>
                {collapseButton("right")}
            </div>

            {moreButton("left")}
            {moreButton("right")}

            <div ref={overlaysRef} className={styles.overlays} />
            <div ref={tipRef} className={styles.tip} />
        </div>
    );
};
