import React, { useState } from 'react';

/**
 * Message Component
 * Displays an individual chat message, styling it based on sender.
 * Now handles both text and image messages.
 */
const Message = ({ message, isCurrentUser }) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const messageClass = isCurrentUser
    ? 'bg-blue-500 text-white rounded-bl-xl rounded-t-xl ml-auto' // Current user's messages
    : 'bg-gray-300 text-gray-800 rounded-br-xl rounded-t-xl mr-auto'; // Other user's messages

  const alignmentClass = isCurrentUser ? 'justify-end' : 'justify-start';

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  const openImageInNewTab = () => {
    if (message.type === 'image' && message.content) {
      window.open(message.content, '_blank');
    }
  };

  return (
    <div className={`flex ${alignmentClass}`}>
      <div className={`max-w-xs md:max-w-md lg:max-w-lg shadow-md ${messageClass}`}>
        {message.type === 'image' ? (
          <div className="p-1">
            {imageLoading && (
              <div className="flex justify-center items-center h-32 bg-gray-200 rounded">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
              </div>
            )}
            {imageError ? (
              <div className="p-3 text-center">
                <p className="text-sm">Failed to load image</p>
                <p className="text-xs opacity-75">{message.fileName || 'Unknown file'}</p>
              </div>
            ) : (
              <img
                src={message.content}
                alt={message.fileName || 'Shared image'}
                className={`max-w-full h-auto rounded cursor-pointer hover:opacity-90 transition-opacity ${
                  imageLoading ? 'hidden' : 'block'
                }`}
                onClick={openImageInNewTab}
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={{ maxHeight: '300px' }}
              />
            )}
            <span className="text-xs opacity-75 block mt-1 p-2">
              {message.timestamp?.toDate()?.toLocaleTimeString() || 'Sending...'}
            </span>
          </div>
        ) : (
          <div className="p-3">
            <p className="text-sm break-words">{message.content}</p>
            <span className="text-xs opacity-75 block mt-1">
              {message.timestamp?.toDate()?.toLocaleTimeString() || 'Sending...'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Message;