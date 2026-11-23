import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Share2,
  PhoneOff,
  Activity,
  MessageSquare,
} from 'lucide-react';
import { NetworkTier } from '../types';

interface ControlsProps {
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  isStatsOpen: boolean;
  networkTier: NetworkTier;
  unreadCount?: number;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleStats: () => void;
  onEndCall: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  isChatOpen,
  isStatsOpen,
  networkTier,
  unreadCount = 0,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onToggleStats,
  onEndCall,
}) => {
  const getNetworkBadgeColor = () => {
    switch (networkTier) {
      case 'excellent':
        return 'bg-emerald-500';
      case 'good':
        return 'bg-cyan-500';
      case 'poor':
        return 'bg-amber-500';
      case 'critical-audio-only':
        return 'bg-rose-500 animate-pulse';
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-slate-700/80 bg-slate-900/90 px-6 py-3 shadow-2xl backdrop-blur-2xl">
      {/* Audio Mute */}
      <button
        onClick={onToggleAudio}
        title={isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all ${
          isAudioMuted
            ? 'bg-rose-600 text-white hover:bg-rose-500'
            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }`}
      >
        {isAudioMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </button>

      {/* Video Toggle */}
      <button
        onClick={onToggleVideo}
        title={isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all ${
          isVideoOff
            ? 'bg-rose-600 text-white hover:bg-rose-500'
            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }`}
      >
        {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
      </button>

      {/* Screen Share */}
      <button
        onClick={onToggleScreenShare}
        title="Share Screen"
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
          isScreenSharing
            ? 'bg-cyan-600 text-white'
            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }`}
      >
        <Share2 className="h-5 w-5" />
      </button>

      {/* Network Telemetry HUD Toggle */}
      <button
        onClick={onToggleStats}
        title="Network Telemetry & Low-Bandwidth Simulator"
        className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all ${
          isStatsOpen
            ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/50'
            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }`}
      >
        <Activity className="h-5 w-5" />
        <span
          className={`absolute top-2 right-2 h-2.5 w-2.5 rounded-full border-2 border-slate-900 ${getNetworkBadgeColor()}`}
        />
      </button>

      {/* Chat */}
      <button
        onClick={onToggleChat}
        title="Meeting Chat"
        className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all ${
          isChatOpen
            ? 'bg-cyan-600 text-white'
            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }`}
      >
        <MessageSquare className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      <div className="h-6 w-px bg-slate-700 mx-1" />

      {/* End Call */}
      <button
        onClick={onEndCall}
        title="Leave Call"
        className="flex h-12 w-14 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-600/30 transition-all"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );
};
