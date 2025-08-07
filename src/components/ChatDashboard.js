import React, { useState, useEffect, useContext, useMemo } from 'react';
import { collection, onSnapshot, doc, getDoc, setDoc, serverTimestamp, updateDoc, query, orderBy, limit } from 'firebase/firestore';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showSidebar, setShowSidebar] = useState(true);
  const [lastMessages, setLastMessages] = useState({}); // Store last messages for each chat

  const memoizedCurrentUser = useMemo(() => currentUser, [currentUser?.uid, currentUser?.displayName, currentUser?.photoURL]);

  // Mobile responsiveness handler (minimal mobile optimization)
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      
      // On mobile, hide sidebar when chat is selected
      if (mobile && selectedChatId) {
        setShowSidebar(false);
      } else if (!mobile) {
        setShowSidebar(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedChatId]);

  // Handle mobile navigation (minimal addition)
  const handleMobileBackToSidebar = () => {
    if (isMobile) {
      setShowSidebar(true);
      setSelectedChatId(null);
      setSelectedChatReceiver(null);
    }
  };

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

  // Filter and sort users based on search query and last message time
  const filteredUsers = useMemo(() => {
    let usersToDisplay = users;
    
    // Filter by search query if exists
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      usersToDisplay = users.filter(user => {
        const displayName = (user.displayName || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        
        return displayName.includes(query) || email.includes(query);
      });
    }
    
    // Sort by last message timestamp (most recent first)
    return usersToDisplay.sort((a, b) => {
      const participantsA = [memoizedCurrentUser.uid, a.id].sort();
      const participantsB = [memoizedCurrentUser.uid, b.id].sort();
      const chatIdA = participantsA.join('_');
      const chatIdB = participantsB.join('_');
      
      const lastMessageA = lastMessages[chatIdA];
      const lastMessageB = lastMessages[chatIdB];
      
      // If both have messages, sort by timestamp (newest first)
      if (lastMessageA && lastMessageB) {
        const timeA = lastMessageA.timestamp?.toDate ? lastMessageA.timestamp.toDate() : new Date(lastMessageA.timestamp);
        const timeB = lastMessageB.timestamp?.toDate ? lastMessageB.timestamp.toDate() : new Date(lastMessageB.timestamp);
        return timeB - timeA; // Newest first
      }
      
      // If only one has messages, prioritize the one with messages
      if (lastMessageA && !lastMessageB) return -1;
      if (!lastMessageA && lastMessageB) return 1;
      
      // If neither has messages, sort by online status, then alphabetically
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      
      // Both same online status, sort alphabetically
      const nameA = (a.displayName || 'Unknown User').toLowerCase();
      const nameB = (b.displayName || 'Unknown User').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [users, searchQuery, lastMessages, memoizedCurrentUser]);

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
  };

  // Format last seen time (show days/minutes)
  // Simpler format last seen time function
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const date = timestamp.toDate();
    const now = new Date();
    const diffInMs = now - date;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    // Just now (less than 1 minute)
    if (diffInMinutes < 1) return 'Just now';
    
    // Less than 1 hour
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    // Less than 24 hours
    if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours}h ago`;
    }
    
    // Yesterday
    if (diffInDays === 1) return 'Yesterday';
    
    // X days ago (for recent days)
    if (diffInDays < 7) return `${diffInDays} days ago`;
    
    // More than a week - show actual date
    return date.toLocaleDateString();
  };

  // Format message preview for contact list
  const formatMessagePreview = (lastMessage) => {
    if (!lastMessage) return 'No messages yet';
    
    if (lastMessage.type === 'image') {
      return '📷 Photo';
    }
    
    const content = lastMessage.content || '';
    return content.length > 30 ? content.substring(0, 30) + '...' : content;
  };

  // Format message time for contact list
  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } else if (diffInHours < 168) { // Less than a week
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
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

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
    }, 30000);

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

  // Listen to last messages for each chat
  useEffect(() => {
    if (!memoizedCurrentUser) return;

    const chatsRef = collection(db, `artifacts/${appId}/chats`);
    const unsubscribeChats = onSnapshot(chatsRef, (chatsSnapshot) => {
      const messageUnsubscribes = [];

      chatsSnapshot.forEach((chatDoc) => {
        const chatData = chatDoc.data();
        const participants = chatData.participants || [];
        
        // Only listen to chats where current user is a participant
        if (participants.includes(memoizedCurrentUser.uid)) {
          const chatId = chatDoc.id;
          const messagesRef = collection(db, `artifacts/${appId}/chats/${chatId}/messages`);
          const lastMessageQuery = query(messagesRef, orderBy('timestamp', 'desc'), limit(1));
          
          const unsubscribeMessages = onSnapshot(lastMessageQuery, (messagesSnapshot) => {
            if (!messagesSnapshot.empty) {
              const lastMessageDoc = messagesSnapshot.docs[0];
              const lastMessageData = {
                id: lastMessageDoc.id,
                ...lastMessageDoc.data()
              };
              
              setLastMessages(prev => ({
                ...prev,
                [chatId]: lastMessageData
              }));
            }
          });
          
          messageUnsubscribes.push(unsubscribeMessages);
        }
      });

      // Clean up function will be returned
      return () => {
        messageUnsubscribes.forEach(unsubscribe => unsubscribe());
      };
    });

    return () => {
      unsubscribeChats();
    };
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
          
          const lastSeen = userData.lastSeen?.toDate();
          const isRecentlyActive = lastSeen && (now - lastSeen) < 120000;
          
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
      showMessage("Failed to load contacts. Please check console.", "error");
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
      
      // On mobile, hide sidebar when chat is selected
      if (isMobile) {
        setShowSidebar(false);
      }
    } catch (error) {
      console.error("Error selecting chat:", error);
      showMessage(`Failed to select chat: ${error.message}`, "error");
    }
  };

  if (loadingUsers) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex relative">
      {/* Message Box */}
      <MessageBox message={message} type={messageType} onClose={handleCloseMessage} />

      {/* FIXED: Mobile Header - only back button without any user info */}
      {isMobile && !showSidebar && selectedChatReceiver && (
        <div className="absolute top-0 left-0 z-50 p-4 md:hidden">
          <button
            onClick={handleMobileBackToSidebar}
            className="p-2 bg-white/90 backdrop-blur-sm rounded-full hover:bg-gray-100 shadow-lg touch-target"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Sidebar - YOUR ORIGINAL BEAUTIFUL STYLING WITH FIXED SEARCH */}
      <div className={`
        ${isMobile ? 'fixed inset-0 z-40' : 'relative'}
        ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
        ${isMobile ? 'w-full' : 'w-80'}
        bg-white/90 backdrop-blur-xl border-r border-gray-200/50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out
      `}>
        {/* Header - YOUR ORIGINAL GRADIENT STYLING */}
        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold mb-1">Messages</h2>
              <p className="text-blue-100 text-sm">
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
          <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-indigo-400/20 rounded-full"></div>
        </div>

        {/* Search Bar - FIXED OVERLAPPING ISSUE WITH INCREASED SPACING */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
            {/* Search Icon - Only show when no search query */}
            {!searchQuery && (
              <svg 
                className="absolute left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            
            {/* Clear Button - Only show when there's a search query */}
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-1 h-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Contacts List - YOUR ORIGINAL STYLING WITH MESSAGE PREVIEWS */}
        <div className="flex-grow overflow-y-auto scroll-container">
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
                  className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors text-sm touch-target"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="p-2"> 
              {filteredUsers.map((user) => {
                // Get chat ID and last message for this user
                const participants = [memoizedCurrentUser.uid, user.id].sort();
                const chatId = participants.join('_');
                const lastMessage = lastMessages[chatId];
                
                return (
                  <div
                    key={user.id}
                    className={`group relative flex items-center p-4 m-2 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] touch-target ${
                      selectedChatReceiver && selectedChatReceiver.id === user.id
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg transform scale-[1.02]'
                        : 'hover:bg-gray-50 hover:shadow-md'
                    }`}
                    onClick={() => handleSelectChat(user)}
                    style={{ minHeight: '80px' }}
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
                        {/* Show message time */}
                        {lastMessage && (
                          <span className={`text-xs ${
                            selectedChatReceiver && selectedChatReceiver.id === user.id 
                              ? 'text-blue-100' 
                              : 'text-gray-400'
                          }`}>
                            {formatMessageTime(lastMessage.timestamp)}
                          </span>
                        )}
                      </div>
                      {/* Show last message preview instead of online status */}
                      <p className={`text-sm truncate ${
                        selectedChatReceiver && selectedChatReceiver.id === user.id 
                          ? 'text-blue-100' 
                          : 'text-gray-500'
                      }`}>
                        {lastMessage ? formatMessagePreview(lastMessage) : (user.isOnline ? 'Active now' : `Last seen ${formatLastSeen(user.lastSeen)}`)}
                      </p>
                    </div>

                    <svg className={`w-5 h-5 transition-transform duration-200 group-hover:translate-x-1 ${
                      selectedChatReceiver && selectedChatReceiver.id === user.id ? 'text-white' : 'text-gray-400'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area - YOUR ORIGINAL STYLING */}
      <div className={`
        flex-grow flex flex-col
        ${isMobile && showSidebar ? 'hidden' : 'flex'}
        ${isMobile && !showSidebar && selectedChatReceiver ? 'pt-20' : ''}
      `}>
        {selectedChatId && selectedChatReceiver ? (
          <ChatWindow 
            chatId={selectedChatId} 
            receiver={selectedChatReceiver} 
            currentUserId={memoizedCurrentUser.uid} 
          />
        ) : (
          <div className="flex-grow flex items-center justify-center">
            <div className="text-center max-w-md mx-auto p-8">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3">Welcome to ChatApp</h3>
              <p className="text-gray-600 mb-6">
                Select a conversation from the {isMobile ? 'menu' : 'sidebar'} to start messaging
              </p>
              {isMobile && (
                <button
                  onClick={() => setShowSidebar(true)}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-full hover:from-blue-600 hover:to-indigo-600 transition-all duration-200 touch-target"
                >
                  View Contacts
                </button>
              )}
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 mt-4">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Ready to connect</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Overlay */}
      {isMobile && showSidebar && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}
    </div>
  );
};

export default ChatDashboard;
