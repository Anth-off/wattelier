import { useEffect, useMemo, useState } from 'react';
import Chart from '../Chart.jsx';
import { api, post, fmtKwh, fmtEur, fmtDate, localDate, daysAgo } from '../api.js';
import { chartTheme, baseAxes } from '../theme.js';

const SOURCE_LABELS = {
  linky: 'compteur Linky',
  manuel: 'relevé manuel du compteur',
};

const RANGES = [
  ['7', '7 jours'],
  ['30', '30 jours'],
  ['90', '90 jours'],
  ['365', '12 mois'],
];
const GRANS = [
  ['day', 'Jour'],
  ['week', 'Semaine'],
  ['month', 'Mois'],
];

/** Regroupe la série quotidienne par semaine (lundi) ou mois — maison et prises séparées. */
function groupSeries(rows, gran) {
  if (gran === 'day') return rows.map((r) => ({ key: r.date, ...r, days: 1 }));
  const map = new Map();
  for (const r of rows) {
    let key;
    if (gran === 'week') {
      const d = new Date(r.date + 'T12:00:00');
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      key = localDate(monday);
    } else {
      key = r.date.slice(0, 7);
    }
    const cur = map.get(key) || {
      key,
      houseKwh: null,
      houseEur: null,
      houseFrom: null,
      plugsKwh: null,
      plugsEur: null,
      days: 0,
    };
    if (r.houseKwh != null) {
      cur.houseKwh = (cur.houseKwh || 0) + r.houseKwh;
      cur.houseEur = (cur.houseEur || 0) + r.houseEur;
      cur.houseFrom = cur.houseFrom === 'linky' ? 'linky' : r.houseFrom;
    }
    if (r.plugsKwh != null) {
      cur.plugsKwh = (cur.plugsKwh || 0) + r.plugsKwh;
      cur.plugsEur = (cur.plugsEur || 0) + r.plugsEur;
    }
    cur.days++;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export default function History() {
  const [daily, setDaily] = useState([]);
  const [range, setRange] = useState('30');
  const [gran, setGran] = useState('day');
  const [detailDate, setDetailDate] = useState(null);
  const [detail, setDetail] = useState(null);
  const [status, setStatus] = useState(null);
  const [meter, setMeter] = useState(null);
  const [formDate, setFormDate] = useState(localDate());
  const [formIndex, setFormIndex] = useState('');
  const [meterError, setMeterError] = useState(null);

  const loadDaily = () =>
    api('daily?days=800')
      .then(setDaily)
      .catch(() => {});
  useEffect(() => {
    loadDaily();
    api('status')
      .then(setStatus)
      .catch(() => {});
    api('meter-index')
      .then(setMeter)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!detailDate) return;
    api(`day/${detailDate}`)
      .then(setDetail)
      .catch(() => {});
  }, [detailDate]);

  const addMeterEntry = async () => {
    setMeterError(null);
    try {
      const m = await post('meter-index', { date: formDate, index_kwh: Number(formIndex) });
      setMeter(m);
      setFormIndex('');
      loadDaily();
    } catch {
      setMeterError("Saisie invalide — reportez l'index en kWh affiché par le compteur.");
    }
  };
  const removeMeterEntry = async (date) => {
    const m = await api(`meter-index/${date}`, { method: 'DELETE' }).catch(() => null);
    if (m) {
      setMeter(m);
      loadDaily();
    }
  };

  // visible tant qu'Enedis n'a livré aucune donnée (et hors mode démo)
  const showMeterPanel = status && !status.demo && status.linky?.daysInDb === 0;

  const t = chartTheme();
  const axes = baseAxes(t);

  const cutoff = daysAgo(Number(range));
  const prevCutoff = daysAgo(Number(range) * 2);
  const inRange = daily.filter((r) => r.date >= cutoff);
  const prevRange = daily.filter((r) => r.date >= prevCutoff && r.date < cutoff);

  // Totaux SÉPARÉS : maison (Linky/relevé) d'un côté, prises (sous-ensemble) de l'autre
  const houseIn = inRange.filter((r) => r.houseKwh != null);
  const plugsIn = inRange.filter((r) => r.plugsKwh != null);
  const totalHouseKwh = houseIn.reduce((s, r) => s + r.houseKwh, 0);
  const totalHouseEur = houseIn.reduce((s, r) => s + r.houseEur, 0);
  const totalPlugsKwh = plugsIn.reduce((s, r) => s + r.plugsKwh, 0);
  const totalPlugsEur = plugsIn.reduce((s, r) => s + r.plugsEur, 0);

  // Comparaison de période : sur la moyenne/jour, même source des deux côtés
  const prevHouse = prevRange.filter((r) => r.houseKwh != null);
  const prevPlugs = prevRange.filter((r) => r.plugsKwh != null);
  let delta = null;
  let deltaBasis = null;
  if (houseIn.length && prevHouse.length) {
    const avgCur = totalHouseKwh / houseIn.length;
    const avgPrev = prevHouse.reduce((s, r) => s + r.houseKwh, 0) / prevHouse.length;
    if (avgPrev > 0) {
      delta = ((avgCur - avgPrev) / avgPrev) * 100;
      deltaBasis = 'maison';
    }
  } else if (plugsIn.length && prevPlugs.length) {
    const avgCur = totalPlugsKwh / plugsIn.length;
    const avgPrev = prevPlugs.reduce((s, r) => s + r.plugsKwh, 0) / prevPlugs.length;
    if (avgPrev > 0) {
      delta = ((avgCur - avgPrev) / avgPrev) * 100;
      deltaBasis = 'prises';
    }
  }

  const avgDayKwh = houseIn.length
    ? totalHouseKwh / houseIn.length
    : plugsIn.length
      ? totalPlugsKwh / plugsIn.length
      : null;
  const avgBasis = houseIn.length ? 'maison' : 'prises';

  const grouped = useMemo(() => groupSeries(inRange, gran), [daily, range, gran]);

  const barOption = useMemo(() => {
    const houseVals = grouped.filter((r) => r.houseKwh != null);
    const plugVals = grouped.filter((r) => r.plugsKwh != null);
    const meanVals = houseVals.length
      ? houseVals.map((r) => r.houseKwh)
      : plugVals.map((r) => r.plugsKwh);
    const mean = meanVals.length ? meanVals.reduce((s, v) => s + v, 0) / meanVals.length : 0;
    const markLine = {
      silent: true,
      symbol: 'none',
      lineStyle: { color: t.muted, type: 'dashed', width: 1 },
      label: {
        color: t.muted,
        fontSize: 11,
        position: 'insideEndTop',
        formatter: `moy. ${mean.toFixed(1)} kWh`,
      },
      data: [{ yAxis: +mean.toFixed(2) }],
    };
    return {
      ...axes,
      grid: { left: 52, right: 16, top: 36, bottom: 60 },
      legend: { ...axes.legend, top: 0 },
      tooltip: {
        ...axes.tooltip,
        trigger: 'axis',
        formatter: (params) => {
          const r = grouped[params[0].dataIndex];
          if (!r) return '';
          let html = `<b>${params[0].axisValue}</b>`;
          if (r.houseKwh != null) {
            html +=
              `<br/>Maison : ${fmtKwh(r.houseKwh)} · ${fmtEur(r.houseEur)}` +
              ` <span style="color:${t.muted}">(${SOURCE_LABELS[r.houseFrom] || r.houseFrom})</span>`;
          }
          if (r.plugsKwh != null) {
            html +=
              `<br/>Prises : ${fmtKwh(r.plugsKwh)} · ${fmtEur(r.plugsEur)}` +
              (r.houseKwh != null
                ? ` <span style="color:${t.muted}">— incluses dans le total maison</span>`
                : '');
          }
          if (gran !== 'day')
            html += `<br/><span style="color:${t.muted}">${r.days} jour(s)</span>`;
          return html;
        },
      },
      xAxis: {
        ...axes.xAxis,
        type: 'category',
        data: grouped.map((r) => r.key),
        axisLabel: { ...axes.xAxis.axisLabel, rotate: grouped.length > 20 ? 45 : 0 },
      },
      yAxis: { ...axes.yAxis, type: 'value', name: 'kWh', nameTextStyle: { color: t.muted } },
      dataZoom:
        grouped.length > 60
          ? [
              {
                type: 'slider',
                height: 18,
                bottom: 6,
                borderColor: t.grid,
                textStyle: { color: t.muted },
              },
            ]
          : [],
      series: [
        {
          name: 'Maison (Linky / relevé)',
          type: 'bar',
          barMaxWidth: 22,
          itemStyle: { color: t.series[0], borderRadius: [4, 4, 0, 0] },
          data: grouped.map((r) => (r.houseKwh != null ? +r.houseKwh.toFixed(2) : null)),
          markLine: houseVals.length ? markLine : undefined,
        },
        {
          name: 'Prises (sous-ensemble)',
          type: 'bar',
          barMaxWidth: 22,
          itemStyle: { color: t.series[1], borderRadius: [4, 4, 0, 0] },
          data: grouped.map((r) => (r.plugsKwh != null ? +r.plugsKwh.toFixed(2) : null)),
          markLine: houseVals.length ? undefined : markLine,
        },
      ],
    };
  }, [grouped, t.series[0]]);

  const detailOption = useMemo(() => {
    if (!detail) return null;
    // même unité partout : W moyens (Wh sur 1 h = W moyens de l'heure)
    const linkySeries = detail.linky.map((r) => [r.ts, Math.round(r.watts)]);
    const plugSeries = detail.plugs.map((r) => [r.ts + 1800_000, Math.round(r.wh)]);
    return {
      ...axes,
      grid: { left: 52, right: 16, top: 36, bottom: 30 },
      legend: { ...axes.legend, top: 0 },
      tooltip: { ...axes.tooltip, trigger: 'axis', valueFormatter: (v) => `${v} W` },
      xAxis: { ...axes.xAxis, type: 'time' },
      yAxis: {
        ...axes.yAxis,
        type: 'value',
        name: 'W (moyenne)',
        nameTextStyle: { color: t.muted },
      },
      series: [
        {
          name: 'Maison (Linky, pas 30 min)',
          type: 'line',
          step: 'end',
          showSymbol: false,
          lineStyle: { width: 2, color: t.series[0] },
          itemStyle: { color: t.series[0] },
          areaStyle: { opacity: 0.08, color: t.series[0] },
          data: linkySeries,
        },
        {
          name: 'Prises (moyenne horaire)',
          type: 'line',
          step: 'middle',
          showSymbol: false,
          lineStyle: { width: 2, color: t.series[1] },
          itemStyle: { color: t.series[1] },
          data: plugSeries,
        },
      ],
    };
  }, [detail, t.series[0]]);

  const meterEntries = meter?.entries || [];

  return (
    <>
      {showMeterPanel && (
        <div className="panel" style={{ borderLeft: '3px solid var(--warn)' }}>
          <h2>
            Relevés manuels du compteur
            <span className="hint">
              en attendant Enedis — ce bloc disparaîtra automatiquement à l'arrivée des vraies
              données
            </span>
          </h2>
          <p className="note">
            Notez chaque jour (à peu près à la même heure, idéalement le soir) l'index <b>BASE</b>{' '}
            en kWh affiché par le Linky (appuyez sur la touche <b>+</b> du compteur jusqu'à voir «
            index en kWh »). La différence entre deux relevés est comptée sur{' '}
            <b>le jour du relevé le plus récent</b> : 7 096 hier → 7 101 aujourd'hui = 5 kWh
            attribués à aujourd'hui. Quand Enedis publiera l'historique, ces valeurs seront
            remplacées automatiquement par les mesures officielles.
          </p>
          <div className="row" style={{ margin: '10px 0' }}>
            <input
              type="date"
              style={{
                border: '1px solid var(--border)',
                background: 'var(--page)',
                color: 'var(--ink)',
                borderRadius: 8,
                padding: '8px 10px',
              }}
              value={formDate}
              max={localDate()}
              onChange={(e) => setFormDate(e.target.value)}
            />
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Index compteur (kWh)"
              style={{
                border: '1px solid var(--border)',
                background: 'var(--page)',
                color: 'var(--ink)',
                borderRadius: 8,
                padding: '8px 10px',
                width: 180,
              }}
              value={formIndex}
              onChange={(e) => setFormIndex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && formIndex !== '') addMeterEntry();
              }}
            />
            <button className="btn" onClick={addMeterEntry} disabled={formIndex === ''}>
              Ajouter le relevé
            </button>
            {meterError && <span style={{ color: 'var(--crit)', fontSize: 13 }}>{meterError}</span>}
          </div>
          {meterEntries.length > 0 && (
            <table className="data" style={{ maxWidth: 560 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Index (kWh)</th>
                  <th className="num">Conso depuis le relevé précédent</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {meterEntries.map((e, i) => {
                  const prev = meterEntries[i - 1];
                  const diff = prev ? e.index_kwh - prev.index_kwh : null;
                  return (
                    <tr key={e.date}>
                      <td>{fmtDate(e.date)}</td>
                      <td className="num">{e.index_kwh.toLocaleString('fr-FR')}</td>
                      <td className="num">
                        {diff == null ? (
                          '—'
                        ) : diff < 0 ? (
                          <span style={{ color: 'var(--crit)' }}>index décroissant ?</span>
                        ) : (
                          fmtKwh(diff)
                        )}
                      </td>
                      <td className="num">
                        <button
                          className="btn secondary"
                          style={{ padding: '3px 10px' }}
                          onClick={() => removeMeterEntry(e.date)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {meterEntries.length === 1 && (
            <p className="note" style={{ marginTop: 8 }}>
              Premier relevé enregistré — revenez demain noter le suivant pour obtenir la
              consommation du jour.
            </p>
          )}
        </div>
      )}

      <div className="cards">
        <div className="card">
          <div className="label">Maison sur la période</div>
          <div className="value">{houseIn.length ? fmtKwh(totalHouseKwh) : '—'}</div>
          <div className="sub">
            {houseIn.length
              ? `${fmtEur(totalHouseEur)} · ${houseIn.length} jour(s) mesurés (Linky/relevé)`
              : 'en attente du Linky ou de 2 relevés manuels'}
          </div>
        </div>
        <div className="card">
          <div className="label">Prises sur la période</div>
          <div className="value">{plugsIn.length ? fmtKwh(totalPlugsKwh) : '—'}</div>
          <div className="sub">
            {plugsIn.length ? `${fmtEur(totalPlugsEur)} · incluses dans le total maison` : ''}
          </div>
        </div>
        <div className="card">
          <div className="label">vs période précédente</div>
          <div className="value">
            {delta == null ? (
              '—'
            ) : (
              <span className={delta > 0 ? 'delta-up' : 'delta-down'}>
                {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} <small>%</small>
              </span>
            )}
          </div>
          <div className="sub">
            {delta == null
              ? 'pas encore assez d’historique comparable'
              : `moyenne/jour, ${deltaBasis} vs ${deltaBasis}`}
          </div>
        </div>
        <div className="card">
          <div className="label">Moyenne / jour ({avgBasis})</div>
          <div className="value">{fmtKwh(avgDayKwh)}</div>
          <div className="sub">
            {houseIn.length || plugsIn.length
              ? `${houseIn.length || plugsIn.length} jour(s) de données`
              : ''}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>
          Consommation{' '}
          <span className="hint">
            maison et prises côte à côte — les prises font partie du total maison, elles ne s'y
            ajoutent pas
          </span>
        </h2>
        <div className="filters">
          {RANGES.map(([v, label]) => (
            <button key={v} className={range === v ? 'active' : ''} onClick={() => setRange(v)}>
              {label}
            </button>
          ))}
          <span style={{ width: 12 }} />
          {GRANS.map(([v, label]) => (
            <button key={v} className={gran === v ? 'active' : ''} onClick={() => setGran(v)}>
              {label}
            </button>
          ))}
        </div>
        {grouped.length === 0 ? (
          <div className="empty">
            Pas encore de données sur cette période.
            <br />
            Les données Linky apparaissent 24-48 h après l'activation du token — ou activez le mode
            démo.
          </div>
        ) : (
          <Chart
            option={barOption}
            height={320}
            onClick={(p) => {
              if (gran === 'day' && grouped[p.dataIndex]) setDetailDate(grouped[p.dataIndex].key);
            }}
          />
        )}
      </div>

      <div className="panel">
        <h2>
          Détail d'une journée
          <span className="hint">courbe de charge Linky (30 min) + moyenne horaire des prises</span>
        </h2>
        <div className="filters">
          <input
            type="date"
            value={detailDate || ''}
            max={localDate()}
            onChange={(e) => setDetailDate(e.target.value)}
          />
          {detailDate && <button onClick={() => setDetailDate(daysAgo(1))}>Hier</button>}
        </div>
        {!detailDate ? (
          <div className="empty">Choisissez une date ou cliquez sur une barre ci-dessus.</div>
        ) : detail && detail.linky.length === 0 && detail.plugs.length === 0 ? (
          <div className="empty">Aucune donnée pour le {fmtDate(detailDate)}.</div>
        ) : (
          detailOption && <Chart option={detailOption} height={300} />
        )}
      </div>
    </>
  );
}
