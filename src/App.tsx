import { useState } from 'react';

type TabId = 'today' | 'calendar' | 'settings';

type Tab = {
  id: TabId;
  label: string;
  title: string;
  eyebrow: string;
  description: string;
};

const tabs: Tab[] = [
  {
    id: 'today',
    label: '오늘',
    title: '오늘',
    eyebrow: 'Today',
    description: '오늘 해야 할 일을 가장 먼저 보여주는 기본 화면입니다.',
  },
  {
    id: 'calendar',
    label: '캘린더',
    title: '캘린더',
    eyebrow: 'Calendar',
    description: '월간 일정과 할 일 분포를 확인할 공간입니다.',
  },
  {
    id: 'settings',
    label: '설정',
    title: '설정',
    eyebrow: 'Settings',
    description: '아침/저녁 알림 시간과 PWA 알림 상태를 설정할 공간입니다.',
  },
];

const tabIcons: Record<TabId, string> = {
  today: '✓',
  calendar: '▦',
  settings: '⚙',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <main className="app-shell" aria-label="Checklist Alarm PWA">
      <section className="phone-frame">
        <header className="app-header">
          <p className="app-kicker">Checklist Alarm</p>
          <h1>{active.title}</h1>
        </header>

        <section className="content-card" aria-label={`${active.title} 화면`}>
          <p className="content-eyebrow">{active.eyebrow}</p>
          <p className="panel-title" id={`${active.id}-panel`}>
            {active.title}
          </p>
          <p>{active.description}</p>
          {active.id === 'today' ? (
            <div className="empty-state" role="status">
              아직 등록된 할 일이 없습니다. 다음 이슈에서 빠른 추가와 로컬 저장을 연결합니다.
            </div>
          ) : null}
        </section>

        <nav className="bottom-tabs" aria-label="Primary" role="tablist">
          {tabs.map((tab) => (
            <button
              aria-controls={`${tab.id}-panel`}
              aria-selected={activeTab === tab.id}
              className="bottom-tab"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <span aria-hidden="true" className="tab-icon">
                {tabIcons[tab.id]}
              </span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </section>
    </main>
  );
}
