// Data shared by the UI parts: binding names, the saved layout and the indexes sent by the C# part.

/** Binding group; must match Mod.kId on the C# side. */
export const GROUP = "ToolbarOrganizer";

/** Prefix of the text keys registered by the C# part (Locale/LocaleSource.cs). */
export const TEXT_PREFIX = "ToolbarOrganizer.UI";

export type Side = "left" | "right";

/** Order of the icons of a bar. "manual" is the order left by the user when dragging icons in the edit mode. */
export type OrderMode = "az" | "za" | "manual";

/** Longest name the user may give to an item, in characters: what fits in the two lines under an icon of a
 *  panel. A longer name saved by an earlier version is cut to this length. */
export const NAME_MAX = 32;

/** Columns of the panel opened by the "+" button of a bar: the standard, which is also the least, and the most. */
export const MORE_COLUMNS_MIN = 3;
export const MORE_COLUMNS_MAX = 10;

/** Longest name of a group, in characters. */
export const GROUP_NAME_MAX = 20;
/** Most items a group may hold. */
export const GROUP_ITEMS_MAX = 30;
/** Panel of a group: columns of the standard size, with the names under the icons and without them, and
 *  the rows a panel that was never resized shows at least. */
export const PANEL_COLUMNS_NAMED = 3;
export const PANEL_COLUMNS_PLAIN = 5;
export const PANEL_ROWS_STANDARD = 3;
/** Panel of a group without names under the icons: most columns and most rows. With the names, the limit
 *  is what fits on the screen. */
export const PANEL_COLUMNS_MAX = 30;
export const PANEL_ROWS_MAX = 15;

export interface BarLayout {
    mode: OrderMode;
    /** True while the bar is collapsed: its buttons are hidden, the collapse button stays. */
    hidden: boolean;
    /** Columns of the panel of the "+" button, as left by the user when dragging its edge. */
    moreColumns: number;
    /** Keys of the items and of the groups ("g:" + id) in the order chosen by the user, from the game's
     *  fixed buttons outwards. Used only in "manual" mode; what is not listed goes after the listed ones. */
    order: string[];
}

/** A group: a named set of items, shown on a bar as one button that opens a panel with them. */
export interface GroupLayout {
    /** Stable id ("g1", "g2", ...); the name may change. */
    id: string;
    name: string;
    /** Bar where the button of the group is. */
    side: Side;
    /** Order of the items inside the panel. */
    mode: OrderMode;
    /** Item keys in the order chosen by the user; used only in "manual" mode. */
    order: string[];
    /** Keys of the items of the group. An item belongs to one group at most. */
    items: string[];
    /** Names under the icons of the panel. Off as the standard; it is on only where the user turned it on. */
    labels: boolean;
    /** Columns and rows chosen by the user when resizing the panel; null where nothing was chosen. */
    columns: number | null;
    rows: number | null;
    /** Place of the panel after the user moved it, in rem from the top left of the screen; null while it
     *  opens under the button of the group. */
    pos: { x: number; y: number } | null;
    /** Title bar of the panel (handle, name, quantity, "⋮" and "x"). On as the standard; off only where the
     *  user hid it: the panel then shows the icons alone and its handle sits in a tab outside its left edge. */
    head: boolean;
}

/** Saved layout (ModsData/ToolbarOrganizer/layout.json). Unknown fields are kept untouched. */
export interface Layout {
    v: number;
    left: BarLayout;
    right: BarLayout;
    /** Item key -> name edited by the user, used instead of the official mod name. */
    names: Record<string, string>;
    /** Item key -> bar the user moved it to. An item that is not listed stays on the bar where its mod puts it.
     *  It is kept while the item is inside a group: it tells the bar the item returns to when it leaves. */
    moved: Record<string, Side>;
    groups: GroupLayout[];
}

export const LAYOUT_VERSION = 1;

