// Reads what a toolbar button exposes (component code, icon, tooltip) so it can be linked to its mod.
// Nothing here changes the page.

const MAX_DESCENDANTS = 40;
const MAX_CHAIN = 120;
const URL_IN_STYLE = /url\(\s*["']?([^"')]+)["']?\s*\)/;
const UI_MODS_URL = /^coui:\/\/ui-mods\/([^?#]+)/i;

/** Name the game gives to the components that hold what mods add to a place of the UI. */
const HOOK_NAME = "ModdingHook";

function descendants(el: Element): Element[] {
    const all = el.querySelectorAll("*");
    const result: Element[] = [];
    for (let i = 0; i < all.length && i < MAX_DESCENDANTS; i++) {
        result.push(all[i]);
    }
    return result;
}

function urlFromStyleValue(value: unknown): string | null {
    if (typeof value !== "string" || value.indexOf("url(") < 0) {
        return null;
    }
    const match = URL_IN_STYLE.exec(value);
    return match ? match[1] : null;
}

/** Image addresses used by the element: <img> sources and background or mask images set inline. */
export function iconUrls(el: Element): string[] {
    const urls: string[] = [];
    const elements = [el, ...descendants(el)];

    for (const node of elements) {
        if (node.tagName === "IMG") {
            const src = node.getAttribute("src");
            if (src) {
                urls.push(src);
            }
        }

        const style = (node as HTMLElement).style as any;
        if (style) {
            for (const prop of ["backgroundImage", "maskImage", "webkitMaskImage"]) {
                const url = urlFromStyleValue(style[prop]);
                if (url) {
                    urls.push(url);
                }
            }
        }
    }

    return urls;
}

/**
 * Path of an image inside a mod folder (lower case), or null when the address does not point to the
 * shared mods location. Icons taken from the game or from an icon library do not identify a mod.
 */
export function modImagePath(url: string): string | null {
    const match = UI_MODS_URL.exec(url);
    if (!match) {
        return null;
    }

    let path = match[1];
    try {
        path = decodeURIComponent(path);
    } catch (e) {
        // Keep the raw path.
    }
    return path.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

/** Short label for a button whose mod could not be found: the file name of its icon, or "?". */
export function iconLabel(el: Element): string {
    for (const url of iconUrls(el)) {
        if (url.indexOf("data:") === 0) {
            continue;
        }
        const clean = url.split(/[?#]/)[0];
        const parts = clean.split("/");
        const name = parts[parts.length - 1];
        if (name) {
            return name.toLowerCase();
        }
    }
    return "?";
}

// -------------------------------------------------------------------------------------------------
// Components behind an element (internal data kept by the UI library on each element)

function fiberOf(el: Element): any {
    try {
        for (const key of Object.keys(el)) {
            if (key.indexOf("__reactFiber$") === 0 || key.indexOf("__reactInternalInstance$") === 0) {
                return (el as any)[key];
            }
        }
    } catch (e) {
        // No access to the internal data.
    }
    return null;
}

/** The function behind a component type, also when it is wrapped (memo, forwardRef). */
function functionOf(type: any): Function | null {
    for (let depth = 0; type && depth < 4; depth++) {
        if (typeof type === "function") {
            return type;
        }
        if (typeof type !== "object") {
            return null;
        }
        type = type.type || type.render;
    }
    return null;
}

function typeName(type: any): string {
    if (!type) {
        return "";
    }
    if (typeof type === "string") {
        return type;
    }
    if (type.displayName) {
        return String(type.displayName);
    }
    const fn = functionOf(type);
    return fn ? String((fn as any).displayName || fn.name || "") : "";
}

/** True for the game components that hold what mods add; everything above them is not part of a mod. */
function isHook(fiber: any): boolean {
    return typeName(fiber.type).indexOf(HOOK_NAME) >= 0;
}

export interface ComponentChain {
    /** Source code of each component function, from the one nearest to the game's hook down to the button. */
    sources: string[];
    /** False when the game's hook was not found above the button (unexpected structure). */
    hookFound: boolean;
    /** Number of levels between the button and the hook. */
    depth: number;
}

/**
 * Source code of the components that draw a button. The first ones belong to the game (shared by every
 * button); the first one found inside a mod's UI module tells which mod the button belongs to.
 */
export function componentChain(button: Element): ComponentChain {
    const sources: string[] = [];
    let fiber = fiberOf(button);
    let depth = 0;
    let hookFound = false;

    for (; fiber && depth < MAX_CHAIN; depth++, fiber = fiber.return) {
        if (isHook(fiber)) {
            hookFound = true;
            break;
        }

        const fn = functionOf(fiber.type);
        if (!fn) {
            continue;
        }

        let source = "";
        try {
            source = Function.prototype.toString.call(fn);
        } catch (e) {
            source = "";
        }
        if (source && source.indexOf("[native code]") < 0 && sources.indexOf(source) < 0) {
            sources.push(source);
        }
    }

    sources.reverse();
    return { sources, hookFound, depth };
}

// -------------------------------------------------------------------------------------------------
// Tooltip

function filled(value: unknown): boolean {
    return value !== undefined && value !== null && value !== false && value !== "";
}

export interface TooltipInfo {
    /**
     * component: the button is wrapped by a component that receives a "tooltip"; whether that component
     * is the game's own one (which always shows) or one made by a mod is decided by the caller, from
     * its source code. open: nothing wraps the button. unknown: the internal data could not be read.
     */
    state: "component" | "open" | "unknown";
    /** Where the tooltip component was found, for the log. */
    where: string;
    /** Source code of the tooltip component. */
    source: string;
}

/**
 * Finds the component with a "tooltip" property between the button and the game's hook. Properties with
 * similar names ("tooltipLabel", "title") do not show anything on the screen and are not considered.
 */
export function tooltipInfo(button: Element): TooltipInfo {
    let fiber = fiberOf(button);
    if (!fiber) {
        return { state: "unknown", where: "no internal data", source: "" };
    }

    for (let depth = 0; fiber && depth < MAX_CHAIN; depth++, fiber = fiber.return) {
        if (isHook(fiber)) {
            break;
        }
        const props = fiber.memoizedProps;
        if (props && typeof props === "object" && filled(props.tooltip)) {
            const fn = functionOf(fiber.type);
            let source = "";
            if (fn) {
                try {
                    source = Function.prototype.toString.call(fn);
                } catch (e) {
                    source = "";
                }
            }
            return { state: "component", where: depth + " levels above the button", source };
        }
    }

    return { state: "open", where: "", source: "" };
}

/**
 * The element that works as the button of an item: the item itself when it is a button, the first
 * button inside it, or, when the mod draws its button with another kind of element, the first part of
 * the item that has the standard size. Otherwise the item itself.
 */
export function findButton(item: HTMLElement, standard: number): HTMLElement {
    if (item.tagName === "BUTTON") {
        return item;
    }

    const inner = item.querySelector("button");
    if (inner) {
        return inner as HTMLElement;
    }

    const tolerance = standard * 0.05;
    for (const node of descendants(item)) {
        const rect = node.getBoundingClientRect();
        if (Math.abs(rect.width - standard) <= tolerance && Math.abs(rect.height - standard) <= tolerance) {
            return node as HTMLElement;
        }
    }

    return item;
}

/** False when the element is fully transparent (a tooltip being prepared, not yet shown). */
export function isOpaque(el: Element): boolean {
    if (typeof window.getComputedStyle !== "function") {
        return true;
    }
    try {
        const style = window.getComputedStyle(el);
        const opacity = style ? parseFloat(style.opacity) : NaN;
        return isNaN(opacity) || opacity > 0.05;
    } catch (e) {
        return true;
    }
}

/**
 * Parts of an item that are drawn outside its button: a tooltip made by the mod itself, shown by a
 * style rule or by the mod's own code, sticks out of the button this way.
 */
export function stickingOut(item: Element, button: Element, tolerance: number): Element[] {
    const box = button.getBoundingClientRect();
    const result: Element[] = [];
    for (const node of descendants(item)) {
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) {
            continue;
        }
        if (
            rect.bottom > box.bottom + tolerance ||
            rect.top < box.top - tolerance ||
            rect.right > box.right + tolerance ||
            rect.left < box.left - tolerance
        ) {
            result.push(node);
        }
    }
    return result;
}

// -------------------------------------------------------------------------------------------------
// Visual content and position

export type VisualState = "yes" | "no" | "unknown";

/**
 * Tells whether the button shows anything (image, drawing or text). Icons set by a style sheet can only
 * be seen through the computed style; when that is not available the answer is "unknown".
 */
export function visualState(button: Element): VisualState {
    if (iconUrls(button).length > 0) {
        return "yes";
    }
    if ((button.textContent || "").trim().length > 0) {
        return "yes";
    }
    if (button.querySelector("svg, img, canvas")) {
        return "yes";
    }

    if (typeof window.getComputedStyle !== "function") {
        return "unknown";
    }

    try {
        for (const node of [button, ...descendants(button)]) {
            const style = window.getComputedStyle(node) as any;
            if (!style) {
                return "unknown";
            }
            // Both properties must be readable; a missing one means an icon could be there unseen.
            if (typeof style.backgroundImage !== "string" || typeof style.maskImage !== "string") {
                return "unknown";
            }
            for (const prop of ["backgroundImage", "maskImage", "webkitMaskImage"]) {
                const value = style[prop];
                if (typeof value === "string" && value.indexOf("url(") >= 0) {
                    return "yes";
                }
            }
        }
    } catch (e) {
        return "unknown";
    }

    return "no";
}

/** "absolute", "fixed", "static"... or null when the computed style is not available. */
export function computedPosition(el: Element): string | null {
    if (typeof window.getComputedStyle !== "function") {
        return null;
    }
    try {
        const style = window.getComputedStyle(el);
        return style && typeof style.position === "string" && style.position ? style.position : null;
    } catch (e) {
        return null;
    }
}

/** One-line description of an element for the log. */
export function describe(el: Element): string {
    const id = el.id ? "#" + el.id : "";
    const cls = (el.getAttribute("class") || "").trim();
    return "<" + el.tagName.toLowerCase() + id + (cls ? ' class="' + cls.substring(0, 80) + '"' : "") + ">";
}
