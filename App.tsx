import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './components/Landing';
import RoomEntry from './components/RoomEntry';
import ServerGuide from './components/ServerGuide';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/r/:invite" element={<RoomEntry />} />
        <Route path="/room/:roomId" element={<RoomEntry />} />
        <Route path="/server-setup" element={<ServerGuide />} />
      </Routes>
    </Router>
  );
};

export default App;
