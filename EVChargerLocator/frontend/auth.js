// ============= AUTH STATE =============
let currentUser = null;
let authToken = null;

// ============= INITIALIZE AUTH =============
(function seedDefaultUser() {
  const usersStr = localStorage.getItem('evcharger_users_db');
  const users = usersStr ? JSON.parse(usersStr) : [];
  if (!users.some(u => u.email === 'vinayakakv@gmail.com')) {
    users.push({
      id: 'default-vinayaka',
      firstName: 'Vinayaka',
      lastName: 'KV',
      email: 'vinayakakv@gmail.com',
      password: 'vinayaka@143',
      authProvider: 'password',
      avatar: 'https://ui-avatars.com/api/?name=Vinayaka+KV&background=random'
    });
    localStorage.setItem('evcharger_users_db', JSON.stringify(users));
  }
})();

loadAuthState(); // Load immediately

window.addEventListener('load', () => {
  initAuthEventListeners();
  if (window.location.pathname.includes('login.html') || window.location.pathname.includes('signup.html')) {
    redirectIfAuthed();
  }
});

// Load user from localStorage
function loadAuthState() {
  const userStr = localStorage.getItem('evcharger_user');
  const token = localStorage.getItem('evcharger_token');
  
  if (userStr && token) {
    currentUser = JSON.parse(userStr);
    authToken = token;
  }
}

// Save user to localStorage
function saveAuthState(user, token) {
  currentUser = user;
  authToken = token;
  localStorage.setItem('evcharger_user', JSON.stringify(user));
  localStorage.setItem('evcharger_token', token);
}

// Logout
function logout() {
  currentUser = null;
  authToken = null;
  localStorage.removeItem('evcharger_user');
  localStorage.removeItem('evcharger_token');
  window.location.href = 'login.html';
}

// ============= LOGIN PAGE =============
function initAuthEventListeners() {
  // Login Form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
    document.getElementById('togglePassword')?.addEventListener('click', togglePasswordVisibility);
    
    // Show registration success message if applicable
    if (window.location.search.includes('registered=true')) {
      const msg = document.createElement('div');
      msg.className = 'form-success';
      msg.style.cssText = "background: rgba(46, 125, 50, 0.2); color: #81c784; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; text-align: center; border: 1px solid rgba(129, 199, 132, 0.3); backdrop-filter: blur(4px);";
      msg.textContent = "Account verified and registered! Please log in.";
      loginForm.parentNode.insertBefore(msg, loginForm);
    }
  }

  // Signup Form
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', handleSignup);
    document.getElementById('toggleSignupPassword')?.addEventListener('click', togglePasswordVisibility);
    document.getElementById('toggleConfirmPassword')?.addEventListener('click', togglePasswordVisibility);
    document.getElementById('signupPassword')?.addEventListener('input', checkPasswordStrength);
  }

  // Google OAuth Buttons
  document.getElementById('googleSignInBtn')?.addEventListener('click', handleGoogleSignIn);
  document.getElementById('googleSignUpBtn')?.addEventListener('click', handleGoogleSignUp);
}

// ============= FORM SUBMISSION =============
async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  
  // Clear previous errors
  document.getElementById('emailError').textContent = '';
  document.getElementById('passwordError').textContent = '';

  if (!email || !password) {
    document.getElementById('emailError').textContent = 'Please fill in all fields';
    return;
  }

  try {
    const usersStr = localStorage.getItem('evcharger_users_db');
    const users = usersStr ? JSON.parse(usersStr) : [];
    
    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const token = 'mock-jwt-token-' + Date.now();
    
    // Create safe user object without password
    const safeUser = { ...user };
    delete safeUser.password;

    saveAuthState(safeUser, token);
    
    window.location.href = 'index.html';
  } catch (error) {
    document.getElementById('emailError').textContent = error.message;
    console.error('Login error:', error);
  }
}

async function handleSignup(e) {
  e.preventDefault();
  
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const agree = document.getElementById('agree').checked;

  // Clear previous errors
  document.querySelectorAll('.form-error').forEach(el => el.textContent = '');

  // Validate
  if (!firstName) {
    document.getElementById('firstNameError').textContent = 'First name is required';
    return;
  }
  if (password !== confirmPassword) {
    document.getElementById('confirmPasswordError').textContent = 'Passwords do not match';
    return;
  }
  if (!agree) {
    document.getElementById('agreeError').textContent = 'You must agree to the terms';
    return;
  }

  try {
    const usersStr = localStorage.getItem('evcharger_users_db');
    const users = usersStr ? JSON.parse(usersStr) : [];

    if (users.some(u => u.email === email)) {
      throw new Error('Email already registered');
    }

    const newUser = {
      id: 'user-' + Date.now(),
      firstName, lastName, email, phone, password,
      authProvider: 'password'
    };

    users.push(newUser);
    localStorage.setItem('evcharger_users_db', JSON.stringify(users));

    // Redirect to login page instead of logging in automatically
    window.location.href = 'login.html?registered=true';
  } catch (error) {
    document.getElementById('signupEmailError').textContent = error.message;
    console.error('Signup error:', error);
  }
}

// ============= GOOGLE OAUTH =============
window.handleGoogleSignIn = function(response) {
  if (response && response.credential) {
    processGoogleToken(response.credential, 'login');
  } else {
    // Manually clicked the custom button
    processGoogleToken('mock-token', 'login');
  }
};

window.handleGoogleSignUp = function(response) {
  if (response && response.credential) {
    processGoogleToken(response.credential, 'signup');
  } else {
    // Manually clicked the custom button
    processGoogleToken('mock-token', 'signup');
  }
};

