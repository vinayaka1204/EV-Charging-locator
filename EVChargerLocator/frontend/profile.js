// ============= PROFILE PAGE INITIALIZATION =============
if (typeof requireAuth !== 'undefined' && !requireAuth()) {
  // Redirects immediately
}

window.addEventListener('load', () => {
  if (!isAuthenticated()) return;
  
  initProfilePage();
  loadProfileData();
  attachProfileEventListeners();
});

// ============= LOAD PROFILE DATA =============
function loadProfileData() {
  if (!currentUser) return;

  // Set header info
  document.getElementById('profileName').textContent = `${currentUser.firstName} ${currentUser.lastName}`;
  document.getElementById('profileEmail').textContent = currentUser.email;
  document.getElementById('profileAvatar').src = currentUser.avatar || getAvatarUrl(currentUser.email);

  // Show Google badge if signed in with Google
  if (currentUser.authProvider === 'google') {
    document.getElementById('googleBadge').style.display = 'inline-flex';
  }

  // Load personal info
  document.getElementById('firstName').value = currentUser.firstName || '';
  document.getElementById('lastName').value = currentUser.lastName || '';
  document.getElementById('email').value = currentUser.email || '';
  document.getElementById('phone').value = currentUser.phone || '';
  document.getElementById('location').value = currentUser.location || '';
  document.getElementById('bio').value = currentUser.bio || '';

  // Load preferences
  document.getElementById('preferredCharger').value = currentUser.preferences?.preferredCharger || '';
  document.getElementById('notificationDistance').value = currentUser.preferences?.notificationDistance || '10';
  document.getElementById('emailNotifications').checked = currentUser.preferences?.emailNotifications !== false;
  document.getElementById('pushNotifications').checked = currentUser.preferences?.pushNotifications !== false;
  document.getElementById('locationTracking').checked = currentUser.preferences?.locationTracking !== false;

  // Load vehicles
  loadVehicles(currentUser.vehicles || []);

  // Load history
  loadHistory(currentUser.recentVisits || []);
}

function getAvatarUrl(email) {
  // Try to get from Google profile or use gravatar
  return `https://i.pravatar.cc/150?u=${email}`;
}

