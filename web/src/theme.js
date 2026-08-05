/** Lit la palette depuis les variables CSS (suit le thème clair/sombre actif). */
export function chartTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    series: [
      v('--s1'),
      v('--s2'),
      v('--s3'),
      v('--s4'),
      v('--s5'),
      v('--s6'),
      v('--s7'),
      v('--s8'),
    ],
    seq: [
      v('--seq1'),
      v('--seq2'),
      v('--seq3'),
      v('--seq4'),
      v('--seq5'),
      v('--seq6'),
      v('--seq7'),
    ],
    ink: v('--ink'),
    ink2: v('--ink2'),
    muted: v('--muted'),
    grid: v('--grid'),
    axis: v('--axis'),
    surface: v('--surface'),
    neutral: v('--neutral-slice'),
    ok: v('--ok'),
    crit: v('--crit'),
  };
}

/** Fragments d'option ECharts conformes au design (axes discrets, grille fine). */
export function baseAxes(t) {
  return {
    textStyle: { fontFamily: `system-ui, -apple-system, 'Segoe UI', sans-serif` },
    xAxis: {
      axisLine: { lineStyle: { color: t.axis } },
      axisTick: { show: false },
      axisLabel: { color: t.muted, fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: t.grid, width: 1 } },
    },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.grid,
      textStyle: { color: t.ink, fontSize: 12 },
    },
    legend: {
      textStyle: { color: t.ink2, fontSize: 12 },
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 8,
    },
  };
}
