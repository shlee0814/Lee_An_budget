import './tailwind.css';
import './dashboard.jsx';

// Load the bridge only after the React chart has registered its global renderer.
const bridge = document.createElement('script');
bridge.src = new URL('dashboard-bridge.js', document.baseURI).href;
document.body.appendChild(bridge);
