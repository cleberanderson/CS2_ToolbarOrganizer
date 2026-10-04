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
// The menu has every part of screen 17 of the project sketch, in its place and with its look. The menu
// keeps its size: it is not resizable.
// Stage 4: groups. A group is created, renamed and deleted in the list of the menu; on its bar it is a
// button with its name and quantity, placed among the icons by the engine, that opens and closes its panel.
// The panel shows the icons of the group (the real buttons of the mods): its header has the handle that
// moves it, the name, the list of options ("⋮") and the "x" that closes it; its edges resize it. An item
// enters and leaves a group by dragging, in the edit mode, or by the buttons of the field of the item.
// The pencil of a row of the list edits the group in the row itself: its name, its bar and its order. The
// title bar of a panel can be hidden (right click on the handle): the handle then sits in a tab at the left
// of the first row of icons. A panel under its button keeps clear of the open menu and of the edit notice.
// The images of the mod come from an address of its own when the C# part could register one.

import { Component, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useValue } from "cs2/api";
import { useLocalization } from "cs2/l10n";
import { Tooltip } from "cs2/ui";
import { enabled$, imagesHost$, layout$, log, modIndex$, probeIndex$, requestModIndex, resetAll, saveLayout } from "./bindings";
import { Box, EMPTY_STATS, Engine, EngineStats, OverflowView, PanelView, SelectedView } from "./engine";
import {
    addToGroup,
    cleanGroupName,
    compareNames,
    createGroup,
    deleteGroup,
    GROUP_NAME_MAX,
    groupById,
    GroupLayout,
    groupNameProblem,
    Layout,
    leaveGroups,
    MORE_COLUMNS_MAX,
    MORE_COLUMNS_MIN,
    moveGroupToBar,
    moveToBar,
    NAME_MAX,
    OrderMode,
    otherSide,
    parseLayout,
    parseModIndex,
    parseProbeIndex,
    renameGroup,
    resetPanelPositions,
    resetPanels,
    resetPanelSizes,
    restoreBar,
    serializeLayout,
    setAllGroupHeads,
    setGroupHead,
    setGroupLabels,
    setGroupMode,
    setGroupPos,
    setGroupSize,
    Side,
    TEXT_PREFIX,
    withName,
} from "./model";
import icon from "./images/toolbox_organizer_icon_34x34.png";
import checkIcon from "./images/toolbox_organizer_check.svg";
import chevronLeft from "./images/toolbox_organizer_chevron_left.svg";
import chevronRight from "./images/toolbox_organizer_chevron_right.svg";
import closeIcon from "./images/toolbox_organizer_close.svg";
import dotsIcon from "./images/toolbox_organizer_dots.svg";
import folderIcon from "./images/toolbox_organizer_folder.svg";
import handleIcon from "./images/toolbox_organizer_handle.svg";
import handleEditIcon from "./images/toolbox_organizer_handle_edit.svg";
import pencilIcon from "./images/toolbox_organizer_pencil.svg";
import resizeMark from "./images/toolbox_organizer_resize.svg";
import trashIcon from "./images/toolbox_organizer_trash.svg";
import warningIcon from "./images/toolbox_organizer_warning.svg";
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
/** Address shared by the images of all the mods, as written by the build in the path of each image. */
const SHARED_IMAGES = "coui://ui-mods/";
const BANNER_HEIGHT = 52;
const FIELD_WIDTH = 360;
/** Room inside the menu, between its paddings, in rem (screen 17: 480 wide, 18 of padding on each side). */
const MENU_INNER = 444;
/** The menu, as in screen 17: its width and, until it is measured on the screen, its height. */
const MENU_WIDTH = 480;
const MENU_HEIGHT = 756;
/** Panel of a group: from its outer edge to what is inside it (line of 1 and padding of 14), and from its
 *  top to its header (line of 1 and padding of 12). */
const PANEL_INSET_X = 15;
const PANEL_INSET_TOP = 13;
/** Tab of the handle of a panel without title bar (screen 43): its width; it covers the line of the panel. */
const EAR_WIDTH = 19;
/** List opened by a right click on the handle of a panel (screen 43): its width and its height. */
const CTX_WIDTH = 230;
const CTX_HEIGHT = 154;
/** "Panel full!" as a block (screen 33): its height, with the line around it. */
const FULL_BLOCK = 122;
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

interface ScrollListProps {
    rows: ReactNode[];
    /** Height of a row, space between rows and rows shown at a time, in rem. */
    rowHeight: number;
    gap: number;
    visible: number;
    /** False hides the scroll bar while every row fits. */
    alwaysBar: boolean;
}

/**
 * A list that keeps its height and shows its rows through it: the mouse wheel moves it one row at a time
 * and the bar at its right can be dragged. The game UI engine has no scrolling box of its own in use here.
 */
const ScrollList = ({ rows, rowHeight, gap, visible, alwaysBar }: ScrollListProps) => {
    const [offset, setOffset] = useState(0);
    const trackRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<(() => void) | null>(null);

    const pitch = rowHeight + gap;
    const view = visible * pitch - gap;
    const total = Math.max(0, rows.length * pitch - gap);
    const most = Math.max(0, total - view);
    const at = Math.min(offset, most);
    const thumb = total > view ? Math.max(24, Math.round((view * view) / total)) : view;
    const thumbTop = most > 0 ? (at / most) * (view - thumb) : 0;

    useEffect(
        () => () => {
            if (dragRef.current) {
                dragRef.current();
            }
        },
        []
    );

    const startDrag = (event: { button: number; clientY: number; preventDefault(): void }) => {
        const track = trackRef.current;
        if (!track || event.button !== 0 || most <= 0 || dragRef.current) {
            return;
        }
        event.preventDefault();
        const scale = track.getBoundingClientRect().height / view;
        const startY = event.clientY;
        const startAt = at;
        const onMove = (move: MouseEvent) => {
            const moved = (move.clientY - startY) / (scale > 0 ? scale : 1);
            const next = startAt + (moved / Math.max(1, view - thumb)) * most;
            setOffset(Math.max(0, Math.min(most, next)));
        };
        const stop = () => {
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("mouseup", stop, true);
            dragRef.current = null;
        };
        dragRef.current = stop;
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("mouseup", stop, true);
    };

    return (
        <div
            className={styles.scrollList}
            style={{ height: view + "rem" }}
            onWheel={(event: { deltaY: number }) => {
                if (most > 0 && event.deltaY) {
                    setOffset(Math.max(0, Math.min(most, at + (event.deltaY > 0 ? pitch : -pitch))));
                }
            }}
        >
            <div className={classes(styles.scrollRows, !alwaysBar && most <= 0 && styles.full)}>
                <div className={styles.scrollInner} style={{ marginTop: -at + "rem" }}>
                    {rows}
                </div>
            </div>
            {(alwaysBar || most > 0) && (
                <div ref={trackRef} className={styles.scrollTrack}>
                    <div
                        className={styles.scrollThumb}
                        style={{ height: thumb + "rem", marginTop: thumbTop + "rem" }}
                        onMouseDown={startDrag}
                    />
                </div>
            )}
        </div>
    );
};

/** A group as offered to an item: where it can be put. */
interface GroupChoice {
    id: string;
    name: string;
    side: Side;
}

interface NameFieldProps {
    view: SelectedView;
    left: number;
    top: number;
    text: (key: string, fallback: string) => string;
    /** Groups the item can be put in (every group but its own). */
    groups: GroupChoice[];
    /** The text of the field changed; it is saved when the field closes. */
    onChange: (value: string) => void;
    /** "Confirm" or the Enter key: saves the name and closes the field. */
    onEnter: (value: string) => void;
    onMove: () => void;
    /** "Take out of the group", for an item that is in one. */
    onTake: () => void;
    /** A group chosen in the list of "Put in a group". */
    onPut: (id: string) => void;
    /** Image shown before the name of each group of that list. */
    folder: string;
}

