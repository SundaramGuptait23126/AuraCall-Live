import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { Lobby } from './components/Lobby';
import { VideoRoom } from './components/VideoRoom';

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [initialAudio, setInitialAudio] = useState(true);
  const [initialVideo, setInitialVideo] = useState(true);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-cyan-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <span className="text-xs font-mono text-slate-400">Loading AuraCall environment...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthModal onSuccess={() => {}} />;
  }

  if (inCall && roomId) {
    return (
      <VideoRoom
        roomId={roomId}
        initialAudio={initialAudio}
        initialVideo={initialVideo}
        onLeave={() => setInCall(false)}
      />
    );
  }

  return (
    <Lobby
      onJoinRoom={(id, audio, video) => {
        setRoomId(id);
        setInitialAudio(audio);
        setInitialVideo(video);
        setInCall(true);
      }}
    />
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
