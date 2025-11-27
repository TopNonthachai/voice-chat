import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');

  const createRoom = () => {
    const id = uuidv4();
    navigate(`/room/${id}`);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      navigate(`/room/${roomCode}`);
    }
  };

  return (
    <div className="min-h-screen bg-discord-dark flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-10 left-10 w-32 h-32 bg-discord-primary rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
          <div className="absolute top-10 right-10 w-32 h-32 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-32 h-32 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="z-10 bg-discord-darker p-8 rounded-lg shadow-2xl w-full max-w-md border border-discord-darkest">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-discord-primary rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg transform rotate-3">
            <i className="fas fa-headset text-3xl text-white"></i>
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2">VoiceCord</h1>
          <p className="text-discord-muted">Your place to talk. Create a room and hang out.</p>
        </div>

        <div className="space-y-6">
          <button
            onClick={createRoom}
            className="w-full bg-discord-primary hover:bg-blue-600 text-white font-bold py-3 px-4 rounded transition duration-200 flex items-center justify-center group"
          >
            <i className="fas fa-plus-circle mr-2 group-hover:scale-110 transition-transform"></i>
            Create New Room
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-discord-light"></div>
            <span className="flex-shrink-0 mx-4 text-discord-muted text-sm">OR JOIN WITH CODE</span>
            <div className="flex-grow border-t border-discord-light"></div>
          </div>

          <form onSubmit={joinRoom} className="space-y-4">
            <div>
              <label htmlFor="roomCode" className="block text-xs font-bold text-discord-muted uppercase mb-2">
                Room Code
              </label>
              <input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="e.g. 8f9s-22..."
                className="w-full bg-discord-darkest border border-transparent focus:border-discord-primary text-white rounded p-3 outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={!roomCode}
              className={`w-full font-bold py-3 px-4 rounded transition duration-200 ${
                roomCode 
                  ? 'bg-discord-success hover:bg-green-600 text-white' 
                  : 'bg-discord-light text-discord-muted cursor-not-allowed'
              }`}
            >
              Join Room
            </button>
          </form>
        </div>
      </div>
      
      <div className="mt-8 text-center text-discord-muted text-sm">
        <p className="mb-2">Need to setup the backend?</p>
        <button 
            onClick={() => navigate('/server-setup')} 
            className="text-discord-primary hover:underline"
        >
            View Server Instructions
        </button>
      </div>
    </div>
  );
};

export default Landing;