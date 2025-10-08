"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRegistryProvider = void 0;
exports.useCommandRegistry = useCommandRegistry;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const CommandRegistryContext = (0, react_1.createContext)(null);
function useCommandRegistry() {
    const ctx = (0, react_1.useContext)(CommandRegistryContext);
    if (!ctx)
        throw new Error("useCommandRegistry must be used within CommandRegistryProvider");
    return ctx;
}
const RECENT_STORAGE_KEY = "commandPalette:recent";
const CommandRegistryProvider = ({ children }) => {
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    const [sources, setSources] = (0, react_1.useState)(new Set());
    const [recent, setRecent] = (0, react_1.useState)(() => {
        try {
            const raw = localStorage.getItem(RECENT_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
        }
        catch {
            return [];
        }
    });
    const persistRecent = (0, react_1.useCallback)((next) => {
        setRecent(next);
        try {
            localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next.slice(0, 20)));
        }
        catch {
            /* ignore persistence errors */
        }
    }, []);
    const addRecent = (0, react_1.useCallback)((actionId) => {
        // Move to front, dedupe
        const next = [actionId, ...recent.filter((id) => id !== actionId)].slice(0, 20);
        persistRecent(next);
    }, [recent, persistRecent]);
    const open = (0, react_1.useCallback)(() => setIsOpen(true), []);
    const close = (0, react_1.useCallback)(() => setIsOpen(false), []);
    const toggle = (0, react_1.useCallback)(() => setIsOpen((v) => !v), []);
    const registerSource = (0, react_1.useCallback)((source) => {
        setSources((prev) => new Set(prev).add(source));
        return () => setSources((prev) => {
            const copy = new Set(prev);
            copy.delete(source);
            return copy;
        });
    }, []);
    const getActions = (0, react_1.useCallback)(() => {
        const all = [];
        for (const s of sources) {
            try {
                const actions = s();
                for (const a of actions) {
                    if (a.visible && !a.visible())
                        continue;
                    all.push(a);
                }
            }
            catch (e) {
                console.error("Command source error:", e);
            }
        }
        return all;
    }, [sources]);
    const value = (0, react_1.useMemo)(() => ({ isOpen, open, close, toggle, registerSource, getActions, addRecent, recent }), [isOpen, open, close, toggle, registerSource, getActions, addRecent, recent]);
    return ((0, jsx_runtime_1.jsx)(CommandRegistryContext.Provider, { value: value, children: children }));
};
exports.CommandRegistryProvider = CommandRegistryProvider;
//# sourceMappingURL=CommandRegistryContext.js.map