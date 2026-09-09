import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TelemetryChartProps {
  isExplosion: boolean;
  facilityName: string;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ isExplosion, facilityName }) => {
  // Generate 30 time points representing historical overpasses
  const labels = Array.from({ length: 25 }, (_, i) => `T-${24 - i}d`);
  labels[24] = 'CURRENT';

  // Baseline data: stable around 24.5 MW with low noise
  const baselineData = [
    24.1, 23.8, 25.2, 24.6, 26.1, 23.9, 24.4, 25.0, 24.8, 23.7,
    25.5, 24.2, 24.9, 25.1, 23.9, 24.5, 25.3, 24.0, 24.7, 25.2,
    23.8, 24.6, 25.1, 24.4, isExplosion ? 145.0 : 25.7
  ];

  const upperThreshold = Array(25).fill(34.0); // +2.5 sigma threshold (34 MW)

  const data = {
    labels,
    datasets: [
      {
        label: `${facilityName} FRP (MW)`,
        data: baselineData,
        borderColor: isExplosion ? '#ef4444' : '#10b981',
        backgroundColor: isExplosion ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
        borderWidth: 2,
        pointRadius: (ctx: any) => (ctx.dataIndex === 24 ? (isExplosion ? 6 : 4) : 2),
        pointBackgroundColor: (ctx: any) => (ctx.dataIndex === 24 ? (isExplosion ? '#dc2626' : '#059669') : '#64748b'),
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Routine Equilibrium Limit (+2.5σ)',
        data: upperThreshold,
        borderColor: '#eab308',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#94a3b8',
          font: { family: 'monospace', size: 10 },
          boxWidth: 12,
        },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#e2e8f0',
        bodyColor: '#cbd5e1',
        borderColor: '#334155',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        ticks: { color: '#64748b', font: { family: 'monospace', size: 9 }, maxTicksLimit: 7 },
        grid: { color: 'rgba(51, 65, 85, 0.2)' },
      },
      y: {
        ticks: { color: '#64748b', font: { family: 'monospace', size: 9 } },
        grid: { color: 'rgba(51, 65, 85, 0.2)' },
        suggestedMax: isExplosion ? 160 : 45,
      },
    },
  };

  return (
    <div className="w-full h-44 bg-zinc-950 p-2 rounded-lg border border-zinc-800">
      <Line data={data} options={options} />
    </div>
  );
};
