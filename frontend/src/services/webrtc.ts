import { NetworkQualityStats, NetworkTier } from '../types';

export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private statsInterval: number | null = null;
  private onStatsCallback?: (stats: NetworkQualityStats) => void;
  private onTrackCallback?: (stream: MediaStream) => void;

  // Adaptive low-network state
  private currentTier: NetworkTier = 'excellent';
  private simulatedLoss: number = 2; // %
  private simulatedRtt: number = 35; // ms

  constructor() {
    this.initPeerConnection();
  }

  private initPeerConnection() {
    const rtcConfig: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
      ],
      iceCandidatePoolSize: 10,
    };

    try {
      this.peerConnection = new RTCPeerConnection(rtcConfig);

      this.peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          this.onTrackCallback?.(event.streams[0]);
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', this.peerConnection?.iceConnectionState);
      };
    } catch (err) {
      console.warn('RTCPeerConnection initialization in browser fallback mode:', err);
    }
  }

  public async getLocalMedia(video = true, audio = true): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: video
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30, max: 30 },
            }
          : false,
      });

      this.localStream = stream;

      // Add tracks to PeerConnection
      if (this.peerConnection) {
        stream.getTracks().forEach((track) => {
          this.peerConnection?.addTrack(track, stream);
        });
      }

      return stream;
    } catch (err) {
      console.warn('Camera/Mic permission not granted or device missing. Creating virtual canvas stream fallback.', err);
      return this.createVirtualStream(video, audio);
    }
  }

  // Fallback virtual media for devices/browsers without active webcam
  private createVirtualStream(_video: boolean, audio: boolean): MediaStream {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    let hue = 180;

    const draw = () => {
      if (ctx) {
        hue = (hue + 1) % 360;
        ctx.fillStyle = `hsl(${hue}, 40%, 15%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AuraCall HD Adaptive Feed', canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.fillText(`Simulated Adaptive Stream | Tier: ${this.currentTier.toUpperCase()}`, canvas.width / 2, canvas.height / 2 + 15);
      }
      requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);

    // If audio is requested, generate silent/tone audio track via Web Audio API
    if (audio) {
      try {
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const dst = audioCtx.createMediaStreamDestination();
        oscillator.connect(dst);
        oscillator.start();
        const audioTrack = dst.stream.getAudioTracks()[0];
        if (audioTrack) {
          canvasStream.addTrack(audioTrack);
        }
      } catch (e) {
        console.warn('AudioContext virtual audio track error:', e);
      }
    }

    this.localStream = canvasStream;
    return canvasStream;
  }

  public setCallbacks(onStats: (stats: NetworkQualityStats) => void, onTrack: (stream: MediaStream) => void) {
    this.onStatsCallback = onStats;
    this.onTrackCallback = onTrack;
  }

  public startNetworkMonitoring() {
    if (this.statsInterval) clearInterval(this.statsInterval);

    this.statsInterval = window.setInterval(async () => {
      const stats = this.computeNetworkStats();
      this.onStatsCallback?.(stats);
      this.applyAdaptiveLayer(stats.tier);
    }, 2000);
  }

  public stopNetworkMonitoring() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  // Network Simulation Slider / Stress Test support for low-bandwidth demonstration
  public simulateNetworkCondition(tier: NetworkTier) {
    this.currentTier = tier;
    switch (tier) {
      case 'excellent':
        this.simulatedRtt = Math.floor(25 + Math.random() * 15);
        this.simulatedLoss = Number((Math.random() * 0.5).toFixed(1));
        break;
      case 'good':
        this.simulatedRtt = Math.floor(70 + Math.random() * 30);
        this.simulatedLoss = Number((1.5 + Math.random() * 2).toFixed(1));
        break;
      case 'poor':
        this.simulatedRtt = Math.floor(180 + Math.random() * 80);
        this.simulatedLoss = Number((8 + Math.random() * 7).toFixed(1));
        break;
      case 'critical-audio-only':
        this.simulatedRtt = Math.floor(380 + Math.random() * 150);
        this.simulatedLoss = Number((25 + Math.random() * 12).toFixed(1));
        break;
    }

    const stats = this.computeNetworkStats();
    this.onStatsCallback?.(stats);
    this.applyAdaptiveLayer(tier);
  }

  private computeNetworkStats(): NetworkQualityStats {
    let bitrateKbps = 1200;
    let resolution = '1280x720 @ 30fps';

    if (this.currentTier === 'good') {
      bitrateKbps = 480;
      resolution = '640x360 @ 24fps';
    } else if (this.currentTier === 'poor') {
      bitrateKbps = 140;
      resolution = '320x180 @ 15fps';
    } else if (this.currentTier === 'critical-audio-only') {
      bitrateKbps = 32; // Pure Opus FEC stream
      resolution = 'Audio Only (Video Suspended for Zero Glitch)';
    }

    return {
      rtt: this.simulatedRtt,
      packetLoss: this.simulatedLoss,
      bitrateKbps,
      resolution,
      tier: this.currentTier,
      codec: 'VP9 / Opus FEC',
      fecActive: this.simulatedLoss > 3,
    };
  }

  private applyAdaptiveLayer(tier: NetworkTier) {
    if (!this.localStream) return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      if (tier === 'critical-audio-only') {
        // Suspend video track sending to protect audio throughput
        videoTrack.enabled = false;
      } else {
        videoTrack.enabled = true;
      }
    }
  }

  public toggleAudio(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  public toggleVideo(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  public async switchScreenShare(): Promise<MediaStream | null> {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      return screenStream;
    } catch {
      console.log('Screen sharing cancelled or unsupported');
      return null;
    }
  }

  public destroy() {
    this.stopNetworkMonitoring();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}
