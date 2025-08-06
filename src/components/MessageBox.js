// src/components/MessageBox.js
import React from 'react';

/**
 * MessageBox Component
 * A custom modal for displaying messages (info, success, warning, error)
 * instead of using native browser alerts/confirms.
 */
const MessageBox = ({ message, type = 'info', onClose, onConfirm }) => {
  if (!message) return null; // Don't render if no message

  const title = type === 'error' ? 'Error' : type === 'success' ? 'Success' : type === 'warning' ? 'Warning' : 'Information';
  const titleColorClass =
    type === 'error' ? 'text-red-600' : type === 'success' ? 'text-green-600' : type === 'warning' ? 'text-yellow-600' : 'text-blue-600';

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-auto">
        <div className={`text-lg font-semibold mb-4 ${titleColorClass}`}>
          {title}
        </div>
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          {onConfirm && (
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
            >
              Confirm
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
          >
            {onConfirm ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageBox;