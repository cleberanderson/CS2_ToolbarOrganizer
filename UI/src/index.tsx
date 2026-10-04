import { ModRegistrar } from "cs2/modding";
import { Organizer } from "./organizer";

// The mod has a single button, in the left toolbar. From there it also arranges the right toolbar.
const register: ModRegistrar = (moduleRegistry) => {
    moduleRegistry.append("GameTopLeft", Organizer);
};

export default register;
