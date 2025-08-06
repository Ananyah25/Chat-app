import React, { useState, useEffect, useContext, useMemo } from 'react';
import { collection, onSnapshot, doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, appId } from '../firebase/firebaseConfig';
import AuthContext from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';
import MessageBox from './MessageBox';
import ChatWindow from './ChatWindow';
import UserMenu from './UserMenu';

const ChatDashboard = () => {
  const { currentUser, logout, userId, removeFcmTokenOnLogout } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [selectedChatReceiver, setSelectedChatReceiver] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState('');
  const [currentUserPhoto, setCurrentUserPhoto] = useState('');
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('info');
  const [searchQuery, setSearchQuery] = useState(''); // Add search state

  const memoizedCurrentUser = useMemo(() => currentUser, [currentUser?.uid, currentUser?.displayName, currentUser?.photoURL]);

  const showMessage = (msg, type = 'info') => {
    setMessage(msg);
    setMessageType(type);
  };

  const handleCloseMessage = () => {
    setMessage(null);
  };

  const handleUserUpdate = (updates) => {
    if (updates.photoURL) {
      setCurrentUserPhoto(updates.photoURL);
    }
  };

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) {
      return users;
    }
    
    const query = searchQuery.toLowerCase().trim();
    return users.filter(user => {
      const displayName = (user.displayName || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      
      return displayName.includes(query) || email.includes(query);
    });
  }, [users, searchQuery]);

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
  };

  // Format last seen time (show days/minutes)
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate();
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    
    const diffInDays = Math.floor(diffInMinutes / 1440);
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} week${Math.floor(diffInDays / 7) > 1 ? 's' : ''} ago`;
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} month${Math.floor(diffInDays / 30) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffInDays / 365)} year${Math.floor(diffInDays / 365) > 1 ? 's' : ''} ago`;
  };

  // Update user's online status
  const updateOnlineStatus = async (isOnline) => {
    if (!memoizedCurrentUser) return;

    try {
      const userRef = doc(db, `artifacts/${appId}/users`, memoizedCurrentUser.uid);
      await updateDoc(userRef, {
        isOnline: isOnline,
        lastSeen: serverTimestamp()
      });
    } catch (error) {
      console.error("Error updating online status:", error);
    }
  };

  // Set user online when component mounts
  useEffect(() => {
    if (memoizedCurrentUser) {
      updateOnlineStatus(true);
    }
  }, [memoizedCurrentUser]);

  // Set user offline when component unmounts or page closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (memoizedCurrentUser) {
        // Use sendBeacon for reliable offline status update
        const userRef = doc(db, `artifacts/${appId}/users`, memoizedCurrentUser.uid);
        updateDoc(userRef, {
          isOnline: false,
          lastSeen: serverTimestamp()
        }).catch(console.error);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateOnlineStatus(false);
      } else if (document.visibilityState === 'visible') {
        updateOnlineStatus(true);
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Set offline when component unmounts
      if (memoizedCurrentUser) {
        updateOnlineStatus(false);
      }
    };
  }, [memoizedCurrentUser]);

  // Send periodic heartbeat to maintain online status
  useEffect(() => {
    if (!memoizedCurrentUser) return;

    const heartbeatInterval = setInterval(() => {
      updateOnlineStatus(true);
    }, 30000); // Update every 30 seconds

    return () => clearInterval(heartbeatInterval);
  }, [memoizedCurrentUser]);

  useEffect(() => {
    const fetchCurrentUserData = async () => {
      if (memoizedCurrentUser) {
        setCurrentUserDisplayName(memoizedCurrentUser.displayName || 'Unknown User');
        setCurrentUserPhoto(memoizedCurrentUser.photoURL || '');

        try {
          const userRef = doc(db, `artifacts/${appId}/users`, memoizedCurrentUser.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            setCurrentUserDisplayName(userData.displayName || 'Unknown User');
            setCurrentUserPhoto(userData.photoURL || '');
          }
        } catch (error) {
          console.error("Error fetching current user data:", error);
        }
      }
    };

    fetchCurrentUserData();
  }, [memoizedCurrentUser]);

  useEffect(() => {
    if (!memoizedCurrentUser) {
      setLoadingUsers(false);
      return;
    }

    setLoadingUsers(true);
    const usersCollectionRef = collection(db, `artifacts/${appId}/users`);

    const unsubscribe = onSnapshot(usersCollectionRef, (snapshot) => {
      const fetchedUsers = [];
      const now = new Date();
      
      snapshot.forEach((doc) => {
        if (doc.id !== memoizedCurrentUser.uid) {
          const userData = doc.data();
          
          // Check if user is truly online (last seen within 2 minutes)
          const lastSeen = userData.lastSeen?.toDate();
          const isRecentlyActive = lastSeen && (now - lastSeen) < 120000; // 2 minutes
          
          fetchedUsers.push({ 
            id: doc.id, 
            ...userData,
            isOnline: userData.isOnline && isRecentlyActive
          });
        }
      });
      
      setUsers(fetchedUsers);
      setLoadingUsers(false);
    }, (error) => {
      console.error("Error subscribing to users collection:", error);
      showMessage("Failed to load contacts (subscription error). Please check console.", "error");
      setLoadingUsers(false);
    });

    return () => unsubscribe();
  }, [memoizedCurrentUser]);

  const handleSelectChat = async (targetUser) => {
    if (!memoizedCurrentUser || !targetUser) {
      showMessage("Cannot start chat: current user or target user is missing.", "error");
      return;
    }

    const participants = [memoizedCurrentUser.uid, targetUser.id].sort();
    const chatDocId = participants.join('_');
    const chatRef = doc(db, `artifacts/${appId}/chats`, chatDocId);

    try {
      const chatSnap = await getDoc(chatRef);

      if (!chatSnap.exists()) {
        await setDoc(chatRef, {
          participants: participants,
          createdAt: serverTimestamp(),
          lastMessage: null,
        });
      }

      setSelectedChatId(chatDocId);
      setSelectedChatReceiver(targetUser);
    } catch (error) {
      console.error("Error selecting chat:", error);
      showMessage(`Failed to select chat: ${error.message}`, "error");
    }
  };

  if (loadingUsers) {
    return <LoadingSpinner />;
  }

  return (
    <div className="h-screen bg-gray-100 flex">
      {/* Sidebar for Contacts */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-lg">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white relative overflow-hidden">
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold mb-1 text-white">Messages</h2>
              <p className="text-black-100 text-sm">
                {searchQuery ? 
                  `${filteredUsers.length} of ${users.length} contacts` : 
                  `${users.length} contacts (${users.filter(u => u.isOnline).length} online)`
                }
              </p>
            </div>
            <UserMenu 
              currentUserDisplayName={currentUserDisplayName}
              currentUserPhoto={currentUserPhoto}
              onUserUpdate={handleUserUpdate}
            />
          </div>
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
          <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-blue-500/20 rounded-full"></div>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Contacts List */}
        <div className="flex-grow overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                {searchQuery ? (
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                {searchQuery ? 'No results found' : 'No contacts yet'}
              </h3>
              <p className="text-gray-500 text-sm">
                {searchQuery ? 
                  `No contacts match "${searchQuery}"` : 
                  'Register more accounts to start chatting!'
                }
              </p>
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors text-sm"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="p-2"> 
             
              
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className={`group relative flex items-center p-4 m-2 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] ${
                    selectedChatReceiver && selectedChatReceiver.id === user.id
                      ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]'
                      : 'hover:bg-blue-50 hover:shadow-md'
                  }`}
                  onClick={() => handleSelectChat(user)}
                >
                  <div className="relative mr-4 flex-shrink-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white shadow-lg">
                      <img
                        src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=3b82f6&color=fff&size=48`}
                        alt={user.displayName || 'User'}
                        className="w-full h-full object-cover"
                        onError={(e) => { 
                          e.target.onerror = null; 
                          e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=3b82f6&color=fff&size=48`;
                        }}
                      />
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${
                      user.isOnline ? 'bg-green-400' : 'bg-gray-300'
                    }`}></div>
                  </div>

                  <div className="flex-grow min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={`font-semibold truncate ${
                        selectedChatReceiver && selectedChatReceiver.id === user.id ? 'text-white' : 'text-gray-800'
                      }`}>
                        {user.displayName || 'Unknown User'}
                      </h4>
                      {user.isOnline && (
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          selectedChatReceiver && selectedChatReceiver.id === user.id 
                            ? 'bg-white/20 text-white' 
                            : 'bg-green-100 text-green-600'
                        }`}>
                          Online
                        </span>
                      )}
                    </div>
                    <p className={`text-sm truncate ${
                      selectedChatReceiver && selectedChatReceiver.id === user.id 
                        ? 'text-blue-100' 
                        : 'text-gray-500'
                    }`}>
                      {user.isOnline ? 'Active now' : `Last seen ${formatLastSeen(user.lastSeen)}`}
                    </p>
                  </div>

                  <svg className={`w-5 h-5 transition-transform duration-200 group-hover:translate-x-1 ${
                    selectedChatReceiver && selectedChatReceiver.id === user.id ? 'text-white' : 'text-gray-400'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-grow flex flex-col">
        {selectedChatId && selectedChatReceiver ? (
          <ChatWindow 
            chatId={selectedChatId} 
            receiver={selectedChatReceiver} 
            currentUserId={memoizedCurrentUser.uid} 
          />
        ) : (
          <div className="flex-grow flex items-center justify-center">
            <div className="text-center max-w-md mx-auto p-8">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3">Welcome to ChatApp</h3>
              <p className="text-gray-600 mb-6">Select a conversation from the sidebar to start messaging</p>
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Ready to connect</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <MessageBox message={message} type={messageType} onClose={handleCloseMessage} />
    </div>
  );
};

export default ChatDashboard;