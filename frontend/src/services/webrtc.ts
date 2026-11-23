import { NetworkQualityStats, NetworkTier, ChatMessage } from '../types';

function enableOpusFEC(sdp: string): string {
  const lines = sdp.split('\r\n');
  let opusPayload: string | null = null;
  for (const line of lines) {
    const m = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (m) {
      opusPayload = m[1];
      break;
    }
  }
  if (!opusPayload) return sdp;

  return lines
    .map((line) => {
      if (line.startsWith(`a=fmtp:${opusPayload}`)) {
        let updated = line;
        if (!updated.includes('useinbandfec=')) updated += ';useinbandfec=1';
        if (!updated.includes('usedtx=')) updated += ';usedtx=1';
        return updated;
      }
      return line;
    })
    .join('\r\n');
}

export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private statsInterval: number | null = null;
  private heartbeatInterval: number | null = null;
  private offerFallbackTimer: number | null = null;
  private roomId: string | null = null;
  private isCaller: boolean = false;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];

  private onStatsCallback?: (stats: NetworkQualityStats) => void;
  private onTrackCallback?: (stream: MediaStream) => void;
  private onChatCallback?: (msg: ChatMessage) => void;
  private onPeerStatusCallback?: (status: { connected: boolean; email?: string; peersCount?: number }) => void;

  // Adaptive low-network state
  private currentTier: NetworkTier = 'excellent';
  private simulatedLoss: number = 0.5; // %
  private simulatedRtt: number = 35; // ms

  constructor() {
    this.initPeerConnection();
  }

  private initPeerConnection() {
    const rtcConfig: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:openrelay.metered.ca:80' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
      iceCandidatePoolSize: 10,
    };

    try {
      this.peerConnection = new RTCPeerConnection(rtcConfig);

      this.peerConnection.ontrack = (event) => {
        console.log('[WEBRTC] Remote track received:', event.track.kind, event.streams);
        let stream = event.streams && event.streams[0];
        if (!stream) {
          if (!this.remoteStream) {
            this.remoteStream = new MediaStream();
          }
          if (!this.remoteStream.getTracks().find((t) => t.id === event.track.id)) {
            this.remoteStream.addTrack(event.track);
          }
          stream = this.remoteStream;
        } else {
          this.remoteStream = stream;
        }
        this.onTrackCallback?.(stream);
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
          this.onPeerStatusCallback?.({ connected: true });
        } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          this.onPeerStatusCallback?.({ connected: false });
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: video
          ? {
              width: { ideal: 1280, min: 320 },
              height: { ideal: 720, min: 180 },
              frameRate: { ideal: 30, max: 30 },
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

        // Start 20s heartbeat ping to keep Render WebSocket alive
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
              // Heartbeat acknowledgement
              break;
            }

            case 'room-joined': {
              console.log(`[SIGNALING] Joined room successfully: ${payload.roomId}, peers: ${payload.peersCount}`);
              if (payload.peersCount && payload.peersCount > 1) {
                // Another peer is already in the room!
                this.onPeerStatusCallback?.({ connected: true, peersCount: payload.peersCount });

                // Polite timer: if the existing peer does not send offer within 2.5s, create offer
                if (this.offerFallbackTimer) clearTimeout(this.offerFallbackTimer);
                this.offerFallbackTimer = window.setTimeout(async () => {
                  if (this.peerConnection && !this.peerConnection.remoteDescription) {
                    console.log('[SIGNALING] No offer received from existing peer. Initiating offer as polite peer.');
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

  private async createAndSendOffer() {
    if (!this.peerConnection) return;
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await this.peerConnection.setLocalDescription(offer);

      const modifiedSdp = offer.sdp ? enableOpusFEC(offer.sdp) : offer.sdp;
      this.sendSignal('signal-offer', {
        sdp: {
          type: offer.type,
          sdp: modifiedSdp,
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
      await this.peerConnection.setLocalDescription(answer);

      const modifiedSdp = answer.sdp ? enableOpusFEC(answer.sdp) : answer.sdp;
      this.sendSignal('signal-answer', {
        sdp: {
          type: answer.type,
          sdp: modifiedSdp,
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
        hue = (hue + 1) % 360;
        ctx.fillStyle = `hsl(${hue}, 40%, 15%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '22px sans-serif';
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
      requestAnimationFrame(draw);
    };
    draw();

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
    onTrack: (stream: MediaStream) => void,
    onChat?: (msg: ChatMessage) => void,
    onPeerStatus?: (status: { connected: boolean; email?: string; peersCount?: number }) => void
  ) {
    this.onStatsCallback = onStats;
    this.onTrackCallback = onTrack;
    this.onChatCallback = onChat;
    this.onPeerStatusCallback = onPeerStatus;
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
      bitrateKbps = 32;
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
