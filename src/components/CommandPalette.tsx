import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { Command } from "cmdk";
import { useCommandRegistry } from "@/contexts/CommandRegistryContext";
import type { CommandAction } from "@/contexts/CommandRegistryContext";
import { formatKeybind, KEYBINDS, isEditableElement, matchesKeybind } from "@/utils/ui/keybinds";
import { getSlashCommandSuggestions } from "@/utils/slashCommands/suggestions";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 2000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
`;

const PaletteContainer = styled(Command)`
  width: min(720px, 92vw);
  background: #1f1f1f;
  border: 1px solid #333;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  color: #e5e5e5;
  font-family: var(--font-primary);
  overflow: hidden;
` as unknown as typeof Command;

const PaletteInput = styled(Command.Input)`
  width: 100%;
  padding: 12px 14px;
  background: #161616;
  color: #e5e5e5;
  border: none;
  outline: none;
  font-size: 14px;
  border-bottom: 1px solid #2a2a2a;
` as unknown as typeof Command.Input;

const Empty = styled.div`
  padding: 16px;
  color: #7a7a7a;
  font-size: 13px;
`;

const List = styled(Command.List)`
  max-height: 420px;
  overflow: auto;
` as unknown as typeof Command.List;

const Group = styled(Command.Group)`
  &[cmdk-group] {
    padding: 8px 6px;
  }
  &[cmdk-group-heading] {
    padding: 4px 10px;
    color: #9a9a9a;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
` as unknown as typeof Command.Group;

const Item = styled(Command.Item)`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
  margin: 2px 4px;
  &:hover {
    background: #2a2a2a;
  }
  &[aria-selected="true"] {
    background: #2f2f2f;
  }
` as unknown as typeof Command.Item;

const Subtitle = styled.span`
  color: #9a9a9a;
  font-size: 12px;
`;

const ShortcutHint = styled.span`
  color: #9a9a9a;
  font-size: 11px;
  font-family: var(--font-monospace);
`;

interface CommandPaletteProps {
  getSlashContext?: () => { providerNames: string[]; workspaceId?: string };
}

type PromptDef = NonNullable<NonNullable<CommandAction["prompt"]>>;
type PromptField = PromptDef["fields"][number];

interface PromptPaletteItem {
  id: string;
  title: string;
  section: string;
  keywords?: string[];
  subtitle?: string;
  shortcutHint?: string;
  run: () => void;
}

type PaletteItem = CommandAction | PromptPaletteItem;

interface PaletteGroup {
  name: string;
  items: PaletteItem[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ getSlashContext }) => {
  const { isOpen, close, getActions, addRecent, recent } = useCommandRegistry();
  const [query, setQuery] = useState("");
  const [activePrompt, setActivePrompt] = useState<null | {
    title?: string;
    fields: PromptDef["fields"];
    onSubmit: PromptDef["onSubmit"];
    idx: number;
    values: Record<string, string>;
  }>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  // Close palette with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchesKeybind(e, KEYBINDS.CANCEL) && isOpen) {
        e.preventDefault();
        setActivePrompt(null);
        setPromptError(null);
        setQuery("");
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Reset state whenever palette visibility changes
  useEffect(() => {
    if (!isOpen) {
      setActivePrompt(null);
      setPromptError(null);
      setQuery("");
    } else {
      setPromptError(null);
      setQuery("");
    }
  }, [isOpen]);

  const rawActions = getActions();

  const recentIndex = useMemo(() => {
    const idx = new Map<string, number>();
    recent.forEach((id, i) => idx.set(id, i));
    return idx;
  }, [recent]);

  const startPrompt = useCallback((action: CommandAction) => {
    if (!action.prompt) return;
    setPromptError(null);
    setQuery("");
    setActivePrompt({
      title: action.prompt.title ?? action.title,
      fields: action.prompt.fields,
      onSubmit: action.prompt.onSubmit,
      idx: 0,
      values: {},
    });
  }, []);

  const handlePromptValue = useCallback(
    (value: string) => {
      let nextInitial: string | null = null;
      setPromptError(null);
      setActivePrompt((current) => {
        if (!current) return current;
        const field = current.fields[current.idx];
        if (!field) return current;
        const nextValues = { ...current.values, [field.name]: value };
        const nextIdx = current.idx + 1;
        if (nextIdx < current.fields.length) {
          const nextField = current.fields[nextIdx];
          if (nextField.type === "text") {
            nextInitial = nextField.getInitialValue?.(nextValues) ?? nextField.initialValue ?? "";
          } else {
            nextInitial = "";
          }
          return {
            ...current,
            idx: nextIdx,
            values: nextValues,
          };
        }
        const submit = current.onSubmit;
        setTimeout(() => void submit(nextValues), 0);
        close();
        setQuery("");
        return null;
      });
      if (nextInitial !== null) {
        const valueToSet = nextInitial;
        setTimeout(() => setQuery(valueToSet), 0);
      }
    },
    [close]
  );

  const handlePromptTextSubmit = useCallback(() => {
    if (!activePrompt) return;
    const field = activePrompt.fields[activePrompt.idx];
    if (!field || field.type !== "text") return;
    const trimmed = query.trim();
    const err = field.validate?.(trimmed) ?? null;
    if (err) {
      setPromptError(err);
      return;
    }
    handlePromptValue(trimmed);
  }, [activePrompt, query, handlePromptValue]);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (activePrompt) {
        setPromptError(null);
      }
    },
    [activePrompt]
  );

  const generalResults = useMemo(() => {
    const q = query.trim();

    if (q.startsWith("/")) {
      const ctx = getSlashContext?.() ?? { providerNames: [] };
      const suggestions = getSlashCommandSuggestions(q, { providerNames: ctx.providerNames });
      const section = "Slash Commands";
      const groups: PaletteGroup[] = [
        {
          name: section,
          items: suggestions.map((s) => ({
            id: `slash:${s.id}`,
            title: s.display,
            subtitle: s.description,
            section,
            shortcutHint: `${formatKeybind(KEYBINDS.SEND_MESSAGE)} to insert`,
            run: () => {
              const text = s.replacement;
              window.dispatchEvent(new CustomEvent("cmux:insertToChatInput", { detail: { text } }));
            },
          })),
        },
      ];
      return {
        groups,
        emptyText: suggestions.length ? undefined : "No command suggestions",
      } satisfies { groups: PaletteGroup[]; emptyText: string | undefined };
    }

    const filtered = [...rawActions].sort((a, b) => {
      const ai = recentIndex.has(a.id) ? recentIndex.get(a.id)! : 9999;
      const bi = recentIndex.has(b.id) ? recentIndex.get(b.id)! : 9999;
      if (ai !== bi) return ai - bi;
      return a.title.localeCompare(b.title);
    });

    const bySection = new Map<string, CommandAction[]>();
    for (const action of filtered) {
      const sec = action.section || "Other";
      const list = bySection.get(sec) ?? [];
      list.push(action);
      bySection.set(sec, list);
    }

    const groups: PaletteGroup[] = Array.from(bySection.entries()).map(([name, items]) => ({
      name,
      items,
    }));

    return {
      groups,
      emptyText: filtered.length ? undefined : "No results",
    } satisfies { groups: PaletteGroup[]; emptyText: string | undefined };
  }, [query, rawActions, recentIndex, getSlashContext]);

  useEffect(() => {
    if (!activePrompt) return;
    const field = activePrompt.fields[activePrompt.idx];
    if (!field) return;
    if (field.type === "text") {
      const initial = field.getInitialValue?.(activePrompt.values) ?? field.initialValue ?? "";
      setQuery(initial);
    } else {
      setQuery("");
    }
  }, [activePrompt]);

  const currentField: PromptField | null = activePrompt
    ? (activePrompt.fields[activePrompt.idx] ?? null)
    : null;
  const isSlashQuery = !currentField && query.trim().startsWith("/");
  const shouldUseCmdkFilter = currentField ? currentField.type === "select" : !isSlashQuery;

  let groups: PaletteGroup[] = generalResults.groups;
  let emptyText: string | undefined = generalResults.emptyText;

  if (currentField) {
    const promptTitle = activePrompt?.title ?? currentField.label ?? "Provide details";
    if (currentField.type === "select") {
      const options = currentField.getOptions(activePrompt?.values ?? {});
      groups = [
        {
          name: promptTitle,
          items: options.map((opt) => ({
            id: `prompt-select:${currentField.name}:${opt.id}`,
            title: opt.label,
            section: promptTitle,
            keywords: opt.keywords,
            run: () => handlePromptValue(opt.id),
          })),
        },
      ];
      emptyText = options.length ? undefined : "No options";
    } else {
      const typed = query.trim();
      const fallbackHint = currentField.placeholder ?? "Type value and press Enter";
      const hint =
        promptError ?? (typed.length > 0 ? `Press Enter to use “${typed}”` : fallbackHint);
      groups = [
        {
          name: promptTitle,
          items: [
            {
              id: `prompt-text:${currentField.name}`,
              title: hint,
              section: promptTitle,
              run: handlePromptTextSubmit,
            },
          ],
        },
      ];
      emptyText = undefined;
    }
  }

  if (!isOpen) return null;

  const groupsWithItems = groups.filter((group) => group.items.length > 0);
  const hasAnyItems = groupsWithItems.length > 0;

  return (
    <Overlay
      onMouseDown={() => {
        setActivePrompt(null);
        setPromptError(null);
        setQuery("");
        close();
      }}
    >
      <PaletteContainer
        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        shouldFilter={shouldUseCmdkFilter}
      >
        <PaletteInput
          value={query}
          onValueChange={handleQueryChange}
          placeholder={
            currentField
              ? currentField.type === "text"
                ? (currentField.placeholder ?? "Type value…")
                : (currentField.placeholder ?? "Search options…")
              : `Type a command… (${formatKeybind(KEYBINDS.CANCEL)} to close, ${formatKeybind(KEYBINDS.SEND_MESSAGE)} to send in chat)`
          }
          autoFocus
          onKeyDown={(e: React.KeyboardEvent) => {
            if (!currentField && isEditableElement(e.target)) return;

            if (currentField) {
              if (e.key === "Enter" && currentField.type === "text") {
                e.preventDefault();
                e.stopPropagation();
                handlePromptTextSubmit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setActivePrompt(null);
                setPromptError(null);
                setQuery("");
                close();
              }
              return;
            }
          }}
        />
        <List>
          {groupsWithItems.map((group) => (
            <Group key={group.name} heading={group.name}>
              {group.items.map((item) => (
                <Item
                  key={item.id}
                  onSelect={() => {
                    if ("prompt" in item && item.prompt) {
                      addRecent(item.id);
                      startPrompt(item);
                      return;
                    }

                    if (currentField) {
                      void item.run();
                      return;
                    }

                    addRecent(item.id);
                    close();
                    setTimeout(() => {
                      void item.run();
                    }, 0);
                  }}
                >
                  <div>
                    {item.title}
                    {"subtitle" in item && item.subtitle && (
                      <>
                        <br />
                        <Subtitle>{item.subtitle}</Subtitle>
                      </>
                    )}
                  </div>
                  {"shortcutHint" in item && item.shortcutHint && (
                    <ShortcutHint>{item.shortcutHint}</ShortcutHint>
                  )}
                </Item>
              ))}
            </Group>
          ))}
          {!hasAnyItems && <Empty>{emptyText ?? "No results"}</Empty>}
        </List>
      </PaletteContainer>
    </Overlay>
  );
};
