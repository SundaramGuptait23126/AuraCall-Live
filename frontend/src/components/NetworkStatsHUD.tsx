import React from 'react';
import { NetworkQualityStats, NetworkTier } from '../types';
import { Activity, Wifi, ShieldAlert, Cpu } from 'lucide-react';

interface NetworkStatsHUDProps {
  stats: NetworkQualityStats;
  onSimulateTier: (tier: NetworkTier) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const NetworkStatsHUD: React.FC<NetworkStatsHUDProps> = ({
  stats,
  onSimulateTier,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const getTierColor = (tier: NetworkTier) => {
    switch (tier) {
      case 'excellent':
        return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40';
      case 'good':
        return 'text-cyan-400 border-cyan-500/40 bg-cyan-950/40';
      case 'poor':
        return 'text-amber-400 border-amber-500/40 bg-amber-950/40';
      case 'critical-audio-only':
        return 'text-rose-400 border-rose-500/40 bg-rose-950/40';
    }
  };

  return (
    <div className="absolute top-16 right-4 z-40 w-96 rounded-2xl border border-slate-700/80 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl transition-all">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-slate-100">Live Network Telemetry (TWCC/GCC)</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          ✕
        </button>
      </div>

      {/* Primary Status Banner */}
      <div className={`mt-3 rounded-xl border p-2.5 text-xs font-medium ${getTierColor(stats.tier)}`}>
        <div className="flex items-center justify-between">
          <span className="capitalize font-bold flex items-center gap-1.5">
            <Wifi className="h-3.5 w-3.5" />
            {stats.tier.replace('-', ' ')}
          </span>
          <span className="rounded bg-black/40 px-2 py-0.5 text-[11px] font-mono">
            {stats.codec}
          </span>
        </div>
        <div className="mt-1 text-[11px] opacity-90">
          Target: {stats.resolution}
        </div>
      </div>

      {/* Detailed Metrics Grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-800/80 p-2 border border-slate-700/50">
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Round Trip Time</span>
          <span className="font-mono text-base font-bold text-slate-100">{stats.rtt} ms</span>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2 border border-slate-700/50">
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Packet Loss</span>
          <span className={`font-mono text-base font-bold ${stats.packetLoss > 10 ? 'text-rose-400' : 'text-slate-100'}`}>
            {stats.packetLoss}%
          </span>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2 border border-slate-700/50">
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Video Bitrate</span>
          <span className="font-mono text-base font-bold text-slate-100">{stats.bitrateKbps} kbps</span>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2 border border-slate-700/50">
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Opus In-band FEC</span>
          <span className="font-mono text-xs font-semibold text-emerald-400 flex items-center gap-1 mt-1">
            <ShieldAlert className="h-3 w-3" />
            {stats.fecActive ? 'Active (Loss Protection)' : 'Standby'}
          </span>
        </div>
      </div>

      {/* Interactive Network Condition Simulator */}
      <div className="mt-4 border-t border-slate-800 pt-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
          <Cpu className="h-3 w-3 text-cyan-400" />
          Test Poor Network Resilience:
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => onSimulateTier('excellent')}
            className={`rounded-lg py-1.5 px-2 text-[11px] font-medium transition ${
              stats.tier === 'excellent' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            ⚡ Broadband (HD)
          </button>
          <button
            onClick={() => onSimulateTier('good')}
            className={`rounded-lg py-1.5 px-2 text-[11px] font-medium transition ${
              stats.tier === 'good' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            📶 Average 4G (360p)
          </button>
          <button
            onClick={() => onSimulateTier('poor')}
            className={`rounded-lg py-1.5 px-2 text-[11px] font-medium transition ${
              stats.tier === 'poor' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            📉 Low Signal (180p)
          </button>
          <button
            onClick={() => onSimulateTier('critical-audio-only')}
            className={`rounded-lg py-1.5 px-2 text-[11px] font-medium transition ${
              stats.tier === 'critical-audio-only' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            ⚠️ 2G / Heavy Loss
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-400 leading-tight">
          When network deteriorates, Simulcast switches layers instantly without disconnecting, and drops to Audio-Only under extreme packet loss.
        </p>
      </div>
    </div>
  );
};
