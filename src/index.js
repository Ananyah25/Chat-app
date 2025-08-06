import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Enhanced service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Register both service workers
    Promise.all([
      navigator.serviceWorker.register('/sw.js'),
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
    ]).then((registrations) => {
      console.log('Service workers registered:', registrations);
      
      // Check if notifications are supported
      if ('Notification' in window) {
        console.log('Notifications supported');
        if (Notification.permission === 'default') {
          console.log('Notification permission is default, will request later');
        }
      }
    }).catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  });
}