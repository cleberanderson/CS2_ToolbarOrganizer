// Values and commands exchanged with the C# part (Systems/ToolbarOrganizerUISystem.cs).

import { bindValue, trigger } from "cs2/api";
import { GROUP } from "./model";

/** Master switch from the options page. False until the user turns the mod on. */
export const enabled$ = bindValue<boolean>(GROUP, "enabled", false);

/** Saved layout as JSON; empty when nothing was saved. */
export const layout$ = bindValue<string>(GROUP, "layout", "");

/** Mods that use the top toolbars, as JSON; empty until the C# part finishes building it. */
export const modIndex$ = bindValue<string>(GROUP, "modIndex", "");

/** Probe id -> UI module names, as JSON. */
export const probeIndex$ = bindValue<string>(GROUP, "probeIndex", "");

/** Name of the address registered by the C# part for the images of the mod ("coui://<name>/"); empty when
 *  none was registered, and the address shared by all the mods is used. */
export const imagesHost$ = bindValue<string>(GROUP, "imagesHost", "");

export function saveLayout(json: string): void {
    trigger(GROUP, "saveLayout", json);
}

export function resetAll(): void {
    trigger(GROUP, "resetAll");
}

export function requestModIndex(): void {
    trigger(GROUP, "requestModIndex");
}

/** Asks the C# part which mod contains this piece of component source code. */
export function resolveProbe(id: string, text: string): void {
    trigger(GROUP, "resolveProbe", id, text);
}

/** Writes a line to the complete log (Logs/ToolbarOrganizer.Full.log). */
export function log(message: string): void {
    trigger(GROUP, "log", message);
}
