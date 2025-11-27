import React from 'react';
import { SERVER_CODE, PACKAGE_JSON } from '../server-instructions';

const ServerGuide: React.FC = () => {
  const [copied, setCopied] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="bg-discord-dark p-6 rounded-lg shadow-lg max-w-4xl w-full mx-auto my-8 border border-discord-darkest">
      <h2 className="text-2xl font-bold text-white mb-4">
        <i className="fas fa-server mr-2 text-discord-primary"></i>
        Backend Setup Required
      </h2>
      <p className="text-discord-text mb-6">
        Since this is a client-side React application, you must run a local Node.js server to handle 
        Socket.io signaling (connecting users together).
      </p>

      {/* Warning Box */}
      <div className="bg-yellow-900/30 border border-yellow-700 p-4 rounded-md mb-6">
        <h3 className="text-yellow-500 font-bold flex items-center mb-2">
            <i className="fas fa-exclamation-triangle mr-2"></i>
            Important for Online Previews
        </h3>
        <p className="text-gray-300 text-sm">
            If you are viewing this app in an online IDE or preview window (which uses <strong>HTTPS</strong>), 
            the browser will likely block connections to your local <strong>HTTP</strong> server due to "Mixed Content" security rules.
        </p>
        <p className="text-gray-300 text-sm mt-2">
            To test this app fully:
            <ol className="list-decimal list-inside ml-2 mt-1">
                <li>Download the frontend code and run it locally (e.g., <code className="bg-black/30 px-1 rounded">npm run dev</code>).</li>
                <li>Or, ensure your browser allows insecure content for this site (not recommended for production).</li>
            </ol>
        </p>
      </div>

      <div className="grid gap-6">
        {/* Step 1 */}
        <div className="bg-discord-darker p-4 rounded-md">
          <h3 className="text-lg font-semibold text-white mb-2">Step 1: Create package.json</h3>
          <div className="relative">
            <pre className="bg-discord-darkest p-4 rounded text-sm text-green-400 overflow-x-auto">
              {PACKAGE_JSON}
            </pre>
            <button 
              onClick={() => copyToClipboard(PACKAGE_JSON, 'package')}
              className="absolute top-2 right-2 bg-discord-primary hover:bg-blue-600 text-white px-3 py-1 rounded text-xs transition"
            >
              {copied === 'package' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-discord-darker p-4 rounded-md">
          <h3 className="text-lg font-semibold text-white mb-2">Step 2: Create server.js</h3>
          <div className="relative">
            <pre className="bg-discord-darkest p-4 rounded text-sm text-blue-300 overflow-x-auto h-64">
              {SERVER_CODE}
            </pre>
            <button 
              onClick={() => copyToClipboard(SERVER_CODE, 'server')}
              className="absolute top-2 right-2 bg-discord-primary hover:bg-blue-600 text-white px-3 py-1 rounded text-xs transition"
            >
              {copied === 'server' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-discord-darker p-4 rounded-md">
          <h3 className="text-lg font-semibold text-white mb-2">Step 3: Run the Server</h3>
          <p className="text-discord-text mb-2">Open your terminal in the folder containing these files and run:</p>
          <div className="bg-discord-darkest p-3 rounded font-mono text-sm">
            npm install<br/>
            npm start
          </div>
          <p className="text-discord-success text-sm mt-2">
            <i className="fas fa-check-circle mr-1"></i>
            The server will run on <strong>http://localhost:3001</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ServerGuide;