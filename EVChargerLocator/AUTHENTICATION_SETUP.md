# Authentication & Profile System

## Overview
The EV Charger Locator now includes a complete authentication system with:
- ✅ Email/Password Login & Signup
- ✅ Google OAuth Integration
- ✅ User Profile Management
- ✅ Vehicle Management
- ✅ Preferences & Settings
- ✅ Account Security

## Setup Instructions

### 1. Google OAuth Configuration

#### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project called "EV Charger Locator"
3. Enable the Google+ API

#### Step 2: Create OAuth 2.0 Credentials
1. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
2. Choose "Web application"
3. Add Authorized Redirect URIs:
   - `http://localhost:8000`
   - `http://localhost:8000/index.html`
   - `http://localhost:8000/profile.html`
   - Your production domain when deployed

#### Step 3: Update Your Frontend
In `login.html` and `signup.html`, replace:
```html
data-client_id="YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
```

With your actual Google Client ID.

### 2. Backend API Integration

The authentication system expects these API endpoints:

#### Register/Signup
```
POST /api/signup
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1-555-0000",
  "password": "securePassword123"
}

Response:
{
  "user": {
    "id": "user-123",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "avatar": "https://...",
    "authProvider": "password"
  },
  "token": "jwt-token-here"
}
```

#### Login
```
POST /api/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securePassword123"
}

Response: Same as signup response
```

#### Google OAuth
```
POST /api/google-auth
Content-Type: application/json

{
  "token": "google-id-token",
  "mode": "login" or "signup"
}

Response: Same as signup response
```

#### Update Profile
```
POST /api/profile/update
Authorization: Bearer {token}
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1-555-0000",
  "location": "Bangalore, India",
  "bio": "EV enthusiast"
}
```

#### Update Preferences
```
POST /api/profile/preferences
Authorization: Bearer {token}
Content-Type: application/json

{
  "preferredCharger": "fast",
  "notificationDistance": 10,
  "emailNotifications": true,
  "pushNotifications": true,
  "locationTracking": true
}
```

#### Add Vehicle
```
POST /api/profile/vehicles
Authorization: Bearer {token}
Content-Type: application/json

{
  "make": "Tesla",
  "model": "Model 3",
  "year": 2023,
  "batteryCapacity": 75.5
}
```

#### Delete Vehicle
```
DELETE /api/profile/vehicles/{vehicleId}
Authorization: Bearer {token}
```

#### Change Password
```
POST /api/profile/change-password
Authorization: Bearer {token}
Content-Type: application/json

{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456"
}
```

#### Upload Avatar
```
POST /api/profile/avatar
Authorization: Bearer {token}
Content-Type: multipart/form-data

File: avatar (multipart form)

Response:
{
  "avatarUrl": "https://..."
}
```

#### Delete Account
```
DELETE /api/profile/delete
Authorization: Bearer {token}
```

## Frontend Pages

### 1. Login Page (`login.html`)
- Email/Password login
- Google OAuth sign-in
- "Forgot password" link
- Link to signup page

### 2. Signup Page (`signup.html`)
- Registration form
- Name, email, phone fields
- Password strength indicator
- Terms & conditions acceptance
- Google OAuth sign-up
- Link to login page

### 3. Profile Page (`profile.html`)
**Tabs:**
- **Personal Info**: Update name, email, phone, location, bio
- **Vehicles**: Manage multiple vehicles with battery capacity
- **Preferences**: App settings and notifications
- **History**: View recent charging station visits

**Security Features:**
- Change password
- Two-factor authentication setup (UI ready)
- Account deletion

## Local Storage

The system uses browser's localStorage to persist authentication:

```javascript
// User data stored as JSON
localStorage.getItem('evcharger_user')

// JWT token for API calls
localStorage.getItem('evcharger_token')
```

## Auth Functions

### Check Authentication
```javascript
isAuthenticated() // Returns boolean
requireAuth()     // Redirects to login if not authenticated
```

### Get Current User
```javascript
currentUser // Global object with user data
```

### Make Authenticated Requests
```javascript
makeAuthRequest(url, options) // Automatically adds Bearer token
getAuthHeaders()               // Returns headers with token
```

### Logout
```javascript
logout() // Clears data and redirects to login
```

## Files Created/Modified

### New Files
- `login.html` - Login page
- `signup.html` - Signup page
- `profile.html` - Profile management
- `auth.js` - Authentication logic
- `profile.js` - Profile page functionality

### Modified Files
- `index.html` - Added auth script & sidebar profile button
- `script.js` - Added auth check & profile navigation
- `style.css` - Added auth & profile page styles

## Security Best Practices

1. **HTTPS Only**: Always use HTTPS in production
2. **JWT Storage**: Tokens stored in localStorage (consider using httpOnly cookies for production)
3. **CORS**: Configure proper CORS headers on backend
4. **Password Hashing**: Hash passwords using bcrypt or similar
5. **Token Expiry**: Implement token refresh mechanism
6. **Validation**: Server-side validation for all inputs
7. **Rate Limiting**: Implement rate limiting on auth endpoints

## Testing Credentials (for development)

You can create test users in your backend for development:

```
Email: test@example.com
Password: TestPassword123!
```

## Deployment Notes

1. Replace Google Client ID with production version
2. Update API endpoints to production server
3. Enable HTTPS
4. Set up environment variables for sensitive data
5. Configure CORS headers properly
6. Implement proper error logging
7. Set up user data backups

## Troubleshooting

### "Invalid Google Client ID"
- Verify the Client ID is correct
- Check authorized domains in Google Console
- Clear browser cache and localStorage

### "Token expired"
- Implement token refresh mechanism
- Clear localStorage and re-login

### "API 404 errors"
- Check backend server is running
- Verify API endpoints match your backend routes
- Check CORS configuration

## Future Enhancements

- [ ] Two-factor authentication
- [ ] Social login (Facebook, GitHub)
- [ ] Payment integration for premium features
- [ ] Email verification
- [ ] Password recovery via email
- [ ] Account linking
- [ ] Biometric authentication
