// src/pages/HomePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

/* ---------------------------- Tiny chart helpers ---------------------------- */
function useApplicationsTimeSeries(jobs) {
  const [series, setSeries] = useState({ days: [], max: 0, total: 0, loaded: false });

  useEffect(() => {
    let cancelled = false;
    if (!jobs || jobs.length === 0) {
      setSeries({ days: [], max: 0, total: 0, loaded: true });
      return;
    }

    (async () => {
      try {
        // Fetch applicants for each job (parallel), then flatten
        const lists = await Promise.all(
          jobs.map((j) =>
            api(`/api/applications/job/${j.id}`).catch(() => [])
          )
        );

        const all = lists.flat();
        // Build a map YYYY-MM-DD -> count
        const byDay = new Map();
        for (const a of all) {
          const d = new Date(a.created_at);
          if (Number.isNaN(d.getTime())) continue;
          const key = d.toISOString().slice(0, 10);
          byDay.set(key, (byDay.get(key) || 0) + 1);
        }

        // Last 30 days timeline (inclusive of today)
        const days = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let i = 29; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          days.push({ date: key, count: byDay.get(key) || 0 });
        }

        // 7-day rolling average
        const window = 7;
        for (let i = 0; i < days.length; i++) {
          let sum = 0;
          let n = 0;
          for (let k = Math.max(0, i - (window - 1)); k <= i; k++) {
            sum += days[k].count;
            n++;
          }
          days[i].avg7 = sum / n;
        }

        const max = days.reduce((m, d) => Math.max(m, d.count, d.avg7 || 0), 0);
        const total = all.length;

        if (!cancelled) setSeries({ days, max, total, loaded: true });
      } catch {
        if (!cancelled) setSeries({ days: [], max: 0, total: 0, loaded: true });
      }
    })();

    return () => { cancelled = true; };
  }, [jobs]);

  return series;
}

