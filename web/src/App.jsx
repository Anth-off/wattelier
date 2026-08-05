import { useEffect, useState } from 'react';
import { api, subscribe } from './api.js';
import RealTime from './pages/RealTime.jsx';
import History from './pages/History.jsx';
import Devices from './pages/Devices.jsx';
import Advanced from './pages/Advanced.jsx';
import Billing from './pages/Billing.jsx';
import Settings from './pages/Settings.jsx';

const TABS = [
  ['realtime', 'Temps réel'],
  ['history', 'Historique'],
  ['devices', 'Par appareil'],
  ['advanced', 'Stats avancées'],
  ['billing', 'Facturation'],
  ['settings', 'Réglages'],
];

function StatusPill({ label, state, title }) {
  const color =
    state === 'ok'
      ? 'var(--ok)'
      : state === 'warn'
        ? 'var(--warn)'
        : state === 'off'
          ? 'var(--muted)'
          : 'var(--crit)';
  const icon = state === 'ok' ? '✓' : state === 'warn' ? '…' : state === 'off' ? '·' : '✕';
  return (
    <span className="status-pill" title={title}>
      <span className="dot" style={{ background: color }} />
      {label} {icon}
    </span>
  );
}

export default function App() {
  const [tab, setTab] = useState('realtime');
  const [status, setStatus] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'auto');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'auto' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    media.addEventListener('change', apply);
    localStorage.setItem('theme', theme);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    const load = () =>
      api('status')
        .then(setStatus)
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    const off = subscribe({ status: load, linky: load }, load);
    return () => {
      clearInterval(t);
      off();
    };
  }, []);

  const linkyState = !status
    ? 'warn'
    : status.linky.lastError
      ? 'err'
      : !status.linky.configured
        ? 'off'
        : status.linky.waitingForData
          ? 'warn'
          : 'ok';
  const sonoffState = !status
    ? 'warn'
    : status.sonoff.lastError
      ? 'err'
      : !status.sonoff.configured
        ? 'off'
        : status.sonoff.cloudOnline || status.sonoff.lanDevices > 0
          ? 'ok'
          : 'warn';

  const resolvedTheme = document.documentElement.dataset.theme || 'light';

  return (
    <div className="app">
      <header className="topbar">
        <h1>⚡ Suivi élec</h1>
        <div className="statuses">
          <StatusPill
            label="Linky"
            state={linkyState}
            title={
              status?.linky?.lastError ||
              (status?.linky?.waitingForData
                ? 'En attente des premières données Enedis (compteur récent)'
                : '') ||
              (!status?.linky?.configured
                ? 'Token Conso API non configuré (Réglages)'
                : `${status?.linky?.daysInDb ?? 0} jours en base`)
            }
          />
          <StatusPill
            label="Prises"
            state={sonoffState}
            title={
              status?.sonoff?.lastError ||
              (!status?.sonoff?.configured
                ? 'Identifiants eWeLink absents du .env'
                : `${status?.sonoff?.deviceCount ?? 0} prise(s), ${status?.sonoff?.lanDevices ?? 0} en LAN`)
            }
          />
          {status?.demo && (
            <StatusPill
              label="Mode démo"
              state="warn"
              title="Données factices affichées — désactivable dans Réglages"
            />
          )}
          <button
            className="theme-btn"
            onClick={() =>
              setTheme(theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto')
            }
            title="Thème : auto → clair → sombre"
          >
            {theme === 'auto' ? '🌗 Auto' : theme === 'light' ? '☀️ Clair' : '🌙 Sombre'}
          </button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <main key={`${tab}-${resolvedTheme}-${theme}`}>
        {tab === 'realtime' && <RealTime />}
        {tab === 'history' && <History />}
        {tab === 'devices' && <Devices />}
        {tab === 'advanced' && <Advanced />}
        {tab === 'billing' && <Billing />}
        {tab === 'settings' && <Settings status={status} />}
      </main>
    </div>
  );
}
