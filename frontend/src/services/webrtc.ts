import { NetworkQualityStats, NetworkTier, ChatMessage } from '../types';

export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private statsInterval: number | null = null;
  private heartbeatInterval: number | null = null;
  private offerFallbackTimer: number | null = null;
  private virtualStreamInterval: number | null = null;
  private roomId: string | null = null;
  private isCaller: boolean = false;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];

  // Real telemetry tracking
  private prevBytesReceived: number = 0;
  private prevTimestamp: number = 0;
  private isManualSimulation: boolean = false;

  private onStatsCallback?: (stats: NetworkQualityStats) => void;
  private onTrackCallback?: (stream: MediaStream, track: MediaStreamTrack) => void;
  private onChatCallback?: (msg: ChatMessage) => void;
  private onPeerStatusCallback?: (status: {
    connected: boolean;
    email?: string;
    peersCount?: number;
    iceState?: RTCIceConnectionState;
  }) => void;

  // Adaptive network state
  private currentTier: NetworkTier = 'excellent';
  private simulatedLoss: number = 0.5; // %
  private simulatedRtt: number = 35; // ms

  constructor() {
    this.initPeerConnection();
  }

  public static getSavedIceServers(): RTCIceServer[] {
    const baseServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ];

    try {
      const stored = localStorage.getItem('auracall_turn_servers');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log('[WEBRTC] Loaded custom TURN servers from storage:', parsed);
          return [...baseServers, ...parsed];
        }
      }
    } catch (e) {
      console.warn('[WEBRTC] Could not parse stored TURN servers:', e);
    }

    if (import.meta.env.VITE_TURN_SERVERS) {
      try {
        const parsed = JSON.parse(import.meta.env.VITE_TURN_SERVERS);
        if (Array.isArray(parsed)) return [...baseServers, ...parsed];
      } catch {}
    }

    return baseServers;
  }

  public static saveCustomTurn(servers: RTCIceServer[]) {
    localStorage.setItem('auracall_turn_servers', JSON.stringify(servers));
  }

  public static clearCustomTurn() {
    localStorage.removeItem('auracall_turn_servers');
  }

  public static hasCustomTurn(): boolean {
    const stored = localStorage.getItem('auracall_turn_servers');
    if (!stored) return false;
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }

  private initPeerConnection() {
    const rtcConfig: RTCConfiguration = {
      iceServers: WebRTCManager.getSavedIceServers(),
      iceCandidatePoolSize: 10,
    };

    try {
      this.peerConnection = new RTCPeerConnection(rtcConfig);

      this.peerConnection.ontrack = (event) => {
        console.log('[WEBRTC] Remote track received:', event.track.kind, event.track.id, 'muted:', event.track.muted);
        const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
        this.onTrackCallback?.(stream, event.track);
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateData =
            typeof event.candidate.toJSON === 'function'
              ? event.candidate.toJSON()
              : {
                  candidate: event.candidate.candidate,
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                  usernameFragment: event.candidate.usernameFragment,
                };
          this.sendSignal('ice-candidate', { candidate: candidateData });
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection?.iceConnectionState;
        console.log('[WEBRTC] ICE connection state:', state);
        if (state === 'connected' || state === 'completed') {
          this.setHighDefinitionVideoParameters();
          this.onPeerStatusCallback?.({ connected: true, iceState: state });
        } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          this.onPeerStatusCallback?.({ connected: false, iceState: state });
        } else if (state) {
          this.onPeerStatusCallback?.({ connected: true, iceState: state });
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        console.log('[WEBRTC] Connection state:', this.peerConnection?.connectionState);
      };
    } catch (err) {
      console.warn('[WEBRTC] PeerConnection init failed:', err);
    }
  }

  public async getLocalMedia(video = true, audio = true): Promise<MediaStream> {
    try {
      // Robust constraints that work across desktop and mobile cameras (portrait/landscape)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
        video: video
          ? {
              facingMode: 'user',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            }
          : false,
      });

      this.localStream = stream;

      // Add local tracks to PeerConnection
      if (this.peerConnection) {
        stream.getTracks().forEach((track) => {
          this.peerConnection?.addTrack(track, stream);
        });
      }

      return stream;
    } catch (err) {
      console.warn('Camera/Mic permission missing or blocked. Using fallback virtual stream:', err);
      return this.createVirtualStream(video, audio);
    }
  }

  public connectSignaling(roomId: string, token: string) {
    this.roomId = roomId;

    let baseWsUrl = import.meta.env.VITE_WS_URL || 'wss://auracall-signaling-service.onrender.com';
    if (baseWsUrl.startsWith('http://')) baseWsUrl = baseWsUrl.replace('http://', 'ws://');
    if (baseWsUrl.startsWith('https://')) baseWsUrl = baseWsUrl.replace('https://', 'wss://');
    baseWsUrl = baseWsUrl.replace(/\/+$/, '');

    const wsUrl = `${baseWsUrl}/?token=${encodeURIComponent(token)}`;
    console.log(`[WEBRTC] Connecting to WebSocket Signaling Server: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[SIGNALING] Connected! Joining room: ${roomId}`);
        this.sendSignal('join-room', { roomId });

        // 20-second heartbeat ping to keep Render WebSocket alive
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = window.setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendSignal('ping', {});
          }
        }, 20000);
      };

      this.ws.onmessage = async (event) => {
        try {
          const packet = JSON.parse(event.data);
          const { type, payload } = packet;

          switch (type) {
            case 'pong': {
              break;
            }

            case 'room-joined': {
              console.log(`[SIGNALING] Joined room successfully: ${payload.roomId}, peers: ${payload.peersCount}`);
              if (payload.iceServers && Array.isArray(payload.iceServers)) {
                try {
                  if (this.peerConnection && typeof this.peerConnection.setConfiguration === 'function') {
                    this.peerConnection.setConfiguration({
                      iceServers: payload.iceServers,
                      iceCandidatePoolSize: 10,
                    });
                    console.log('[WEBRTC] Applied dynamic ICE servers from signaling:', payload.iceServers.length);
                  }
                } catch (e) {
                  console.warn('[WEBRTC] setConfiguration error:', e);
                }
              }
              if (payload.peersCount && payload.peersCount > 1) {
                this.onPeerStatusCallback?.({ connected: true, peersCount: payload.peersCount });

                // Polite peer fallback: if no offer arrives within 2.5s from existing member, send offer
                if (this.offerFallbackTimer) clearTimeout(this.offerFallbackTimer);
                this.offerFallbackTimer = window.setTimeout(async () => {
                  if (this.peerConnection && !this.peerConnection.remoteDescription) {
                    console.log('[SIGNALING] Initiating offer as polite peer.');
                    await this.createAndSendOffer();
                  }
                }, 2500);
              } else {
                this.onPeerStatusCallback?.({ connected: false, peersCount: 1 });
              }
              break;
            }

            case 'peer-joined': {
              console.log(`[SIGNALING] Remote peer joined: ${payload.peerId} (${payload.email}). Creating WebRTC Offer.`);
              if (this.offerFallbackTimer) clearTimeout(this.offerFallbackTimer);
              this.isCaller = true;
              this.onPeerStatusCallback?.({ connected: true, email: payload.email, peersCount: 2 });
              await this.createAndSendOffer();
              break;
            }

            case 'signal-offer': {
              console.log('[SIGNALING] Received WebRTC Offer from peer. Answering.');
              if (this.offerFallbackTimer) clearTimeout(this.offerFallbackTimer);
              this.onPeerStatusCallback?.({ connected: true, email: payload.senderEmail, peersCount: 2 });
              await this.handleOfferAndSendAnswer(payload.sdp);
              break;
            }

            case 'signal-answer': {
              console.log('[SIGNALING] Received WebRTC Answer from peer. Setting remote description.');
              await this.handleAnswer(payload.sdp);
              break;
            }

            case 'ice-candidate': {
              if (payload.candidate) {
                await this.handleIceCandidate(payload.candidate);
              }
              break;
            }

            case 'chat-message': {
              if (payload && payload.text) {
                const chatMsg: ChatMessage = {
                  id: 'msg_' + Date.now(),
                  senderId: payload.senderId || 'peer',
                  senderEmail: payload.senderEmail || 'Peer',
                  text: payload.text,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  isSelf: false,
                };
                this.onChatCallback?.(chatMsg);
              }
              break;
            }

            case 'peer-left': {
              console.log('[SIGNALING] Remote peer left the call.');
              this.onPeerStatusCallback?.({ connected: false, peersCount: 1 });
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.error('[SIGNALING] Error processing message:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[SIGNALING] WebSocket connection error:', err);
      };

      this.ws.onclose = () => {
        console.log('[SIGNALING] WebSocket connection closed.');
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
      };
    } catch (err) {
      console.warn('[SIGNALING] Could not establish WebSocket:', err);
    }
  }

  private sendSignal(type: string, payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  public sendChatMessage(text: string) {
    this.sendSignal('chat-message', { text });
  }

  private boostSdpBitrate(sdp: string): string {
    if (!sdp) return sdp;
    let modified = sdp;
    // Inject b=AS:4000 (4 Mbps) and b=TIAS:4000000 into m=video section
    if (modified.includes('m=video') && !modified.includes('b=AS:')) {
      modified = modified.replace(/(m=video [^\r\n]+\r?\n)/, '$1b=AS:4000\r\nb=TIAS:4000000\r\n');
    }
    return modified;
  }

  public async setHighDefinitionVideoParameters() {
    if (!this.peerConnection) return;
    try {
      const senders = this.peerConnection.getSenders();
      for (const sender of senders) {
        if (sender.track && sender.track.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          // Set 4 Mbps maximum bitrate for crystal-clear 1080p/720p HD
          params.encodings[0].maxBitrate = 4000000;
          params.encodings[0].maxFramerate = 30;
          params.encodings[0].scaleResolutionDownBy = 1.0; // Strictly 1:1 crisp scaling
          // 'maintain-resolution' ensures text and facial sharpness are preserved
          params.degradationPreference = 'maintain-resolution';
          await sender.setParameters(params);
          console.log('[WEBRTC] High definition video parameters applied (4 Mbps, scale 1.0, maintain-resolution)');
        }
        if (sender.track && sender.track.kind === 'audio') {
          const params = sender.getParameters();
          if (params.encodings && params.encodings.length > 0) {
            params.encodings[0].maxBitrate = 64000; // 64 kbps high-fidelity voice
            await sender.setParameters(params);
          }
        }
      }
    } catch (e) {
      console.warn('[WEBRTC] setHighDefinitionVideoParameters warning:', e);
    }
  }

  private async createAndSendOffer() {
    if (!this.peerConnection) return;
    try {
      const offer = await this.peerConnection.createOffer();
      const boostedSdp = this.boostSdpBitrate(offer.sdp || '');
      await this.peerConnection.setLocalDescription({ type: offer.type, sdp: boostedSdp });
      await this.setHighDefinitionVideoParameters();

      this.sendSignal('signal-offer', {
        sdp: {
          type: offer.type,
          sdp: boostedSdp,
        },
      });
    } catch (err) {
      console.error('[WEBRTC] Failed to create offer:', err);
    }
  }

  private async handleOfferAndSendAnswer(offer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return;
    try {
      if (this.peerConnection.signalingState !== 'stable') {
        console.warn('[WEBRTC] handleOffer called while signalingState is:', this.peerConnection.signalingState);
        await Promise.all([
          this.peerConnection.setLocalDescription({ type: 'rollback' }),
          this.peerConnection.setRemoteDescription(offer),
        ]);
      } else {
        await this.peerConnection.setRemoteDescription(offer);
      }

      // Flush queued ICE candidates
      while (this.iceCandidatesQueue.length > 0) {
        const cand = this.iceCandidatesQueue.shift();
        if (cand) {
          try {
            await this.peerConnection.addIceCandidate(cand);
          } catch (e) {
            console.warn('[WEBRTC] Queued candidate add error:', e);
          }
        }
      }

      const answer = await this.peerConnection.createAnswer();
      const boostedSdp = this.boostSdpBitrate(answer.sdp || '');
      await this.peerConnection.setLocalDescription({ type: answer.type, sdp: boostedSdp });
      await this.setHighDefinitionVideoParameters();

      this.sendSignal('signal-answer', {
        sdp: {
          type: answer.type,
          sdp: boostedSdp,
        },
      });
    } catch (err) {
      console.error('[WEBRTC] Failed to handle offer and create answer:', err);
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return;
    try {
      if (this.peerConnection.signalingState !== 'have-local-offer') {
        console.warn('[WEBRTC] handleAnswer in unexpected state:', this.peerConnection.signalingState);
        return;
      }

      await this.peerConnection.setRemoteDescription(answer);
      await this.setHighDefinitionVideoParameters();

      // Flush queued candidates
      while (this.iceCandidatesQueue.length > 0) {
        const cand = this.iceCandidatesQueue.shift();
        if (cand) {
          try {
            await this.peerConnection.addIceCandidate(cand);
          } catch (e) {
            console.warn('[WEBRTC] Queued candidate add error:', e);
          }
        }
      }
    } catch (err) {
      console.error('[WEBRTC] Failed to set remote description (answer):', err);
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection) return;
    try {
      if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
        await this.peerConnection.addIceCandidate(candidate);
      } else {
        this.iceCandidatesQueue.push(candidate);
      }
    } catch (err) {
      console.warn('[WEBRTC] Error adding ICE candidate:', err);
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
        hue = (hue + 2) % 360;
        ctx.fillStyle = `hsl(${hue}, 40%, 15%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AuraCall HD Adaptive Feed', canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.fillText(
          `Simulated Adaptive Stream | Tier: ${this.currentTier.toUpperCase()}`,
          canvas.width / 2,
          canvas.height / 2 + 15
        );
      }
    };
    draw();

    // Use setInterval instead of requestAnimationFrame so off-screen canvas NEVER freezes
    if (this.virtualStreamInterval) clearInterval(this.virtualStreamInterval);
    this.virtualStreamInterval = window.setInterval(draw, 33);

    const canvasStream = canvas.captureStream(30);

    if (audio) {
      try {
        const audioCtx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0; // Silent fallback
        const dst = audioCtx.createMediaStreamDestination();
        oscillator.connect(gainNode);
        gainNode.connect(dst);
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

    if (this.peerConnection) {
      canvasStream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, canvasStream);
      });
    }

    return canvasStream;
  }

  public setCallbacks(
    onStats: (stats: NetworkQualityStats) => void,
    onTrack: (stream: MediaStream, track: MediaStreamTrack) => void,
    onChat?: (msg: ChatMessage) => void,
    onPeerStatus?: (status: {
      connected: boolean;
      email?: string;
      peersCount?: number;
      iceState?: RTCIceConnectionState;
    }) => void
  ) {
    this.onStatsCallback = onStats;
    this.onTrackCallback = onTrack;
    this.onChatCallback = onChat;
    this.onPeerStatusCallback = onPeerStatus;
  }

  public startNetworkMonitoring() {
    if (this.statsInterval) clearInterval(this.statsInterval);

    this.statsInterval = window.setInterval(async () => {
      const stats = await this.computeNetworkStats();
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

  public simulateNetworkCondition(tier: NetworkTier) {
    this.isManualSimulation = true;
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

    const mockStats: NetworkQualityStats = {
      rtt: this.simulatedRtt,
      packetLoss: this.simulatedLoss,
      bitrateKbps: tier === 'good' ? 480 : tier === 'poor' ? 140 : tier === 'critical-audio-only' ? 32 : 1200,
      resolution:
        tier === 'good'
          ? '640x360 @ 24fps'
          : tier === 'poor'
          ? '320x180 @ 15fps'
          : tier === 'critical-audio-only'
          ? 'Audio Only'
          : '1280x720 @ 30fps',
      tier: this.currentTier,
      codec: 'VP8 / Opus FEC',
      fecActive: this.simulatedLoss > 3,
      isRealStats: false,
    };

    this.onStatsCallback?.(mockStats);
    this.applyAdaptiveLayer(tier);
  }

  // Real WebRTC telemetry from browser RTCPeerConnection.getStats()
  private async computeNetworkStats(): Promise<NetworkQualityStats> {
    const iceState = this.peerConnection?.iceConnectionState || 'new';

    if (this.isManualSimulation) {
      return {
        rtt: this.simulatedRtt,
        packetLoss: this.simulatedLoss,
        bitrateKbps:
          this.currentTier === 'good'
            ? 480
            : this.currentTier === 'poor'
            ? 140
            : this.currentTier === 'critical-audio-only'
            ? 32
            : 1200,
        resolution:
          this.currentTier === 'good'
            ? '640x360 @ 24fps'
            : this.currentTier === 'poor'
            ? '320x180 @ 15fps'
            : this.currentTier === 'critical-audio-only'
            ? 'Audio Only'
            : '1280x720 @ 30fps',
        tier: this.currentTier,
        codec: 'VP8 / Opus FEC',
        fecActive: this.simulatedLoss > 3,
        iceState,
        isRealStats: false,
      };
    }

    let realRtt = 0;
    let realBitrateKbps = 0;
    let realPacketLoss = 0;
    let framesDecoded = 0;
    let resolution = 'Negotiating...';
    let detectedCodec = 'VP8 / Opus FEC';

    if (this.peerConnection) {
      try {
        const stats = await this.peerConnection.getStats();
        const now = Date.now();

        stats.forEach((report) => {
          // Check active candidate pair for real RTT
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime !== undefined) {
              realRtt = Math.round(report.currentRoundTripTime * 1000);
            }
          }

          // Inbound RTP video track stats
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            framesDecoded = report.framesDecoded || 0;
            const bytesReceived = report.bytesReceived || 0;

            if (this.prevTimestamp > 0 && bytesReceived >= this.prevBytesReceived) {
              const dtSec = (now - this.prevTimestamp) / 1000;
              if (dtSec > 0) {
                realBitrateKbps = Math.round(((bytesReceived - this.prevBytesReceived) * 8) / (dtSec * 1000));
              }
            }

            this.prevBytesReceived = bytesReceived;
            this.prevTimestamp = now;

            const packetsLost = report.packetsLost || 0;
            const packetsReceived = report.packetsReceived || 0;
            const total = packetsLost + packetsReceived;
            if (total > 0) {
              realPacketLoss = Number(((packetsLost / total) * 100).toFixed(1));
            }

            if (report.frameWidth && report.frameHeight) {
              resolution = `${report.frameWidth}x${report.frameHeight} @ ${report.framesPerSecond || 30}fps`;
            } else if (framesDecoded > 0) {
              resolution = 'Active Feed (Decoding)';
            }
          }

          // Codec detection
          if (report.type === 'codec' && report.mimeType && report.mimeType.toLowerCase().includes('video')) {
            detectedCodec = `${report.mimeType.replace('video/', '').toUpperCase()} / Opus FEC`;
          }
        });
      } catch (e) {
        console.warn('[WEBRTC] getStats error:', e);
      }
    }

    // Determine tier based on REAL network metrics
    let derivedTier: NetworkTier = 'excellent';
    if (iceState !== 'connected' && iceState !== 'completed') {
      derivedTier = 'good';
      resolution = iceState === 'failed' ? 'ICE Failed (NAT Block)' : `ICE: ${iceState.toUpperCase()}`;
    } else if (framesDecoded === 0 && realBitrateKbps === 0) {
      derivedTier = 'good';
      resolution = 'Connected • Awaiting Frames';
    } else if (realPacketLoss > 20 || realRtt > 400) {
      derivedTier = 'critical-audio-only';
    } else if (realPacketLoss > 8 || realRtt > 200) {
      derivedTier = 'poor';
    } else if (realPacketLoss > 2 || realRtt > 80) {
      derivedTier = 'good';
    }

    return {
      rtt: realRtt,
      packetLoss: realPacketLoss,
      bitrateKbps: realBitrateKbps,
      resolution,
      tier: derivedTier,
      codec: detectedCodec,
      fecActive: realPacketLoss > 3,
      iceState,
      framesDecoded,
      isRealStats: true,
    };
  }

  private applyAdaptiveLayer(tier: NetworkTier) {
    // Only adaptively disable video if the user is explicitly testing via manual simulation
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack && this.isManualSimulation) {
      if (tier === 'critical-audio-only') {
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

      if (this.peerConnection && screenStream) {
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'video');
        if (sender && screenTrack) {
          sender.replaceTrack(screenTrack);
        }
      }

      return screenStream;
    } catch {
      console.log('Screen sharing cancelled or unsupported');
      return null;
    }
  }

  public getRoomId(): string | null {
    return this.roomId;
  }

  public isRoomCaller(): boolean {
    return this.isCaller;
  }

  public destroy() {
    this.stopNetworkMonitoring();
    if (this.virtualStreamInterval) {
      clearInterval(this.virtualStreamInterval);
      this.virtualStreamInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.offerFallbackTimer) {
      clearTimeout(this.offerFallbackTimer);
      this.offerFallbackTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}
