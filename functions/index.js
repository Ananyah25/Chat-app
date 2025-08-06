// functions/index.js

// Import Firebase Admin SDK and Functions SDK
const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
// This automatically picks up credentials when deployed to Cloud Functions
admin.initializeApp();

// Get Firestore and Messaging instances
const db = admin.firestore();
const messaging = admin.messaging();

/**

 *
 * This function is triggered whenever a new document is created in any
 * `messages` subcollection within the `chats` collection.
 *
 * Firestore Path: `artifacts/{appId}/chats/{chatId}/messages/{messageId}`
 */
exports.sendChatNotification = functions.firestore
    .document("artifacts/{appId}/chats/{chatId}/messages/{messageId}")
    .onCreate(async (snapshot, context) => {
    // Get the newly created message data
      const message = snapshot.data();
      const senderId = message.senderId;
      const content = message.content;
      const chatId = context.params.chatId; // Get chatId from the path
      const currentAppId = context.params.appId; // Get appId from the path

      // Log message details for debugging
      console.log(`New message in chat ${chatId} for app ${currentAppId}:`,
          message);

      // Determine the receiverId from the chat participants
      // First, get the chat document to find its participants
      const chatRef = db.collection(`artifacts/${currentAppId}/chats`)
          .doc(chatId);
      const chatSnap = await chatRef.get();

      if (!chatSnap.exists) {
        console.log(`Chat document ${chatId} does not exist. ` +
                  `Cannot send notification.`);
        return null;
      }

      const participants = chatSnap.data().participants;
      if (!participants || participants.length < 2) {
        console.log(`Chat ${chatId} has insufficient participants. ` +
                  `Cannot send notification.`);
        return null;
      }

      // Find the receiver ID (the participant who is not the sender)
      const receiverId = participants.find((uid) => uid !== senderId);

      if (!receiverId) {
        console.log(`Could not determine receiver for chat ${chatId}.`);
        return null;
      }

      // Get the receiver's user document to retrieve their FCM tokens
      const receiverUserRef = db.collection(`artifacts/${currentAppId}/users`)
          .doc(receiverId);
      const receiverUserSnap = await receiverUserRef.get();

      if (!receiverUserSnap.exists) {
        console.log(`Receiver user document ${receiverId} does not exist. ` +
                  `Cannot send notification.`);
        return null;
      }

      const receiverData = receiverUserSnap.data();
      const receiverFcmTokens = receiverData.fcmTokens;

      // Get the sender's display name for the notification title
      const senderUserRef = db.collection(`artifacts/${currentAppId}/users`)
          .doc(senderId);
      const senderUserSnap = await senderUserRef.get();
      const senderDisplayName = senderUserSnap.exists ?
      senderUserSnap.data().displayName || "Someone" : "Someone";

      if (!receiverFcmTokens || receiverFcmTokens.length === 0) {
        console.log(`Receiver ${receiverId} has no FCM tokens. ` +
                  `Notification not sent.`);
        return null;
      }

      // Construct the notification payload
      const payload = {
        notification: {
          title: `${senderDisplayName} sent you a message!`,
          body: content,
          icon: "https://www.gstatic.com/firebasejs/demos/firechat/app-icon.png",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
        data: {
          chatId: chatId,
          senderId: senderId,
          receiverId: receiverId,
          messageId: snapshot.id,
        // You can add more custom data here
        },
      };

      // Send the notification to all of the receiver's tokens
      try {
        const response = await messaging.sendToDevice(receiverFcmTokens,
            payload);
        console.log("Successfully sent message:", response);

        // Optional: Handle invalid tokens (e.g., remove them from Firestore)
        if (response.results) {
          const tokensToRemove = [];
          response.results.forEach((result, index) => {
            const error = result.error;
            if (error) {
              console.error("Failure sending notification to",
                  receiverFcmTokens[index], error);
              // Cleanup the token if it's no longer valid
              if (error.code === "messaging/invalid-registration-token" ||
                error.code === "messaging/registration-token-not-registered") {
                tokensToRemove.push(receiverFcmTokens[index]);
              }
            }
          });

          if (tokensToRemove.length > 0) {
            console.log("Removing invalid FCM tokens:", tokensToRemove);
            await receiverUserRef.update({fcmTokens:
                admin.firestore.FieldValue.arrayRemove(...tokensToRemove),
            });
          }
        }
        return {success: true, message: "Notification sent"};
      } catch (error) {
        console.error("Error sending message:", error);
        return {success: false, error: error.message};
      }
    });
