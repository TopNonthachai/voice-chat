import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './components/Landing';
import Room from './components/Room';
import ServerGuide from './components/ServerGuide';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="/server-setup" element={<ServerGuide />} />
      </Routes>
    </Router>
  );
};

export default App;