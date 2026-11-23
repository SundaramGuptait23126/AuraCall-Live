import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  LogOut,
  Sparkles,
  ArrowRight,
  Shield,
  Zap,
} from 'lucide-react';

interface LobbyProps {
  onJoinRoom: (roomId: string, initialAudio: boolean, initialVideo: boolean) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoinRoom }) => {
  const { user, logout } = useAuth();
  const [roomIdInput, setRoomIdInput] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startPreview = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setPreviewStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.warn('Lobby camera preview fallback:', e);
      }
    };

    startPreview();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const toggleVideo = () => {
    if (previewStream) {
      const vTrack = previewStream.getVideoTracks()[0];
      if (vTrack) {
        vTrack.enabled = !videoEnabled;
      }
    }
    setVideoEnabled(!videoEnabled);
  };

  const toggleAudio = () => {
    if (previewStream) {
      const aTrack = previewStream.getAudioTracks()[0];
      if (aTrack) {
        aTrack.enabled = !audioEnabled;
      }
    }
    setAudioEnabled(!audioEnabled);
  };

  const handleCreateInstant = () => {
    const randomId = 'room-' + Math.random().toString(36).substring(2, 7);
    if (previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
    }
    onJoinRoom(randomId, audioEnabled, videoEnabled);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput.trim()) return;
    if (previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
    }
    onJoinRoom(roomIdInput.trim(), audioEnabled, videoEnabled);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 px-6 py-4 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-md">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white text-base">AuraCall Live</span>
            <span className="ml-2 rounded-md bg-cyan-950/80 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 border border-cyan-800/50">
              Microservices Gateway
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="block text-xs font-medium text-slate-200">{user?.email}</span>
            <span className="block text-[10px] text-emerald-400 font-mono">Authenticated via JWT</span>
          </div>
          <button
            onClick={logout}
            title="Log Out"
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Lobby Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-10 flex flex-col lg:flex-row items-center justify-center gap-10">
        {/* Pre-call Video & Audio Testing Card */}
        <div className="w-full lg:w-1/2 flex flex-col items-center">
          <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl flex items-center justify-center group">
            {videoEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500">
                <VideoOff className="h-12 w-12 stroke-[1.5]" />
                <span className="mt-2 text-xs font-medium">Camera is disabled</span>
              </div>
            )}

            {/* Quick in-preview device toggles */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full bg-slate-950/80 px-4 py-2 border border-slate-700/60 backdrop-blur-md">
              <button
                onClick={toggleAudio}
                className={`p-2.5 rounded-full transition ${
                  audioEnabled ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-rose-600 text-white'
                }`}
              >
                {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </button>
              <button
                onClick={toggleVideo}
                className={`p-2.5 rounded-full transition ${
                  videoEnabled ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-rose-600 text-white'
                }`}
              >
                {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </button>
            </div>

            <div className="absolute top-4 left-4 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-mono text-slate-300 backdrop-blur-sm border border-slate-800">
              Pre-call Device Check
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400 text-center">
            Check your audio and video before stepping into the room.
          </p>
        </div>

        {/* Room Launch & Join Panel */}
        <div className="w-full lg:w-1/2 max-w-md space-y-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Ready to collaborate?
            </h2>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Experience seamless HD calls built to withstand packet loss and congested 2G/3G networks with automated Simulcast adaptation.
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleCreateInstant}
              className="w-full flex items-center justify-between rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 p-4 font-semibold text-white shadow-xl shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/10">
                  <Video className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-bold">Start Instant Meeting</span>
                  <span className="block text-xs text-cyan-100">Create a new secure room</span>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-950 px-3 text-xs text-slate-500 font-medium uppercase tracking-wider">
                Or join with link/code
              </span>
            </div>

            <form onSubmit={handleJoin} className="flex gap-2">
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="Enter Room Code (e.g. room-alpha)"
                className="flex-1 rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!roomIdInput.trim()}
                className="rounded-xl bg-slate-800 border border-slate-700 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40 transition"
              >
                Join
              </button>
            </form>
          </div>

          {/* Microservices Architecture Indicators */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
                <Zap className="h-3.5 w-3.5" />
                SFU Simulcast
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Auto 720p/360p/180p tiering and Opus FEC packet recovery.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
                <Shield className="h-3.5 w-3.5" />
                SLM Auth Engine
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                OTP verification tokenized through Nginx API Gateway.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
