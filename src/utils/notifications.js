export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
    return permission === 'granted';
  }

  console.log('Notification permission denied');
  return false;
};

export const showNotification = (title, options = {}) => {
  console.log('Attempting to show notification:', title, options);
  
  if (!('Notification' in window)) {
    console.log('Notifications not supported');
    return;
  }

  if (Notification.permission === 'granted') {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        console.log('Showing notification via service worker');
        registration.showNotification(title, {
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          vibrate: [100, 50, 100],
          tag: 'chat-notification',
          requireInteraction: true,
          ...options
        });
      }).catch((error) => {
        console.error('Service worker notification failed:', error);
        // Fallback to regular notification
        new Notification(title, {
          icon: '/icons/icon-192x192.png',
          ...options
        });
      });
    } else {
      console.log('Showing regular notification');
      new Notification(title, {
        icon: '/icons/icon-192x192.png',
        ...options
      });
    }
  } else {
    console.log('Notification permission not granted:', Notification.permission);
  }
};