async function processGoogleToken(token, mode) {
  try {
    // Simulated Google API logic with mock modal
    showGoogleSimulatedModal();
  } catch (error) {
    console.error('Google auth error:', error);
    alert('Google authentication failed: ' + error.message);
  }
}

// Simulated Google Login Modal
function showGoogleSimulatedModal() {
  const modalHTML = `
    <div id="googleAuthMockOverlay" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(4px); opacity: 0; transition: opacity 0.3s ease;">
      <div style="background: white; width: 100%; max-width: 400px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); overflow: hidden; font-family: 'Roboto', sans-serif; transform: scale(0.95); transition: transform 0.3s ease;" id="googleAuthBox">
        <div style="padding: 24px; text-align: center;">
          <img src="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg" alt="Google" style="width: 74px; margin-bottom: 12px;">
          <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 400; color: #202124;">Sign in</h2>
          <p style="margin: 0 0 32px 0; font-size: 16px; color: #202124;">Continue to <strong>EV Charger Locator</strong></p>
          
          <div id="googleMockAccountsList" style="text-align: left; margin-bottom: 24px; border: 1px solid #dadce0; border-radius: 8px; overflow: hidden;">
            <div style="padding: 12px 16px; border-bottom: 1px solid #dadce0; display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="completeGoogleMock('Vinayaka', 'KV', 'vinayakakv@gmail.com')">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: #1a73e8; color: white; display: flex; align-items: center; justify-content: center; font-weight: 500;">V</div>
              <div style="flex: 1;">
                <div style="font-size: 14px; font-weight: 500; color: #3c4043;">Vinayaka KV</div>
                <div style="font-size: 12px; color: #5f6368;">vinayakakv@gmail.com</div>
              </div>
            </div>
            <div style="padding: 12px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="completeGoogleMock('Jane', 'Smith', 'jane.smith@gmail.com')">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: #e91e63; color: white; display: flex; align-items: center; justify-content: center; font-weight: 500;">J</div>
              <div style="flex: 1;">
                <div style="font-size: 14px; font-weight: 500; color: #3c4043;">Jane Smith</div>
                <div style="font-size: 12px; color: #5f6368;">jane.smith@gmail.com</div>
              </div>
            </div>
          </div>
          
        </div>
        <div style="padding: 16px 24px; display: flex; justify-content: space-between; align-items: center;">
          <button style="background: none; border: none; color: #1a73e8; font-weight: 500; font-size: 14px; cursor: pointer;" onclick="closeGoogleMock()">Cancel</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  const addHoverEffect = (el) => {
    el.addEventListener('mouseover', () => el.style.background = '#f8f9fa');
    el.addEventListener('mouseout', () => el.style.background = 'white');
  };
  
  const accounts = document.getElementById('googleMockAccountsList').children;
  Array.from(accounts).forEach(addHoverEffect);
  
  setTimeout(() => {
    document.getElementById('googleAuthMockOverlay').style.opacity = '1';
    document.getElementById('googleAuthBox').style.transform = 'scale(1)';
  }, 10);
}

window.closeGoogleMock = function() {
  const overlay = document.getElementById('googleAuthMockOverlay');
  overlay.style.opacity = '0';
  document.getElementById('googleAuthBox').style.transform = 'scale(0.95)';
  setTimeout(() => overlay.remove(), 300);
};

window.completeGoogleMock = function(firstName, lastName, email) {
  closeGoogleMock();
  
  // Show localized loading state
  const btn = document.getElementById('googleSignInBtn') || document.getElementById('googleSignUpBtn');
  if (btn) btn.innerHTML = 'Signing in...';
  
  const usersStr = localStorage.getItem('evcharger_users_db');
  const users = usersStr ? JSON.parse(usersStr) : [];
  
  let user = users.find(u => u.email === email);
  
  if (!user) {
    user = {
      id: 'g-user-' + Date.now(),
      firstName,
      lastName,
      email,
      authProvider: 'google',
      avatar: `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=random`
    };
    users.push(user);
    localStorage.setItem('evcharger_users_db', JSON.stringify(users));
  }
  
  saveAuthState(user, 'mock-google-token-' + Date.now());
  window.location.href = 'index.html';
};



// ============= PASSWORD UTILITIES =============
function togglePasswordVisibility(e) {
  e.preventDefault();
  const input = e.currentTarget.previousElementSibling;
  const icon = e.currentTarget.querySelector('i');
  
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.add('fa-eye');
    icon.classList.remove('fa-eye-slash');
  }
}

function checkPasswordStrength() {
  const password = document.getElementById('signupPassword').value;
  const strengthBar = document.getElementById('passwordStrength');
  
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;

  const strengthLevels = ['', 'weak', 'fair', 'good', 'strong', 'very-strong'];
  const strengthTexts = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  
  strengthBar.className = 'password-strength ' + strengthLevels[strength];
  strengthBar.textContent = strength > 0 ? strengthTexts[strength] : '';
}

// ============= AUTH GUARDS =============
function requireAuth() {
  if (!currentUser) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function isAuthenticated() {
  return !!currentUser && !!authToken;
}

// Redirect to home if already logged in
function redirectIfAuthed() {
  if (isAuthenticated()) {
    window.location.href = 'index.html';
  }
}

// ============= API HELPERS =============
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };
}

async function makeAuthRequest(url, options = {}) {
  const headers = getAuthHeaders();
  return fetch(url, { ...options, headers });
}
