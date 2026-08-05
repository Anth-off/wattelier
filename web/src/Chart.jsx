import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

/** Enveloppe ECharts : init une fois, met à jour l'option, resize automatique. */
export default function Chart({ option, height = 300, onClick }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, []);

  useEffect(() => {
    if (option) chartRef.current.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!onClick) return;
    chart.on('click', onClick);
    return () => chart.off('click', onClick);
  }, [onClick]);

  return <div ref={ref} style={{ height, width: '100%' }} />;
}
