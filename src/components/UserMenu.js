import React, { useState, useRef, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../firebase/firebaseConfig';
import AuthContext from '../context/AuthContext';

const UserMenu = ({ currentUserDisplayName, currentUserPhoto, onUserUpdate }) => {
    const { logout, currentUser } = useContext(AuthContext);
    const [isOpen, setIsOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [message, setMessage] = useState('');
    const [localPhotoURL, setLocalPhotoURL] = useState(currentUserPhoto); // Add local state
    const menuRef = useRef(null);
    const buttonRef = useRef(null);
    const fileInputRef = useRef(null);

    // Update local state when prop changes
    useEffect(() => {
        setLocalPhotoURL(currentUserPhoto);
    }, [currentUserPhoto]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target) &&
                buttonRef.current && !buttonRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleButtonClick = () => {
        if (!isOpen) {
            const rect = buttonRef.current?.getBoundingClientRect();
            setButtonRect(rect);
        }
        setIsOpen(!isOpen);
    };

    const handleLogout = () => {
        setIsOpen(false);
        logout();
    };

    const handlePhotoUpload = () => {
        fileInputRef.current?.click();
        setIsOpen(false);
    };

    // Updated remove photo function with better state management
    const handleRemovePhoto = async () => {
        if (!currentUserPhoto) {
            setMessage('No profile picture to remove');
            return;
        }

        setRemoving(true);
        setMessage('Removing profile picture...');
        setIsOpen(false);

        try {
           // console.log('Removing profile picture...');
            
            // Update Firestore first
            const userRef = doc(db, `artifacts/${appId}/users`, currentUser.uid);
            await updateDoc(userRef, {
                photoURL: '' // Set to empty string to remove
            });

           // console.log('Profile picture removed from Firestore');

            // Update local state immediately
            setLocalPhotoURL('');
            
            // Update parent component state
            onUserUpdate({ photoURL: '' });

            // Force a small delay to ensure state propagation
          //  setTimeout(() => {
           //     setMessage('Profile picture removed successfully!');
          //  }, 100);

            // Auto-hide success message after 3 seconds
            setTimeout(() => setMessage(''), 3000);

        } catch (error) {
            console.error('Error removing profile picture:', error);
            setMessage('Failed to remove profile picture. Please try again.');
            // Revert local state on error
            setLocalPhotoURL(currentUserPhoto);
        } finally {
            setRemoving(false);
        }
    };

    // Convert image to base64 for storage in Firestore
    const convertToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });
    };

    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        console.log('File selected:', file);

        // Validate file
        if (!file.type.startsWith('image/')) {
            setMessage('Please select an image file');
            return;
        }

        if (file.size > 1024 * 1024) { // 1MB limit for base64 storage
            setMessage('Image size must be less than 1MB');
            return;
        }

        setUploading(true);
        setMessage('Uploading image...');

        try {
            console.log('Starting image upload...');
            
            // Convert to base64
            const base64Image = await convertToBase64(file);
            console.log('Image converted to base64');

            setMessage('Updating profile...');

            // Update user document in Firestore with base64 image
            const userRef = doc(db, `artifacts/${appId}/users`, currentUser.uid);
            await updateDoc(userRef, {
                photoURL: base64Image
            });

            console.log('Firestore updated successfully');

            // Update local state immediately
            setLocalPhotoURL(base64Image);

            // Update parent component state
            onUserUpdate({ photoURL: base64Image });

            setMessage('Profile picture updated successfully!');

            // Auto-hide success message after 3 seconds
            setTimeout(() => setMessage(''), 3000);

        } catch (error) {
            console.error('Error uploading profile picture:', error);
            setMessage('Failed to upload image. Please try again or use a smaller image.');
        } finally {
            setUploading(false);
            // Clear file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const DropdownMenu = () => {
        if (!isOpen || !buttonRect) return null;

        return createPortal(
            <div 
                ref={menuRef}
                className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                style={{
                    top: buttonRect.bottom + 8,
                    right: window.innerWidth - buttonRect.right,
                    minWidth: '200px'
                }}
            >
                {/* User Info Section */}
                <div className="px-4 py-3 border-b border-gray-100">
                    <div className="font-medium text-black-bold truncate">
                        {currentUserDisplayName || 'Unknown User'}
                    </div>
                    <div className="text-sm text-green-600 flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                        Online
                    </div>
                </div>

                {/* Profile Picture Options */}
                <div className="py-1">
                    <button
                        onClick={handlePhotoUpload}
                        disabled={uploading || removing}
                        className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {uploading ? 'Uploading...' : 'Change Profile Picture'}
                    </button>

                    {/* Remove Profile Picture Option - Use local state for conditional rendering */}
                    {localPhotoURL && (
                        <button
                            onClick={handleRemovePhoto}
                            disabled={uploading || removing}
                            className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {removing ? 'Removing...' : 'Remove Profile Picture'}
                        </button>
                    )}
                </div>

                {/* Logout Option */}
                <div className="border-t border-gray-100 py-1">
                    <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center"
                    >
                        <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                    </button>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <>
            <button
                ref={buttonRef}
                onClick={handleButtonClick}
                className="flex items-center space-x-3 hover:bg-gray-100 rounded-lg p-2 transition-colors"
            >
                <img
                    src={localPhotoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserDisplayName)}&background=667eea&color=ffffff`}
                    alt={currentUserDisplayName}
                    className="w-8 h-8 rounded-full object-cover"
                    onError={(e) => {
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserDisplayName)}&background=667eea&color=ffffff`;
                    }}
                />
                <span className="text-md font-medium text-black truncate max-w-32">
                    {currentUserDisplayName}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            <DropdownMenu />

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Status message */}
            {message && (
                <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
                    {message}
                </div>
            )}
        </>
    );
};

export default UserMenu;
