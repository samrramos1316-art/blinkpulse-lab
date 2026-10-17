import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef {
  id: string;
  label: string;
  render: () => ReactNode;
}

/**
 * WAI-ARIA tabs: Left/Right/Home/End move between tabs (roving tabindex);
 * only the selected panel is rendered.
 */
export function Tabs({ label, tabs }: { label: string; tabs: readonly TabDef[] }) {
  const [selected, setSelected] = useState(tabs[0]?.id ?? '');
  const listRef = useRef<HTMLDivElement>(null);
  const current = tabs.find((t) => t.id === selected) ?? tabs[0];

  const focusTab = (i: number) => {
    const next = tabs[(i + tabs.length) % tabs.length];
    if (!next) return;
    setSelected(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#tab-${next.id}`)?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === selected);
    const to =
      e.key === 'ArrowRight'
        ? i + 1
        : e.key === 'ArrowLeft'
          ? i - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    focusTab(to);
  };

  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            className="tabs__tab"
            aria-selected={t.id === current?.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={t.id === current?.id ? 0 : -1}
            onClick={() => {
              setSelected(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current ? (
        <div
          id={`panel-${current.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${current.id}`}
          className="tabs__panel"
          tabIndex={0}
        >
          {current.render()}
        </div>
      ) : null}
    </div>
  );
}
