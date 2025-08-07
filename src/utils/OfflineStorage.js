// Enhanced IndexedDB wrapper for offline message and user storage

class OfflineStorage {
  constructor() {
    this.dbName = 'ChatAppOffline';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('chatId', 'chatId', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Users store
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id' });
        }

        // Offline queue store
        if (!db.objectStoreNames.contains('offlineQueue')) {
          const queueStore = db.createObjectStore('offlineQueue', {
            keyPath: 'id',
            autoIncrement: true
          });
          queueStore.createIndex('chatId', 'chatId', { unique: false });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // ===== MESSAGE METHODS =====
  async storeMessages(chatId, messages) {
    const transaction = this.db.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    
    // Clear existing messages for this chat first
    const index = store.index('chatId');
    const existingRequest = index.getAllKeys(chatId);
    
    return new Promise((resolve, reject) => {
      existingRequest.onsuccess = async () => {
        try {
          // Delete existing messages for this chat
          for (const key of existingRequest.result) {
            await store.delete(key);
          }
          
          // Store new messages
          for (const message of messages) {
            const messageToStore = {
              ...message,
              chatId,
              timestamp: message.timestamp?.toDate ? message.timestamp.toDate() : message.timestamp
            };
            await store.put(messageToStore);
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      existingRequest.onerror = () => reject(existingRequest.error);
    });
  }

  async getMessages(chatId) {
    const transaction = this.db.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const index = store.index('chatId');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(chatId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const messages = request.result || [];
        // Sort by timestamp to maintain order
        const sortedMessages = messages.sort((a, b) => {
          const aTime = new Date(a.timestamp);
          const bTime = new Date(b.timestamp);
          return aTime - bTime;
        });
        resolve(sortedMessages);
      };
    });
  }

  async deleteMessage(chatId, messageId) {
    const transaction = this.db.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    return store.delete(messageId);
  }

  // ===== USER METHODS =====
  async storeUsers(users) {
    const transaction = this.db.transaction(['users'], 'readwrite');
    const store = transaction.objectStore('users');
    
    for (const user of users) {
      await store.put(user);
    }
  }

  async getUsers() {
    const transaction = this.db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async storeUser(userId, userData) {
    const transaction = this.db.transaction(['users'], 'readwrite');
    const store = transaction.objectStore('users');
    return store.put({ id: userId, ...userData });
  }

  async getUser(userId) {
    const transaction = this.db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    
    return new Promise((resolve, reject) => {
      const request = store.get(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // ===== OFFLINE QUEUE METHODS =====
  async queueMessage(message) {
    const transaction = this.db.transaction(['offlineQueue'], 'readwrite');
    const store = transaction.objectStore('offlineQueue');
    
    const messageWithTimestamp = {
      ...message,
      timestamp: Date.now(),
      status: 'queued'
    };
    
    return new Promise((resolve, reject) => {
      const request = store.add(messageWithTimestamp);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve({ id: request.result, ...messageWithTimestamp });
      };
    });
  }

  async getQueuedMessages() {
    const transaction = this.db.transaction(['offlineQueue'], 'readonly');
    const store = transaction.objectStore('offlineQueue');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async clearQueuedMessage(id) {
    const transaction = this.db.transaction(['offlineQueue'], 'readwrite');
    const store = transaction.objectStore('offlineQueue');
    return store.delete(id);
  }

  // ===== UTILITY METHODS =====
  async clearAllData() {
    const transaction = this.db.transaction(['messages', 'users', 'offlineQueue'], 'readwrite');
    const promises = [
      transaction.objectStore('messages').clear(),
      transaction.objectStore('users').clear(),
      transaction.objectStore('offlineQueue').clear()
    ];
    return Promise.all(promises);
  }

  async getAllData() {
    const [messages, users, queue] = await Promise.all([
      this.getAllMessages(),
      this.getUsers(),
      this.getQueuedMessages()
    ]);
    return { messages, users, queue };
  }

  async getAllMessages() {
    const transaction = this.db.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }
}

export default OfflineStorage;
