// src/components/OfflineIndicator.js
import React, { useState, useEffect } from 'react';

const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnecting, setShowReconnecting] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnecting(false);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnecting(false);
    };

    // Listen for service worker messages about queued messages
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'QUEUED_MESSAGES_COUNT') {
        setQueuedCount(event.data.count);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);

  // Show reconnecting state briefly when coming back online
  useEffect(() => {
    if (isOnline && !navigator.onLine) {
      setShowReconnecting(true);
      const timer = setTimeout(() => setShowReconnecting(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (isOnline && !showReconnecting) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
      {!isOnline ? (
        <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-3 text-center shadow-lg">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-pulse">📡</div>
            <span className="font-medium">You're offline</span>
            {queuedCount > 0 && (
              <span className="bg-white bg-opacity-20 px-2 py-1 rounded-full text-xs">
                {queuedCount} message{queuedCount > 1 ? 's' : ''} queued
              </span>
            )}
          </div>
          <div className="text-xs mt-1 opacity-90">
            Messages will be sent when connection is restored
          </div>
        </div>
      ) : showReconnecting ? (
        <div className="bg-gradient-to-r from-green-400 to-blue-500 text-white px-4 py-3 text-center shadow-lg">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin">🔄</div>
            <span className="font-medium">Reconnecting...</span>
          </div>
          <div className="text-xs mt-1 opacity-90">
            Syncing your messages
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default OfflineIndicator;
