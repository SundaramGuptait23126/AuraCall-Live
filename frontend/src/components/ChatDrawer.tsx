import React, { useState } from 'react';
import { ChatMessage } from '../types';
import { Send, MessageSquare } from 'lucide-react';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
}) => {
  const [text, setText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
  };

  return (
    <div className="absolute right-4 top-16 bottom-24 z-40 w-80 rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800 p-3.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">In-Call Chat</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-slate-500 mt-10">
            No messages yet. Send a message to participants!
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}
            >
              <span className="text-[10px] text-slate-400 mb-0.5">
                {msg.isSelf ? 'You' : msg.senderEmail.split('@')[0]}
              </span>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                  msg.isSelf
                    ? 'bg-cyan-600 text-white rounded-br-none'
                    : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-800 p-3 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type message..."
          className="flex-1 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-cyan-600 p-2 text-white hover:bg-cyan-500 transition"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};
