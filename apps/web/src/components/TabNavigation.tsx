interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export default function TabNavigation({ tabs, activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="border-b border-zinc-950/10 dark:border-white/10">
      <nav className="-mb-px flex flex-wrap gap-x-8 gap-y-2" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium transition
              ${
                activeTab === tab.id
                  ? 'border-zinc-950 text-zinc-950 dark:border-white dark:text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
              }
            `}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`
                  ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium
                  ${
                    activeTab === tab.id
                      ? 'bg-zinc-950/10 text-zinc-950 dark:bg-white/10 dark:text-white'
                      : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300'
                  }
                `}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
