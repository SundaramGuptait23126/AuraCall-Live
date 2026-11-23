export interface User {
  id: string;
  email: string;
  name?: string;
}

export type NetworkTier = 'excellent' | 'good' | 'poor' | 'critical-audio-only';

export interface NetworkQualityStats {
  rtt: number; // Round trip time in ms
  packetLoss: number; // percentage (0-100)
  bitrateKbps: number; // current video bitrate
  resolution: string; // e.g. "1280x720", "640x360", "320x180", "Audio Only"
  tier: NetworkTier;
  codec: string; // VP8 / VP9 / H264
  fecActive: boolean;
  iceState?: RTCIceConnectionState;
  framesDecoded?: number;
  isRealStats?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderEmail: string;
  text: string;
  timestamp: string;
  isSelf: boolean;
}

export interface Participant {
  id: string;
  email: string;
  audioMuted: boolean;
  videoOff: boolean;
  isSpeaking: boolean;
  networkTier: NetworkTier;
}

export type CallStage = 'auth' | 'lobby' | 'in-call';
