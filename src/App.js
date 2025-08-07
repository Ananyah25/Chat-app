import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { auth, db, appId } from './firebase/firebaseConfig';
import AuthContext from './context/AuthContext';
import Auth from './components/Auth';
import ChatDashboard from './components/ChatDashboard';
import OfflineIndicator from './components/OfflineIndicator';
import OfflineStorage from './utils/OfflineStorage';
import useFirebaseMessaging from './hooks/useFirebaseMessaging';
import InstallPWA from './components/InstallPWA';
import { requestNotificationPermission } from './utils/notifications';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState(null);
  const [offlineStorage] = useState(() => new OfflineStorage());
  
  const { requestAndStoreToken, removeFcmTokenOnLogout } = useFirebaseMessaging(
    currentUser?.uid,
    () => {}
  );

  // Initialize offline storage
  useEffect(() => {
    offlineStorage.init();
  }, []);

  // Request notification permission on app load
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Process queued messages when coming back online
  useEffect(() => {
    const handleOnline = async () => {
      console.log('App came back online, processing queued messages...');
      
      try {
        const queuedMessages = await offlineStorage.getQueuedMessages();
        console.log(`Found ${queuedMessages.length} queued messages`);
        
        for (const message of queuedMessages) {
          try {
            const messagesRef = collection(db, `artifacts/${appId}/chats/${message.chatId}/messages`);
            await addDoc(messagesRef, {
              content: message.content,
              senderId: message.senderId,
              receiverId: message.receiverId,
              timestamp: serverTimestamp(),
              type: message.type,
              ...(message.fileName && { fileName: message.fileName })
            });
            
            // Remove from queue after successful send
            await offlineStorage.clearQueuedMessage(message.id);
            console.log('Queued message sent and removed from queue');
          } catch (error) {
            console.error('Failed to send queued message:', error);
            // Keep message in queue for next attempt
          }
        }
        
        console.log('Finished processing queued messages');
      } catch (error) {
        console.error('Error processing queued messages:', error);
      }
    };

    const handleOffline = () => {
      console.log('App went offline');
    };

    // Listen for service worker sync messages
    const handleServiceWorkerMessage = (event) => {
      if (event.data && event.data.type === 'SYNC_QUEUED_MESSAGES') {
        handleOnline();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [offlineStorage]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setError(null);
        if (user) {
          console.log('User authenticated:', user.uid);
          const userRef = doc(db, `artifacts/${appId}/users`, user.uid);
          
          try {
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const userData = userSnap.data();
              setCurrentUser({
                uid: user.uid,
                email: user.email,
                displayName: userData.displayName || user.displayName || user.email.split('@')[0],
                photoURL: userData.photoURL || user.photoURL || '',
                ...userData
              });
              
              // Update online status
              await setDoc(userRef, {
                isOnline: true,
                lastSeen: serverTimestamp()
              }, { merge: true });
            } else {
              // Create new user document
              const fallbackDisplayName = user.displayName || user.email.split('@')[0];
              const newUserData = {
                uid: user.uid,
                email: user.email,
                displayName: fallbackDisplayName,
                photoURL: user.photoURL || '',
                isOnline: true,
                lastSeen: serverTimestamp(),
                createdAt: serverTimestamp()
              };
              await setDoc(userRef, newUserData);
              setCurrentUser({
                uid: user.uid,
                email: user.email,
                displayName: fallbackDisplayName,
                photoURL: user.photoURL || ''
              });
            }
          } catch (firestoreError) {
            console.error("Firestore error:", firestoreError);
            // Still set user even if Firestore fails
            setCurrentUser({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email.split('@')[0],
              photoURL: user.photoURL || ''
            });
            setError('Database connection issue. Some features may not work properly.');
          }
        } else {
          console.log('User not authenticated');
          setCurrentUser(null);
        }
      } catch (error) {
        console.error("Error in auth state change:", error);
        setCurrentUser(null);
        setError('Authentication error. Please try again.');
      } finally {
        setLoading(false);
        setAuthChecked(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      if (currentUser && removeFcmTokenOnLogout) {
        await removeFcmTokenOnLogout(currentUser.uid);
      }
      
      if (currentUser) {
        try {
          const userRef = doc(db, `artifacts/${appId}/users`, currentUser.uid);
          await setDoc(userRef, {
            isOnline: false,
            lastSeen: serverTimestamp()
          }, { merge: true });
        } catch (firestoreError) {
          console.error("Error updating offline status:", firestoreError);
        }
      }
      
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center p-6 bg-white rounded-lg shadow-lg max-w-md">
          <div className="text-red-500 text-2xl mb-2">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      logout, 
      userId: currentUser?.uid,
      removeFcmTokenOnLogout 
    }}>
      <div className="min-h-screen bg-gray-100">
        <OfflineIndicator />
        <InstallPWA />
        
        {currentUser ? (
          <ChatDashboard />
        ) : (
          <Auth />
        )}
      </div>
    </AuthContext.Provider>
  );
}

export default App;