export function defaultLayout(): Layout {
    return {
        v: LAYOUT_VERSION,
        left: { mode: "az", hidden: false, moreColumns: MORE_COLUMNS_MIN, order: [] },
        right: { mode: "az", hidden: false, moreColumns: MORE_COLUMNS_MIN, order: [] },
        names: {},
        moved: {},
        groups: [],
    };
}

function readMode(value: unknown): OrderMode {
    return value === "za" ? "za" : value === "manual" ? "manual" : "az";
}

/** Reads a list of item keys: only texts, each one once. */
function readOrder(value: unknown): string[] {
    const order: string[] = [];
    if (Array.isArray(value)) {
        for (const key of value) {
            if (typeof key === "string" && key && order.indexOf(key) < 0) {
                order.push(key);
            }
        }
    }
    return order;
}

/** A name as it is kept: without spaces around it and no longer than NAME_MAX. Anything else gives "". */
export function cleanName(value: unknown): string {
    return typeof value === "string" ? value.trim().substring(0, NAME_MAX).trim() : "";
}

/** A group name as it is kept: without spaces around it and no longer than GROUP_NAME_MAX. */
export function cleanGroupName(value: unknown): string {
    return typeof value === "string" ? value.trim().substring(0, GROUP_NAME_MAX).trim() : "";
}

function readCount(value: unknown, most: number): number | null {
    if (typeof value !== "number" || !isFinite(value)) {
        return null;
    }
    return Math.max(1, Math.min(most, Math.round(value)));
}

/** Reads the saved groups: each id once, each item in one group only, no group without a name. */
function readGroups(value: unknown): GroupLayout[] {
    const groups: GroupLayout[] = [];
    const taken: Record<string, boolean> = {};
    if (!Array.isArray(value)) {
        return groups;
    }
    for (const raw of value) {
        if (!isObject(raw) || typeof raw.id !== "string" || !/^g[0-9]+$/.test(raw.id)) {
            continue;
        }
        const name = cleanGroupName(raw.name);
        if (!name || groups.some((group) => group.id === raw.id)) {
            continue;
        }
        const items = readOrder(raw.items)
            .filter((key) => !taken[key])
            .slice(0, GROUP_ITEMS_MAX);
        for (const key of items) {
            taken[key] = true;
        }
        const mode = readMode(raw.mode);
        const pos = isObject(raw.pos) && typeof raw.pos.x === "number" && typeof raw.pos.y === "number" && isFinite(raw.pos.x) && isFinite(raw.pos.y)
            ? { x: raw.pos.x, y: raw.pos.y }
            : null;
        groups.push({
            ...raw,
            id: raw.id,
            name,
            side: raw.side === "right" ? "right" : "left",
            mode,
            order: mode === "manual" ? readOrder(raw.order).filter((key) => items.indexOf(key) >= 0) : [],
            items,
            labels: raw.labels === true,
            columns: readCount(raw.columns, PANEL_COLUMNS_MAX),
            rows: readCount(raw.rows, PANEL_ROWS_MAX),
            pos,
            head: raw.head !== false,
        });
    }
    return groups;
}

function readBar(raw: Record<string, any>): BarLayout {
    const mode = readMode(raw.mode);
    return {
        ...raw,
        mode,
        hidden: raw.hidden === true,
        moreColumns: clampColumns(raw.moreColumns),
        // The list only exists in manual mode; any other mode discards it.
        order: mode === "manual" ? readOrder(raw.order) : [],
    };
}

/** Keeps a number of columns inside the allowed range; anything else gives the standard. */
export function clampColumns(value: unknown): number {
    if (typeof value !== "number" || !isFinite(value)) {
        return MORE_COLUMNS_MIN;
    }
    return Math.max(MORE_COLUMNS_MIN, Math.min(MORE_COLUMNS_MAX, Math.round(value)));
}