// ============= LOAD VEHICLES =============
function loadVehicles(vehicles) {
  const vehiclesList = document.getElementById('vehiclesList');
  
  if (vehicles.length === 0) {
    vehiclesList.innerHTML = '<p class="empty-state">No vehicles added yet</p>';
    return;
  }

  vehiclesList.innerHTML = vehicles.map(vehicle => `
    <div class="vehicle-card">
      <div class="vehicle-icon">
        <i class="fas fa-car"></i>
      </div>
      <div class="vehicle-info">
        <h4>${vehicle.year} ${vehicle.make} ${vehicle.model}</h4>
        ${vehicle.batteryCapacity ? `<p>Battery: ${vehicle.batteryCapacity} kWh</p>` : ''}
      </div>
      <button class="vehicle-delete" data-id="${vehicle.id}">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join('');

  // Attach delete handlers
  vehiclesList.querySelectorAll('.vehicle-delete').forEach(btn => {
    btn.addEventListener('click', (e) => deleteVehicle(e.currentTarget.dataset.id));
  });
}

// ============= LOAD HISTORY =============
function loadHistory(history) {
  const historyList = document.getElementById('historyList');
  
  if (history.length === 0) {
    historyList.innerHTML = '<p class="empty-state">No history yet</p>';
    return;
  }

  historyList.innerHTML = history.slice(0, 10).map(visit => {
    const date = new Date(visit.timestamp);
    return `
      <div class="history-item">
        <div class="history-icon">
          <i class="fas fa-map-marker-alt"></i>
        </div>
        <div class="history-info">
          <h4>${visit.stationName}</h4>
          <p>${visit.location}</p>
          <small>${date.toLocaleDateString()} at ${date.toLocaleTimeString()}</small>
        </div>
      </div>
    `;
  }).join('');
}

// ============= PROFILE PAGE INTERACTIONS =============
function initProfilePage() {
  // Tab switching
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Back button
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Logout button
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
      logout();
    }
  });
}

function attachProfileEventListeners() {
  // Personal form
  document.getElementById('personalForm').addEventListener('submit', handlePersonalFormSubmit);

  // Password change
  document.getElementById('changePasswordBtn').addEventListener('click', () => {
    document.getElementById('passwordModal').classList.remove('hidden');
  });
  document.getElementById('closePasswordModal').addEventListener('click', () => {
    document.getElementById('passwordModal').classList.add('hidden');
  });
  document.getElementById('cancelPasswordBtn').addEventListener('click', () => {
    document.getElementById('passwordModal').classList.add('hidden');
  });
  document.getElementById('passwordForm').addEventListener('submit', handlePasswordChange);

  // Avatar upload
  document.getElementById('uploadAvatarBtn').addEventListener('click', () => {
    document.getElementById('avatarUpload').click();
  });
  document.getElementById('avatarUpload').addEventListener('change', handleAvatarUpload);

  // Add vehicle
  document.getElementById('addVehicleBtn').addEventListener('click', () => {
    document.getElementById('vehicleModal').classList.remove('hidden');
  });
  document.getElementById('closeVehicleModal').addEventListener('click', () => {
    document.getElementById('vehicleModal').classList.add('hidden');
  });
  document.getElementById('cancelVehicleBtn').addEventListener('click', () => {
    document.getElementById('vehicleModal').classList.add('hidden');
  });
  document.getElementById('vehicleForm').addEventListener('submit', handleAddVehicle);

  // Preferences
  document.getElementById('preferencesForm').addEventListener('submit', handlePreferencesSubmit);

  // Delete account
  document.getElementById('deleteAccountBtn').addEventListener('click', handleDeleteAccount);
}

// ============= TAB SWITCHING =============
function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.profile-tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Deactivate all tab buttons
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.classList.remove('active');
  });

  // Show selected tab
  const tabElement = document.getElementById(tabName + 'Tab');
  if (tabElement) {
    tabElement.classList.add('active');
  }

  // Activate tab button
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

// ============= FORM SUBMISSIONS =============
async function handlePersonalFormSubmit(e) {
  e.preventDefault();

  const userData = {
    firstName: document.getElementById('firstName').value,
    lastName: document.getElementById('lastName').value,
    phone: document.getElementById('phone').value,
    location: document.getElementById('location').value,
    bio: document.getElementById('bio').value
  };

  try {
    const usersStr = localStorage.getItem('evcharger_users_db');
    const users = usersStr ? JSON.parse(usersStr) : [];
    const idx = users.findIndex(u => u.email === currentUser.email);
    if (idx !== -1) {
      Object.assign(users[idx], userData);
      localStorage.setItem('evcharger_users_db', JSON.stringify(users));
    }

    Object.assign(currentUser, userData);
    saveAuthState(currentUser, authToken);

    document.getElementById('profileName').textContent = `${currentUser.firstName} ${currentUser.lastName}`;
    showNotification('Profile updated successfully!', 'success');
  } catch (error) {
    showNotification('Failed to update profile: ' + error.message, 'error');
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();

  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmNewPassword').value;

  if (newPassword !== confirmPassword) {
    showNotification('Passwords do not match', 'error');
    return;
  }

  try {
    const usersStr = localStorage.getItem('evcharger_users_db');
    const users = usersStr ? JSON.parse(usersStr) : [];
    const idx = users.findIndex(u => u.email === currentUser.email);
    
    if (idx !== -1) {
      if (users[idx].password && users[idx].password !== currentPassword) {
        showNotification('Incorrect current password', 'error');
        return;
      }
      users[idx].password = newPassword;
      localStorage.setItem('evcharger_users_db', JSON.stringify(users));
    }

    document.getElementById('passwordModal').classList.add('hidden');
    document.getElementById('passwordForm').reset();
    showNotification('Password changed successfully!', 'success');
  } catch (error) {
    showNotification('Failed to change password: ' + error.message, 'error');
  }
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Avatar = reader.result;
      
      const usersStr = localStorage.getItem('evcharger_users_db');
      const users = usersStr ? JSON.parse(usersStr) : [];
      const idx = users.findIndex(u => u.email === currentUser.email);
      if (idx !== -1) {
        users[idx].avatar = base64Avatar;
        localStorage.setItem('evcharger_users_db', JSON.stringify(users));
      }

      currentUser.avatar = base64Avatar;
      saveAuthState(currentUser, authToken);

      const avatarImg = document.getElementById('profileAvatar');
      const headerAvatar = document.querySelector('.profile-avatar');
      if (avatarImg) avatarImg.src = base64Avatar;
      if (headerAvatar) headerAvatar.src = base64Avatar;
      
      showNotification('Avatar updated successfully!', 'success');
    };
    reader.readAsDataURL(file);
  } catch (error) {
    showNotification('Failed to upload avatar: ' + error.message, 'error');
  }
}

async function handleAddVehicle(e) {
  e.preventDefault();

  const vehicle = {
    id: 'veh-' + Date.now(),
    make: document.getElementById('vehicleMake').value,
    model: document.getElementById('vehicleModel').value,
    year: parseInt(document.getElementById('vehicleYear').value),
    batteryCapacity: parseFloat(document.getElementById('batteryCapacity').value) || null
  };

  try {
    if (!currentUser.vehicles) currentUser.vehicles = [];
    currentUser.vehicles.push(vehicle);

    const usersStr = localStorage.getItem('evcharger_users_db');
    const users = usersStr ? JSON.parse(usersStr) : [];
    const idx = users.findIndex(u => u.email === currentUser.email);
    if (idx !== -1) {
      if (!users[idx].vehicles) users[idx].vehicles = [];
      users[idx].vehicles.push(vehicle);
      localStorage.setItem('evcharger_users_db', JSON.stringify(users));
    }

    saveAuthState(currentUser, authToken);

    document.getElementById('vehicleModal').classList.add('hidden');
    document.getElementById('vehicleForm').reset();
    loadVehicles(currentUser.vehicles);
    showNotification('Vehicle added successfully!', 'success');
  } catch (error) {
    showNotification('Failed to add vehicle: ' + error.message, 'error');
  }
}

async function deleteVehicle(vehicleId) {
  if (!confirm('Delete this vehicle?')) return;

  try {
    currentUser.vehicles = currentUser.vehicles.filter(v => v.id !== vehicleId);

    const usersStr = localStorage.getItem('evcharger_users_db');
    const users = usersStr ? JSON.parse(usersStr) : [];
    const idx = users.findIndex(u => u.email === currentUser.email);
    if (idx !== -1) {
      users[idx].vehicles = users[idx].vehicles.filter(v => v.id !== vehicleId);
      localStorage.setItem('evcharger_users_db', JSON.stringify(users));
    }

    saveAuthState(currentUser, authToken);
    loadVehicles(currentUser.vehicles);
    showNotification('Vehicle deleted', 'success');
  } catch (error) {
    showNotification('Failed to delete vehicle: ' + error.message, 'error');
  }
}

async function handlePreferencesSubmit(e) {
  e.preventDefault();

  const preferences = {
    preferredCharger: document.getElementById('preferredCharger').value,
    notificationDistance: parseInt(document.getElementById('notificationDistance').value),
    emailNotifications: document.getElementById('emailNotifications').checked,
    pushNotifications: document.getElementById('pushNotifications').checked,
    locationTracking: document.getElementById('locationTracking').checked
  };

  try {
    currentUser.preferences = preferences;

    const usersStr = localStorage.getItem('evcharger_users_db');
    const users = usersStr ? JSON.parse(usersStr) : [];
    const idx = users.findIndex(u => u.email === currentUser.email);
    if (idx !== -1) {
      users[idx].preferences = preferences;
      localStorage.setItem('evcharger_users_db', JSON.stringify(users));
    }

    saveAuthState(currentUser, authToken);
    showNotification('Preferences updated!', 'success');
  } catch (error) {
    showNotification('Failed to update preferences: ' + error.message, 'error');
  }
}

async function handleDeleteAccount() {
  if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) return;
  if (!confirm('This will permanently delete all your data. Proceed?')) return;

  try {
    const usersStr = localStorage.getItem('evcharger_users_db');
    const users = usersStr ? JSON.parse(usersStr) : [];
    const updatedUsers = users.filter(u => u.email !== currentUser.email);
    localStorage.setItem('evcharger_users_db', JSON.stringify(updatedUsers));

    logout();
  } catch (error) {
    showNotification('Failed to delete account: ' + error.message, 'error');
  }
}

// ============= UTILITIES =============
function showNotification(message, type = 'info') {
  // Simple notification - you can enhance with a proper toast library
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#188038' : type === 'error' ? '#d93025' : '#1a73e8'};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
