import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, appId } from './firebase/firebaseConfig';
import AuthContext from './context/AuthContext';
import Auth from './components/Auth';
import ChatDashboard from './components/ChatDashboard';
import useFirebaseMessaging from './hooks/useFirebaseMessaging';
import InstallPWA from './components/InstallPWA';
import { requestNotificationPermission } from './utils/notifications';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState(null);

  const { requestAndStoreToken, removeFcmTokenOnLogout } = useFirebaseMessaging(
    currentUser?.uid,
    () => {}
  );

  useEffect(() => {
    // Request notification permission on app load
    requestNotificationPermission();
  }, []);

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
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading...</p>
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
      <div className="App bg-white min-h-screen">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        {currentUser ? <ChatDashboard /> : <Auth />}
        <InstallPWA />
      </div>
    </AuthContext.Provider>
  );
}

export default App;