function isObject(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the saved layout. Anything missing, broken or from another version falls back to the default. */
export function parseLayout(json: string): Layout {
    if (!json) {
        return defaultLayout();
    }

    try {
        const raw = JSON.parse(json);
        if (!isObject(raw) || raw.v !== LAYOUT_VERSION) {
            return defaultLayout();
        }

        const names: Record<string, string> = {};
        if (isObject(raw.names)) {
            for (const key of Object.keys(raw.names)) {
                const value = cleanName(raw.names[key]);
                if (value) {
                    names[key] = value;
                }
            }
        }

        const moved: Record<string, Side> = {};
        if (isObject(raw.moved)) {
            for (const key of Object.keys(raw.moved)) {
                const value = raw.moved[key];
                if (value === "left" || value === "right") {
                    moved[key] = value;
                }
            }
        }

        return {
            ...raw,
            v: LAYOUT_VERSION,
            left: readBar(isObject(raw.left) ? raw.left : {}),
            right: readBar(isObject(raw.right) ? raw.right : {}),
            names,
            moved,
            groups: readGroups(raw.groups),
        };
    } catch (e) {
        return defaultLayout();
    }
}

export function serializeLayout(layout: Layout): string {
    return JSON.stringify(layout);
}

// -------------------------------------------------------------------------------------------------
// Changes made in the edit mode. Every function returns a new layout and leaves the given one untouched.

export function otherSide(side: Side): Side {
    return side === "left" ? "right" : "left";
}

function setBar(layout: Layout, side: Side, bar: BarLayout): Layout {
    return side === "left" ? { ...layout, left: bar } : { ...layout, right: bar };
}

/** The bar an item is shown on: the one the user moved it to, else the one where its mod puts it ("home"). */
export function barOf(layout: Layout, key: string, home: Side): Side {
    const target = layout.moved[key];
    return target === "left" || target === "right" ? target : home;
}

/** UI module of an item key ("m:Module" or "m:Module#2"); null for an item whose mod was not identified. */
export function moduleOfKey(key: string): string | null {
    if (key.indexOf("m:") !== 0) {
        return null;
    }
    const hash = key.lastIndexOf("#");
    return hash > 2 && /^[0-9]+$/.test(key.substring(hash + 1)) ? key.substring(2, hash) : key.substring(2);
}

/**
 * Drops, from the manual order and from the moved items, the keys of mods that are not installed any more:
 * a removed mod has its place discarded and, if it returns, is treated as a new mod. Nothing is dropped
 * while the list of mods has not arrived.
 */
export function pruneLayout(layout: Layout, index: ModIndexData | null): Layout {
    if (!index) {
        return layout;
    }
    const alive = (key: string) => {
        const owner = moduleOfKey(key);
        return owner === null || index.names.has(owner);
    };
    const moved: Record<string, Side> = {};
    for (const key of Object.keys(layout.moved)) {
        if (alive(key)) {
            moved[key] = layout.moved[key];
        }
    }
    return {
        ...layout,
        left: { ...layout.left, order: layout.left.order.filter(alive) },
        right: { ...layout.right, order: layout.right.order.filter(alive) },
        moved,
        groups: layout.groups.map((group) =>
            group.items.every(alive)
                ? group
                : { ...group, items: group.items.filter(alive), order: group.order.filter(alive) }
        ),
    };
}

/**
 * New manual order of a bar: "visible" is the order just set on the screen; the keys of "old" that are not
 * on the screen now (a button its mod is not showing at the moment) keep their place, each one right after
 * the key it followed before.
 */
export function mergeAbsent(visible: string[], old: string[]): string[] {
    const result = visible.slice();
    let anchor = -1;
    for (const key of old) {
        const at = result.indexOf(key);
        if (at >= 0 && visible.indexOf(key) >= 0) {
            anchor = at;
        } else if (at < 0) {
            anchor++;
            result.splice(anchor, 0, key);
        }
    }
    return result;
}

/** Records the bar of an item and takes it out of the manual order of the bar it leaves. */
function withBar(layout: Layout, key: string, home: Side, from: Side, target: Side): Layout {
    const moved = { ...layout.moved };
    if (target === home) {
        delete moved[key];
    } else {
        moved[key] = target;
    }
    let next: Layout = { ...layout, moved };
    if (from !== target && next[from].mode === "manual") {
        next = setBar(next, from, { ...next[from], order: next[from].order.filter((other) => other !== key) });
    }
    return next;
}

/**
 * Puts an item on a bar at a chosen place; the bar becomes manual. "visible" is the order of that bar as it
 * is on the screen (keys, from the fixed buttons outwards); the item goes right before "beforeKey", or to
 * the end when it is null.
 */
export function placeInBar(
    layout: Layout,
    key: string,
    home: Side,
    target: Side,
    visible: string[],
    beforeKey: string | null
): Layout {
    const from = barOf(layout, key, home);
    const list = visible.filter((other) => other !== key);
    const at = beforeKey === null ? -1 : list.indexOf(beforeKey);
    if (at < 0) {
        list.push(key);
    } else {
        list.splice(at, 0, key);
    }
    const old = layout[target].mode === "manual" ? layout[target].order.filter((other) => other !== key) : [];
    const next = setBar(layout, target, { ...layout[target], mode: "manual", order: mergeAbsent(list, old) });
    return from === target ? next : withBar(next, key, home, from, target);
}

/**
 * Sends an item to a bar without choosing a place: a bar in alphabetical order takes it by its name, a
 * manual bar at its end.
 */
export function moveToBar(layout: Layout, key: string, home: Side, target: Side): Layout {
    const from = barOf(layout, key, home);
    if (from === target) {
        return layout;
    }
    const next = withBar(layout, key, home, from, target);
    if (next[target].mode !== "manual") {
        return next;
    }
    return setBar(next, target, {
        ...next[target],
        order: next[target].order.filter((other) => other !== key).concat(key),
    });
}

/**
 * "Restore" of a bar: its groups are deleted; its own items that are on the other bar or inside a group
 * return to it; the items of the other bar that are on it return to theirs (with two bars, that is every
 * moved item); its order goes back to A-Z and it is expanded. The edited names stay. "homeOf" tells the
 * bar where the mod of an item puts it (null for an item that is not on the screen).
 */
export function restoreBar(layout: Layout, side: Side, homeOf: (key: string) => Side | null): Layout {
    const other = otherSide(side);
    const gone = layout.groups.filter((group) => group.side === side).map((group) => groupKey(group.id));
    const groups = layout.groups
        .filter((group) => group.side !== side)
        .map((group) => {
            const items = group.items.filter((key) => homeOf(key) !== side);
            return items.length === group.items.length
                ? group
                : { ...group, items, order: group.order.filter((key) => items.indexOf(key) >= 0) };
        });
    const next = setBar(layout, side, { ...layout[side], mode: "az", order: [], hidden: false });
    return {
        ...setBar(next, other, {
            ...layout[other],
            order: layout[other].order.filter((key) => layout.moved[key] !== other && gone.indexOf(key) < 0),
        }),
        moved: {},
        groups,
    };
}

// -------------------------------------------------------------------------------------------------
// Groups. Every function returns a new layout and leaves the given one untouched.

const GROUP_KEY = "g:";

/** Key of the button of a group inside the order of a bar. */
export function groupKey(id: string): string {
    return GROUP_KEY + id;
}

/** Id of the group whose button has this key; null when the key is the one of an item. */
export function groupIdOfKey(key: string): string | null {
    return key.indexOf(GROUP_KEY) === 0 ? key.substring(GROUP_KEY.length) : null;
}

export function groupById(layout: Layout, id: string): GroupLayout | null {
    for (const group of layout.groups) {
        if (group.id === id) {
            return group;
        }
    }
    return null;
}

/** The group an item is in; null when it is on a bar. */
export function groupOf(layout: Layout, key: string): GroupLayout | null {
    for (const group of layout.groups) {
        if (group.items.indexOf(key) >= 0) {
            return group;
        }
    }
    return null;
}

/**
 * Why a name cannot be given to a group: "empty", or "taken" when another group already has it (upper and
 * lower case, and accents, do not tell two names apart); null when the name can be used.
 */
export function groupNameProblem(layout: Layout, value: string, exceptId: string | null): "empty" | "taken" | null {
    const name = cleanGroupName(value);
    if (!name) {
        return "empty";
    }
    const folded = fold(name);
    for (const group of layout.groups) {
        if (group.id !== exceptId && fold(group.name) === folded) {
            return "taken";
        }
    }
    return null;
}

function mapGroup(layout: Layout, id: string, change: (group: GroupLayout) => GroupLayout): Layout {
    return { ...layout, groups: layout.groups.map((group) => (group.id === id ? change(group) : group)) };
}

/** Takes a key (item or group button) out of the manual order of both bars. */
function dropFromBars(layout: Layout, key: string): Layout {
    const drop = (bar: BarLayout) =>
        bar.order.indexOf(key) >= 0 ? { ...bar, order: bar.order.filter((other) => other !== key) } : bar;
    return { ...layout, left: drop(layout.left), right: drop(layout.right) };
}

/** Creates an empty group on a bar. The name must have been checked with groupNameProblem. */
export function createGroup(layout: Layout, name: string, side: Side): Layout {
    let number = 1;
    while (groupById(layout, "g" + number)) {
        number++;
    }
    const group: GroupLayout = {
        id: "g" + number,
        name: cleanGroupName(name),
        side,
        mode: "az",
        order: [],
        items: [],
        labels: false,
        columns: null,
        rows: null,
        pos: null,
        head: true,
    };
    const next: Layout = { ...layout, groups: layout.groups.concat(group) };
    return next[side].mode === "manual"
        ? setBar(next, side, { ...next[side], order: withGroupKey(next[side].order, groupKey(group.id), side) })
        : next;
}

/**
 * Manual order of a bar with the button of a group that has just arrived (a new group, or one sent to this
 * bar without choosing a place). The groups stay next to the collapse button, before the icons, and the one
 * that arrives is the last of them as the bar is read from left to right: on the left bar it goes after the
 * groups that open the bar, right before the first icon; on the right bar it goes next to the collapse button.
 * The order is counted from the game's fixed buttons outwards. From there on the user may drag it anywhere.
 */
export function withGroupKey(order: string[], key: string, side: Side): string[] {
    const list = order.filter((other) => other !== key);
    let at = 0;
    if (side === "left") {
        while (at < list.length && groupIdOfKey(list[at]) !== null) {
            at++;
        }
    }
    list.splice(at, 0, key);
    return list;
}

export function renameGroup(layout: Layout, id: string, name: string): Layout {
    return mapGroup(layout, id, (group) => ({ ...group, name: cleanGroupName(name) }));
}

/**
 * Deletes a group. Its items go back to the bars: each one to the bar where it was before entering the
 * group (the one where its mod puts it, or the one the user had moved it to), following the order of that bar.
 */
export function deleteGroup(layout: Layout, id: string): Layout {
    return dropFromBars({ ...layout, groups: layout.groups.filter((group) => group.id !== id) }, groupKey(id));
}

/** Takes an item out of whatever group it is in; it is back on its bar. */
export function leaveGroups(layout: Layout, key: string): Layout {
    if (!groupOf(layout, key)) {
        return layout;
    }
    return {
        ...layout,
        groups: layout.groups.map((group) =>
            group.items.indexOf(key) < 0
                ? group
                : { ...group, items: group.items.filter((other) => other !== key), order: group.order.filter((other) => other !== key) }
        ),
    };
}

/**
 * Puts an item in a group without choosing a place: a group in alphabetical order takes it by its name, a
 * manual one at its end. Returns null when the group is full.
 */
export function addToGroup(layout: Layout, key: string, id: string): Layout | null {
    const group = groupById(layout, id);
    if (!group || group.items.indexOf(key) >= 0) {
        return layout;
    }
    if (group.items.length >= GROUP_ITEMS_MAX) {
        return null;
    }
    const next = dropFromBars(leaveGroups(layout, key), key);
    return mapGroup(next, id, (current) => ({
        ...current,
        items: current.items.concat(key),
        order: current.mode === "manual" ? current.order.concat(key) : [],
    }));
}

/**
 * Puts an item at a chosen place of a group; the group becomes manual. "visible" is the order of the group
 * as it is on the screen; the item goes right before "beforeKey", or to the end when it is null. Returns
 * null when the item is not of the group and the group is full.
 */
export function placeInGroup(layout: Layout, key: string, id: string, visible: string[], beforeKey: string | null): Layout | null {
    const group = groupById(layout, id);
    if (!group) {
        return layout;
    }
    const member = group.items.indexOf(key) >= 0;
    if (!member && group.items.length >= GROUP_ITEMS_MAX) {
        return null;
    }
    const list = visible.filter((other) => other !== key);
    const at = beforeKey === null ? -1 : list.indexOf(beforeKey);
    if (at < 0) {
        list.push(key);
    } else {
        list.splice(at, 0, key);
    }
    const next = member ? layout : dropFromBars(leaveGroups(layout, key), key);
    return mapGroup(next, id, (current) => {
        const items = member ? current.items : current.items.concat(key);
        const old = current.mode === "manual" ? current.order.filter((other) => other !== key) : [];
        return { ...current, items, mode: "manual", order: mergeAbsent(list, old).filter((other) => items.indexOf(other) >= 0) };
    });
}

/** Order of the items of a group. "Manual" starts from the order that is on the screen ("visible"). */
export function setGroupMode(layout: Layout, id: string, mode: OrderMode, visible: string[]): Layout {
    return mapGroup(layout, id, (group) => ({
        ...group,
        mode,
        order: mode === "manual" ? visible.filter((key) => group.items.indexOf(key) >= 0) : [],
    }));
}

/** Names under the icons of the panel, on or off. Each way has its own standard size, so the size chosen
 *  by the user for the other way is dropped. */
export function setGroupLabels(layout: Layout, id: string, labels: boolean): Layout {
    return mapGroup(layout, id, (group) => ({ ...group, labels, columns: null, rows: null }));
}

/** Columns and rows of the panel as left by the user; null and null give the standard size back. */
export function setGroupSize(layout: Layout, id: string, columns: number | null, rows: number | null): Layout {
    return mapGroup(layout, id, (group) => ({ ...group, columns, rows }));
}

/** Place of the panel as left by the user; null puts it back under the button of the group. */
export function setGroupPos(layout: Layout, id: string, pos: { x: number; y: number } | null): Layout {
    return mapGroup(layout, id, (group) => ({ ...group, pos }));
}

export function resetPanelPositions(layout: Layout): Layout {
    return { ...layout, groups: layout.groups.map((group) => (group.pos === null ? group : { ...group, pos: null })) };
}

export function resetPanelSizes(layout: Layout): Layout {
    return {
        ...layout,
        groups: layout.groups.map((group) =>
            group.columns === null && group.rows === null ? group : { ...group, columns: null, rows: null }
        ),
    };
}

/** Title bar of the panel of every group, shown or hidden. */
export function setAllGroupHeads(layout: Layout, head: boolean): Layout {
    return { ...layout, groups: layout.groups.map((group) => (group.head === head ? group : { ...group, head })) };
}

/** Every panel back to its original state: title bar shown, standard size, place under the button of its group. */
export function resetPanels(layout: Layout): Layout {
    return {
        ...layout,
        groups: layout.groups.map((group) =>
            group.head && group.columns === null && group.rows === null && group.pos === null
                ? group
                : { ...group, head: true, columns: null, rows: null, pos: null }
        ),
    };
}

/** Title bar of the panel, shown or hidden. */
export function setGroupHead(layout: Layout, id: string, head: boolean): Layout {
    return mapGroup(layout, id, (group) => ({ ...group, head }));
}

/** Sends the button of a group to a bar without choosing a place: by its name, or with the groups of a
 *  manual bar (see withGroupKey). */
export function moveGroupToBar(layout: Layout, id: string, target: Side): Layout {
    const group = groupById(layout, id);
    if (!group || group.side === target) {
        return layout;
    }
    const key = groupKey(id);
    const next = mapGroup(dropFromBars(layout, key), id, (current) => ({ ...current, side: target }));
    return next[target].mode === "manual"
        ? setBar(next, target, { ...next[target], order: withGroupKey(next[target].order, key, target) })
        : next;
}

/**
 * Puts the button of a group at a chosen place of a bar; the bar becomes manual. "visible" is the order of
 * that bar as it is on the screen; the button goes right before "beforeKey", or to the end when it is null.
 */
export function placeGroupInBar(layout: Layout, id: string, target: Side, visible: string[], beforeKey: string | null): Layout {
    const key = groupKey(id);
    const list = visible.filter((other) => other !== key);
    const at = beforeKey === null ? -1 : list.indexOf(beforeKey);
    if (at < 0) {
        list.push(key);
    } else {
        list.splice(at, 0, key);
    }
    const old = layout[target].mode === "manual" ? layout[target].order.filter((other) => other !== key) : [];
    const cleared = dropFromBars(layout, key);
    const next = setBar(cleared, target, { ...cleared[target], mode: "manual", order: mergeAbsent(list, old) });
    return mapGroup(next, id, (current) => ({ ...current, side: target }));
}

/** Sets the name of an item. An empty name, or the official one, removes the edited name. */
export function withName(layout: Layout, key: string, value: string, official: string | null): Layout {
    const name = cleanName(value);
    const names = { ...layout.names };
    if (!name || name === official) {
        delete names[key];
    } else {
        names[key] = name;
    }
    return { ...layout, names };
}

/** Mods that add something to the top toolbars, as sent by the C# part. */
export interface ModIndexData {
    /** UI module name -> official mod name. */
    names: Map<string, string>;
    /** Image path relative to the mod folder (lower case) -> UI module names that have that file. */
    byPath: Map<string, string[]>;
}

export function parseModIndex(json: string): ModIndexData | null {
    if (!json) {
        return null;
    }

    try {
        const raw = JSON.parse(json);
        const names = new Map<string, string>();
        const byPath = new Map<string, string[]>();
        const mods = isObject(raw) && Array.isArray(raw.mods) ? raw.mods : [];

        for (const mod of mods) {
            if (!isObject(mod) || typeof mod.m !== "string" || !mod.m) {
                continue;
            }

            names.set(mod.m, typeof mod.n === "string" && mod.n ? mod.n : mod.m);

            const files = Array.isArray(mod.f) ? mod.f : [];
            for (const file of files) {
                if (typeof file !== "string") {
                    continue;
                }

                const owners = byPath.get(file);
                if (owners) {
                    if (owners.indexOf(mod.m) < 0) {
                        owners.push(mod.m);
                    }
                } else {
                    byPath.set(file, [mod.m]);
                }
            }
        }

        return { names, byPath };
    } catch (e) {
        return { names: new Map(), byPath: new Map() };
    }
}

/** Probe id (a piece of component source code) -> UI module names whose file contains it. */
export type ProbeIndex = Map<string, string[]>;

export function parseProbeIndex(json: string): ProbeIndex {
    const result: ProbeIndex = new Map();
    if (!json) {
        return result;
    }

    try {
        const raw = JSON.parse(json);
        if (isObject(raw)) {
            for (const id of Object.keys(raw)) {
                const owners = raw[id];
                if (Array.isArray(owners)) {
                    result.set(id, owners.filter((owner) => typeof owner === "string"));
                }
            }
        }
    } catch (e) {
        // An unreadable answer leaves the probes unanswered.
    }

    return result;
}

function fold(text: string): string {
    let folded = text.toLowerCase();
    try {
        folded = folded.normalize("NFD").replace(/[̀-ͯ]/g, "");
    } catch (e) {
        // normalize() is optional in the game UI engine; lower case alone still gives a usable order.
    }
    return folded;
}

/** Alphabetical comparison that ignores case and accents; equal names keep a stable order by key. */
export function compareNames(aName: string, aKey: string, bName: string, bKey: string): number {
    const a = fold(aName);
    const b = fold(bName);
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
}
