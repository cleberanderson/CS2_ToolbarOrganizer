// Data shared by the UI parts: binding names, the saved layout and the indexes sent by the C# part.

/** Binding group; must match Mod.kId on the C# side. */
export const GROUP = "ToolbarOrganizer";

/** Prefix of the text keys registered by the C# part (Locale/LocaleSource.cs). */
export const TEXT_PREFIX = "ToolbarOrganizer.UI";

export type Side = "left" | "right";

/** Order of the icons of a bar. "manual" is the order left by the user when dragging icons in the edit mode. */
export type OrderMode = "az" | "za" | "manual";

/** Longest name the user may give to an item, in characters. */
export const NAME_MAX = 64;

/** Columns of the panel opened by the "+" button of a bar: the standard, which is also the least, and the most. */
export const MORE_COLUMNS_MIN = 3;
export const MORE_COLUMNS_MAX = 10;

export interface BarLayout {
    mode: OrderMode;
    /** True while the bar is collapsed: its buttons are hidden, the collapse button stays. */
    hidden: boolean;
    /** Columns of the panel of the "+" button, as left by the user when dragging its edge. */
    moreColumns: number;
    /** Item keys in the order chosen by the user, from the game's fixed buttons outwards. Used only in
     *  "manual" mode; an item of the bar that is not listed goes after the listed ones. */
    order: string[];
}

/** Saved layout (ModsData/ToolbarOrganizer/layout.json). Unknown fields are kept untouched. */
export interface Layout {
    v: number;
    left: BarLayout;
    right: BarLayout;
    /** Item key -> name edited by the user, used instead of the official mod name. */
    names: Record<string, string>;
    /** Item key -> bar the user moved it to. An item that is not listed stays on the bar where its mod puts it. */
    moved: Record<string, Side>;
}

export const LAYOUT_VERSION = 1;

export function defaultLayout(): Layout {
    return {
        v: LAYOUT_VERSION,
        left: { mode: "az", hidden: false, moreColumns: MORE_COLUMNS_MIN, order: [] },
        right: { mode: "az", hidden: false, moreColumns: MORE_COLUMNS_MIN, order: [] },
        names: {},
        moved: {},
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
 * "Restore" of a bar: its own items that are on the other bar return to it, the items of the other bar
 * that are on it return to theirs (with two bars, that is every moved item), its order goes back to A-Z
 * and it is expanded. The edited names stay.
 */
export function restoreBar(layout: Layout, side: Side): Layout {
    const other = otherSide(side);
    const next = setBar(layout, side, { ...layout[side], mode: "az", order: [], hidden: false });
    return {
        ...setBar(next, other, {
            ...layout[other],
            order: layout[other].order.filter((key) => layout.moved[key] !== other),
        }),
        moved: {},
    };
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
