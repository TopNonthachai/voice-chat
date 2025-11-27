export interface User {
  id: string;
  stream?: MediaStream;
  isMuted: boolean;
  isSpeaking: boolean;
}

export interface RoomParams {
  roomId: string;
}

export interface PeerData {
  peerId: string;
}

// Helper type for the PeerJS library which doesn't have perfect types in all environments
export interface PeerJSOption {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
}
