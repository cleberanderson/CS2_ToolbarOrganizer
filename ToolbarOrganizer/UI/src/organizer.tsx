// The mod's own elements in the left toolbar: the mod button and its menu.
// Stage 1: order of each bar (A-Z / Z-A), reorder shortcut and full reset.

import { Component, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useValue } from "cs2/api";
import { useLocalization } from "cs2/l10n";
import { Tooltip } from "cs2/ui";
import { enabled$, layout$, log, modIndex$, probeIndex$, requestModIndex, resetAll, saveLayout } from "./bindings";
import { EMPTY_STATS, Engine, EngineStats } from "./engine";
import { OrderMode, parseLayout, parseModIndex, parseProbeIndex, serializeLayout, Side, TEXT_PREFIX } from "./model";
import icon from "./images/ToolbarOrganizer_34x34.png";
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
    const engineRef = useRef<Engine | null>(null);

    const [stats, setStats] = useState<EngineStats>(EMPTY_STATS);
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const text = useCallback(
        (key: string, fallback: string) => translate(TEXT_PREFIX + "[" + key + "]", fallback) || fallback,
        [translate]
    );

    // The engine lives while the mod is enabled; stopping it puts every button back.
    useEffect(() => {
        if (!rootRef.current || !tipRef.current || !overlaysRef.current) {
            log("ERROR the mod's own elements were not created; nothing is arranged");
            return;
        }

        const engine = new Engine(rootRef.current, tipRef.current, overlaysRef.current, styles.generic, setStats);
        engineRef.current = engine;
        engine.start();
        requestModIndex();

        return () => {
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

    const toggle = () => {
        log("Menu " + (open ? "closed" : "opened") + " by the mod button");
        setOpen(!open);
        setConfirming(false);
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
                <div className={styles.menu}>
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
                                <div
                                    className={classes(styles.button, styles.danger, styles.last)}
                                    onClick={() => askReset(true)}
                                >
                                    {text("RestoreAll", "Restore everything (full reset)")}
                                </div>
                            </div>
                        )}
                        {confirming && (
                            <div className={styles.confirm}>
                                <div className={styles.confirmText}>
                                    {text("RestoreAllConfirm", "This erases the order, the edited names and every customization. Continue?")}
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

            <div ref={overlaysRef} className={styles.overlays} />
            <div ref={tipRef} className={styles.tip} />
        </div>
    );
};
