/**
 * SafeBdg.jsx — Safe food status badge component
 */
import React from 'react';

const STATUS_MAP = {
  safe: { l: '✅ Safe', bg: 'rgba(52,211,153,0.12)', c: '#34d399' },
  caution: { l: '⚠️ Caution', bg: 'rgba(245,158,11,0.12)', c: '#fbbf24' },
  avoid: { l: '🚫 Avoid', bg: 'rgba(239,68,68,0.12)', c: '#f87171' },
};

export default function SafeBdg({ s }) {
  if (!s || s === 'unknown') return null;
  const v = STATUS_MAP[s];
  if (!v) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 8,
      fontSize: 9, fontWeight: 600, background: v.bg, color: v.c,
    }}>
      {v.l}
    </span>
  );
}
