import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import SalesDashboard from './components/SalesDashboard';
import AgentLogin from './components/AgentLogin';
import AgentRegister from './components/AgentRegister';

function DashboardPage({ agentInfo, onLogin, onLogout }) {
  const navigate = useNavigate();

  if (!agentInfo) {
    return <Navigate to="/dashboard/login" replace />;
  }

  return <SalesDashboard agentInfo={agentInfo} onLogout={() => { onLogout(); navigate('/dashboard/login'); }} />;
}

function LoginPage({ onLogin }) {
  return <AgentLogin onLogin={onLogin} />;
}

function App() {
  const [agentInfo, setAgentInfo] = useState(() => {
    const stored = localStorage.getItem('agentInfo');
    return stored ? JSON.parse(stored) : null;
  });

  const handleLogin = (info) => {
    setAgentInfo(info);
    localStorage.setItem('agentInfo', JSON.stringify(info));
  };

  const handleLogout = () => {
    setAgentInfo(null);
    localStorage.removeItem('agentInfo');
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<ChatInterface />} />
        <Route path="/dashboard" element={<DashboardPage agentInfo={agentInfo} onLogin={handleLogin} onLogout={handleLogout} />} />
        <Route path="/dashboard/login" element={<LoginPage onLogin={handleLogin} />} />
        <Route path="/dashboard/register" element={<AgentRegister />} />
      </Routes>
    </Router>
  );
}

export default App;
