import { useEffect, useCallback } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { messaging, db, appId, getToken, onMessage } from '../firebase/firebaseConfig';

// VAPID key from Firebase Console -> Project settings -> Cloud Messaging
const VAPID_KEY = 'YOUR_VAPID'; 

const useFirebaseMessaging = (userUid, showMessage) => {
  // Request permission and get FCM token
  const requestAndStoreToken = useCallback(async () => {
    if (!userUid) return;

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      console.log('Notification permission:', permission);

      if (permission === 'granted') {
        // Register service worker
        if ('serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('Service Worker registered:', registration);
            
            // Wait for service worker to be ready
            await navigator.serviceWorker.ready;
          } catch (swError) {
            console.error('Service Worker registration failed:', swError);
            showMessage('Failed to register service worker', 'error');
            return;
          }
        }

        // Get FCM token
        try {
          const token = await getToken(messaging, { 
            vapidKey: VAPID_KEY
          });

          if (token) {
            console.log('FCM Token:', token);
            
            // Store token in Firestore
            const userRef = doc(db, `artifacts/${appId}/users`, userUid);
            await updateDoc(userRef, {
              fcmTokens: arrayUnion(token)
            });

            showMessage('Push notifications enabled!', 'success');
          } else {
            console.log('No FCM token available');
            showMessage('Unable to get notification token', 'warning');
          }
        } catch (tokenError) {
          console.error('Error getting FCM token:', tokenError);
          showMessage('Error getting notification token', 'error');
        }
      } else {
        console.log('Notification permission denied');
        showMessage('Notification permission denied', 'warning');
      }
    } catch (error) {
      console.error('Error in requestAndStoreToken:', error);
      showMessage('Error setting up notifications', 'error');
    }
  }, [userUid, showMessage]);

  // Remove FCM token on logout
  const removeFcmTokenOnLogout = useCallback(async (uid) => {
    if (!uid) return;

    try {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token) {
        const userRef = doc(db, `artifacts/${appId}/users`, uid);
        await updateDoc(userRef, {
          fcmTokens: arrayRemove(token)
        });
        console.log('FCM token removed on logout');
      }
    } catch (error) {
      console.error('Error removing FCM token:', error);
    }
  }, []);

  // Listen for foreground messages
  useEffect(() => {
    if (!messaging) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
      
      // Show in-app notification
      if (payload.notification) {
        showMessage(
          `${payload.notification.title}: ${payload.notification.body}`,
          'info'
        );

        // Also show browser notification if page is not focused
        if (document.hidden && Notification.permission === 'granted') {
          new Notification(payload.notification.title, {
            body: payload.notification.body,
            icon: '/logo192.png'
          });
        }
      }
    });

    return () => unsubscribe();
  }, [showMessage]);

  return {
    requestAndStoreToken,
    removeFcmTokenOnLogout
  };
};

export default useFirebaseMessaging;