/**
 * Field of the item selected in the edit mode, with the look of screen 8 of the sketch: its name with
 * "Clear" and "Confirm" on the same line, and under them the buttons that change its place: to the other
 * bar (an item of a bar), out of its group (an item of a group) and into a group, chosen from a list.
 * "Confirm" or the Enter key saves the name and closes the field; the name is also saved when the field
 * closes in any other way (a click outside, another item selected, end of the edit mode). An empty field
 * gives the item its official name back.
 */
const NameField = ({ view, left, top, text, groups, onChange, onEnter, onMove, onTake, onPut, folder }: NameFieldProps) => {
    const [value, setValue] = useState(view.name);
    const [picking, setPicking] = useState(false);
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
            {view.group === null && view.canMove && (
                <Tooltip
                    tooltip={text(
                        "MoveTip",
                        "Moves this button to the other toolbar. In A→Z or Z→A it enters by its name; in Manual, at the end."
                    )}
                >
                    <div className={classes(styles.button, styles.nameMove)} onClick={onMove}>
                        {view.side === "left"
                            ? text("MoveToRight", "Move to the right toolbar")
                            : text("MoveToLeft", "Move to the left toolbar")}
                    </div>
                </Tooltip>
            )}
            {view.group !== null && (
                <Tooltip
                    tooltip={text(
                        "TakeFromGroupTip",
                        "Takes this button out of the group. It returns to its own toolbar, or to the last one it was on before entering the group."
                    )}
                >
                    <div className={classes(styles.button, styles.nameMove)} onClick={onTake}>
                        {text("TakeFromGroup", "Take out of the group")}
                    </div>
                </Tooltip>
            )}
            {groups.length > 0 && (
                <div className={classes(styles.button, styles.nameMove, picking && styles.picking)} onClick={() => setPicking(!picking)}>
                    {text("PutInGroup", "Put in a group")}
                </div>
            )}
            {groups.length > 0 && picking && (
                <div className={styles.pickList}>
                    <ScrollList
                        rowHeight={44}
                        gap={2}
                        visible={Math.min(5, groups.length)}
                        alwaysBar={false}
                        rows={groups.map((group) => (
                            <div key={group.id} className={styles.pickRow} onClick={() => onPut(group.id)}>
                                <img className={styles.groupIcon} src={folder} />
                                <div className={styles.pickName}>{group.name}</div>
                                <div className={styles.pickSide}>
                                    {group.side === "left" ? text("Left", "Left") : text("Right", "Right")}
                                </div>
                            </div>
                        ))}
                    />
                </div>
            )}
        </div>
    );
};

interface GroupNameInputProps {
    value: string;
    /** The name cannot be used: the field is marked. */
    invalid: boolean;
    className: string;
    /** When it changes, the field takes the keyboard again. */
    focusKey?: string;
    onChange: (value: string) => void;
    onEnter: () => void;
}

/** Field for the name of a group (new group, rename in the list, rename in the header of the panel). */
const GroupNameInput = ({ value, invalid, className, focusKey, onChange, onEnter }: GroupNameInputProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    // The field takes the keyboard when it appears, and again whenever "focusKey" changes: a click on a
    // button next to it takes the keyboard away, and Enter must still confirm.
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [focusKey]);

    return (
        <input
            ref={inputRef}
            className={classes(styles.nameInput, className, invalid && styles.invalid)}
            type="text"
            value={value}
            maxLength={GROUP_NAME_MAX}
            onChange={(event: { target: { value: string } }) => onChange(event.target.value.substring(0, GROUP_NAME_MAX))}
            onKeyDown={(event: { key?: string; keyCode?: number }) => {
                if (event.key === "Enter" || event.keyCode === 13) {
                    onEnter();
                }
            }}
        />
    );
};

