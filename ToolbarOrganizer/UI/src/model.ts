// Data shared by the UI parts: binding names, the saved layout and the indexes sent by the C# part.

/** Binding group; must match Mod.kId on the C# side. */
export const GROUP = "ToolbarOrganizer";

/** Prefix of the text keys registered by the C# part (Locale/LocaleSource.cs). */
export const TEXT_PREFIX = "ToolbarOrganizer.UI";

export type Side = "left" | "right";

/** Order of the icons of a bar. "manual" arrives with the edit mode (stage 3). */
export type OrderMode = "az" | "za";

export interface BarLayout {
    mode: OrderMode;
}

/** Saved layout (ModsData/ToolbarOrganizer/layout.json). Unknown fields are kept untouched. */
export interface Layout {
    v: number;
    left: BarLayout;
    right: BarLayout;
    /** Item key -> name edited by the user, used instead of the official mod name. */
    names: Record<string, string>;
}

export const LAYOUT_VERSION = 1;

export function defaultLayout(): Layout {
    return { v: LAYOUT_VERSION, left: { mode: "az" }, right: { mode: "az" }, names: {} };
}

function readMode(value: unknown): OrderMode {
    return value === "za" ? "za" : "az";
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
                const value = raw.names[key];
                if (typeof value === "string" && value.trim()) {
                    names[key] = value.trim();
                }
            }
        }

        const left = isObject(raw.left) ? raw.left : {};
        const right = isObject(raw.right) ? raw.right : {};

        return {
            ...raw,
            v: LAYOUT_VERSION,
            left: { ...left, mode: readMode(left.mode) },
            right: { ...right, mode: readMode(right.mode) },
            names,
        };
    } catch (e) {
        return defaultLayout();
    }
}

export function serializeLayout(layout: Layout): string {
    return JSON.stringify(layout);
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
