import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, appId } from '../firebase/firebaseConfig';
import MessageBox from './MessageBox';
import { showNotification, requestNotificationPermission } from '../utils/notifications';
import OfflineStorage from '../utils/OfflineStorage';

const ChatWindow = ({ chatId, receiver, currentUserId }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('info');
  const [isTyping, setIsTyping] = useState(false);
  const [opponentTyping, setOpponentTyping] = useState(false);
  const [longPressMessage, setLongPressMessage] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(null);
  const [lastNotificationTime, setLastNotificationTime] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineStorage] = useState(() => new OfflineStorage());
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const longPressTimeoutRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const initialLoadRef = useRef(true);

  // Initialize offline storage
  useEffect(() => {
    offlineStorage.init();
  }, []);

  // Listen for online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Mobile-friendly input handling (minimal mobile optimization)
  const mobileInputStyles = {
    fontSize: '16px', // Prevents zoom on iOS
    touchAction: 'manipulation'
  };

  // Touch-friendly button sizes (minimal mobile optimization)
  const mobileButtonStyles = {
    minHeight: '44px',
    minWidth: '44px',
    touchAction: 'manipulation'
  };

  // Mobile responsiveness handler
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showMessage = (msg, type = 'info') => {
    setMessage(msg);
    setMessageType(type);
  };

  const handleCloseMessage = () => {
    setMessage(null);
  };

  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: smooth ? "smooth" : "instant",
        block: "end"
      });
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, isMobile ? 100 : 120) + 'px';
    }
  };

  // IMPROVED formatTime function - shows appropriate time/date for different ages
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInMs = now - date;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    // Today - show time only
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
    
    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    // This week (within 7 days) - show day name
    if (diffInDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    }
    
    // Older than a week - show date
    if (diffInDays < 365) {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
    
    // Older than a year - include year
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Enhanced format last seen time function
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInMs = now - date;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    // Just now (less than 1 minute)
    if (diffInMinutes < 1) return 'Just now';
    
    // X minutes ago (less than 1 hour)
    if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
    
    // X hours ago (less than 24 hours but more than 1 hour)
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
    
    // Yesterday (exactly 1 day ago)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    // Today (same day but more than 24 hours - edge case)
    if (date.toDateString() === now.toDateString()) {
      return 'Today';
    }
    
    // X days ago (less than 7 days)
    if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
    }
    
    // X weeks ago (less than 30 days)
    if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    }
    
    // X months ago (less than 365 days)
    if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30);
      return `${months} month${months === 1 ? '' : 's'} ago`;
    }
    
    // X years ago
    const years = Math.floor(diffInDays / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
  };

  // Function to load and display queued messages
  const loadAndDisplayQueuedMessages = async () => {
    try {
      const queuedMessages = await offlineStorage.getQueuedMessages();
      
      // Filter queued messages for current chat
      const currentChatQueued = queuedMessages.filter(msg => msg.chatId === chatId);
      
      if (currentChatQueued.length > 0) {
        // Create display format for queued messages
        const queuedForDisplay = currentChatQueued.map(msg => ({
          ...msg,
          id: `queued-${msg.id}`, // Unique ID for queued messages
          isQueued: true, // Flag to show this is a queued message
          timestamp: new Date(msg.timestamp) // Convert timestamp to Date object
        }));
        
        // Add queued messages to current messages for display
        setMessages(prevMessages => [...prevMessages, ...queuedForDisplay]);
      }
    } catch (error) {
      console.error("Error loading queued messages:", error);
    }
  };

  // Test notification function
  const testNotification = () => {
    console.log('Testing notification...');
    if (!notificationPermission) {
      showMessage('Notifications are disabled. Please enable them in your browser settings.', 'warning');
      return;
    }
    
    showNotification('🧪 Chat App Test', {
      body: 'This is a test notification from your chat app! If you see this, notifications are working correctly.',
      tag: 'test-notification',
      icon: '/icons/icon-192x192.png',
      requireInteraction: false
    });
    
    showMessage('Test notification sent! Check if you received it.', 'info');
  };

  // Long press handlers for delete functionality
  const handleLongPressStart = (messageId) => {
    longPressTimeoutRef.current = setTimeout(() => {
      setLongPressMessage(messageId);
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
    }, 800);
  };

  const handleLongPressEnd = (event) => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }
    if (event && event.target.closest('.delete-menu')) {
      return;
    }
  };

  const handleDeleteMessage = async () => {
    if (!messageToDelete) return;

    try {
      const messageRef = doc(db, `artifacts/${appId}/chats/${chatId}/messages`, messageToDelete);
      await deleteDoc(messageRef);
      
      showMessage('Message deleted successfully', 'success');
      setShowDeleteModal(false);
      setMessageToDelete(null);
      setLongPressMessage(null);
    } catch (error) {
      console.error('Error deleting message:', error);
      showMessage(`Failed to delete message: ${error.message}`, 'error');
      setShowDeleteModal(false);
      setMessageToDelete(null);
      setLongPressMessage(null);
    }
  };

  const openDeleteModal = (messageId) => {
    setMessageToDelete(messageId);
    setShowDeleteModal(true);
    setLongPressMessage(null);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setMessageToDelete(null);
    setLongPressMessage(null);
  };

  // Update typing status in Firestore
  const updateTypingStatus = async (typing) => {
    try {
      const typingRef = doc(db, `artifacts/${appId}/chats/${chatId}/typing`, currentUserId);
      
      if (typing) {
        await setDoc(typingRef, {
          userId: currentUserId,
          userName: 'You',
          timestamp: serverTimestamp()
        });
      } else {
        await deleteDoc(typingRef);
      }
    } catch (error) {
      console.error('Error updating typing status:', error);
    }
  };

  // Request notification permission when component mounts
  useEffect(() => {
    const setupNotifications = async () => {
      try {
        const hasPermission = await requestNotificationPermission();
        setNotificationPermission(hasPermission);
        if (!hasPermission) {
          console.log('Notification permission denied or not supported');
          showMessage('Enable notifications to receive message alerts when the app is in background', 'warning');
        } else {
          console.log('Notification permission granted');
        }
      } catch (error) {
        console.error('Error setting up notifications:', error);
      }
    };

    setupNotifications();
  }, []);

  // Listen for opponent typing status
  useEffect(() => {
    if (!chatId || !receiver.id) return;

    const typingRef = doc(db, `artifacts/${appId}/chats/${chatId}/typing`, receiver.id);
    
    const unsubscribe = onSnapshot(typingRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const now = new Date();
        const typingTime = data.timestamp?.toDate();
        const isRecent = typingTime && (now - typingTime) < 5000;
        
        setOpponentTyping(isRecent);
      } else {
        setOpponentTyping(false);
      }
    });

    return () => unsubscribe();
  }, [chatId, receiver.id]);

  // Fixed scroll effect - handles both initial load and new messages
  useEffect(() => {
    if (loading) return;
    
    if (initialLoadRef.current && messages.length > 0) {
      setTimeout(() => {
        scrollToBottom(false);
        initialLoadRef.current = false;
      }, 50);
    } else if (!initialLoadRef.current) {
      scrollToBottom(true);
    }
  }, [messages, opponentTyping, loading]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [newMessage, isMobile]);

  // Enhanced message listener with proper offline handling
  useEffect(() => {
    if (!chatId) return;
    setLoading(true);
    initialLoadRef.current = true;

    const loadMessages = async () => {
      if (isOnline) {
        // Load from Firebase and cache
        const messagesRef = collection(db, `artifacts/${appId}/chats/${chatId}/messages`);
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q, async (snapshot) => {
          const fetchedMessages = [];
          let newMessagesFromOthers = [];
          
          snapshot.forEach((doc) => {
            const messageData = {
              id: doc.id,
              ...doc.data()
            };
            fetchedMessages.push(messageData);
            
            if (!initialLoadRef.current && 
                messageData.senderId !== currentUserId && 
                messageData.timestamp && 
                Date.now() - messageData.timestamp.toDate().getTime() < 10000) {
              newMessagesFromOthers.push(messageData);
            }
          });

          // Store in offline cache
          await offlineStorage.storeMessages(chatId, fetchedMessages);
          
          // Handle notifications only for new messages
          if (!initialLoadRef.current && 
              lastMessageCountRef.current > 0 && 
              newMessagesFromOthers.length > 0) {
            
            const shouldShowNotification = !document.hasFocus() || 
                                         (window.currentActiveChatId && chatId !== window.currentActiveChatId) || 
                                         (localStorage.getItem('forceNotifications') === 'true');
            
            if (shouldShowNotification && notificationPermission) {
              newMessagesFromOthers.forEach(msg => {
                const messagePreview = msg.type === 'image' ? '📷 Image' : 
                                     msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content;
                
                setLastNotificationTime(new Date().toLocaleTimeString());
                
                showNotification('💬 New Message', {
                  body: `${receiver.displayName}: ${messagePreview}`,
                  tag: `chat-${chatId}-${msg.id}`,
                  icon: receiver.photoURL || '/icons/icon-192x192.png',
                  requireInteraction: false,
                  data: {
                    chatId: chatId,
                    messageId: msg.id,
                    senderId: msg.senderId
                  }
                });
              });
            }
          }
          
          lastMessageCountRef.current = fetchedMessages.length;
          setMessages(fetchedMessages);
          setLoading(false);
          
          // Load and add queued messages
          await loadAndDisplayQueuedMessages();
        }, (error) => {
          console.error("Error subscribing to messages:", error);
          showMessage("Failed to load messages. Please check console.", "error");
          setLoading(false);
          initialLoadRef.current = false;
        });

        return unsubscribe;
      } else {
        // FIXED: Don't replace messages, enhance them with cache
        try {
          // If we have current messages, keep them and supplement with cache
          if (messages.length > 0) {
            console.log('Offline: Keeping existing messages and adding cached ones');
            
            // Get cached messages
            const cachedMessages = await offlineStorage.getMessages(chatId);
            
            // Merge cached messages with existing ones (remove duplicates)
            const existingIds = new Set(messages.map(msg => msg.id));
            const newCachedMessages = cachedMessages.filter(msg => !existingIds.has(msg.id));
            
            // Add new cached messages to existing ones
            if (newCachedMessages.length > 0) {
              setMessages(prevMessages => [...prevMessages, ...newCachedMessages].sort((a, b) => {
                const aTime = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
                const bTime = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
                return aTime - bTime;
              }));
            }
          } else {
            // No existing messages, load from cache
            console.log('Offline: Loading messages from cache');
            const cachedMessages = await offlineStorage.getMessages(chatId);
            setMessages(cachedMessages);
          }
          
          // Add queued messages
          await loadAndDisplayQueuedMessages();
          
          setLoading(false);
          
          if (messages.length > 0) {
            setTimeout(() => scrollToBottom(false), 50);
          }
        } catch (error) {
          console.error("Error loading offline messages:", error);
          showMessage("Failed to load cached messages", "error");
          setLoading(false);
        }
      }
    };
    
    loadMessages();
  }, [chatId, currentUserId, receiver.displayName, receiver.photoURL, notificationPermission, isOnline]);

  // Clean up typing status when component unmounts
  useEffect(() => {
    return () => {
      if (isTyping) {
        updateTypingStatus(false);
      }
    };
  }, [isTyping]);

  // Close long press menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (event.target.closest('.delete-menu')) {
        return;
      }
      
      if (longPressMessage) {
        setLongPressMessage(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [longPressMessage]);

  useEffect(() => {
    window.currentActiveChatId = chatId;
    return () => {
      if (window.currentActiveChatId === chatId) {
        window.currentActiveChatId = null;
      }
    };
  }, [chatId]);

  // Updated sendMessage to show queued messages immediately
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const messageText = newMessage.trim();
    const messageData = {
      content: messageText,
      senderId: currentUserId,
      receiverId: receiver.id,
      timestamp: new Date(),
      type: 'text',
      chatId: chatId
    };

    setNewMessage('');
    setIsTyping(false);
    updateTypingStatus(false);

    if (isOnline) {
      // Send directly to Firebase
      try {
        const messagesRef = collection(db, `artifacts/${appId}/chats/${chatId}/messages`);
        await addDoc(messagesRef, {
          ...messageData,
          timestamp: serverTimestamp()
        });
      } catch (error) {
        console.error("Error sending message:", error);
        // If fails, add to queue
        const queuedMessage = await offlineStorage.queueMessage(messageData);
        
        // Show queued message immediately in chat
        setMessages(prevMessages => [...prevMessages, {
          ...messageData,
          id: `queued-${queuedMessage.id}`,
          isQueued: true
        }]);
        
        showMessage('Message queued for sending when online', 'info');
        setNewMessage(messageText);
      }
    } else {
      // Add to offline queue
      const queuedMessage = await offlineStorage.queueMessage(messageData);
      
      // Show queued message immediately in chat
      setMessages(prevMessages => [...prevMessages, {
        ...messageData,
        id: `queued-${queuedMessage.id}`,
        isQueued: true
      }]);
      
      showMessage('Message queued for sending when online', 'info');
    }
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    
    const typing = e.target.value.length > 0;
    
    if (typing !== isTyping) {
      setIsTyping(typing);
      updateTypingStatus(typing);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (typing) {
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        updateTypingStatus(false);
      }, 3000);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showMessage('Please select an image file.', 'error');
      return;
    }

    if (file.size > 1024 * 1024) {
      showMessage('Image size must be less than 1MB.', 'error');
      return;
    }

    setUploading(true);

    try {
      const base64 = await convertToBase64(file);
      
      if (isOnline) {
        const messagesRef = collection(db, `artifacts/${appId}/chats/${chatId}/messages`);
        await addDoc(messagesRef, {
          content: base64,
          senderId: currentUserId,
          receiverId: receiver.id,
          timestamp: serverTimestamp(),
          type: 'image',
          fileName: file.name
        });
        showMessage('Image uploaded successfully!', 'success');
      } else {
        const queuedMessage = await offlineStorage.queueMessage({
          content: base64,
          senderId: currentUserId,
          receiverId: receiver.id,
          timestamp: new Date(),
          type: 'image',
          fileName: file.name,
          chatId: chatId
        });
        
        // Show queued image immediately in chat
        setMessages(prevMessages => [...prevMessages, {
          content: base64,
          senderId: currentUserId,
          receiverId: receiver.id,
          timestamp: new Date(),
          type: 'image',
          fileName: file.name,
          id: `queued-${queuedMessage.id}`,
          isQueued: true
        }]);
        
        showMessage('Image queued for sending when online', 'info');
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      showMessage(`Failed to upload image: ${error.message}`, "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Chat Header - YOUR ORIGINAL STYLING */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="relative mr-4">
              <img
                src={receiver.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(receiver.displayName || 'User')}&background=3b82f6&color=fff&size=40`}
                alt={receiver.displayName}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-blue-100"
              />
              <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                receiver.isOnline ? 'bg-green-400' : 'bg-gray-300'
              }`}></div>
            </div>
            <div className="flex-grow">
              <h3 className="font-semibold text-gray-800">{receiver.displayName || 'Unknown User'}</h3>
              <p className="text-sm text-gray-500">
                {opponentTyping ? (
                  <span className="text-blue-600 font-medium">typing...</span>
                ) : (
                  receiver.isOnline ? 'Active now' : `Last seen ${formatLastSeen(receiver.lastSeen)}`
                )}
              </p>
            </div>
          </div>
          
          {/* Offline indicator */}
          {!isOnline && (
            <div className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs">
              📡 Offline
            </div>
          )}
        </div>
      </div>

      {/* Messages Container - YOUR ORIGINAL STYLING */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-white scroll-container">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <p className="text-gray-500">Start a conversation with {receiver.displayName}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              const isCurrentUser = msg.senderId === currentUserId;
              const isLongPressed = longPressMessage === msg.id;
              
              return (
                <div
                  key={msg.id}
                  className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-xs lg:max-w-md ${isCurrentUser ? 'order-2' : 'order-1'} relative`}>
                    {msg.type === 'image' ? (
                      <div 
                        className={`relative group ${
                          isCurrentUser 
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                            : 'bg-white border border-gray-200'
                        } rounded-2xl p-2 shadow-sm ${isLongPressed ? 'ring-2 ring-red-400' : ''}`}
                        onMouseDown={() => isCurrentUser && handleLongPressStart(msg.id)}
                        onMouseUp={handleLongPressEnd}
                        onMouseLeave={handleLongPressEnd}
                        onTouchStart={() => isCurrentUser && handleLongPressStart(msg.id)}
                        onTouchEnd={handleLongPressEnd}
                      >
                        <img
                          src={msg.content}
                          alt="Shared image"
                          className="max-w-full h-auto rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(msg.content, '_blank')}
                          style={{ maxHeight: isMobile ? '200px' : '300px' }}
                        />
                        <div className={`mt-2 text-xs ${
                          isCurrentUser ? 'text-blue-100' : 'text-gray-500'
                        }`}>
                          {formatTime(msg.timestamp)}
                          {/* Add queue indicator for images */}
                          {msg.isQueued && (
                            <span className="ml-2 text-yellow-300">⏳ Queued</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div 
                        className={`relative group ${
                          isCurrentUser 
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' 
                            : 'bg-white text-gray-800 border border-gray-200'
                        } rounded-2xl px-4 py-3 shadow-sm hover:shadow-md transition-shadow ${isLongPressed ? 'ring-2 ring-red-400' : ''}`}
                        onMouseDown={() => isCurrentUser && handleLongPressStart(msg.id)}
                        onMouseUp={handleLongPressEnd}
                        onMouseLeave={handleLongPressEnd}
                        onTouchStart={() => isCurrentUser && handleLongPressStart(msg.id)}
                        onTouchEnd={handleLongPressEnd}
                      >
                        <p className="text-sm leading-relaxed break-words">{msg.content}</p>
                        <div className={`mt-1 text-xs ${
                          isCurrentUser ? 'text-blue-100' : 'text-gray-500'
                        }`}>
                          {formatTime(msg.timestamp)}
                          {/* Add queue indicator for text messages */}
                          {msg.isQueued && (
                            <span className="ml-2 text-yellow-300">⏳ Queued</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Long Press Delete Menu - YOUR ORIGINAL STYLING */}
                    {isLongPressed && isCurrentUser && (
                      <div className="delete-menu absolute -top-12 right-0 bg-red-500 text-white px-3 py-2 rounded-lg shadow-lg z-50 pointer-events-auto">
                        <button
                          onMouseDown={(e) => {
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            openDeleteModal(msg.id);
                          }}
                          className="flex items-center space-x-2 hover:bg-red-600 px-2 py-1 rounded transition-colors cursor-pointer touch-target"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span className="text-sm">Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {/* Opponent Typing Indicator - YOUR ORIGINAL STYLING */}
            {opponentTyping && (
              <div className="flex justify-start">
                <div className="max-w-xs lg:max-w-md">
                  <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                      <span className="text-sm text-gray-500"> is typing...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input - YOUR ORIGINAL STYLING */}
      <div className={`flex-shrink-0 p-6 bg-white border-t border-gray-100 ${isMobile ? 'pb-6' : ''}`}>
        <form onSubmit={sendMessage} className="flex items-end space-x-4">
          <div className="flex-grow relative">
            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={handleInputChange}
              placeholder={isOnline ? "Type your message..." : "Type your message (will send when online)..."}
              className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all duration-200"
              rows="1"
              style={{ 
                ...mobileInputStyles,
                minHeight: '48px', 
                maxHeight: isMobile ? '100px' : '120px' 
              }}
              disabled={uploading}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(e);
                }
              }}
            />
          </div>

          <div className="flex space-x-2">
            <button
              type="button"
              onClick={triggerFileInput}
              disabled={uploading}
              className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors duration-200 disabled:opacity-50 touch-target"
              style={mobileButtonStyles}
              title="Upload image"
            >
              {uploading ? (
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </button>

            <button
              type="submit"
              disabled={!newMessage.trim() || uploading}
              className={`p-3 rounded-full transition-all duration-200 touch-target ${
                newMessage.trim() && !uploading
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
              style={mobileButtonStyles}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
      </div>

      {/* Delete Confirmation Modal - YOUR ORIGINAL STYLING */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Delete Message</h3>
              <p className="text-gray-600 mb-6">Are you sure you want to delete this message? This action cannot be undone.</p>
              
              <div className="flex space-x-3">
                <button
                  onClick={closeDeleteModal}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors touch-target"
                  style={{ minHeight: '44px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMessage}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors touch-target"
                  style={{ minHeight: '44px' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <MessageBox message={message} type={messageType} onClose={handleCloseMessage} />
    </div>
  );
};

export default ChatWindow;
