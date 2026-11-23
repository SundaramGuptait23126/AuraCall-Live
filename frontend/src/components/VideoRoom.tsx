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
  Radio,
  Loader2,
  Volume2,
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
  const { user, token } = useAuth();
  const [manager] = useState(() => new WebRTCManager());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const [isAudioMuted, setIsAudioMuted] = useState(!initialAudio);
  const [isVideoOff, setIsVideoOff] = useState(!initialVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const [hasRemotePeer, setHasRemotePeer] = useState(false);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [remotePeerEmail, setRemotePeerEmail] = useState<string | null>(null);
  const [peerCount, setPeerCount] = useState(1);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

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
      text: `Connected to room: ${roomId}. Microservices Gateway and WebRTC P2P signaling active.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSelf: false,
    },
  ]);

  // Global user gesture listener to automatically unlock audio in strict browsers
  useEffect(() => {
    const unlockAudio = () => {
      if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
        remoteAudioRef.current
          .play()
          .then(() => {
            setIsAutoplayBlocked(false);
          })
          .catch(() => {});
      }
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Initialize Media & Call
  useEffect(() => {
    let active = true;

    const setupCall = async () => {
      manager.setCallbacks(
        (stats) => {
          if (active) setNetworkStats(stats);
        },
        (_remoteStream, track) => {
          console.log('[VIDEOROOM] Remote track received:', track.kind, track.id, track.readyState);
          if (active) {
            setHasRemotePeer(true);
            setPeerCount(2);

            // Handle video track
            if (track.kind === 'video') {
              console.log('[VIDEOROOM] Setting remote video track to MediaStream');
              setHasRemoteStream(true);
              if (remoteVideoRef.current) {
                remoteVideoRef.current.muted = true;
                remoteVideoRef.current.defaultMuted = true;
                remoteVideoRef.current.srcObject = new MediaStream([track]);
                remoteVideoRef.current.play().catch((err) => {
                  console.warn('[VIDEOROOM] Remote video play error:', err);
                });
              }
            }

            // Handle audio track via dedicated unmuted audio element
            if (track.kind === 'audio') {
              console.log('[VIDEOROOM] Setting remote audio track');
              if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = new MediaStream([track]);
                remoteAudioRef.current
                  .play()
                  .then(() => {
                    setIsAutoplayBlocked(false);
                  })
                  .catch((err) => {
                    console.warn('[VIDEOROOM] Remote audio autoplay blocked:', err);
                    setIsAutoplayBlocked(true);
                  });
              }
            }
          }
        },
        (chatMsg) => {
          if (active) {
            setMessages((prev) => [...prev, chatMsg]);
          }
        },
        (status) => {
          console.log('[VIDEOROOM] Peer status updated:', status);
          if (active) {
            setHasRemotePeer(status.connected);
            if (status.connected) {
              setPeerCount(status.peersCount || 2);
              if (status.email) setRemotePeerEmail(status.email);
            } else {
              setPeerCount(1);
              setHasRemoteStream(false);
              setRemotePeerEmail(null);
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
              }
              if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = null;
              }
            }
          }
        }
      );

      // Acquire local camera & microphone
      const stream = await manager.getLocalMedia(!isVideoOff, !isAudioMuted);
      if (localVideoRef.current && active) {
        localVideoRef.current.srcObject = stream;
      }

      // Connect to WebSocket signaling server
      if (active) {
        manager.connectSignaling(roomId, token || '');
        manager.startNetworkMonitoring();
      }
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
  }, [manager, roomId, token]);

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
    manager.sendChatMessage(text);
  };

  const handleUnblockAutoplay = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current
        .play()
        .then(() => {
          setIsAutoplayBlocked(false);
        })
        .catch((e) => console.warn('Retry play failed:', e));
    }
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
            <span>{peerCount}</span>
          </div>
        </div>
      </header>

      {/* Main Video Arena */}
      <div className="flex-1 w-full h-full p-4 pb-24 pt-20 flex items-center justify-center">
        <div className="relative w-full h-full max-w-7xl max-h-[90vh] rounded-3xl overflow-hidden border border-slate-800/90 bg-slate-900 shadow-2xl flex items-center justify-center">
          {/* Main Remote Video: ALWAYS MUTED so browser never pauses or blocks video decoding */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-500 ${
              hasRemoteStream
                ? networkStats.tier === 'critical-audio-only'
                  ? 'opacity-20 blur-md'
                  : 'opacity-100'
                : 'opacity-0 pointer-events-none absolute'
            }`}
          />

          {/* Dedicated Audio Element for Peer Voice */}
          <audio ref={remoteAudioRef} autoPlay playsInline />

          {/* Autoplay Audio Unblock Banner */}
          {isAutoplayBlocked && (
            <div className="absolute top-6 z-30 flex items-center gap-3 px-4 py-2 rounded-2xl bg-amber-500/90 text-slate-950 shadow-2xl backdrop-blur-md animate-bounce">
              <Volume2 className="h-5 w-5" />
              <span className="text-xs font-bold">Tap anywhere to unmute peer audio.</span>
              <button
                onClick={handleUnblockAutoplay}
                className="px-3 py-1 bg-slate-950 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
              >
                Unmute Sound
              </button>
            </div>
          )}

          {/* State 1: Peer has joined signaling, but video track is not ready yet */}
          {hasRemotePeer && !hasRemoteStream && (
            <div className="flex flex-col items-center justify-center p-8 text-center max-w-md z-10 animate-fade-in">
              <div className="relative mb-6">
                <div className="h-20 w-20 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-cyan-400 animate-spin" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Connecting to Peer...</h2>
              <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
                Peer ({remotePeerEmail ? remotePeerEmail.split('@')[0] : 'Remote'}) connected. Synchronizing video streams...
              </p>
              <div className="flex items-center gap-2 rounded-full bg-slate-950/80 border border-slate-800 px-3 py-1 text-[11px] font-mono text-cyan-400">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                <span>P2P Media Channel Active</span>
              </div>
            </div>
          )}

          {/* State 2: Waiting for Peer to join room */}
          {!hasRemotePeer && (
            <div className="flex flex-col items-center justify-center p-8 text-center max-w-lg z-10">
              <div className="relative mb-6">
                <div className="h-20 w-20 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center animate-pulse">
                  <Radio className="h-9 w-9 text-cyan-400 animate-pulse" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                </span>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Waiting for peer to connect...</h2>
              <p className="text-sm text-slate-400 mb-6 max-w-md leading-relaxed">
                Enter room code <span className="font-mono text-cyan-300 font-semibold">{roomId}</span> on your second device or send this code to start live video & audio call.
              </p>

              <div className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-inner">
                <span className="font-mono text-sm text-cyan-300 font-semibold px-2">{roomId}</span>
                <button
                  onClick={copyRoomCode}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow-md"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copied ? 'Copied Room ID!' : 'Copy Code'}</span>
                </button>
              </div>

              <div className="mt-6 flex items-center gap-2 text-[11px] font-mono text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>WebRTC Signaling Live • Ready for P2P Handshake</span>
              </div>
            </div>
          )}

          {/* Extreme Network Critical Audio-Only Banner */}
          {hasRemoteStream && networkStats.tier === 'critical-audio-only' && (
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
          {hasRemoteStream && (
            <div className="absolute bottom-5 left-5 z-20 flex items-center gap-2 rounded-xl bg-black/60 px-3 py-1.5 backdrop-blur-md border border-slate-800 text-xs text-slate-200">
              <span>{remotePeerEmail ? `Peer (${remotePeerEmail.split('@')[0]})` : 'Remote Peer'}</span>
              <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] font-mono text-cyan-400">
                {networkStats.resolution}
              </span>
            </div>
          )}

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
