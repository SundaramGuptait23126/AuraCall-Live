import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { WebRTCManager } from '../services/webrtc';
import { NetworkQualityStats, NetworkTier, ChatMessage } from '../types';
import { Controls } from './Controls';
import { NetworkStatsHUD } from './NetworkStatsHUD';
import { ChatDrawer } from './ChatDrawer';
import {
  Copy,
  Check,
  Users,
  MicOff,
  VideoOff,
  Wifi,
} from 'lucide-react';

interface VideoRoomProps {
  roomId: string;
  initialAudio: boolean;
  initialVideo: boolean;
  onLeave: () => void;
}

export const VideoRoom: React.FC<VideoRoomProps> = ({
  roomId,
  initialAudio,
  initialVideo,
  onLeave,
}) => {
  const { user } = useAuth();
  const [manager] = useState(() => new WebRTCManager());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [isAudioMuted, setIsAudioMuted] = useState(!initialAudio);
  const [isVideoOff, setIsVideoOff] = useState(!initialVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const [networkStats, setNetworkStats] = useState<NetworkQualityStats>({
    rtt: 32,
    packetLoss: 0.8,
    bitrateKbps: 1200,
    resolution: '1280x720 @ 30fps',
    tier: 'excellent',
    codec: 'VP9 / Opus FEC',
    fecActive: false,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      senderId: 'sys',
      senderEmail: 'system@auracall.internal',
      text: `Connected to room: ${roomId}. Microservices Gateway and SFU channels active.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSelf: false,
    },
  ]);

  // Initialize Media & Call
  useEffect(() => {
    let active = true;

    const setupCall = async () => {
      manager.setCallbacks(
        (stats) => {
          if (active) setNetworkStats(stats);
        },
        (remoteStream) => {
          if (remoteVideoRef.current && active) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
        }
      );

      const stream = await manager.getLocalMedia(!isVideoOff, !isAudioMuted);
      if (localVideoRef.current && active) {
        localVideoRef.current.srcObject = stream;
      }

      // Also set remote preview with adaptive stream
      if (remoteVideoRef.current && active) {
        remoteVideoRef.current.srcObject = stream;
      }

      manager.startNetworkMonitoring();
    };

    setupCall();

    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => {
      active = false;
      clearInterval(timer);
      manager.destroy();
    };
  }, [manager]);

  const handleToggleAudio = () => {
    const nextState = !isAudioMuted;
    setIsAudioMuted(nextState);
    manager.toggleAudio(!nextState);
  };

  const handleToggleVideo = () => {
    const nextState = !isVideoOff;
    setIsVideoOff(nextState);
    manager.toggleVideo(!nextState);
  };

  const handleToggleScreenShare = async () => {
    if (!isScreenSharing) {
      const screenStream = await manager.switchScreenShare();
      if (screenStream) {
        setIsScreenSharing(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        screenStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
        };
      }
    } else {
      setIsScreenSharing(false);
      const stream = await manager.getLocalMedia(!isVideoOff, !isAudioMuted);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    }
  };

  const handleSimulateTier = (tier: NetworkTier) => {
    manager.simulateNetworkCondition(tier);
  };

  const handleSendMessage = (text: string) => {
    const newMsg: ChatMessage = {
      id: 'm_' + Date.now(),
      senderId: user?.id || 'self',
      senderEmail: user?.email || 'me',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSelf: true,
    };
    setMessages((prev) => [...prev, newMsg]);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative h-screen w-screen bg-slate-950 overflow-hidden flex flex-col">
      {/* Top Floating App Bar */}
      <header className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/80 px-3.5 py-2 shadow-lg backdrop-blur-xl">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-xs font-semibold text-white tracking-wide">{roomId}</span>
            <button
              onClick={copyRoomCode}
              title="Copy Room ID"
              className="ml-1 text-slate-400 hover:text-white transition"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 px-3 py-2 text-xs font-mono text-slate-300 shadow-lg backdrop-blur-xl">
            {formatDuration(callDuration)}
          </div>
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
          {/* Network Health Indicator Pill */}
          <button
            onClick={() => setIsStatsOpen(!isStatsOpen)}
            className="flex items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/80 px-3.5 py-2 shadow-lg backdrop-blur-xl hover:bg-slate-800 transition"
          >
            <Wifi className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold capitalize text-slate-200">
              {networkStats.tier.replace('-', ' ')}
            </span>
            <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
              {networkStats.rtt}ms
            </span>
          </button>

          {/* Participant count badge */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-800/80 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur-xl">
            <Users className="h-4 w-4 text-slate-400" />
            <span>2</span>
          </div>
        </div>
      </header>

      {/* Main Video Arena */}
      <div className="flex-1 w-full h-full p-4 pb-24 pt-20 flex items-center justify-center">
        <div className="relative w-full h-full max-w-7xl max-h-[90vh] rounded-3xl overflow-hidden border border-slate-800/90 bg-slate-900 shadow-2xl flex items-center justify-center">
          {/* Main Remote Video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              networkStats.tier === 'critical-audio-only' ? 'opacity-20 blur-md' : 'opacity-100'
            }`}
          />

          {/* Extreme Network Critical Audio-Only Banner */}
          {networkStats.tier === 'critical-audio-only' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 text-center p-6">
              <div className="h-16 w-16 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center animate-pulse">
                <Wifi className="h-8 w-8 text-rose-400" />
              </div>
              <h3 className="mt-4 text-xl font-bold text-white">Low Bandwidth Mode Active</h3>
              <p className="mt-2 text-sm text-slate-300 max-w-md">
                Video suspended to prioritize pristine Opus voice transmission without dropouts or bufferbloat.
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-full bg-rose-950/80 border border-rose-800/60 px-3 py-1 text-xs text-rose-300 font-mono">
                Packet Loss: {networkStats.packetLoss}% | In-band FEC Active
              </div>
            </div>
          )}

          {/* Remote Peer Label */}
          <div className="absolute bottom-5 left-5 z-20 flex items-center gap-2 rounded-xl bg-black/60 px-3 py-1.5 backdrop-blur-md border border-slate-800 text-xs text-slate-200">
            <span>Remote Peer (Simulcast Downlink)</span>
            <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] font-mono text-cyan-400">
              {networkStats.resolution}
            </span>
          </div>

          {/* Floating Local Stream PiP */}
          <div className="absolute bottom-5 right-5 z-20 w-52 md:w-64 aspect-video rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-950 shadow-2xl group">
            {isVideoOff ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500">
                <VideoOff className="h-8 w-8" />
                <span className="text-[10px] mt-1">Camera Off</span>
              </div>
            ) : (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            )}

            <div className="absolute top-2 left-2 flex items-center gap-1">
              {isAudioMuted && (
                <div className="rounded-md bg-rose-600/90 p-1 text-white">
                  <MicOff className="h-3 w-3" />
                </div>
              )}
            </div>

            <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] text-slate-300 backdrop-blur-sm">
              You ({user?.email?.split('@')[0]})
            </div>
          </div>
        </div>
      </div>

      {/* Floating HUD & Chat Modals */}
      <NetworkStatsHUD
        stats={networkStats}
        onSimulateTier={handleSimulateTier}
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
      />

      <ChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={messages}
        onSendMessage={handleSendMessage}
      />

      {/* Call Controls */}
      <Controls
        isAudioMuted={isAudioMuted}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        isChatOpen={isChatOpen}
        isStatsOpen={isStatsOpen}
        networkTier={networkStats.tier}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        onToggleStats={() => setIsStatsOpen(!isStatsOpen)}
        onEndCall={onLeave}
      />
    </div>
  );
};