function AreaBarChart({ data, maxY }) {
  // SVG sizes
  const height = 220; // fits your card
  const padding = { top: 16, right: 12, bottom: 28, left: 32 };
  const width = 600; // responsive via viewBox
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // Scales
  const n = data.length;
  const xStep = innerW / Math.max(1, n - 1);
  const y = (v) => innerH - (maxY ? (v / maxY) * innerH : 0);

  // Paths
  const lineAvg = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${padding.left + i * xStep} ${padding.top + y(d.avg7 || 0)}`)
    .join(" ");

  // Bars
  const barW = Math.max(2, innerW / Math.max(20, n) * 0.8);

  // X ticks ~ weekly
  const ticks = data.map((d, i) => ({ i, d })).filter(({ i }) => i % 7 === 0);

  // Tooltip state
  const [hover, setHover] = useState(null);
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - padding.left;
    const idx = Math.round(px / xStep);
    const i = Math.min(n - 1, Math.max(0, idx));
    setHover({ i, x: padding.left + i * xStep });
  };

  const dFmt = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
        {/* axes */}
        <line x1={padding.left} y1={padding.top + innerH} x2={padding.left + innerW} y2={padding.top + innerH} stroke="#e5e7eb" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerH} stroke="#e5e7eb" />

        {/* y-grid (3 lines) */}
        {[1, 2, 3].map((k) => {
          const yy = padding.top + (innerH * k) / 4;
          return <line key={k} x1={padding.left} y1={yy} x2={padding.left + innerW} y2={yy} stroke="#f3f4f6" />;
        })}

        {/* bars */}
        {data.map((d, i) => {
          const x = padding.left + i * xStep - barW / 2;
          const h = innerH - y(d.count);
          return (
            <rect
              key={i}
              x={x}
              y={padding.top + y(d.count)}
              width={barW}
              height={h}
              rx="2"
              fill="#e5e7eb"
            />
          );
        })}

        {/* avg line */}
        <path d={lineAvg} fill="none" stroke="#111827" strokeWidth="2" />

        {/* x-axis ticks & labels */}
        {ticks.map(({ i, d }) => {
          const x = padding.left + i * xStep;
          return (
            <g key={i}>
              <line x1={x} y1={padding.top + innerH} x2={x} y2={padding.top + innerH + 4} stroke="#9ca3af" />
              <text x={x} y={padding.top + innerH + 18} textAnchor="middle" fontSize="10" fill="#6b7280">
                {dFmt(d.date)}
              </text>
            </g>
          );
        })}

        {/* y-axis labels (0, max/2, max) */}
        {[0, 0.5, 1].map((t, idx) => {
          const val = Math.round(maxY * t);
          const yy = padding.top + y(maxY * t);
          return (
            <text key={idx} x={padding.left - 8} y={yy + 3} textAnchor="end" fontSize="10" fill="#6b7280">
              {val}
            </text>
          );
        })}

        {/* hover guide */}
        {hover && (
          <>
            <line x1={hover.x} y1={padding.top} x2={hover.x} y2={padding.top + innerH} stroke="#d1d5db" />
            <circle
              cx={hover.x}
              cy={padding.top + y(data[hover.i].avg7 || 0)}
              r="3.5"
              fill="#111827"
            />
          </>
        )}

        {/* hit area */}
        <rect
          x={padding.left}
          y={padding.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {/* tooltip */}
      {hover && (
        <div
          className="absolute text-xs bg-white border border-gray-200 shadow-sm rounded-md px-2 py-1"
          style={{ left: `calc(${(hover.x / width) * 100}% - 40px)`, top: 0 }}
        >
          <div className="font-medium text-gray-900">{dFmt(data[hover.i].date)}</div>
          <div className="text-gray-600">New apps: <span className="font-medium text-gray-900">{data[hover.i].count}</span></div>
          <div className="text-gray-600">7-day avg: <span className="font-medium text-gray-900">{(data[hover.i].avg7 || 0).toFixed(1)}</span></div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Page ---------------------------------- */
export default function HomePage() {
  const [me, setMe] = useState(null);
  const [jobCount, setJobCount] = useState(0);
  const [totalApplicants, setTotalApplicants] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [loadingChart, setLoadingChart] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api("/api/me")
      .then((resp) => {
        const u = resp?.user || resp;
        if (!cancelled) setMe(u || null);
      })
      .catch(() => {});

    api("/api/jobs")
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res.jobs || [];
        setJobs(list.map((j) => ({ id: j.id, applicants: j.applicants ?? 0 })));
        setJobCount(list.length);
        const total = list.reduce((s, j) => s + (j.applicants ?? 0), 0);
        setTotalApplicants(total);
        setLoadingChart(false);
      })
      .catch(() => {
        if (!cancelled) {
          setJobs([]);
          setJobCount(0);
          setTotalApplicants(0);
          setLoadingChart(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  const series = useApplicationsTimeSeries(jobs);

  const first = me?.name ? me.name.split(" ")[0] : "Recruiter";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">
          Welcome, {first} 👋
        </h1>
        <p className="text-gray-600 max-w-2xl">
          Recrio helps recruiters evaluate candidates through AI-driven resume
          analysis and realistic simulations. Here's an overview of your current
          activity.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Total Job Postings</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{jobCount}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Total Applicants</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">
            {totalApplicants}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Avg AI Score</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">78.2%</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Simulations Completed</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">143</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-72">
          <p className="text-lg font-semibold text-gray-800 mb-4">
            Applications Over Time
          </p>
          {loadingChart || !series.loaded ? (
            <div className="h-full flex items-center justify-center text-gray-400 italic">
              Loading…
            </div>
          ) : series.days.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 italic">
              No applications yet
            </div>
          ) : (
            <AreaBarChart data={series.days} maxY={Math.max(1, series.max)} />
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-72">
          <p className="text-lg font-semibold text-gray-800 mb-4">
            Top Scoring Jobs
          </p>
          <div className="h-full flex items-center justify-center text-gray-400 italic">
            (Chart Placeholder)
          </div>
        </div>
      </div>
    </div>
  );
}