const ActiveOrganizer = () => {
    const layoutJson = useValue(layout$);
    const indexJson = useValue(modIndex$);
    const probeJson = useValue(probeIndex$);
    const imagesHost = useValue(imagesHost$);
    const { translate } = useLocalization();

    const rootRef = useRef<HTMLDivElement>(null);
    const tipRef = useRef<HTMLDivElement>(null);
    const overlaysRef = useRef<HTMLDivElement>(null);
    const rightToggleRef = useRef<HTMLDivElement>(null);
    const dropLineRef = useRef<HTMLDivElement>(null);
    const dropBoxRef = useRef<HTMLDivElement>(null);
    const dragFrameRef = useRef<HTMLDivElement>(null);
    const bannerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const ctxRef = useRef<HTMLDivElement>(null);
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
    /** "Reset panels (Global)" waiting for confirmation. */
    const [resettingPanels, setResettingPanels] = useState(false);
    /** Edit mode. It is a state of the session: it stays on when the menu closes and starts off with the game. */
    const [editing, setEditing] = useState(false);
    /** Bar whose "+" list (icons that do not fit in the rows) is open; null when none. */
    const [moreOpen, setMoreOpen] = useState<Side | null>(null);
    /** Columns of a "+" panel while its edge is being dragged, and until the saved change comes back. */
    const [preview, setPreview] = useState<{ side: Side; columns: number } | null>(null);
    const [resizing, setResizing] = useState(false);
    /** Groups: the form of a new group, the name being edited, the group whose deletion waits for the
     *  confirmation (each of these in the list of the menu or in a panel) and the group whose list of
     *  options ("⋮") is open. */
    const [groupForm, setGroupForm] = useState<{ name: string; side: Side; problem: "empty" | "taken" | null } | null>(null);
    const [renaming, setRenaming] = useState<{
        id: string;
        where: "list" | "panel";
        value: string;
        invalid: boolean;
        /** Bar chosen in the row of the list, used on the confirmation; the one of the group when edited in
         *  its panel. The order chosen in the row is applied at once, so it is not kept here. */
        side: Side;
    } | null>(null);
    const [deleting, setDeleting] = useState<{ id: string; where: "list" | "panel" } | null>(null);
    const [groupMenu, setGroupMenu] = useState<string | null>(null);
    /** List opened by a right click on the handle of a panel: the group and the point of the click, in rem
     *  from the corner of the root. */
    const [panelCtx, setPanelCtx] = useState<{ id: string; x: number; y: number } | null>(null);
    /** What the engine last reported, for the handlers that outlive a render (end of the drag of a panel). */
    const statsRef = useRef<EngineStats>(EMPTY_STATS);
    statsRef.current = stats;
    /** Ends the drag of a panel (by its handle or by an edge) without saving; null when none is going on. */
    const cancelPanelDragRef = useRef<(() => void) | null>(null);

    const text = useCallback(
        (key: string, fallback: string) => translate(TEXT_PREFIX + "[" + key + "]", fallback) || fallback,
        [translate]
    );

    // Address of the images of the mod. The address shared by all the mods takes several seconds to answer the
    // first request for each file when many mods are installed; the mod's own address, registered by the C#
    // part, answers at once. Without it (registration failed) the shared address is used.
    // If the own address refuses an image, the shared one is used again for the rest of the session.
    const [hostRefused, setHostRefused] = useState(false);
    const host = imagesHost && !hostRefused ? imagesHost : "";
    const image = useCallback(
        (url: string) => (host ? url.replace(SHARED_IMAGES, "coui://" + host + "/") : url),
        [host]
    );
    useEffect(() => {
        log("Images of the mod: " + (imagesHost ? "own address coui://" + imagesHost + "/" : "shared address " + SHARED_IMAGES + " (no own address registered)"));
        if (!imagesHost) {
            return undefined;
        }
        let alive = true;
        try {
            const probe = document.createElement("img");
            const started = Date.now();
            probe.onload = () => {
                if (alive) {
                    log("Images of the mod: the own address answered in " + (Date.now() - started) + " ms");
                }
            };
            probe.onerror = () => {
                if (alive) {
                    log("Images of the mod: the own address refused an image; the shared address " + SHARED_IMAGES + " is used in this session");
                    setHostRefused(true);
                }
            };
            probe.src = handleIcon.replace(SHARED_IMAGES, "coui://" + imagesHost + "/");
        } catch (e) {
            log("Images of the mod: the own address could not be tried (" + e + "); it is used as registered");
        }
        return () => {
            alive = false;
        };
    }, [imagesHost]);

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
                log("Change: " + what);
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
            if (cancelPanelDragRef.current) {
                cancelPanelDragRef.current();
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
            setResettingPanels(false);
            setGroupForm(null);
            setDeleting((current) => (current && current.where === "list" ? null : current));
            setRenaming((current) => (current && current.where === "list" ? null : current));
        };

        document.addEventListener("mousedown", onMouseDown, true);
        return () => document.removeEventListener("mousedown", onMouseDown, true);
    }, [open]);

    // The group edited in the list of the menu: its button and its panel are marked as in the edit mode, and
    // its panel opens for the edition (screen 45).
    const listEdit = renaming !== null && renaming.where === "list" ? renaming.id : null;
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setGroupEdit(listEdit);
        }
    }, [listEdit, stats.active]);

    // A list of a panel (its list of options or the list of its handle) must be drawn over every icon of the
    // panels; the engine is told while one is open.
    const listOpen = panelCtx !== null || groupMenu !== null;
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setListOpen(listOpen);
        }
    }, [listOpen, stats.active]);

    // A panel without title bar shows it while the name of its group is edited there.
    const headFor = renaming !== null && renaming.where === "panel" ? renaming.id : null;
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setHeadShown(headFor);
        }
    }, [headFor]);

    // A name being edited in a panel ends, unsaved, when that panel closes.
    const headOpen = headFor !== null && stats.panels.some((panel) => panel.id === headFor);
    useEffect(() => {
        if (headFor !== null && !headOpen) {
            log("Panel closed with the name of its group in edition: edition cancelled, name kept");
            setRenaming(null);
        }
    }, [headFor, headOpen]);

    // The list opened by a right click on the handle of a panel closes on any press outside it.
    useEffect(() => {
        if (!panelCtx) {
            return;
        }

        const onMouseDown = (event: MouseEvent) => {
            const list = ctxRef.current;
            if (list && event.target && list.contains(event.target as Node)) {
                return;
            }
            setPanelCtx(null);
        };

        document.addEventListener("mousedown", onMouseDown, true);
        return () => document.removeEventListener("mousedown", onMouseDown, true);
    }, [panelCtx]);

    // The list of options of a panel ("⋮") closes on a click anywhere outside it. The "⋮" button itself is
    // left alone: its own click closes the list.
    useEffect(() => {
        if (!groupMenu) {
            return;
        }

        const onMouseDown = (event: MouseEvent) => {
            let node = event.target as HTMLElement | null;
            while (node) {
                if (node.getAttribute && node.getAttribute("data-to-options") !== null) {
                    return;
                }
                node = node.parentElement;
            }
            log("Panel: list of options closed by a click outside it");
            setGroupMenu(null);
            setDeleting((current) => (current && current.where === "panel" ? null : current));
        };

        document.addEventListener("mousedown", onMouseDown, true);
        return () => document.removeEventListener("mousedown", onMouseDown, true);
    }, [groupMenu]);

    const layout = parseLayout(layoutJson);
    /** True when every group has the title bar of its panel hidden (and there is at least one group). */
    const allTitlesHidden = layout.groups.length > 0 && layout.groups.every((group) => !group.head);

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
            restoreBar(engine.getLayout(), side, (key: string) => engine.homeOf(key)),
            '"Restore" of the ' + side + " bar confirmed: its groups are deleted, every moved item returns to its own bar, order A-Z, bar expanded, edited names kept"
        );
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

    const sideText = (side: Side) => (side === "left" ? text("Left", "Left") : text("Right", "Right"));
    const modeText = (mode: OrderMode) =>
        mode === "az" ? text("OrderAZ", "A→Z") : mode === "za" ? text("OrderZA", "Z→A") : text("OrderManual", "Manual");

    /** Applies a change to the layout in use (it may be ahead of the saved one) and saves it. */
    const change = (what: string, make: (current: Layout) => Layout) => {
        const engine = engineRef.current;
        if (engine) {
            engine.commit(make(engine.getLayout()), what);
        }
    };

    /** Closes whatever is open in the list of groups of the menu: form, name being edited, confirmation. */
    const closeGroupParts = () => {
        setGroupForm(null);
        setDeleting(null);
        setRenaming(null);
    };

    const openGroupForm = () => {
        log('Menu: "+ New group" clicked, form opened');
        setGroupForm({ name: "", side: "left", problem: null });
        setRenaming(null);
        setDeleting(null);
    };

    const confirmGroupForm = () => {
        const engine = engineRef.current;
        if (!engine || !groupForm) {
            return;
        }
        const problem = groupNameProblem(engine.getLayout(), groupForm.name, null);
        if (problem) {
            log('Menu: new group "' + groupForm.name + '" not created: the name is ' + (problem === "empty" ? "empty" : "the one of another group"));
            setGroupForm({ ...groupForm, problem });
            return;
        }
        const name = cleanGroupName(groupForm.name);
        const side = groupForm.side;
        change('group "' + name + '" created on the ' + side + " bar, empty", (current) => createGroup(current, name, side));
        setGroupForm(null);
    };

    const startRename = (id: string, where: "list" | "panel") => {
        const group = groupById(layout, id);
        if (!group) {
            return;
        }
        log(
            (where === "list" ? "Edit" : "Rename") + ' of group "' + group.name + '" started in the ' +
            (where === "list" ? "list of the menu (name, bar and order)" : "header of its panel")
        );
        setRenaming({ id, where, value: group.name, invalid: false, side: group.side });
        setGroupMenu(null);
        setDeleting(null);
        if (where === "list") {
            setGroupForm(null);
        }
    };

    const confirmRename = () => {
        const engine = engineRef.current;
        if (!engine || !renaming) {
            return;
        }
        const current = engine.getLayout();
        const group = groupById(current, renaming.id);
        if (!group) {
            setRenaming(null);
            return;
        }
        const problem = groupNameProblem(current, renaming.value, renaming.id);
        if (problem) {
            log('Rename of group "' + group.name + '" to "' + renaming.value + '" refused: the name is ' + (problem === "empty" ? "empty" : "the one of another group"));
            setRenaming({ ...renaming, invalid: true });
            return;
        }
        const name = cleanGroupName(renaming.value);
        const id = renaming.id;
        // In the row of the list the bar is chosen too; in the header of the panel, the name only. The order
        // chosen in the row was applied when it was clicked.
        const side = renaming.where === "list" ? renaming.side : group.side;
        const changes: string[] = [];
        if (name !== group.name) {
            changes.push('renamed to "' + name + '"');
        }
        if (side !== group.side) {
            changes.push(
                "sent to the " + side + " bar (" +
                (current[side].mode === "manual" ? "with the groups of its manual order, before the icons" : "by its name") + ")"
            );
        }
        if (changes.length === 0) {
            log('Edit of group "' + group.name + '": nothing was changed');
        } else {
            change('group "' + group.name + '" ' + changes.join(", "), (now) => {
                const next = name !== group.name ? renameGroup(now, id, name) : now;
                return side !== group.side ? moveGroupToBar(next, id, side) : next;
            });
        }
        setRenaming(null);
    };

    const askDelete = (id: string, where: "list" | "panel") => {
        const group = groupById(layout, id);
        log('Deletion of group "' + (group ? group.name : id) + '" requested, waiting for confirmation');
        setDeleting({ id, where });
        setRenaming(null);
        if (where === "list") {
            setGroupForm(null);
        }
    };

    const confirmDelete = () => {
        const engine = engineRef.current;
        if (!engine || !deleting) {
            return;
        }
        const id = deleting.id;
        const group = groupById(engine.getLayout(), id);
        if (group) {
            change(
                'group "' + group.name + '" deleted; its ' + group.items.length +
                " item(s) return each to its own bar, or to the last one it was on before entering the group",
                (now) => deleteGroup(now, id)
            );
        }
        setDeleting(null);
        setGroupMenu(null);
    };

    /** An option of the list opened by the "⋮" of a panel. */
    const groupOption = (what: string, make: (current: Layout) => Layout) => {
        setGroupMenu(null);
        change(what, make);
    };

    const takeSelected = (view: SelectedView) => {
        saveDraft();
        if (engineRef.current) {
            engineRef.current.select(null);
        }
        change("item " + view.key + " taken out of its group by the button of its field: it returns to its bar", (current) =>
            leaveGroups(current, view.key)
        );
    };

    const putSelected = (view: SelectedView, id: string) => {
        const engine = engineRef.current;
        if (!engine) {
            return;
        }
        const current = engine.getLayout();
        const group = groupById(current, id);
        const next = addToGroup(current, view.key, id);
        saveDraft();
        if (next === null) {
            engine.warnFull(id, "item " + view.key + " was sent to it by the button of its field");
            return;
        }
        engine.select(null);
        engine.commit(
            next,
            "item " + view.key + ' put in group "' + (group ? group.name : id) + '" by the button of its field (' +
            (group && group.mode === "manual" ? "at the end of its manual order" : "by its name") + ")"
        );
    };

    /** Screen measures at this moment: px of one rem and the corner of the root, in rem across the screen. */
    const measures = () => {
        const box = rootRef.current ? rootRef.current.getBoundingClientRect() : null;
        const rem = box && box.width > 1 ? box.width / 40 : 0;
        return { rem, x: box && rem > 0 ? box.left / rem : 0, y: box && rem > 0 ? box.top / rem : 0 };
    };

    const shownPanel = (id: string): PanelView | null => {
        const now = statsRef.current;
        for (const view of now ? now.panels : []) {
            if (view.id === id) {
                return view;
            }
        }
        return null;
    };

    /**
     * Drag of a panel by the handle of its header, with the edit mode on or off. The panel follows the
     * mouse; where it is released is saved, and from then on the panel opens there.
     */
    const startPanelMove = (view: PanelView, event: { button: number; clientX: number; clientY: number; preventDefault(): void }) => {
        const engine = engineRef.current;
        const at = measures();
        if (!engine || at.rem <= 0 || event.button !== 0 || cancelPanelDragRef.current) {
            return;
        }
        event.preventDefault();
        const id = view.id;
        const startX = event.clientX;
        const startY = event.clientY;
        const baseX = at.x + view.box.x;
        const baseY = at.y + view.box.y;
        let moved = false;
        log('Panel of group "' + view.name + '": drag by the handle started at ' + Math.round(baseX) + "," + Math.round(baseY) + "rem");

        const onMove = (move: MouseEvent) => {
            const dx = (move.clientX - startX) / at.rem;
            const dy = (move.clientY - startY) / at.rem;
            if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) {
                return;
            }
            moved = true;
            engine.setPanelMove({ id, x: Math.round(baseX + dx), y: Math.round(baseY + dy) });
        };
        const stop = () => {
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("mouseup", onUp, true);
            cancelPanelDragRef.current = null;
        };
        const onUp = () => {
            stop();
            const shown = shownPanel(id);
            if (moved && shown) {
                // The place saved is the one on the screen: the panel is kept inside the screen while dragged.
                const pos = { x: Math.round(at.x + shown.box.x), y: Math.round(at.y + shown.box.y) };
                engine.commit(
                    setGroupPos(engine.getLayout(), id, pos),
                    'panel of group "' + view.name + '" moved by its handle to ' + pos.x + "," + pos.y + "rem; it opens there from now on"
                );
            } else {
                log('Panel of group "' + view.name + '": released without moving, nothing to save');
            }
            engine.setPanelMove(null);
        };

        cancelPanelDragRef.current = () => {
            stop();
            engine.setPanelMove(null);
        };
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("mouseup", onUp, true);
    };

    /**
     * Drag of an edge of a panel: the right edge sets the columns, the bottom edge sets the rows and the
     * corner sets both. The panel follows the mouse one column or one row at a time, always showing every
     * item; what is on the screen when the button is released is saved.
     */
    const startPanelResize = (
        view: PanelView,
        axis: "x" | "y" | "xy",
        event: { button: number; clientX: number; clientY: number; preventDefault(): void }
    ) => {
        const engine = engineRef.current;
        const at = measures();
        if (!engine || at.rem <= 0 || event.button !== 0 || cancelPanelDragRef.current) {
            return;
        }
        event.preventDefault();
        const id = view.id;
        const startX = event.clientX;
        const startY = event.clientY;
        const pitchX = view.named ? 110 : 46;
        const pitchY = view.named ? 90 : 46;
        const startColumns = view.columns;
        const startRows = view.rows;
        let changed = false;
        log(
            'Panel of group "' + view.name + '": resize by the ' + (axis === "x" ? "right edge" : axis === "y" ? "bottom edge" : "corner") +
            " started with " + startColumns + " column(s) x " + startRows + " row(s)"
        );

        const onMove = (move: MouseEvent) => {
            const columns = axis === "y" ? null : Math.max(1, startColumns + Math.round((move.clientX - startX) / at.rem / pitchX));
            const rows = axis === "x" ? null : Math.max(1, startRows + Math.round((move.clientY - startY) / at.rem / pitchY));
            if ((columns !== null && columns !== startColumns) || (rows !== null && rows !== startRows)) {
                changed = true;
            }
            if (changed) {
                engine.setPanelPreview({ id, columns, rows });
            }
        };
        const stop = () => {
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("mouseup", onUp, true);
            cancelPanelDragRef.current = null;
        };
        const onUp = () => {
            stop();
            const shown = shownPanel(id);
            if (changed && shown) {
                const columns = axis === "y" ? null : shown.columns;
                const rows = axis === "x" ? null : shown.rows;
                engine.commit(
                    setGroupSize(engine.getLayout(), id, columns, rows),
                    'panel of group "' + view.name + '" resized to ' + shown.columns + " column(s) x " + shown.rows + " row(s) (" +
                    (axis === "x" ? "columns chosen, rows follow the items" : axis === "y" ? "rows chosen, columns follow the items" : "columns and rows chosen") + ")"
                );
            } else {
                log('Panel of group "' + view.name + '": resize ended without a change');
            }
            engine.setPanelPreview(null);
        };

        cancelPanelDragRef.current = () => {
            stop();
            engine.setPanelPreview(null);
        };
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("mouseup", onUp, true);
    };

    /** Buttons of the groups. They are placed on the bars by the engine, among the icons. */
    const groupButtons = () =>
        layout.groups.map((group) => {
            const isOpen = stats.panels.some((view) => view.id === group.id);
            const count = stats.groupCounts[group.id];
            return (
                <div
                    key={group.id}
                    data-to-group={group.id}
                    className={classes(styles.groupButton, isOpen && styles.open)}
                    onMouseDown={(event: { button: number; clientX: number; clientY: number; preventDefault(): void }) => {
                        if (engineRef.current) {
                            engineRef.current.pressGroup(group.id, event);
                        }
                    }}
                    onClick={() => {
                        if (!editing && engineRef.current) {
                            engineRef.current.togglePanel(group.id, "a click on the button of the group");
                        }
                    }}
                >
                    <img className={styles.groupIcon} src={image(folderIcon)} />
                    <div data-to-group-text="name" className={styles.groupName}>
                        {group.name}
                    </div>
                    <div data-to-group-text="count" className={styles.countBadge}>
                        {count === undefined ? group.items.length : count}
                    </div>
                </div>
            );
        });

    /** List opened by the "⋮" of a panel, as in screen 17 of the sketch, or the confirmation of "Delete group". */
    const groupMenuList = (view: PanelView, group: GroupLayout, screenWidth: number, screenHeight: number, rootX: number, rootY: number) => {
        const toRight = view.box.x + view.box.w + 8;
        const left = rootX + toRight + 300 <= screenWidth - 6 ? toRight : Math.max(6 - rootX, view.box.x - 308);
        const top = Math.max(6 - rootY, Math.min(view.box.y + (view.head ? 56 : 0), screenHeight - 480 - rootY));
        const asking = deleting !== null && deleting.where === "panel" && deleting.id === view.id;
        const order = (mode: OrderMode, key: string, fallback: string) => (
            <div
                className={classes(styles.menuOption, group.mode === mode && styles.current)}
                onClick={() => {
                    groupOption('order of group "' + group.name + '": ' + group.mode + " -> " + mode, (current) =>
                        setGroupMode(current, group.id, mode, engineRef.current ? engineRef.current.panelOrderOf(group.id) : [])
                    );
                    // The manual order is made by dragging: the edit mode comes on with it.
                    if (mode === "manual" && !editing) {
                        log('Edit mode started by "Order: Manual" of the list of options of the panel of group "' + group.name + '"');
                        setEditing(true);
                    }
                }}
            >
                {text(key, fallback) + (group.mode === mode ? " " + text("Current", "(current)") : "")}
            </div>
        );
        return (
            <div key={"options" + view.id} data-to-options="list" className={styles.groupMenu} style={{ left: left + "rem", top: top + "rem" }}>
                {asking ? (
                    <div className={styles.groupMenuConfirm}>
                        <div className={styles.confirmText}>
                            {text(
                                "DeleteGroupConfirm",
                                "This deletes the group “{0}”. Its items return to their own toolbar, or to the last toolbar they were on before entering the group. Continue?"
                            ).replace("{0}", group.name)}
                        </div>
                        <div className={styles.row}>
                            <div className={styles.button} onClick={() => setDeleting(null)}>
                                {text("Cancel", "Cancel")}
                            </div>
                            <div className={classes(styles.button, styles.last)} onClick={confirmDelete}>
                                {text("Confirm", "Confirm")}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {order("az", "GroupOrderAZ", "Order: A→Z")}
                        {order("za", "GroupOrderZA", "Order: Z→A")}
                        {order("manual", "GroupOrderManual", "Order: Manual")}
                        <div className={styles.menuLine} />
                        <div
                            className={styles.menuOption}
                            onClick={() =>
                                groupOption(
                                    'names under the icons of group "' + group.name + '" turned ' + (group.labels ? "off" : "on") +
                                    "; the panel takes the standard size of that way",
                                    (current) => setGroupLabels(current, group.id, !group.labels)
                                )
                            }
                        >
                            <div className={styles.menuOptionText}>{text("ShowNames", "Names under the icons")}</div>
                            {group.labels && <img className={styles.menuCheck} src={image(checkIcon)} />}
                        </div>
                        <div className={styles.menuLine} />
                        <div
                            className={styles.menuOption}
                            onClick={() =>
                                groupOption('order of group "' + group.name + '" restored: A-Z', (current) =>
                                    setGroupMode(current, group.id, "az", [])
                                )
                            }
                        >
                            {text("RestoreGroupOrder", "Restore the order of the group")}
                        </div>
                        <div
                            className={styles.menuOption}
                            onClick={() =>
                                groupOption('panel of group "' + group.name + '" sent back to the place of its group', (current) =>
                                    setGroupPos(current, group.id, null)
                                )
                            }
                        >
                            {text("PanelToGroup", "Return the panel to the place of the group")}
                        </div>
                        <div
                            className={styles.menuOption}
                            onClick={() =>
                                groupOption('size of the panel of group "' + group.name + '" restored to the standard', (current) =>
                                    setGroupSize(current, group.id, null, null)
                                )
                            }
                        >
                            {text("RestorePanelSize", "Restore the size of the panel")}
                        </div>
                        <div className={styles.menuLine} />
                        <div className={styles.menuOption} onClick={() => startRename(group.id, "panel")}>
                            {text("RenameGroup", "Rename group")}
                        </div>
                        <div className={classes(styles.menuOption, styles.warn)} onClick={() => askDelete(group.id, "panel")}>
                            {text("DeleteGroup", "Delete group")}
                        </div>
                    </>
                )}
            </div>
        );
    };

    /**
     * An open panel of a group, as in screen 17 of the sketch: header with the handle, the name and the
     * quantity, "⋮" and "x"; under it the icons, which are the real buttons of the mods, placed by the
     * engine. The background is made of pieces drawn around the places of the icons, never over them.
     */
    const panelBox = (view: PanelView, screenWidth: number, screenHeight: number, rootX: number, rootY: number) => {
        const group = groupById(layout, view.id);
        if (!group) {
            return null;
        }
        const box = view.box;
        const edit = renaming !== null && renaming.where === "panel" && renaming.id === view.id ? renaming : null;
        const menuOpen = groupMenu === view.id;
        // Marked as in the edit mode: in the edit mode, and while its group is edited in the list of the menu.
        const marked = editing || stats.editGroup === view.id;
        // The handle: the left button of the mouse moves the panel; the right one opens, exactly where it was
        // pressed, the list that hides or shows the title bar, opens the list of options and closes the panel.
        const onHandle = (event: { button: number; clientX: number; clientY: number; preventDefault(): void }) => {
            if (event.button === 2) {
                event.preventDefault();
                const at = measures();
                if (at.rem > 0) {
                    log('Panel of group "' + view.name + '": right click on the handle, list opened');
                    setPanelCtx({ id: view.id, x: Math.round(event.clientX / at.rem - at.x), y: Math.round(event.clientY / at.rem - at.y) });
                }
                return;
            }
            startPanelMove(view, event);
        };
        const handle = (
            <Tooltip
                tooltip={text("MovePanelTip", "Move: drag to put the panel anywhere on the screen. Right click: hide or show the title bar.")}
                disabled={panelCtx !== null}
            >
                <div
                    className={view.head ? styles.panelHandle : styles.panelEar}
                    style={view.head ? undefined : { left: box.x + 1 - EAR_WIDTH + "rem", top: box.y + PANEL_INSET_TOP + "rem" }}
                    onMouseDown={onHandle}
                    onContextMenu={(event: { preventDefault(): void }) => event.preventDefault()}
                >
                    <img className={styles.panelHandleMark} src={image(marked ? handleEditIcon : handleIcon)} />
                </div>
            </Tooltip>
        );
        return (
            <div key={"panel" + view.id} className={styles.panel} style={{ zIndex: view.z }}>
                {view.pieces.map((piece, i) => (
                    <div
                        key={i}
                        className={classes(styles.panelPiece, piece.part === "top" && styles.top, piece.part === "bottom" && styles.bottom)}
                        style={{ left: piece.x + "rem", top: piece.y + "rem", width: piece.w + "rem", height: piece.h + "rem" }}
                    />
                ))}
                <div
                    className={styles.panelFrame}
                    style={{ left: box.x + "rem", top: box.y + "rem", width: box.w + "rem", height: box.h + "rem" }}
                />
                {marked && dashes({ x: box.x - 6, y: box.y - 6, w: box.w + 12, h: box.h + 12 }, styles.editDash, 2, "panel" + view.id)}
                {!view.head && handle}
                {view.head && (
                    <div
                        className={styles.panelHead}
                        style={{ left: box.x + PANEL_INSET_X + "rem", top: box.y + PANEL_INSET_TOP + "rem", width: box.w - 2 * PANEL_INSET_X + "rem" }}
                    >
                        {handle}
                        {edit ? (
                            <>
                                <GroupNameInput
                                    value={edit.value}
                                    invalid={edit.invalid}
                                    className={styles.panelNameInput}
                                    onChange={(value: string) => setRenaming({ ...edit, value, invalid: false })}
                                    onEnter={confirmRename}
                                />
                                <Tooltip tooltip={text("Confirm", "Confirm")}>
                                    <div className={styles.panelButton} onClick={confirmRename}>
                                        <img className={styles.icon16} src={image(checkIcon)} />
                                    </div>
                                </Tooltip>
                                <Tooltip tooltip={text("Cancel", "Cancel")}>
                                    <div className={classes(styles.panelButton, styles.last)} onClick={() => setRenaming(null)}>
                                        <img className={styles.icon16} src={image(closeIcon)} />
                                    </div>
                                </Tooltip>
                            </>
                        ) : (
                            <>
                                <div className={styles.panelTitle}>{view.name}</div>
                                <div className={styles.countBadge}>{view.count}</div>
                                <div className={styles.spacer} />
                                <Tooltip tooltip={text("GroupOptions", "Group options")} disabled={menuOpen}>
                                    <div
                                        data-to-options="button"
                                        className={classes(styles.panelButton, menuOpen && styles.open)}
                                        onClick={() => {
                                            log('Panel of group "' + view.name + '": list of options ' + (menuOpen ? "closed" : "opened"));
                                            setGroupMenu(menuOpen ? null : view.id);
                                            if (deleting && deleting.where === "panel") {
                                                setDeleting(null);
                                            }
                                        }}
                                    >
                                        <img className={styles.icon16} src={image(dotsIcon)} />
                                    </div>
                                </Tooltip>
                                <Tooltip tooltip={text("ClosePanel", "Close")}>
                                    <div
                                        className={classes(styles.panelButton, styles.last)}
                                        onClick={() => {
                                            setGroupMenu(null);
                                            if (engineRef.current) {
                                                engineRef.current.closePanel(view.id, 'its "x"');
                                            }
                                        }}
                                    >
                                        <img className={styles.icon16} src={image(closeIcon)} />
                                    </div>
                                </Tooltip>
                            </>
                        )}
                    </div>
                )}
                {view.labels.map((label) => (
                    <div
                        key={label.key}
                        className={styles.panelLabel}
                        style={{ left: label.x + "rem", top: label.y + "rem", width: label.w + "rem", height: label.h + "rem" }}
                    >
                        {label.text}
                    </div>
                ))}
                <div
                    className={styles.panelEdge}
                    style={{ left: box.x + box.w - 6 + "rem", top: box.y + 8 + "rem", width: "8rem", height: box.h - 28 + "rem" }}
                    onMouseDown={(event: { button: number; clientX: number; clientY: number; preventDefault(): void }) =>
                        startPanelResize(view, "x", event)
                    }
                />
                <div
                    className={styles.panelEdge}
                    style={{ left: box.x + 8 + "rem", top: box.y + box.h - 6 + "rem", width: box.w - 28 + "rem", height: "8rem" }}
                    onMouseDown={(event: { button: number; clientX: number; clientY: number; preventDefault(): void }) =>
                        startPanelResize(view, "y", event)
                    }
                />
                <Tooltip
                    tooltip={text(
                        "ResizePanelTip",
                        "Resize: drag the right edge for the columns, the bottom edge for the rows, or this corner for both."
                    )}
                >
                    <div
                        className={styles.panelCorner}
                        style={{ left: box.x + box.w - 20 + "rem", top: box.y + box.h - 20 + "rem" }}
                        onMouseDown={(event: { button: number; clientX: number; clientY: number; preventDefault(): void }) =>
                            startPanelResize(view, "xy", event)
                        }
                    >
                        <img className={styles.panelGrip} src={image(resizeMark)} />
                    </div>
                </Tooltip>
            </div>
        );
    };

    /**
     * "Panel full!": warning shown over a panel whose group has no room for one more item (screens 33 and 40).
     * With three rows of icons or more it is a block, icon over the text, in the middle of the whole panel;
     * where that would cover the title bar (a panel of three rows) it starts with the icons instead. With
     * one or two rows it is a line, icon and text side by side, in the middle of the icons.
     */
    const panelFull = (view: PanelView) => {
        const inline = view.rows <= 2;
        const fromIcons = inline || (view.box.h - FULL_BLOCK) / 2 < view.gridTop;
        return (
            <div
                key={"full" + view.id}
                className={classes(styles.panelFullHost, !inline && fromIcons && styles.fromTop)}
                style={{
                    left: view.box.x + "rem",
                    top: view.box.y + (fromIcons ? view.gridTop : 0) + "rem",
                    width: view.box.w + "rem",
                    height: (inline ? view.gridHeight : fromIcons ? view.box.h - view.gridTop : view.box.h) + "rem",
                    zIndex: view.z + 2,
                }}
            >
                <div className={classes(styles.panelFull, inline && styles.inline)}>
                    <img className={styles.panelFullIcon} src={image(warningIcon)} />
                    <div className={styles.panelFullText}>{text("PanelFull", "Panel full!")}</div>
                </div>
            </div>
        );
    };

    /**
     * List opened by a right click on the handle of a panel (screen 43), exactly where the click was: hide or
     * show the title bar, open the list of options and close the panel.
     */
    const panelCtxList = (screenWidth: number, screenHeight: number, rootX: number, rootY: number) => {
        const view = panelCtx ? stats.panels.filter((panel) => panel.id === panelCtx.id)[0] : undefined;
        const group = panelCtx ? groupById(layout, panelCtx.id) : null;
        if (!panelCtx || !view || !group) {
            return null;
        }
        const left = Math.max(6 - rootX, Math.min(panelCtx.x, screenWidth - CTX_WIDTH - 6 - rootX));
        const top = Math.max(6 - rootY, Math.min(panelCtx.y, screenHeight - CTX_HEIGHT - 6 - rootY));
        const pick = (what: string, act: () => void) => () => {
            log('Panel of group "' + group.name + '": "' + what + '" chosen in the list of its handle');
            setPanelCtx(null);
            act();
        };
        return (
            <div ref={ctxRef} className={styles.ctxMenu} style={{ left: left + "rem", top: top + "rem" }}>
                <div
                    className={styles.menuOption}
                    onClick={pick(group.head ? "Hide title bar" : "Show title bar", () =>
                        change('title bar of the panel of group "' + group.name + '" ' + (group.head ? "hidden" : "shown"), (current) =>
                            setGroupHead(current, group.id, !group.head)
                        )
                    )}
                >
                    {group.head ? text("HideTitleBar", "Hide title bar") : text("ShowTitleBar", "Show title bar")}
                </div>
                <div
                    className={styles.menuOption}
                    onClick={pick("Open menu", () => {
                        setGroupMenu(group.id);
                        if (deleting && deleting.where === "panel") {
                            setDeleting(null);
                        }
                    })}
                >
                    {text("OpenPanelMenu", "Open menu")}
                </div>
                <div
                    className={classes(styles.menuOption, styles.end)}
                    onClick={pick("Close", () => {
                        setGroupMenu(null);
                        if (engineRef.current) {
                            engineRef.current.closePanel(group.id, 'the "Close" of the list of its handle');
                        }
                    })}
                >
                    {text("ClosePanel", "Close")}
                </div>
            </div>
        );
    };

    /** Section "Groups" of the menu: the list (the only part of the menu that scrolls) and "+ New group";
     *  the form of a new group and the confirmation of a deletion take the place of both, so the menu
     *  keeps its size. */
    const groupsSection = () => {
        const sorted = layout.groups.slice().sort((a, b) => compareNames(a.name, a.id, b.name, b.id));
        const asking = deleting !== null && deleting.where === "list" ? groupById(layout, deleting.id) : null;

        if (groupForm) {
            return (
                <div className={styles.groupForm}>
                    <div className={styles.nameLabel}>{text("GroupName", "Group name")}</div>
                    <GroupNameInput
                        value={groupForm.name}
                        invalid={groupForm.problem !== null}
                        className={styles.formInput}
                        onChange={(value: string) => setGroupForm({ ...groupForm, name: value, problem: null })}
                        onEnter={confirmGroupForm}
                    />
                    {groupForm.problem === "taken" && (
                        <div className={styles.formProblem}>{text("GroupNameTaken", "There is already a group with this name.")}</div>
                    )}
                    <div className={classes(styles.nameLabel, styles.formSecond, groupForm.problem === "taken" && styles.tight)}>
                        {text("Bar", "Toolbar")}
                    </div>
                    <div className={classes(styles.row, styles.formRow)}>
                        <div className={styles.segment}>
                            <div
                                className={classes(styles.seg, styles.first, groupForm.side === "left" && styles.active)}
                                onClick={() => setGroupForm({ ...groupForm, side: "left" })}
                            >
                                {text("Left", "Left")}
                            </div>
                            <div
                                className={classes(styles.seg, styles.end, groupForm.side === "right" && styles.active)}
                                onClick={() => setGroupForm({ ...groupForm, side: "right" })}
                            >
                                {text("Right", "Right")}
                            </div>
                        </div>
                        <div
                            className={styles.button}
                            onClick={() => {
                                log("Menu: new group cancelled");
                                setGroupForm(null);
                            }}
                        >
                            {text("Cancel", "Cancel")}
                        </div>
                        <div className={classes(styles.button, styles.last)} onClick={confirmGroupForm}>
                            {text("Confirm", "Confirm")}
                        </div>
                    </div>
                </div>
            );
        }

        if (asking) {
            return (
                <div className={styles.groupConfirm}>
                    <div className={styles.confirmText}>
                        {text(
                            "DeleteGroupConfirm",
                            "This deletes the group “{0}”. Its items return to their own toolbar, or to the last toolbar they were on before entering the group. Continue?"
                        ).replace("{0}", asking.name)}
                    </div>
                    <div className={styles.row}>
                        <div
                            className={styles.button}
                            onClick={() => {
                                log('Deletion of group "' + asking.name + '" cancelled');
                                setDeleting(null);
                            }}
                        >
                            {text("Cancel", "Cancel")}
                        </div>
                        <div className={classes(styles.button, styles.last)} onClick={confirmDelete}>
                            {text("Confirm", "Confirm")}
                        </div>
                    </div>
                </div>
            );
        }

        const nextMode = (mode: OrderMode): OrderMode => (mode === "az" ? "za" : mode === "za" ? "manual" : "az");
        const rows = sorted.map((group, i) => {
            const edit = renaming !== null && renaming.where === "list" && renaming.id === group.id ? renaming : null;
            const count = stats.groupCounts[group.id];
            return (
                <div key={group.id} className={classes(styles.groupRow, edit !== null && styles.editing, i === sorted.length - 1 && styles.lastRow)}>
                    <img className={styles.groupIcon} src={image(folderIcon)} />
                    {edit ? (
                        // Edit in the row itself (screens 37 and 45): the name, and the bar and the order as buttons
                        // that change to the next value at each click. The order is applied at once; the name
                        // and the bar, on the confirmation.
                        <>
                            <GroupNameInput
                                value={edit.value}
                                invalid={edit.invalid}
                                className={styles.rowInput}
                                focusKey={edit.side + "/" + group.mode}
                                onChange={(value: string) => setRenaming({ ...edit, value, invalid: false })}
                                onEnter={confirmRename}
                            />
                            <Tooltip tooltip={text("RowBarTip", "Toolbar of the group: click to change.")}>
                                <div className={classes(styles.rowCycle, styles.forBar)} onClick={() => setRenaming({ ...edit, side: otherSide(edit.side) })}>
                                    {sideText(edit.side)}
                                </div>
                            </Tooltip>
                            <Tooltip tooltip={text("RowOrderTip", "Order of the items of the group: click to change.")}>
                                <div
                                    className={classes(styles.rowCycle, styles.forOrder)}
                                    onClick={() => {
                                        const mode = nextMode(group.mode);
                                        change(
                                            'order of group "' + group.name + '": ' + group.mode + " -> " + mode + " (row of the list of the menu, applied at once)",
                                            (current) => setGroupMode(current, group.id, mode, engineRef.current ? engineRef.current.panelOrderOf(group.id) : [])
                                        );
                                    }}
                                >
                                    {modeText(group.mode)}
                                </div>
                            </Tooltip>
                        </>
                    ) : (
                        <>
                            <div className={styles.groupRowName}>{group.name}</div>
                            <div className={styles.countBadge}>{count === undefined ? group.items.length : count}</div>
                            <div className={styles.spacer} />
                            <div className={styles.groupRowBar}>{sideText(group.side)}</div>
                            <div className={styles.groupRowOrder}>{modeText(group.mode)}</div>
                        </>
                    )}
                    <Tooltip tooltip={edit ? text("Confirm", "Confirm") : text("EditGroup", "Edit group: name, toolbar and order")}>
                        <div className={styles.rowAction} onClick={() => (edit ? confirmRename() : startRename(group.id, "list"))}>
                            <img className={styles.icon16} src={image(edit ? checkIcon : pencilIcon)} />
                        </div>
                    </Tooltip>
                    <Tooltip tooltip={edit ? text("Cancel", "Cancel") : text("DeleteGroup", "Delete group")}>
                        <div className={classes(styles.rowAction, styles.last)} onClick={() => (edit ? setRenaming(null) : askDelete(group.id, "list"))}>
                            <img className={styles.icon16} src={image(edit ? closeIcon : trashIcon)} />
                        </div>
                    </Tooltip>
                </div>
            );
        });

        return (
            <>
                <ScrollList rows={rows} rowHeight={44} gap={6} visible={3} alwaysBar={true} />
                <div className={styles.dashedHost} onClick={openGroupForm}>
                    {dashes({ x: 0, y: 0, w: MENU_INNER, h: 44 }, styles.dashedPiece, 2, "new")}
                    <div className={styles.dashedLabel}>{text("NewGroup", "+ New group")}</div>
                </div>
            </>
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
                    <img className={styles.chevron} src={image(pointsLeft ? chevronLeft : chevronRight)} />
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
        setResettingPanels(false);
        setMoreOpen(null);
        closeGroupParts();
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
                                setResettingPanels(false);
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
                        "Restore: the groups of this toolbar are deleted, its buttons that are on the other toolbar or in a group return to it, the buttons of the other toolbar return to theirs, the order goes back to A\u2192Z and the toolbar is expanded. The edited names are kept."
                    )}
                >
                    <div
                        className={classes(styles.button, styles.danger, styles.last)}
                        onClick={() => {
                            log("Menu: restore of the " + side + " bar requested, waiting for confirmation");
                            setRestoring(side);
                            setConfirming(false);
                            setResettingPanels(false);
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
                            "This restores this toolbar: its groups are deleted, its buttons that are on the other toolbar or in a group return to it, the buttons of the other toolbar return to theirs, the order goes back to A\u2192Z and the toolbar is expanded. The edited names are kept. Continue?"
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
    // the rows of the bars that are on the screen (and under an open "+" panel). The notice has a fixed
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
    // The notice always stays at its place (screens 8 and 41). A panel that sits under the button of its
    // group and would meet it is opened under it by the engine; a panel moved by the user is the user's to move.
    const bannerLeft = Math.round(Math.min(BANNER_LEFT, screenWidth - bannerWidth - 6) - rootX);
    const bannerTop = bandTop + 14;
    const selected = stats.selected;
    const screenHeight = remPx > 0 ? window.innerHeight / remPx : 1080;
    const rootY = remPx > 0 && rootBox ? rootBox.top / remPx : 10;
    let fieldLeft = selected ? Math.max(6 - rootX, Math.min(selected.box.x, screenWidth - FIELD_WIDTH - 6 - rootX)) : 0;
    const fieldMeetsBanner = fieldLeft < bannerLeft + bannerWidth + 6 && fieldLeft + FIELD_WIDTH + 6 > bannerLeft;
    let fieldTop = fieldMeetsBanner ? bannerTop + BANNER_HEIGHT + 8 : bandTop + 10;
    if (selected && selected.panel) {
        // An item of a panel: the field opens beside the panel, at the height of the item, inside the screen.
        const toRight = selected.panel.x + selected.panel.w + 12;
        fieldLeft =
            rootX + toRight + FIELD_WIDTH <= screenWidth - 6 ? toRight : Math.max(6 - rootX, selected.panel.x - FIELD_WIDTH - 12);
        fieldTop = Math.max(6 - rootY, Math.min(selected.box.y - 10, screenHeight - 320 - rootY));
    }
    // What the engine keeps the panels clear of: the notice of the edit mode and the open menu.
    const noticeShown = editing && stats.active;
    const noticeWidth = Math.round(bannerWidth);
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setNoticeBox(noticeShown ? { x: bannerLeft, y: bannerTop, w: noticeWidth, h: BANNER_HEIGHT } : null);
        }
    }, [noticeShown, bannerLeft, bannerTop, noticeWidth]);
    // The height of the menu is read from the screen after each drawing (a confirmation makes it taller).
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine) {
            return;
        }
        if (!open) {
            engine.setMenuBox(null);
            return;
        }
        const height = menuRef.current && remPx > 0 ? Math.round(menuRef.current.getBoundingClientRect().height / remPx) : 0;
        engine.setMenuBox({ x: 0, y: menuTop, w: MENU_WIDTH, h: height > 1 ? height : MENU_HEIGHT });
    });

    const choices = selected
        ? layout.groups
              .filter((group) => group.id !== selected.group)
              .sort((a, b) => compareNames(a.name, a.id, b.name, b.id))
              .map((group) => ({ id: group.id, name: group.name, side: group.side }))
        : [];

    return (
        <div ref={rootRef} className={styles.root} data-toolbar-organizer="root">
            <Tooltip tooltip={text("Title", "Toolbar Organizer")} disabled={open}>
                <div className={classes(styles.modButton, open && styles.open, editing && styles.editing)} onClick={toggle}>
                    <img className={styles.modIcon} src={image(icon)} />
                </div>
            </Tooltip>

            {open && (
                <div ref={menuRef} className={styles.menu} style={{ top: menuTop + "rem" }}>
                    <div className={styles.head}>
                        <div className={styles.title}>{text("Title", "Toolbar Organizer")}</div>
                        <InfoMark tip={text("AutoSaved", "Every change is saved automatically, as soon as it is made.")} />
                    </div>

                    {bar("left", text("LeftBar", "Left toolbar"))}
                    {bar("right", text("RightBar", "Right toolbar"))}

                    <div className={classes(styles.section, styles.groups)}>
                        <div className={styles.sectionTitle}>{text("Groups", "Groups")}</div>
                        {groupsSection()}
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
                            <Tooltip
                                tooltip={text(
                                    "RestorePanelPositionsTip",
                                    "Every panel of group goes back to the place of its group, under its button."
                                )}
                            >
                                <div
                                    className={classes(styles.button, styles.half)}
                                    onClick={() =>
                                        change("every panel sent back to the place of its group", (current) => resetPanelPositions(current))
                                    }
                                >
                                    {text("RestorePanelPositions", "Restore panel positions")}
                                </div>
                            </Tooltip>
                            <Tooltip
                                tooltip={text("RestorePanelSizesTip", "Every panel of group goes back to its standard size.")}
                            >
                                <div
                                    className={classes(styles.button, styles.half, styles.last)}
                                    onClick={() =>
                                        change("size of every panel restored to the standard", (current) => resetPanelSizes(current))
                                    }
                                >
                                    {text("RestorePanelSizes", "Restore panel sizes")}
                                </div>
                            </Tooltip>
                        </div>
                        <div className={classes(styles.row, styles.controls)}>
                            <Tooltip
                                tooltip={
                                    allTitlesHidden
                                        ? text("ShowPanelTitlesTip", "Shows the title bar of the panels of every group.")
                                        : text("HidePanelTitlesTip", "Hides the title bar of the panels of every group.")
                                }
                            >
                                <div
                                    className={classes(styles.button, styles.half)}
                                    onClick={() =>
                                        change(
                                            "title bar of the panel of every group " + (allTitlesHidden ? "shown" : "hidden") + " by the button of the menu",
                                            (current) => setAllGroupHeads(current, allTitlesHidden)
                                        )
                                    }
                                >
                                    {allTitlesHidden ? text("ShowPanelTitles", "Show panel titles") : text("HidePanelTitles", "Hide panel titles")}
                                </div>
                            </Tooltip>
                            <Tooltip
                                tooltip={text(
                                    "ResetPanelsTip",
                                    "Every panel of group goes back to its original state: title bar shown, standard size and place under the button of its group."
                                )}
                            >
                                <div
                                    className={classes(styles.button, styles.half, styles.danger, styles.last, resettingPanels && styles.asking)}
                                    onClick={() => {
                                        log('Menu: "Reset panels (Global)" requested, waiting for confirmation');
                                        setResettingPanels(true);
                                        setRestoring(null);
                                        setConfirming(false);
                                    }}
                                >
                                    {text("ResetPanels", "Reset panels (Global)")}
                                </div>
                            </Tooltip>
                        </div>
                        {resettingPanels && (
                            <div className={styles.confirm}>
                                <div className={styles.confirmText}>
                                    {text(
                                        "ResetPanelsConfirm",
                                        "This restores every panel of group: the title bar is shown again, the size goes back to the standard and the panel goes back under the button of its group. Continue?"
                                    )}
                                </div>
                                <div className={styles.row}>
                                    <div className={styles.spacer} />
                                    <div
                                        className={styles.button}
                                        onClick={() => {
                                            log('Menu: "Reset panels (Global)" cancelled');
                                            setResettingPanels(false);
                                        }}
                                    >
                                        {text("Cancel", "Cancel")}
                                    </div>
                                    <div
                                        className={classes(styles.button, styles.danger, styles.last)}
                                        onClick={() => {
                                            setResettingPanels(false);
                                            change(
                                                "every panel of group reset: title bar shown, standard size, place under the button of its group",
                                                (current) => resetPanels(current)
                                            );
                                        }}
                                    >
                                        {text("Confirm", "Confirm")}
                                    </div>
                                </div>
                            </div>
                        )}
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
                                        setResettingPanels(false);
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
                </div>
            )}

            {stats.active && groupButtons()}
            {stats.active && stats.panels.map((view) => panelBox(view, screenWidth, screenHeight, rootX, rootY))}
            {stats.active && stats.panels.filter((view) => view.full).map((view) => panelFull(view))}
            {/* The lists of a panel are drawn apart from it, over the icons of every panel. */}
            {stats.active &&
                stats.panels.map((view) => {
                    const group = groupMenu === view.id ? groupById(layout, view.id) : null;
                    return group ? groupMenuList(view, group, screenWidth, screenHeight, rootX, rootY) : null;
                })}
            {stats.active && panelCtxList(screenWidth, screenHeight, rootX, rootY)}

            {stats.active && <div className={styles.toggleHostLeft}>{collapseButton("left")}</div>}
            <div ref={rightToggleRef} className={styles.toggleHostRight}>
                {collapseButton("right")}
            </div>

            {moreButton("left")}
            {moreButton("right")}

            {!editing && stats.active && stats.editGroupBox &&
                dashes(
                    { x: stats.editGroupBox.x - 6, y: stats.editGroupBox.y - 6, w: stats.editGroupBox.w + 12, h: stats.editGroupBox.h + 12 },
                    styles.editDash,
                    2,
                    "editgroup"
                )}
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
                    groups={choices}
                    folder={image(folderIcon)}
                    onTake={() => takeSelected(selected)}
                    onPut={(id: string) => putSelected(selected, id)}
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
