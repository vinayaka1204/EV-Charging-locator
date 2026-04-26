console.log('[EV App] Script Version 2.0 Loaded');

// ============= GLOBAL ERROR HANDLER =============
window.onerror = function (msg, url, lineNo, columnNo, error) {
  console.error('Error: ' + msg + '\nScript: ' + url + '\nLine: ' + lineNo);
  return false;
};

// Check authentication immediately
if (typeof isAuthenticated !== 'undefined' && !isAuthenticated()) {
  window.location.replace('login.html');
}

let map;
let markersLayer;
let chargersData = [];
let routingControl = null;
let userLocation = null;
let userMarker = null;
let carMarker = null;
let selectedCharger = null;
let galleryIndex = 0;
let currentMode = 'normal'; // 'normal' | 'directions' | 'navigation'
let routeSteps = [];
let currentStepIndex = 0;
let navWatchId = null;
let pendingAutoStart = false;
let allModeRoutes = {}; // { driving: {...}, walking: {...}, cycling: {...} }
let activeMode = 'driving';

// APIs
const OCM_API = "https://api.openchargemap.io/v3/poi/";
//const API = "https://bg9r4edt9a.execute-api.us-east-1.amazonaws.com/getCharger";
const API = "https://bg9r4edt9a.execute-api.us-east-1.amazonaws.com/getCharger";

fetch(`${API}/getCharger`)
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));

// Brand colors for markers
const PETROL_COMPANY_COLORS = {
  "HP Petrol Pump": "#d93025",
  "Shell Petrol Pump": "#ffcc00",
  "Indian Oil": "#ff6600",
  "Bharat Petroleum": "#005ea5",
  "Reliance Petroleum": "#003399",
  "Jio-bp": "#00a859",
  "Nayara Energy": "#000000"
};

// Parse Local Data (Petrol Bunks, Hotels & Pre-set EV Stations)
const localPetrolStations = (typeof parsePetrolStations === 'function') ? parsePetrolStations() : [];
const localHotels = (typeof parseHotelStations === 'function') ? parseHotelStations() : [];
const globalLocalStations = [...localPetrolStations, ...localHotels];

// Removed EV datasets entirely
// Removed all hardcoded petrol and EV data to rely purely on live map data


// ============= VOICE ANNOUNCEMENT (TTS) =============
let announcementEnabled = true;
function announceText(text) {
  if (!announcementEnabled || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  window.speechSynthesis.speak(utterance);
}

function announceNearbyStations() {
  if (!chargersData || chargersData.length === 0) {
    announceText('No EV charging stations found within 5 kilometers of your location.');
    return;
  }
  const within5 = chargersData.filter(c => c._distance !== undefined && c._distance <= 5);
  if (within5.length === 0) {
    announceText('No EV charging stations found within 5 kilometers.');
    return;
  }

  const nearest = within5[0];
  const nearDist = nearest._distance ? nearest._distance.toFixed(1) : '?';
  const stName = nearest.AddressInfo.Title;

  // Simulated traffic condition based on usage stats
  let trafficLevel = 'light';
  const avgUsage = within5.reduce((s, c) => s + (c.UsageStats || 0), 0) / within5.length;
  if (avgUsage > 70) trafficLevel = 'heavy';
  else if (avgUsage > 40) trafficLevel = 'moderate';

  let msg = `Found ${within5.length} EV charging station${within5.length > 1 ? 's' : ''} within 5 kilometers. `;
  msg += `The nearest station is ${stName}, located ${nearDist} kilometers away. `;
  if (nearest.Rating) msg += `It has a rating of ${nearest.Rating} out of 5. `;
  msg += `Current traffic around the area is ${trafficLevel}. `;
  if (within5.length > 1) {
    msg += `Other nearby stations include ${within5.slice(1, 3).map(c => c.AddressInfo.Title).join(' and ')}. `;
  }
  msg += 'Tap on any station for directions.';

  announceText(msg);
}

function getTrafficCondition(station) {
  const usage = station.UsageStats || 0;
  if (usage > 70) return { level: 'Heavy', color: '#d93025', icon: 'fa-car-crash' };
  if (usage > 40) return { level: 'Moderate', color: '#f29900', icon: 'fa-car-side' };
  return { level: 'Light', color: '#188038', icon: 'fa-road' };
}

function renderStarRating(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.3 && rating % 1 < 0.8 ? 1 : 0;
  const empty = 5 - full - half;
  let html = '';
  for (let i = 0; i < full; i++) html += '<i class="fas fa-star"></i>';
  if (half) html += '<i class="fas fa-star-half-alt"></i>';
  for (let i = 0; i < empty; i++) html += '<i class="far fa-star"></i>';
  return html;
}

function getAvailabilityStatus(availability) {
  if (!availability) return { text: 'Open 24 hours', color: '#188038' };
  if (availability === '24/7') return { text: 'Open 24 hours', color: '#188038' };

  // Parse hours like "9:00-18:00"
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const parts = availability.split('-');
  if (parts.length === 2) {
    const [openH, openM] = parts[0].split(':').map(Number);
    const [closeH, closeM] = parts[1].split(':').map(Number);
    const currentTotal = currentHour * 60 + currentMin;
    const openTotal = openH * 60 + (openM || 0);
    const closeTotal = closeH * 60 + (closeM || 0);
    if (currentTotal >= openTotal && currentTotal < closeTotal) {
      const minsLeft = closeTotal - currentTotal;
      if (minsLeft <= 60) return { text: `Open · Closes in ${minsLeft} min`, color: '#f29900' };
      return { text: `Open · Closes ${parts[1]}`, color: '#188038' };
    } else {
      return { text: `Closed · Opens ${parts[0]}`, color: '#d93025' };
    }
  }
  return { text: availability, color: '#5f6368' };
}

// Station images
const stationImages = [
  'https://images.unsplash.com/photo-1593941707882-a5bba14938cb?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1647166545674-ce28ce93bdca?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1615744455875-7ad410758be3?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1617886903355-9354ca3fffa5?auto=format&fit=crop&w=600&q=80'
];

// Maneuver icons mapping
const maneuverIcons = {
  'turn-left': 'fa-arrow-left',
  'turn-right': 'fa-arrow-right',
  'sharp-left': 'fa-arrow-left',
  'sharp-right': 'fa-arrow-right',
  'slight-left': 'fa-arrow-left',
  'slight-right': 'fa-arrow-right',
  'straight': 'fa-arrow-up',
  'uturn': 'fa-undo',
  'roundabout': 'fa-sync-alt',
  'rotary': 'fa-sync-alt',
  'merge': 'fa-compress-arrows-alt',
  'fork': 'fa-code-branch',
  'depart': 'fa-play',
  'arrive': 'fa-flag-checkered'
};

// ============= DOM ELEMENTS & UTILS =============
const $ = (id) => document.getElementById(id);
let searchInput, sidePanel, loadingOverlay, loadingText, normalUI, directionsUI, navUI, chips;

// ============= INITIALIZATION =============
window.onload = function () {
  console.log('[EV App] window.onload started');

  // 1. Initialize critical DOM references immediately
  searchInput = $('searchInput');
  sidePanel = $('sidePanel');
  loadingOverlay = $('loadingOverlay');
  loadingText = $('loadingText');
  normalUI = $('normalUI');
  directionsUI = $('directionsUI');
  navUI = $('navUI');
  chips = document.querySelectorAll('.chip[data-filter]');

  // 2. Initialize Map FIRST before any other logic can crash
  console.log('[EV App] Initializing Map...');
  try {
    if (typeof L === 'undefined') throw new Error('Leaflet library not loaded!');

    // LEAFLET INITIALIZATION (Matched to user's requested style)
    map = L.map('map').setView([12.9716, 77.5946], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    // Overlay layers setup
    window.baseTileLayers = {
      map: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {}),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {}),
      terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {})
    };

    markersLayer = L.layerGroup().addTo(map);
    window.mainTileLayer = window.baseTileLayers.map;

    markersLayer = L.layerGroup().addTo(map);
    console.log('[EV App] Map & Layers Initialized');

    // Force map to recognize its container size
    setTimeout(() => { map.invalidateSize(); }, 500);

  } catch (err) {
    console.error('[EV App] Map setup failed CRITICALLY:', err);
    if (loadingText) loadingText.textContent = 'Map initialization failed. Please refresh.';
    return; // Stop if map fails
  }

  // 3. Other UI Initialization
  setupGlobalStreetViewModal();
  setupUserLocation();

  // Sidebar profile & logout buttons
  $('profileSidebarBtn')?.addEventListener('click', () => { window.location.href = 'profile.html'; });
  $('logoutSidebarBtn')?.addEventListener('click', () => { if (confirm('Are you sure you want to logout?')) logout(); });

  // Taskbar buttons
  $('navSavedBtn')?.addEventListener('click', () => { window.location.href = 'profile.html?tab=history'; });
  $('navRecentsBtn')?.addEventListener('click', () => { window.location.href = 'profile.html?tab=history'; });

  // Profile avatar logic
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.avatar) {
    const profileAvatar = document.querySelector('.profile-avatar');
    if (profileAvatar) {
      profileAvatar.src = currentUser.avatar;
      profileAvatar.style.cursor = 'pointer';
      profileAvatar.addEventListener('click', () => { window.location.href = 'profile.html'; });
    }
  }

  // Map Controls State
  let currentMapLayer = 'map';
  const activeOverlays = { traffic: false, transit: false, biking: false };

  // Layer switcher logic
  $('primaryLayerToggle')?.addEventListener('click', () => {
    const targetLayer = $('primaryLayerToggle').dataset.layer || 'satellite';
    setMapLayer(targetLayer);
  });

  // Overlay buttons
  document.querySelectorAll('.layer-option-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.layer;
      if (type === 'more') return;
      if (type === 'terrain') {
        setMapLayer('terrain');
      } else {
        toggleMapOverlay(type);
      }
    });
  });


  // Zoom controls
  $('zoomInBtn').addEventListener('click', () => map.zoomIn());
  $('zoomOutBtn').addEventListener('click', () => map.zoomOut());

  // Location button
  $('currentLocationBtn').addEventListener('click', () => {
    showLoading('Finding chargers near you...');
    detectUserLocation(true);
  });

  // Search
  searchInput.addEventListener('focus', () => {
    // When touching the search bar, open directions UI as requested
    enterDirectionsMode(null);
  });
  searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchLocation(); });
  $('searchBtn').addEventListener('click', searchLocation);

  // Directions destination search
  $('dirDestInput')?.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const q = $('dirDestInput').value.trim();
      if (!q) return;

      // Clear previous marker if exists
      if (window.customDestMarker) map.removeLayer(window.customDestMarker);

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
        const results = await res.json();
        if (results.length) {
          const lat = parseFloat(results[0].lat);
          const lon = parseFloat(results[0].lon);

          // Create dummy charger object for the searched location
          const dummyTarget = {
            AddressInfo: { Title: results[0].name || q, Latitude: lat, Longitude: lon },
            Status: { IsOp: true }, Operator: { Title: '' }, Connections: [], _src: 'search'
          };

          // Show marker
          window.customDestMarker = L.marker([lat, lon]).addTo(map)
            .bindPopup(`<strong>${results[0].name || q}</strong>`).openPopup();
          map.setView([lat, lon], 15);

          // Calculate directions to this location
          enterDirectionsMode(dummyTarget);
        }
      } catch (e) { console.error('Search failed', e); }
    }
  });

  // Map click - allow selecting ANY place/hotel/etc.
  map.on('click', async (e) => {
    if (currentMode === 'directions' && !$('dirDestInput').value) {
      // In directions mode picking a destination
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
        const data = await res.json();
        const title = data.name || data.display_name.split(',')[0] || 'Selected Place';

        if (window.customDestMarker) map.removeLayer(window.customDestMarker);
        window.customDestMarker = L.marker([lat, lon]).addTo(map)
          .bindPopup(`<strong>${title}</strong>`).openPopup();

        const dummyTarget = {
          AddressInfo: { Title: title, Latitude: lat, Longitude: lon },
          Status: { IsOp: true }, Operator: { Title: '' }, Connections: [], _src: 'map_click'
        };
        enterDirectionsMode(dummyTarget);
      } catch (err) { }
    } else if (currentMode === 'normal') {
      // Close side panel if clicking empty space, but let's try to get place info first
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      try {
        showLoading('Identifying place...');
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
        const data = await res.json();
        hideLoading();

        const title = data.name || data.address?.building || data.address?.amenity || data.address?.shop || 'Selected Location';
        if (!title || title === 'Selected Location') {
          // If it's just an empty road/space, just close panel
          sidePanel.classList.remove('open');
          if (window.customDestMarker) map.removeLayer(window.customDestMarker);
          return;
        }

        if (window.customDestMarker) map.removeLayer(window.customDestMarker);
        window.customDestMarker = L.marker([lat, lon]).addTo(map);

        // Show place info in side panel
        const dummyTarget = {
          AddressInfo: {
            Title: title,
            AddressLine1: data.display_name.split(',').slice(0, 2).join(','),
            Latitude: lat,
            Longitude: lon
          },
          Status: { IsOp: true, Title: 'Location' },
          Operator: { Title: data.address?.tourism || data.address?.leisure || 'Place of Interest' },
          Connections: [],
          Usage: 'Public',
          _src: 'map_click'
        };
        openSidePanel(dummyTarget);
        $('spTypeTxt').textContent = dummyTarget.Operator.Title || 'Place';
      } catch (err) {
        hideLoading();
        sidePanel.classList.remove('open');
      }
    }
  });
  $('closePanelBtn').addEventListener('click', () => sidePanel.classList.remove('open'));

  // Station panel: Directions button → opens directions mode
  $('directionsBtn').addEventListener('click', () => {
    if (selectedCharger) enterDirectionsMode(selectedCharger);
  });

  // Station panel: Start button → straight to in-app navigation
  $('startNavBtn').addEventListener('click', () => {
    if (selectedCharger) {
      enterDirectionsMode(selectedCharger);
      // Wait for route calculation then auto-start
      pendingAutoStart = true;
    }
  });

  // Directions UI buttons
  $('dirBackBtn').addEventListener('click', exitDirectionsMode);
  $('startNavInApp').addEventListener('click', startNavigation);

  // Navigation UI buttons
  $('navCloseBtn').addEventListener('click', exitNavigation);
  $('navStopBtn').addEventListener('click', exitNavigation);

  // Gallery
  $('galleryPrev').addEventListener('click', () => slideGallery(-1));
  $('galleryNext').addEventListener('click', () => slideGallery(1));

  // Voice announcement toggle
  $('voiceToggleBtn')?.addEventListener('click', () => {
    announcementEnabled = !announcementEnabled;
    const icon = $('voiceToggleBtn').querySelector('i');
    if (announcementEnabled) {
      icon.className = 'fas fa-volume-up';
      $('voiceToggleBtn').title = 'Voice announcements ON';
      announceText('Voice announcements enabled.');
    } else {
      window.speechSynthesis.cancel();
      icon.className = 'fas fa-volume-mute';
      $('voiceToggleBtn').title = 'Voice announcements OFF';
    }
  });

  // Share results button
  $('shareResultsBtn')?.addEventListener('click', () => {
    const stationNames = chargersData.slice(0, 5).map(c => c.AddressInfo.Title).join(', ');
    const shareText = `Found ${chargersData.length} EV charging stations nearby: ${stationNames}. Check them out!`;
    if (navigator.share) {
      navigator.share({ title: 'EV Charging Stations Nearby', text: shareText, url: window.location.href }).catch(() => { });
    } else {
      navigator.clipboard.writeText(shareText).then(() => {
        alert('Station list copied to clipboard!');
      }).catch(() => alert(shareText));
    }
  });

  // Direction mode icons (top bar)
  document.querySelectorAll('.dir-mode-icon').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dir-mode-icon').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      // Map train to transit, flight to driving (not supported)
      const modeMap = { train: 'transit', flight: 'driving' };
      switchActiveMode(modeMap[mode] || mode);
    });
  });

  // Mode comparison cards
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      document.querySelectorAll('.dir-mode-icon').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
      });
      switchActiveMode(mode);
    });
  });

  // Direction origin/destination search
  $('dirOriginSearchBtn')?.addEventListener('click', () => searchDirectionInput('origin'));
  $('dirDestSearchBtn')?.addEventListener('click', () => searchDirectionInput('dest'));
  $('dirOriginInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchDirectionInput('origin'); });
  $('dirDestInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchDirectionInput('dest'); });

  // Swap origin/destination
  $('reverseRouteBtn')?.addEventListener('click', () => {
    const originEl = $('dirOriginInput');
    const destEl = $('dirDestInput');
    if (originEl && destEl) {
      const tmp = originEl.value;
      originEl.value = destEl.value;
      destEl.value = tmp;
    }
  });

  // "Your location" quick pick
  $('dirUseMyLocation')?.addEventListener('click', () => {
    if ($('dirOriginInput')) $('dirOriginInput').value = 'Your location';
  });

  // Recent locations from nearby stations
  populateRecentLocations();

  // Filter chips
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const filter = chip.getAttribute('data-filter');

      // POI logic (Temples, Food, Banks, Hotels)
      if (filter && filter.startsWith('poi-')) {
        // Toggle off other POI chips
        chips.forEach(c => {
          if (c !== chip && c.getAttribute('data-filter')?.startsWith('poi-')) {
            c.classList.remove('active');
          }
        });

        chip.classList.toggle('active');
        if (chip.classList.contains('active')) {
          fetchAndShowPOIs(chip.textContent.trim());
        } else if (window.poiMarkersLayer) {
          map.removeLayer(window.poiMarkersLayer);
        }
        return;
      }

      if (filter === 'near-me') {
        showLoading('Finding chargers near you...');
        detectUserLocation(true);
        return;
      }
      chip.classList.toggle('active');
      applyFilters();
      renderResults();
    });
  });

  // Profile Dropdown Toggle
  const profileAvatar = $('profileAvatar');
  if (profileAvatar) {
    profileAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = $('profileDropdown');
      if (dropdown) dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
  }

  // Search Suggestions Double Tap
  if (searchInput) {
    searchInput.addEventListener('dblclick', () => {
      const sugg = $('searchSuggestions');
      if (sugg) sugg.style.display = 'block';
    });
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#mainOmnibox') && !e.target.closest('#searchSuggestions')) {
        const sugg = $('searchSuggestions');
        if (sugg) sugg.style.display = 'none';
      }
      // Also hide profile dropdown when clicking outside
      if (!e.target.closest('#profileAvatar') && !e.target.closest('#profileDropdown')) {
        const pd = $('profileDropdown');
        if (pd) pd.style.display = 'none';
      }
    });
  }

  // Results refresh button
  $('refreshResultsBtn')?.addEventListener('click', () => {
    showLoading('Refreshing EV stations...');
    fetchChargersAtMapCenter();
  });

  $('btn360').addEventListener('click', () => {
    if (selectedCharger) {
      const a = selectedCharger.AddressInfo;
      const container = $('streetViewContainer');
      const gallery = $('galleryContainer');

      // Show inline in side panel
      gallery.style.display = 'none';
      container.classList.remove('hidden');

      const iframe = $('streetViewIframe');
      if (iframe) {
        const heading = selectedCharger.StreetViewHeading || 180;
        iframe.src = buildStreetViewUrl(a.Latitude, a.Longitude, heading, 90);
      }

      const fullLink = $('btn360Full');
      if (fullLink) {
        fullLink.href = `https://www.google.com/maps/@${a.Latitude},${a.Longitude},3a,75y,${selectedCharger.StreetViewHeading || 180}h,90t/data=!3m6!1e1!3m4!1s!2e0!7i13312!8i6656`;
      }
    }
  });

  $('btn360Close').addEventListener('click', () => {
    const container = $('streetViewContainer');
    const gallery = $('galleryContainer');
    container.classList.add('hidden');
    gallery.style.display = 'block';
    const iframe = $('streetViewIframe');
    if (iframe) iframe.src = '';
  });

  // Fetch and show custom POIs via Nominatim (Enhanced)
  async function fetchAndShowPOIs(categoryLabel) {
    const center = map.getCenter();
    const chip = Array.from(chips).find(c => c.textContent.trim() === categoryLabel);
    const categoryType = chip ? chip.getAttribute('data-category') : categoryLabel.toLowerCase();

    // Better query: "restaurant" or "hotel" or "place_of_worship" within Bengaluru
    const q = encodeURIComponent(categoryLabel);
    showLoading(`Finding ${categoryLabel} nearby...`);

    try {
      // Use Nominatim search with viewbox to bias results to the current map area
      const bounds = map.getBounds();
      const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=20&viewbox=${viewbox}&bounded=1`;

      const res = await fetch(url);
      const data = await res.json();
      hideLoading();

      if (window.poiMarkersLayer) map.removeLayer(window.poiMarkersLayer);
      window.poiMarkersLayer = L.layerGroup().addTo(map);

      if (data.length === 0) {
        // Fallback: search without bounding box but near center
        const fallbackRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=15&lat=${center.lat}&lon=${center.lng}`);
        const fallbackData = await fallbackRes.json();
        if (fallbackData.length > 0) data.push(...fallbackData);
      }

      const iconMap = {
        'Hotels': { color: '#673ab7', icon: 'fa-hotel' },
        'Food': { color: '#ff5722', icon: 'fa-utensils' },
        'Temples': { color: '#ff9800', icon: 'fa-place-of-worship' },
        'Banks': { color: '#3f51b5', icon: 'fa-university' }
      };

      const config = iconMap[categoryLabel] || { color: '#e91e63', icon: 'fa-map-marker-alt' };

      data.forEach(item => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const title = item.name || item.display_name.split(',')[0];

        const poiIcon = L.divIcon({
          className: 'poi-marker-container',
          html: `<div class="poi-marker-inner" style="background:${config.color};">
                   <i class="fas ${config.icon}"></i>
                 </div>`,
          iconSize: [30, 30], iconAnchor: [15, 15]
        });

        L.marker([lat, lon], { icon: poiIcon }).addTo(window.poiMarkersLayer)
          .bindPopup(`
            <div style="font-family:Roboto,sans-serif; padding:5px;">
              <div style="font-weight:700; font-size:14px; color:${config.color};">${title}</div>
              <div style="font-size:11px; color:#5f6368; margin-top:4px;">${item.display_name.split(',').slice(1, 4).join(',')}</div>
              <button onclick="window.setDestinationFromPOI(${lat}, ${lon}, '${title.replace(/'/g, "\\'")}')" 
                style="margin-top:10px; width:100%; padding:6px; background:${config.color}; color:white; border:none; border-radius:4px; font-size:12px; cursor:pointer;">
                <i class="fas fa-directions"></i> Get Directions
              </button>
            </div>
          `);
      });

      if (data.length > 0) {
        // Adjust zoom slightly if markers are too far
        const markerBounds = L.latLngBounds(data.map(d => [d.lat, d.lon]));
        map.flyToBounds(markerBounds, { padding: [40, 40], maxZoom: 16 });
      } else {
        alert(`No ${categoryLabel} found in this area.`);
      }
    } catch (e) {
      hideLoading();
      console.error('POI Search Error:', e);
    }
  }

  // Global helper for POI directions
  window.setDestinationFromPOI = (lat, lon, title) => {
    const poiObj = {
      AddressInfo: { Title: title, Latitude: lat, Longitude: lon },
      Status: { IsOp: true }, Operator: { Title: 'Point of Interest' }, Connections: [], _src: 'poi'
    };
    enterDirectionsMode(poiObj);
  };

  // Map Layer Toggle (Google Style)
  function setMapLayer(layer) {
    if (layer === currentMapLayer) return;
    if (window.mainTileLayer) map.removeLayer(window.mainTileLayer);
    window.mainTileLayer = window.baseTileLayers[layer] || window.baseTileLayers.map;
    window.mainTileLayer.addTo(map);
    currentMapLayer = layer;

    // Update Main Toggle Button
    const nextLayer = layer === 'satellite' ? 'map' : 'satellite';
    const toggleBtn = $('primaryLayerToggle');
    const thumb = toggleBtn.querySelector('.layer-thumb');
    const label = toggleBtn.querySelector('.layer-label');

    toggleBtn.dataset.layer = nextLayer;
    thumb.className = `layer-thumb ${nextLayer}-thumb`;
    label.textContent = nextLayer === 'satellite' ? 'Satellite' : 'Map';
  }

  function toggleMapOverlay(layer) {
    if (!window.overlayTileLayers[layer]) return;

    activeOverlays[layer] = !activeOverlays[layer];
    const item = document.querySelector(`.layer-option-item[data-layer="${layer}"]`);
    item?.classList.toggle('active', activeOverlays[layer]);

    if (activeOverlays[layer]) {
      window.overlayTileLayers[layer].addTo(map);
    } else {
      map.removeLayer(window.overlayTileLayers[layer]);
    }
  }

  // Event Listeners for New Switcher
  $('primaryLayerToggle').addEventListener('click', () => {
    const targetLayer = $('primaryLayerToggle').dataset.layer;
    setMapLayer(targetLayer);
  });

  document.querySelectorAll('.layer-option-item').forEach(item => {
    item.addEventListener('click', () => {
      const layer = item.dataset.layer;
      if (layer === 'more') {
        alert('More map options are coming soon.');
      } else if (layer === 'terrain') {
        // Terrain is a base layer in our setup
        setMapLayer('terrain');
      } else {
        toggleMapOverlay(layer);
      }
    });
  });

  // Auto-refetch on map move
  map.on('moveend', debounce(() => {
    if (currentMode === 'normal' && !routingControl) {
      fetchChargersAtMapCenter();
    }
  }, 1500));

  // Boot
  showLoading('Detecting your location...');
  detectUserLocation(true);

  // SAFETY: Force-hide loading overlay after 3 seconds no matter what
  setTimeout(() => {
    if (loadingOverlay && !loadingOverlay.classList.contains('hidden')) {
      hideLoading();
      console.log('[EV App] Safety timeout: forced loading overlay dismiss');
    }
  }, 3000);
};

// ============= MODE SWITCHING =============
function setMode(mode) {
  currentMode = mode;
  normalUI.style.display = mode === 'normal' ? '' : 'none';
  $('stationCount').style.display = mode === 'normal' ? '' : 'none';
  $('bottomControls').style.display = mode === 'navigation' ? 'none' : '';

  if (mode === 'directions') {
    directionsUI.classList.remove('hidden');
    navUI.classList.add('hidden');
  } else if (mode === 'navigation') {
    directionsUI.classList.add('hidden');
    navUI.classList.remove('hidden');
  } else {
    directionsUI.classList.add('hidden');
    navUI.classList.add('hidden');
  }
}

// ============= LOCATION =============
function detectUserLocation(centerAndFetch = false) {
  // Always start loading Bengaluru data immediately (don't wait for geolocation)
  if (centerAndFetch) {
    fetchChargersAtLocation(12.9716, 77.5946, 30);
  }

  if (!navigator.geolocation) {
    return;
  }

  const options = {
    enableHighAccuracy: false,
    timeout: 2000,
    maximumAge: 300000
  };

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = [pos.coords.latitude, pos.coords.longitude];
      placeUserMarker();
      map.setView(userLocation, 12);
      // Re-fetch for user's actual location
      fetchChargersAtLocation(userLocation[0], userLocation[1], 30);
    },
    (error) => {
      console.warn("Geolocation error:", error);
      // Already loaded Bengaluru data above, just hide loading
      hideLoading();
    },
    options
  );
}

function placeUserMarker() {
  if (userMarker) map.removeLayer(userMarker);
  const icon = L.divIcon({
    className: 'user-marker-pulse',
    html: '<div class="user-pulse"></div><div class="user-dot" title="Drag to adjust your exact location"></div>',
    iconSize: [40, 40], iconAnchor: [20, 20]
  });

  function getPopupContent(lat, lng) {
    return `<div style="font-family:Roboto,sans-serif;min-width:180px;text-align:center;">
      <strong style="font-size:14px;color:#202124;">Placed Location</strong><br>
      <span style="font-size:11px;color:#5f6368;display:block;margin-top:2px;">(Drag dot to adjust)</span>
      <button onclick="openGlobalStreetView(${lat}, ${lng}, 'Your Location')" style="margin-top:10px;width:100%;background:#1a73e8;color:white;border:none;padding:8px;border-radius:16px;cursor:pointer;font-weight:500;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">
        <i class="fas fa-street-view"></i> View 360°
      </button>
    </div>`;
  }

  userMarker = L.marker(userLocation, {
    icon,
    zIndexOffset: 1000,
    draggable: true // Allow user to pinpoint exact location
  }).addTo(map).bindPopup(getPopupContent(userLocation[0], userLocation[1]));

  // When user finishes dragging the blue dot
  userMarker.on('dragend', (e) => {
    const pos = e.target.getLatLng();
    userLocation = [pos.lat, pos.lng];

    userMarker.setPopupContent(getPopupContent(userLocation[0], userLocation[1]));

    // Show loading state and fetch new data based on manual position
    showLoading('Updating your adjusted location...');
    map.setView(userLocation);
    fetchChargersAtLocation(userLocation[0], userLocation[1], 5);
  });
}

function placeCarMarker(lat, lng, heading = 0) {
  if (carMarker) map.removeLayer(carMarker);
  const icon = L.divIcon({
    className: 'car-marker-icon',
    html: `<div class="car-icon" style="transform: rotate(${heading}deg);"><svg viewBox="0 0 24 24" width="32" height="32" fill="#1a73e8" stroke="white" stroke-width="0.5"><path d="M18 8h-1V6c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1v2H6c-2.76 0-5 2.24-5 5v7c0 1.1.9 2 2 2h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c1.1 0 2-.9 2-2v-7c0-2.76-2.24-5-5-5zm-1-2v2H9V6h8zm1 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm-12 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    className: ''
  });

  carMarker = L.marker([lat, lng], { icon, zIndexOffset: 500 }).addTo(map);
}

// ============= ENHANCED 360° STREET VIEW =============
let svHeading = 0;
let svFov = 90;
let svCurrentLat = 0;
let svCurrentLng = 0;

function buildStreetViewUrl(lat, lng, heading, fov) {
  const pitch = -5; // slight downward pitch looks better
  return `https://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,${heading},0,0,0&output=svembed`;
}

window.openGlobalStreetView = function (lat, lng, title) {
  const modal = $('streetViewModal');
  const sidePanelEmbed = $('streetViewContainer');

  svCurrentLat = lat;
  svCurrentLng = lng;

  // Get heading from station data
  let initialHeading = 180;
  if (selectedCharger && selectedCharger.AddressInfo.Latitude === lat && selectedCharger.AddressInfo.Longitude === lng) {
    initialHeading = selectedCharger.StreetViewHeading || 180;
  }

  svHeading = initialHeading;
  svFov = 90;

  // Update Modal UI
  if (modal) {
    $('svTitle').textContent = title || '360° Street View';
    $('svSubtitle').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    $('svLoading').style.display = 'flex';
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('sv-open'), 10);

    const pano = $('svPanorama');
    let iframe = pano.querySelector('iframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.className = 'sv-iframe';
      iframe.allowFullscreen = true;
      pano.appendChild(iframe);
    }
    iframe.src = buildStreetViewUrl(lat, lng, svHeading, svFov);
    iframe.onload = () => { $('svLoading').style.display = 'none'; };
    updateSvCompass();
    $('svHeadingText').textContent = `${svHeading}°`;
    $('svOpenMaps').onclick = () => {
      window.open(`https://www.google.com/maps/@${lat},${lng},3a,75y,${svHeading}h,90t/data=!3m6!1e1!3m4!1s!2e0!7i13312!8i6656`, '_blank');
    };
  }

  // Update Side Panel Inline Embed (if visible)
  if (sidePanelEmbed && !sidePanelEmbed.classList.contains('hidden')) {
    const sideIframe = $('streetViewIframe');
    if (sideIframe) sideIframe.src = buildStreetViewUrl(lat, lng, svHeading, svFov);
    const fullLink = $('btn360Full');
    if (fullLink) fullLink.href = `https://www.google.com/maps/@${lat},${lng},3a,75y,${svHeading}h,90t/data=!3m6!1e1!3m4!1s!2e0!7i13312!8i6656`;
  }
};

function updateSvCompass() {
  const needle = $('svNeedle');
  if (needle) needle.style.transform = `rotate(${svHeading}deg)`;
}

function rotateSvHeading(delta) {
  svHeading = (svHeading + delta + 360) % 360;
  $('svHeadingText').textContent = `${Math.round(svHeading)}°`;
  updateSvCompass();

  // Reload iframe with new heading
  const pano = $('svPanorama');
  const iframe = pano.querySelector('iframe');
  if (iframe) {
    iframe.src = buildStreetViewUrl(svCurrentLat, svCurrentLng, svHeading, svFov);
  }
}

function closeStreetViewModal() {
  const modal = $('streetViewModal');
  if (!modal) return;
  modal.classList.remove('sv-open');
  setTimeout(() => {
    modal.style.display = 'none';
    const iframe = $('svPanorama')?.querySelector('iframe');
    if (iframe) iframe.src = '';
  }, 300);
}

function setupGlobalStreetViewModal() {
  // Wire up the 360° modal controls
  $('svCloseBtn')?.addEventListener('click', closeStreetViewModal);
  $('svRotateLeft')?.addEventListener('click', () => rotateSvHeading(-45));
  $('svRotateRight')?.addEventListener('click', () => rotateSvHeading(45));
  $('svZoomIn')?.addEventListener('click', () => {
    svFov = Math.max(20, svFov - 15);
    rotateSvHeading(0); // reload
  });
  $('svZoomOut')?.addEventListener('click', () => {
    svFov = Math.min(120, svFov + 15);
    rotateSvHeading(0); // reload
  });

  // Close on backdrop click
  $('streetViewModal')?.addEventListener('click', (e) => {
    if (e.target === $('streetViewModal')) closeStreetViewModal();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('streetViewModal')?.style.display === 'flex') {
      closeStreetViewModal();
    }
  });
}

// ============= FETCH REAL DATA =============
async function fetchChargersAtLocation(lat, lng, radiusKm = 30) {
  console.log('[EV App] Fetching data for:', lat, lng);
  // Start with local curated data
  chargersData = globalLocalStations ? JSON.parse(JSON.stringify(globalLocalStations)) : [];

  try {
    if (typeof loadingText !== 'undefined' && loadingText) {
      loadingText.textContent = 'Updating Petrol Bunks & EV Stations...';
    }

    // Attempt parallel fetching
    await Promise.allSettled([
      fetchFromOverpass(lat, lng, radiusKm),
      fetchFromOpenChargeMap(lat, lng, radiusKm)
    ]);

    console.log(`[EV App] Fetch complete. Total stations: ${chargersData.length}`);
    updateDistances();
    chargersData.sort((a, b) => (a._distance || 999) - (b._distance || 999));
    renderMarkers();
    updateStationCount();
  } catch (e) {
    console.error('[EV App] Fetch logic error:', e);
  } finally {
    if (typeof hideLoading === 'function') hideLoading();
  }
}

async function fetchFromOverpass(lat, lng, radiusKm) {
  try {
    // Get current map bounds for absolute accuracy
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

    // For fuel stations, use Bengaluru city bounds to get all petrol bunks
    const bengaluruBbox = '12.8,77.4,13.1,77.8';

    // Fetch both fuel stations and charging stations in the current view
    const q = `[out:json][timeout:25];(
      node["amenity"~"fuel|charging_station"](${bbox});
      way["amenity"~"fuel|charging_station"](${bbox});
      relation["amenity"~"fuel|charging_station"](${bbox});
    );out center;`;;

    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: 'data=' + encodeURIComponent(q)
    });
    const data = await res.json();
    if (data.elements && data.elements.length > 0) {
      const newStations = data.elements.map(normalizeOSM).filter(Boolean);

      // Deduplicate by ID and location (strict 50m threshold)
      newStations.forEach(s => {
        const isDup = chargersData.some(existing => {
          const existingId = String(existing.ID).replace('pb-osm-', '');
          const newId = String(s.ID);
          return existingId === newId ||
            (Math.abs(existing.AddressInfo.Latitude - s.AddressInfo.Latitude) < 0.0002 &&
              Math.abs(existing.AddressInfo.Longitude - s.AddressInfo.Longitude) < 0.0002);
        });
        if (!isDup) chargersData.push(s);
      });
    }
  } catch (e) {
    console.error('Overpass failed:', e);
  }
}

async function fetchFromOpenChargeMap(lat, lng, radiusKm) {
  try {
    const url = `${OCM_API}?output=json&latitude=${lat}&longitude=${lng}&distance=${radiusKm}&distanceunit=KM&maxresults=100&compact=true`;
    const res = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const newStations = data.map(normalizeOCM).filter(Boolean);
      chargersData.push(...newStations);
    }
  } catch (e) {
    console.error('OpenChargeMap failed:', e);
  }
}

function fetchChargersAtMapCenter() {
  const c = map.getCenter();
  fetchChargersAtLocation(c.lat, c.lng, 30);
}

// ============= NORMALIZE =============
function normalizeOCM(raw) {
  const a = raw.AddressInfo || {};
  const s = raw.StatusType || {};
  const op = raw.OperatorInfo || {};
  const conns = (raw.Connections || []).map(c => ({
    Type: c.ConnectionType ? c.ConnectionType.Title : 'Unknown',
    PowerKW: c.PowerKW || null,
    Level: c.Level ? c.Level.Title : '',
    Qty: c.Quantity || 1
  }));
  const media = (raw.MediaItems || []).filter(m => m.ItemURL).map(m => m.ItemURL);

  return {
    ID: raw.ID,
    AddressInfo: {
      Title: a.Title || 'EV Charging Station',
      AddressLine1: a.AddressLine1 || '',
      AddressLine2: a.AddressLine2 || '',
      Town: a.Town || '', State: a.StateOrProvince || '',
      Postcode: a.Postcode || '',
      Country: a.Country ? a.Country.Title : '',
      Latitude: a.Latitude, Longitude: a.Longitude
    },
    Status: { IsOp: s.IsOperational !== false, Title: s.Title || 'Unknown' },
    Operator: { Title: op.Title || '', URL: op.WebsiteURL || '' },
    Connections: conns,
    Usage: raw.UsageType ? raw.UsageType.Title : 'Public',
    Points: raw.NumberOfPoints || 1,
    Media: media,
    _src: 'ocm'
  };
}

function normalizeOSM(node) {
  const t = node.tags || {};
  const lat = node.lat ?? node.center?.lat;
  const lon = node.lon ?? node.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const isFuel = t.amenity === 'fuel';
  const brandStr = t.brand || t.operator || 'Unknown';
  let matchedBrand = 'Unknown';
  if (typeof PETROL_COMPANY_COLORS !== 'undefined') {
    for (const key of Object.keys(PETROL_COMPANY_COLORS)) {
      if (brandStr.toLowerCase().includes(key.toLowerCase())) {
        matchedBrand = key;
        break;
      }
    }
  }

  const conns = [];
  const sockets = {
    'socket:type2': 'Type 2', 'socket:type2_combo': 'CCS',
    'socket:chademo': 'CHAdeMO', 'socket:type1': 'J1772',
    'socket:tesla_supercharger': 'Tesla Supercharger'
  };
  for (const [k, label] of Object.entries(sockets)) {
    if (t[k]) conns.push({
      Type: label, PowerKW: parseFloat(t[k + ':output']) || null,
      Level: label.includes('CCS') || label.includes('CHAdeMO') || label.includes('Tesla') ? 'Level 3' : 'Level 2',
      Qty: parseInt(t[k]) || 1
    });
  }

  if (!conns.length && !isFuel) conns.push({ Type: 'Standard', PowerKW: null, Level: 'Level 2', Qty: 1 });

  return {
    ID: node.id,
    IsPetrolBunk: isFuel,
    Brand: matchedBrand !== 'Unknown' ? matchedBrand : brandStr,
    PetrolCost: 101.94, // Real-time fallback
    DieselCost: 87.89, // Real-time fallback
    PowerPetrolCost: 112.5,
    PetrolDensity: 745.2,
    DieselDensity: 832.1,
    HasEV: conns.length > 0,
    AddressInfo: {
      Title: t.name || t.operator || t.brand || (isFuel ? 'Petrol Bunk' : 'EV Charging Station'),
      AddressLine1: t['addr:street'] ? `${t['addr:housenumber'] || ''} ${t['addr:street']}`.trim() : '',
      AddressLine2: t['addr:place'] || '', Town: t['addr:city'] || '',
      State: t['addr:state'] || '', Postcode: t['addr:postcode'] || '',
      Country: t['addr:country'] || '',
      Latitude: lat, Longitude: lon
    },
    Status: { IsOp: true, Title: 'Operational' },
    Operator: { Title: t.operator || t.brand || '', URL: t.website || '' },
    Connections: conns,
    Usage: t.access || 'Public',
    Points: parseInt(t.capacity) || 1,
    _src: 'osm'
  };
}

function normalizeChargingStation(node) {
  const t = node.tags || {};
  const lat = node.lat ?? node.center?.lat;
  const lon = node.lon ?? node.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const title = t.name || t.brand || t.operator || 'EV Charging Station';
  const addressLine = t['addr:street'] ? `${t['addr:housenumber'] || ''} ${t['addr:street']}`.trim() : t['addr:place'] || title;
  const town = t['addr:city'] || t['addr:town'] || t['addr:village'] || '';
  const state = t['addr:state'] || '';
  const postcode = t['addr:postcode'] || '';

  const socketMap = {
    'socket:type2': 'Type 2',
    'socket:type2_combo': 'CCS',
    'socket:chademo': 'CHAdeMO',
    'socket:type1': 'J1772',
    'socket:tesla_supercharger': 'Tesla Supercharger',
    'socket:tesla': 'Tesla'
  };

  const connections = [];
  Object.entries(socketMap).forEach(([tag, label]) => {
    if (t[tag]) {
      connections.push({
        Type: label,
        PowerKW: parseFloat(t[`${tag}:output`]) || parseFloat(t['output:kW']) || null,
        Level: label.includes('CCS') || label.includes('CHAdeMO') || label.includes('Tesla') ? 'Level 3' : 'Level 2',
        Qty: parseInt(t[tag], 10) || 1
      });
    }
  });

  if (!connections.length) {
    connections.push({
      Type: 'Standard',
      PowerKW: parseFloat(t['output:kW']) || null,
      Level: 'Level 2',
      Qty: parseInt(t.capacity, 10) || 1
    });
  }

  if (connections.length === 0) {
    connections.push({ Type: 'Standard', PowerKW: null, Level: 'Level 2', Qty: 1 });
  }

  const brandStr = t.brand || t.operator || 'Unknown';
  let matchedBrand = 'Unknown';
  if (typeof PETROL_COMPANY_COLORS !== 'undefined') {
    for (const key of Object.keys(PETROL_COMPANY_COLORS)) {
      if (brandStr.toLowerCase().includes(key.toLowerCase())) {
        matchedBrand = key;
        break;
      }
    }
  }

  return {
    ID: node.id,
    AddressInfo: {
      Title: title,
      AddressLine1: addressLine,
      AddressLine2: t['addr:place'] || '',
      Town: town,
      State: state,
      Postcode: postcode,
      Country: t['addr:country'] || '',
      Latitude: lat,
      Longitude: lon
    },
    Status: { IsOp: true, Title: 'Operational' },
    Operator: { Title: brandStr, URL: t.website || '' },
    Connections: connections,
    Usage: t.access || 'Public',
    Points: parseInt(t.capacity, 10) || connections.length,
    _src: 'osm',
    _needsGeocode: !t['addr:street'],

    // Petrol Bunk Specific fields
    IsPetrolBunk: true,
    Brand: matchedBrand !== 'Unknown' ? matchedBrand : brandStr,
    PetrolCost: 102.8, // Fallback
    DieselCost: 88.9, // Fallback
    PowerPetrolCost: 112.5, // Fallback
    PetrolDensity: 740,
    DieselDensity: 820,
    HasEV: connections.length > 1,
    EVCostType: 'per kWh'
  };
}

// ============= GLOBAL ERROR HANDLER =============
window.onerror = function (msg, url, lineNo, columnNo, error) {
  const errorMsg = 'Error: ' + msg + '\nScript: ' + url + '\nLine: ' + lineNo;
  console.error(errorMsg);
  // Only show alert for severe errors that break the app
  if (msg.toLowerCase().indexOf('script error') === -1 && !window.errorShown) {
    // alert(errorMsg); // Temporary for debugging
    window.errorShown = true;
  }
  return false;
};

// ============= CONFIGURATION =============
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// ============= STATE =============
async function searchLocation() {
  const q = searchInput.value.trim();
  if (!q) return;
  showLoading('Searching...');
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
    const results = await res.json();
    if (results.length) {
      map.setView([results[0].lat, results[0].lon], 14);
      sidePanel.classList.remove('open');
      loadingText.textContent = 'Fetching EV chargers...';
      await fetchChargersAtLocation(parseFloat(results[0].lat), parseFloat(results[0].lon), 30);
    } else {
      hideLoading();
    }
  } catch (e) { hideLoading(); }
}

// ============= MARKERS =============
function renderMarkers() {
  markersLayer.clearLayers();
  chargersData.forEach((ch, idx) => {
    const a = ch.AddressInfo;
    const isOp = ch.Status.IsOp;
    const hasFast = ch.Connections.some(c => (c.Level || '').includes('3') || (c.PowerKW && c.PowerKW >= 50));

    let color = isOp ? '#188038' : '#d93025';
    let iconContent = '';

    if (ch.IsPetrolBunk) {
      color = PETROL_COMPANY_COLORS[ch.Brand] || '#d93025';
      const brandInitial = ch.Brand.charAt(0).toUpperCase();
      iconContent = `
        <circle cx="16" cy="16" r="10" fill="white" opacity="1"/>
        <text x="16" y="21" text-anchor="middle" fill="${color}" font-family="Arial" font-size="12" font-weight="900">${brandInitial}</text>
      `;
    } else if (ch.IsHotel) {
      color = '#673ab7'; // Purple for hotels
      iconContent = `
        <circle cx="16" cy="16" r="10" fill="white" opacity="1"/>
        <path d="M7 14c1.66 0 3-1.34 3-3S8.66 8 7 8s-3 1.34-3 3 1.34 3 3 3zm0-4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm12-3h-8v8H4V7H2v15h2v-3h16v3h2V10c0-1.66-1.34-3-3-3zm1 10H4v-1h16v1z" fill="${color}" transform="scale(0.8) translate(4, 4)"/>
      `;
    } else {
      iconContent = `
        <circle cx="16" cy="16" r="10" fill="white" opacity="1"/>
        <path d="M18 10l-6 8h4l-2 8 8-10h-4z" fill="${color}"/>
      `;
    }

    const icon = L.divIcon({
      className: 'custom-leaflet-icon',
      html: `
        <div style="display:flex; flex-direction:column; align-items:center;">
          <div style="position:relative; width:34px; height:44px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
            <svg viewBox="0 0 32 42" width="34" height="44">
              <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26C32 7.16 24.84 0 16 0z" fill="${color}"/>
              ${iconContent}
            </svg>
          </div>
          <div style="background:white; border:2px solid ${color}; color:#202124; font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; margin-top:-2px; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.3);">
            ${a.Title.split('-')[0].split('—')[0].trim()}
          </div>
        </div>`,
      iconSize: [34, 60], iconAnchor: [17, 44], popupAnchor: [0, -44]
    });

    const marker = L.marker([a.Latitude, a.Longitude], { icon }).addTo(markersLayer);

    // Exact location popup as per user request
    if (ch.IsPetrolBunk) {
      marker.bindPopup(`
        <div style="font-family:Roboto,sans-serif; text-align:center;">
          <strong style="font-size:14px;">${a.Title}</strong><br>
          <span style="font-size:11px;color:#5f6368;">Exact location of petrol bunk</span>
          <button onclick="openGlobalStreetView(${a.Latitude}, ${a.Longitude}, '${a.Title.replace(/'/g, "\\'")}')" 
            style="margin-top:10px; width:100%; background:#1a73e8; color:white; border:none; padding:8px; border-radius:16px; cursor:pointer; font-weight:500; font-size:12px; display:flex; align-items:center; justify-content:center; gap:6px;">
            <i class="fas fa-street-view"></i> View 360°
          </button>
        </div>
      `);
    }

    // Popup
    const distText = ch._distance !== undefined ? `${formatDistance(ch._distance)} away` : '';

    let tagsHtml = `
      <span style="background:${isOp ? '#e6f4ea' : '#fce8e6'};color:${isOp ? '#188038' : '#d93025'};
        padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;">
        ${isOp ? '● Available' : '● Offline'}
      </span>
      ${hasFast ? `<span style="background:#e8f0fe;color:#1a73e8;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;margin-left:4px;">⚡ Fast Charging</span>` : `<span style="background:#f1f3f4;color:#5f6368;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;margin-left:4px;">🔌 Level 2</span>`}
    `;

    if (ch.IsPetrolBunk) {
      tagsHtml = `
        <span style="background:#fce4ec;color:${color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;">⛽ ${ch.Brand}</span>
        ${ch.HasEV ? `<span style="background:#e8f0fe;color:#1a73e8;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;margin-left:4px;">⚡ EV</span>` : ''}
      `;
    } else if (ch.IsHotel) {
      tagsHtml = `
        <span style="background:#f3e5f5;color:#673ab7;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;">🏨 Hotel</span>
        <span style="background:#e8f0fe;color:#1a73e8;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;margin-left:4px;">Luxury</span>
      `;
    }

    let petrolPriceHtml = '';
    if (ch.IsPetrolBunk) {
      petrolPriceHtml = `
        <div style="font-size:12px;margin-top:5px;color:#3c4043;font-weight:500;">
          Petrol: ₹${ch.PetrolCost}/L · Diesel: ₹${ch.DieselCost}/L
        </div>
        <div style="font-size:10px;color:#5f6368;margin-top:2px;">
          Density: P ${ch.PetrolDensity} · D ${ch.DieselDensity} kg/m³
        </div>
      `;
    }

    marker.bindPopup(`<div style="font-family:Roboto,sans-serif;min-width:200px;">
      <strong style="font-size:14px;">${a.Title}</strong>
      <div style="font-size:12px;color:#5f6368;margin-top:3px;">${a.AddressLine1 || a.Town || ''}</div>
      ${distText ? `<div style="font-size:12px;color:#1a73e8;margin-top:4px;font-weight:500;"><i class="fas fa-route" style="margin-right:4px;"></i>${distText}</div>` : ''}
      ${petrolPriceHtml}
      <div style="margin-top:6px;">
        ${tagsHtml}
      </div>
    </div>`, { closeButton: false, offset: [0, -10] });

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      openSidePanel(ch);
      map.setView([a.Latitude, a.Longitude]);
      if (window.innerWidth > 600) map.panBy([-200, 0]);
    });

    ch._leafletMarker = marker;
    ch._idx = idx;
    marker.addTo(markersLayer);
  });
  applyFilters();
  renderResults();
}

function renderResults() {
  const container = $('resultsList');
  const active = Array.from(chips).filter(c => c.classList.contains('active') && c.getAttribute('data-filter') !== 'near-me');
  const reqAvail = active.some(c => c.getAttribute('data-filter') === 'status-available');
  const reqFast = active.some(c => c.getAttribute('data-filter') === 'type-fast');
  const reqL2 = active.some(c => c.getAttribute('data-filter') === 'type-level2');

  let html = '';
  let visibleCount = 0;
  chargersData.forEach((ch, idx) => {
    let show = true;
    if (reqAvail && !ch.Status.IsOp) show = false;
    if (reqFast || reqL2) {
      let match = false;
      ch.Connections.forEach(c => {
        const lv = (c.Level || '').toLowerCase();
        const pw = c.PowerKW || 0;
        if (reqFast && (lv.includes('3') || pw >= 50)) match = true;
        if (reqL2 && (lv.includes('2') || (pw >= 3 && pw < 50))) match = true;
      });
      if (!match) show = false;
    }
    if (!show) return;
    visibleCount++;

    const distance = ch._distance !== undefined ? formatDistance(ch._distance) : '--';
    const rating = ch.Rating || 0;
    const reviewCount = ch.ReviewCount || 0;
    const starsHtml = renderStarRating(rating);
    const availStatus = getAvailabilityStatus(ch.Availability || '24/7');
    const traffic = getTrafficCondition(ch);
    const chargerTypeLabel = ch.ChargerType || 'EV Charging Station';
    const addressShort = ch.AddressInfo.AddressLine1 || '';

    // Connector availability rows
    let connectorHtml = '';
    ch.Connections.forEach(conn => {
      const avail = conn.Available !== undefined ? conn.Available : conn.Qty;
      const total = conn.Total || conn.Qty;
      const availColor = avail > 0 ? '#188038' : '#d93025';
      connectorHtml += `
        <div class="rc-connector-row">
          <span class="rc-conn-icon">⚡</span>
          <span class="rc-conn-type">${conn.Type}</span>
          <span class="rc-conn-power">· ${conn.PowerKW || '?'} kW</span>
          <span class="rc-conn-avail" style="color:${availColor};">${avail}/${total}</span>
        </div>`;
    });

    html += `
      <div class="result-card-v2" data-idx="${idx}">
        <div class="rc-header">
          <div class="rc-info">
            <div class="rc-title">${ch.AddressInfo.Title}</div>
            <div class="rc-rating-row">
              <span class="rc-rating-num">${rating.toFixed(1)}</span>
              <span class="rc-stars">${starsHtml}</span>
              <span class="rc-review-count">(${reviewCount})</span>
            </div>
            <div class="rc-type-label">${chargerTypeLabel} · ${addressShort.split(',')[0]}</div>
            <div class="rc-availability" style="color:${availStatus.color};">${availStatus.text}</div>
          </div>
          <div class="rc-actions">
            <button class="rc-action-btn rc-website-btn" title="Website" data-idx="${idx}"><i class="fas fa-globe"></i><span>Website</span></button>
            <button class="rc-action-btn rc-dir-btn" title="Directions" data-idx="${idx}"><i class="fas fa-diamond-turn-right"></i><span>Directions</span></button>
          </div>
        </div>
        <div class="rc-traffic-row">
          <i class="fas ${traffic.icon}" style="color:${traffic.color};"></i>
          <span style="color:${traffic.color}; font-weight:600;">Traffic: ${traffic.level}</span>
          <span class="rc-distance-badge">${distance}</span>
        </div>
        <div class="rc-connectors">
          ${connectorHtml}
        </div>
        ${ch.Renewable ? '<div class="rc-eco-badge"><i class="fas fa-leaf"></i> Renewable Energy</div>' : ''}
      </div>`;
  });

  // Update header subtitle
  const subtitle = document.querySelector('.results-subtitle');
  if (subtitle) subtitle.textContent = `${visibleCount} EV charging station${visibleCount !== 1 ? 's' : ''} within 5 km`;

  container.innerHTML = html || '<div class="result-card-v2"><div class="rc-title">No stations found</div><div class="rc-type-label">Try moving the map or increasing range.</div></div>';

  // Attach click events
  container.querySelectorAll('.result-card-v2').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger on button clicks
      if (e.target.closest('.rc-action-btn')) return;
      const idx = parseInt(card.dataset.idx, 10);
      const charger = chargersData[idx];
      if (charger) openSidePanel(charger);
      const lat = charger.AddressInfo.Latitude;
      const lng = charger.AddressInfo.Longitude;
      map.setView([lat, lng], 16);
      card.parentElement.querySelectorAll('.result-card-v2').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });
    card.addEventListener('mouseover', () => {
      const idx = parseInt(card.dataset.idx, 10);
      const charger = chargersData[idx];
      if (charger && charger._leafletMarker) {
        charger._leafletMarker.openPopup();
      }
    });
    card.addEventListener('mouseout', () => {
      const idx = parseInt(card.dataset.idx, 10);
      const charger = chargersData[idx];
      if (charger && charger._leafletMarker) {
        charger._leafletMarker.closePopup();
      }
    });
  });

  // Directions buttons
  container.querySelectorAll('.rc-dir-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const charger = chargersData[idx];
      if (charger) enterDirectionsMode(charger);
    });
  });

  // Website buttons (open side panel)
  container.querySelectorAll('.rc-website-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const charger = chargersData[idx];
      if (charger) openSidePanel(charger);
    });
  });
}

function applyFilters() {
  const active = Array.from(chips).filter(c => c.classList.contains('active') && c.getAttribute('data-filter') !== 'near-me');
  const reqAvail = active.some(c => c.getAttribute('data-filter') === 'status-available');
  const reqFast = active.some(c => c.getAttribute('data-filter') === 'type-fast');
  const reqL2 = active.some(c => c.getAttribute('data-filter') === 'type-level2');

  markersLayer.clearLayers();
  let count = 0;
  chargersData.forEach(ch => {
    let show = true;
    if (reqAvail && !ch.Status.IsOp) show = false;
    if (reqFast || reqL2) {
      let match = false;
      ch.Connections.forEach(c => {
        const lv = (c.Level || '').toLowerCase();
        const pw = c.PowerKW || 0;
        if (reqFast && (lv.includes('3') || pw >= 50)) match = true;
        if (reqL2 && (lv.includes('2') || (pw >= 3 && pw < 50))) match = true;
      });
      if (!match) show = false;
    }
    if (show && ch._leafletMarker) {
      ch._leafletMarker.addTo(markersLayer);
      count++;
    }
  });
  $('stationCountNum').textContent = count;
  updateNearestStationInfo();
}

function updateNearestStationInfo() {
  const visibleChargers = chargersData.filter(ch => ch._leafletMarker && markersLayer.hasLayer(ch._leafletMarker));
  const nearest = visibleChargers.reduce((best, ch) => {
    if (!best || (ch._distance !== undefined && ch._distance < best._distance)) return ch;
    return best;
  }, null);

  if (!nearest) {
    $('nearestStationInfo').textContent = 'No EV station found nearby.';
    return;
  }

  $('nearestStationInfo').textContent = `${nearest.AddressInfo.Title} · ${formatDistance(nearest._distance)} away`;
}

// ============= SIDE PANEL =============
function openSidePanel(charger) {
  selectedCharger = charger;
  const a = charger.AddressInfo;
  const op = charger.Operator;

  $('spName').textContent = a.Title;

  // Ratings & Reviews (Premium UI matching image reference)
  const titleContainer = $('spName').parentNode;
  titleContainer.querySelectorAll('.rating-row').forEach(r => r.remove());

  if (charger.Rating) {
    const ratingRow = document.createElement('div');
    ratingRow.className = 'rating-row';
    ratingRow.style.cssText = "display:flex; align-items:center; gap:4px; margin-bottom:8px; font-family:Roboto,sans-serif;";

    const stars = Math.floor(charger.Rating);
    const hasHalf = (charger.Rating % 1) >= 0.5;
    let starsHtml = '';
    for (let i = 0; i < 5; i++) {
      if (i < stars) starsHtml += '<i class="fas fa-star" style="color:#fbbc04; font-size:12px;"></i>';
      else if (i === stars && hasHalf) starsHtml += '<i class="fas fa-star-half-alt" style="color:#fbbc04; font-size:12px;"></i>';
      else starsHtml += '<i class="far fa-star" style="color:#dadce0; font-size:12px;"></i>';
    }

    ratingRow.innerHTML = `
      <span style="font-size:13px; font-weight:500; color:#3c4043;">${charger.Rating}</span>
      <div style="display:flex; align-items:center; margin: 0 2px;">${starsHtml}</div>
      <span style="font-size:13px; color:#70757a;">(${charger.Reviews?.toLocaleString() || '0'})</span>
    `;
    titleContainer.insertBefore(ratingRow, $('spOperator'));
  }

  $('spOperator').textContent = op.Title || '';
  $('spOperator').style.display = op.Title ? 'block' : 'none';

  const companyLabel = op.Title || (charger.AddressInfo.Country ? charger.AddressInfo.Country : 'EV Operator');
  $('spCompany').textContent = companyLabel;
  $('spCompany').style.display = companyLabel ? 'block' : 'none';

  const badge = $('spStatusBadge');
  badge.className = 'status-badge ' + (charger.Status.IsOp ? 'available' : 'offline');
  badge.textContent = charger.Status.IsOp ? '● Operational' : '● Offline';

  if (charger.IsPetrolBunk) {
    // Add a secondary 360 badge
    const svBadge = document.createElement('span');
    svBadge.className = 'status-badge';
    svBadge.style.cssText = "background: #e8f0fe; color: #1a73e8; border: 1px solid #d2e3fc; margin-left: 6px; font-weight: 600;";
    svBadge.innerHTML = '<i class="fas fa-street-view"></i> 360° Live View';
    badge.parentNode.appendChild(svBadge);
  }

  const hasFast = charger.Connections.some(c => (c.Level || '').includes('3') || (c.PowerKW && c.PowerKW >= 50));
  $('spTypeTxt').textContent = charger.IsHotel ? 'Luxury Hotel' : (charger.IsPetrolBunk ? (charger.HasEV ? 'Petrol + EV Combo' : 'Petrol Bunk') : (hasFast ? 'DC Fast Charging' : 'EV Charging Station'));

  // Petrol-specific details
  const fuelDetails = $('spFuelDetails');
  if (charger.IsPetrolBunk) {
    fuelDetails.innerHTML = `
      <div class="fuel-price-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:12px; background:#f8f9fa; border-radius:12px; border:1px solid #e8eaed;">
        <div class="fuel-item">
          <div style="font-size:10px; color:#5f6368; text-transform:uppercase; font-weight:700;">Petrol</div>
          <div style="font-size:18px; font-weight:700; color:#202124;">₹${charger.PetrolCost}<span style="font-size:12px; font-weight:400;">/L</span></div>
          <div style="font-size:9px; color:#5f6368;">Density: ${charger.PetrolDensity}</div>
        </div>
        <div class="fuel-item">
          <div style="font-size:10px; color:#5f6368; text-transform:uppercase; font-weight:700;">Diesel</div>
          <div style="font-size:18px; font-weight:700; color:#202124;">₹${charger.DieselCost}<span style="font-size:12px; font-weight:400;">/L</span></div>
          <div style="font-size:9px; color:#5f6368;">Density: ${charger.DieselDensity}</div>
        </div>
        <div class="fuel-item" style="grid-column: span 2; padding-top:8px; border-top:1px solid #e8eaed; margin-top:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
             <div style="font-size:11px; color:#202124; font-weight:500;">Premium: ₹${charger.PowerPetrolCost}/L</div>
             ${charger.HasEV ? `<div style="font-size:11px; color:#1a73e8; font-weight:500;"><i class="fas fa-bolt"></i> EV: ₹${charger.CostPerKwh} ${charger.EVCostType}</div>` : ''}
          </div>
        </div>
      </div>
    `;
    fuelDetails.style.display = 'block';
  } else {
    fuelDetails.style.display = 'none';
  }

  // Distance card
  if (charger._distance !== undefined) {
    const distKm = charger._distance;
    const estMins = Math.round(distKm * 2);
    $('spDistValue').textContent = formatDistance(distKm);
    $('spDistLabel').textContent = 'away from you';
    $('spDistTime').textContent = `~${formatDuration(estMins)}`;
    $('distanceCard').style.display = 'flex';
  } else {
    $('distanceCard').style.display = 'none';
  }

  // Address
  $('spAddress').textContent = a.AddressLine1 || a.Title;
  $('spAddressLine2').textContent = a.AddressLine2 || '';
  $('spCityState').textContent = [a.Town, a.State].filter(Boolean).join(', ');
  $('spPostcode').textContent = a.Postcode || '';

  if (!a.AddressLine1) reverseGeocode(a.Latitude, a.Longitude);

  $('spCoords').textContent = `${a.Latitude.toFixed(5)}, ${a.Longitude.toFixed(5)}`;
  $('spAccessInfo').textContent = charger.Usage || '';
  $('spHours').textContent = 'Open 24 hours';

  // Connectors
  const connEl = $('spConnectors');
  connEl.innerHTML = charger.Connections.map(c => `
    <div class="connector-item">
      <i class="fas fa-plug"></i>
      <span><strong>${c.Type}</strong></span>
      ${c.PowerKW ? `<span class="connector-power">${c.PowerKW} kW</span>` : ''}
      ${c.Qty > 1 ? `<span class="connector-power">×${c.Qty}</span>` : ''}
    </div>`).join('');

  // Website
  if (op.URL) {
    $('spWebsite').href = op.URL;
    $('spWebsite').textContent = op.URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
    $('spWebsiteRow').style.display = 'flex';
  } else {
    $('spWebsiteRow').style.display = 'none';
  }

  // Setup 360 view toggle & load iframe URL
  const svIframe = $('streetViewIframe');
  const svContainer = $('streetViewContainer');
  if (svIframe) {
    svIframe.src = '';
    // Show loading state for iframe
    svContainer.style.background = '#f1f3f4 url("https://i.stack.imgur.com/ATB3o.gif") no-repeat center';
    svContainer.style.backgroundSize = '30px 30px';

    setTimeout(() => {
      const lat = a.Latitude;
      const lng = a.Longitude;

      // Use custom heading from data or default to 180
      const heading = (charger.StreetViewHeading !== undefined) ? charger.StreetViewHeading : 180;

      svIframe.src = buildStreetViewUrl(lat, lng, heading, 90);

      svIframe.onload = () => {
        svContainer.style.background = 'white';
      };

      const fullBtn = $('btn360Full');
      if (fullBtn) {
        fullBtn.href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}${heading !== undefined ? `&heading=${heading}` : ''}`;
      }
    }, 400);
  }

  // FORCE 360 view for petrol bunks - VERY IMPORTANT
  if (charger.IsPetrolBunk || !charger.Media || charger.Media.length === 0) {
    svContainer.classList.remove('hidden');
    $('galleryContainer').style.display = 'none';
  } else {
    svContainer.classList.add('hidden');
    $('galleryContainer').style.display = 'block';
    setupGallery(charger);
  }

  // Wire up 360 View toggle buttons
  const btn360 = $('btn360');
  const btn360Close = $('btn360Close');
  if (btn360) {
    btn360.onclick = () => {
      $('galleryContainer').style.display = 'none';
      $('streetViewContainer').classList.remove('hidden');
    };
  }
  if (btn360Close) {
    // Only show "Photos" return button if there are actual photos
    btn360Close.style.display = (charger.Media && charger.Media.length > 0) ? 'block' : 'none';
    btn360Close.onclick = () => {
      $('streetViewContainer').classList.add('hidden');
      $('galleryContainer').style.display = 'block';
    };
  }

  // Petrol Bunk Download Data Button
  const downloadBtn = $('downloadDataBtn');
  if (downloadBtn) {
    if (charger.IsPetrolBunk) {
      downloadBtn.style.display = '';
      downloadBtn.onclick = () => downloadPetrolDataSheet(charger);

      // Update type text & show detailed specs
      const hasEvText = charger.HasEV ? ' + ⚡ EV Charging' : '';
      $('spTypeTxt').textContent = `⛽ ${charger.Brand} Petrol Bunk${hasEvText}`;

      // Insert Fuel Details Section before connectors
      const fuelHtml = `
        <div class="info-section">
          <div class="info-label"><i class="fas fa-gas-pump"></i> Fuel Details & Pricing</div>
          <div style="background:#f8f9fa; padding:12px; border-radius:12px; margin-top:8px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span><strong>Regular Petrol</strong></span>
              <span>₹${charger.PetrolCost}/L (D: ${charger.PetrolDensity})</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span><strong>Power Petrol</strong></span>
              <span>₹${charger.PowerPetrolCost || (charger.PetrolCost + 10).toFixed(1)}/L</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span><strong>Diesel</strong></span>
              <span>₹${charger.DieselCost}/L (D: ${charger.DieselDensity})</span>
            </div>
            ${charger.HasEV ? `
            <div style="border-top:1px solid #e0e0e0; margin:10px 0; padding-top:10px;">
              <div style="font-size:12px; font-weight:700; color:#1a73e8; margin-bottom:6px;">⚡ EV ESTIMATED COST</div>
              <div style="display:flex; justify-content:space-between; font-size:13px;">
                <span>30 Minutes (~25 kWh)</span>
                <span>₹${(25 * (charger.EVCostPerUnit || 15)).toFixed(0)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:4px;">
                <span>1 Hour (~50 kWh)</span>
                <span>₹${(50 * (charger.EVCostPerUnit || 15)).toFixed(0)}</span>
              </div>
            </div>
            ` : ''}
          </div>
        </div>
      `;
      // We'll inject this into a placeholder or before connectors
      const fuelSection = $('spFuelDetails');
      if (fuelSection) {
        fuelSection.innerHTML = fuelHtml;
        fuelSection.style.display = 'block';
      }

      // Force 360° street view for petrol bunks
      $('streetViewContainer').classList.remove('hidden');
      $('galleryContainer').style.display = 'none';
    } else {
      downloadBtn.style.display = 'none';
      if ($('spFuelDetails')) $('spFuelDetails').style.display = 'none';
    }
  }

  sidePanel.classList.add('open');
}

// ============= DOWNLOAD PETROL BUNK DATA SHEET =============
function downloadPetrolDataSheet(station) {
  const brand = station.Brand || 'Unknown';
  const name = station.AddressInfo.Title || 'Petrol Bunk';
  const addr = station.AddressInfo.AddressLine1 || 'Bengaluru';
  const lat = station.AddressInfo.Latitude;
  const lng = station.AddressInfo.Longitude;
  const petrolCost = station.PetrolCost || 'N/A';
  const dieselCost = station.DieselCost || 'N/A';
  const powerPetrolCost = station.PowerPetrolCost || 'N/A';
  const xpDieselCost = station.XpPremiumDieselCost || 'N/A';
  const petrolDensity = station.PetrolDensity || 'N/A';
  const dieselDensity = station.DieselDensity || 'N/A';
  const evCost = station.CostPerKwh || 'N/A';
  const evCostType = station.EVCostType || 'per kWh';
  const hasEV = station.HasEV || false;
  const rating = station.Rating ? station.Rating.toFixed(1) : 'N/A';
  const reviews = station.ReviewCount || 0;

  // Build CSV content
  const csvRows = [
    ['╔══════════════════════════════════════════╗'],
    ['║     FUEL STATION DATA SHEET              ║'],
    ['╚══════════════════════════════════════════╝'],
    [''],
    ['STATION DETAILS'],
    ['Station Name', name],
    ['Brand / Company', brand],
    ['Address', `"${addr}"`],
    ['GPS Coordinates', `${lat} / ${lng}`],
    ['Rating', `${rating} / 5 (${reviews} reviews)`],
    ['Availability', station.Availability || '24/7'],
    ['Parking Spots', station.ParkingSpots || 'N/A'],
    [''],
    ['═══════════════════════════════════════════'],
    ['FUEL PRICES (INR per Litre)'],
    ['═══════════════════════════════════════════'],
    ['Fuel Type', 'Price (₹/L)', 'Grade', 'Density (kg/m³)'],
    ['Petrol (Regular)', `₹${petrolCost}`, 'BS-VI', `${petrolDensity} kg/m³`],
    ['Power / Premium Petrol', `₹${powerPetrolCost}`, 'BS-VI Premium', `${petrolDensity} kg/m³`],
    ['Diesel (Regular)', `₹${dieselCost}`, 'BS-VI', `${dieselDensity} kg/m³`],
    ['XP Premium Diesel', `₹${xpDieselCost}`, 'BS-VI Premium', `${dieselDensity} kg/m³`],
    [''],
    ['═══════════════════════════════════════════'],
    ['FUEL DENSITY SPECIFICATIONS'],
    ['═══════════════════════════════════════════'],
    ['Fuel', 'Density', 'Standard', 'Temp Reference'],
    ['Petrol', `${petrolDensity} kg/m³`, 'IS 2796', '15°C'],
    ['Diesel', `${dieselDensity} kg/m³`, 'IS 1460', '15°C'],
    ['Petrol Range (min-max)', '720 - 775 kg/m³', 'BIS Standard', '15°C'],
    ['Diesel Range (min-max)', '820 - 860 kg/m³', 'BIS Standard', '15°C'],
    [''],
  ];

  if (hasEV) {
    csvRows.push(['═══════════════════════════════════════════']);
    csvRows.push(['EV CHARGING COSTS']);
    csvRows.push(['═══════════════════════════════════════════']);
    csvRows.push(['Charging Type', 'Cost (₹)', 'Billing Method', 'Power']);
    csvRows.push(['EV Fast Charging (DC)', `₹${evCost}`, evCostType, '50 kW']);
    csvRows.push(['']);
  } else {
    csvRows.push(['EV Charging', 'Not Available at this location']);
    csvRows.push(['']);
  }

  csvRows.push(['═══════════════════════════════════════════']);
  csvRows.push(['AVAILABLE SERVICES']);
  csvRows.push(['═══════════════════════════════════════════']);
  csvRows.push(['Service', 'Type', 'Qty', 'Available']);

  if (station.Connections) {
    station.Connections.forEach(conn => {
      csvRows.push([
        conn.Type,
        conn.Level || 'Standard',
        conn.Qty || 1,
        conn.Available !== undefined ? conn.Available : conn.Qty
      ]);
    });
  }

  csvRows.push(['']);
  csvRows.push(['═══════════════════════════════════════════']);
  csvRows.push(['ADDITIONAL INFO']);
  csvRows.push(['═══════════════════════════════════════════']);
  csvRows.push(['Installation Year', station.InstallYear || 'N/A']);
  csvRows.push(['Maintenance Schedule', station.Maintenance || 'Regular']);
  csvRows.push(['Average Daily Users', station.UsageStats || 'N/A']);
  csvRows.push(['']);
  csvRows.push(['Generated on', `"${new Date().toLocaleString('en-IN')}"`]);
  csvRows.push(['Source', 'EV Locator App - Bengaluru']);
  csvRows.push(['Disclaimer', '"Prices are indicative and subject to daily revision by oil companies"']);

  const csvContent = csvRows.map(row => row.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${brand}_${name.replace(/\s+/g, '_')}_DataSheet.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
    const data = await res.json();
    if (data.address) {
      const ad = data.address;
      const street = [ad.house_number, ad.road].filter(Boolean).join(' ');

      // Treat building/amenity explicitly if available
      const bldg = ad.building || ad.amenity || ad.shop || '';

      if (bldg) {
        $('spAddress').textContent = bldg;
        $('spAddressLine2').textContent = street || (ad.neighbourhood || '');
      } else {
        $('spAddress').textContent = street || data.display_name.split(',')[0];
        $('spAddressLine2').textContent = ad.neighbourhood || '';
      }

      $('spCityState').textContent = [ad.city || ad.town || ad.village || ad.suburb, ad.state].filter(Boolean).join(', ');
      $('spPostcode').textContent = ad.postcode || '';
    }
  } catch (e) { }
}

// ============= DIRECTIONS MODE (ALL MODES) =============
function enterDirectionsMode(charger) {
  if (!userLocation) {
    console.warn("Location not available. Using default Bengaluru center.");
    userLocation = [12.9716, 77.5946]; // Default to Bengaluru center
    alert('Location access not detected. Using a default starting location for directions.');
  }
  selectedCharger = charger;
  setMode('directions');
  activeMode = 'driving';
  allModeRoutes = {};
  pendingAutoStart = false;

  // Set summary header and sidebar labels
  const destTitle = charger ? charger.AddressInfo.Title : '';
  if ($('dispOrigin')) $('dispOrigin').textContent = 'Your location';
  if ($('dispDest')) $('dispDest').textContent = destTitle || 'Choose destination...';
  if ($('sbDestName')) $('sbDestName').textContent = destTitle || 'Destination';

  // Input fields
  if ($('dirDestInput')) {
    $('dirDestInput').value = destTitle;
    if (!charger) $('dirDestInput').focus();
  }

  // Update sidebar image if available
  const sbImg = $('sbDestImg');
  if (sbImg) {
    const defaultSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23f1f3f4'/><path d='M55 15 L25 55 L45 55 L35 85 L75 40 L55 40 Z' fill='%231a73e8'/></svg>";
    if (charger && charger.Media && charger.Media.length > 0) {
      sbImg.src = charger.Media[0];
    } else {
      sbImg.src = defaultSvg;
    }
    // Backup error handler if the fetched media URL is broken
    sbImg.onerror = function () {
      this.onerror = null; // prevent infinite loop
      this.src = defaultSvg;
    };
  }

  // Reset UI
  $('dirSteps').innerHTML = charger ? '<div style="padding:20px;text-align:center;color:#5f6368;"><div class="spinner" style="width:24px;height:24px;margin:0 auto 8px;border-width:3px;"></div>Calculating all routes...</div>' : '<div style="padding:20px;text-align:center;color:#5f6368;">Enter a destination to calculate routes.</div>';
  $('routeETA').textContent = '--';
  $('routeDistTime').textContent = charger ? 'Calculating...' : '--';
  $('routeVia').textContent = '';
  ['Driving', 'Walking', 'Cycling', 'Transit'].forEach(m => {
    if ($(`tab${m}Time`)) $(`tab${m}Time`).textContent = '...';
    if ($(`mode${m}Time`)) $(`mode${m}Time`).textContent = charger ? 'Calculating...' : '--';
    if ($(`mode${m}Dist`)) $(`mode${m}Dist`).textContent = '--';
  });

  // Reset tabs
  document.querySelectorAll('.travel-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === 'driving'));
  document.querySelectorAll('.mode-card').forEach(c => c.classList.toggle('mode-active', c.dataset.mode === 'driving'));

  if (!charger) return; // Stop here if no destination is set yet

  // Fetch ALL 3 modes simultaneously via OSRM REST API
  const a = charger.AddressInfo;
  const origin = `${userLocation[1]},${userLocation[0]}`;
  const dest = `${a.Longitude},${a.Latitude}`;

  const modes = [
    { key: 'driving', profile: 'car', label: 'Driving', tabId: 'Driving', icon: 'car' },
    { key: 'walking', profile: 'foot', label: 'Walking', tabId: 'Walking', icon: 'walking' },
    { key: 'cycling', profile: 'bike', label: 'Cycling', tabId: 'Cycling', icon: 'bicycle' },
    { key: 'transit', profile: 'car', label: 'Transit', tabId: 'Transit', icon: 'bus', isTransit: true }
  ];

  let completedCount = 0;

  modes.forEach(m => {
    const url = `https://routing.openstreetmap.de/routed-${m.profile}/route/v1/${m.profile}/${origin};${dest}?overview=full&geometries=geojson&steps=true`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const distKm = (route.distance / 1000).toFixed(1);
          // Use precise estimate in minutes, rounding up for professional accuracy
          let timeMins = Math.ceil(route.duration / 60);
          if (m.isTransit) timeMins = Math.ceil(timeMins * 1.4 + 5);

          let routeName = route.legs[0]?.summary || 'route';
          if (m.isTransit) routeName = 'Public Bus Route';

          // Parse steps
          const steps = [];
          if (route.legs && route.legs[0] && route.legs[0].steps) {
            route.legs[0].steps.forEach((s, i) => {
              steps.push({
                text: s.name ? `${getManeuverText(s.maneuver)} onto ${s.name}` : getManeuverText(s.maneuver),
                distance: s.distance,
                duration: s.duration,
                type: s.maneuver ? s.maneuver.type : '',
                modifier: s.maneuver ? s.maneuver.modifier : '',
                location: s.maneuver ? s.maneuver.location : null
              });
            });
          }

          // Parse geometry for polyline
          const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

          // ETA
          const now = new Date();
          now.setMinutes(now.getMinutes() + timeMins);
          const etaStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          allModeRoutes[m.key] = {
            distKm, timeMins, routeName, etaStr, steps, coords,
            label: m.label
          };

          // Update tab badge
          $(`tab${m.tabId}Time`).textContent = formatDuration(timeMins);

          // Update comparison card
          $(`mode${m.tabId}Time`).textContent = formatDuration(timeMins);
          $(`mode${m.tabId}Dist`).textContent = `${distKm} km`;
          $(`mode${m.tabId}Via`).textContent = `via ${routeName}`;
        } else {
          $(`tab${m.tabId}Time`).textContent = 'N/A';
          $(`mode${m.tabId}Time`).textContent = 'Not available';
          $(`mode${m.tabId}Dist`).textContent = '--';
        }

        completedCount++;
        // When first mode (driving) completes, show it
        if (m.key === activeMode) {
          displayActiveRoute();
        }
        // When all are done
        if (completedCount === 4 && pendingAutoStart) {
          pendingAutoStart = false;
          startNavigation();
        }
      })
      .catch(err => {
        console.error(`Route error (${m.key}):`, err);
        $(`tab${m.tabId}Time`).textContent = 'Error';
        $(`mode${m.tabId}Time`).textContent = 'Failed';
        completedCount++;
      });
  });
}

function switchActiveMode(mode) {
  activeMode = mode;
  // Update card highlights
  document.querySelectorAll('.mode-card').forEach(c => c.classList.toggle('mode-active', c.dataset.mode === mode));
  // Redraw route
  displayActiveRoute();
}

function displayActiveRoute() {
  const r = allModeRoutes[activeMode];
  if (!r) {
    $('routeETA').textContent = '--';
    $('routeDistTime').textContent = 'Route not available';
    $('routeVia').textContent = '';
    $('dirSteps').innerHTML = '<div style="padding:20px;text-align:center;color:#d93025;">Route not available for this travel mode.</div>';
    return;
  }

  // Update Summary Header
  const a = selectedCharger.AddressInfo;
  $('routeETA').textContent = formatDuration(r.timeMins);
  $('routeDistTime').textContent = `(${r.distKm} km)`;
  $('routeVia').textContent = `via ${r.routeName}`;

  // Update Sidebar Info
  const sbName = $('sbDestName');
  const sbTime = $('sbDestTime');
  const sbImg = $('sbDestImg');
  if (sbName) sbName.textContent = a.Title;
  if (sbTime) sbTime.textContent = `${r.timeMins} min`;
  if (sbImg && r.Media && r.Media.length > 0) sbImg.src = r.Media[0];

  // Store for navigation
  routeSteps = r.steps;
  routeSteps._totalDist = r.distKm;
  routeSteps._totalTime = r.timeMins;
  routeSteps._eta = r.etaStr;
  routeSteps._coordinates = r.coords.map(c => ({ lat: c[0], lng: c[1] }));

  // Draw on map
  const color = activeMode === 'walking' ? '#4285F4' : (activeMode === 'cycling' ? '#34A853' : '#1a73e8');
  routingControl = L.polyline(r.coords, {
    color: color, weight: 6, opacity: 0.85,
    lineCap: 'round', lineJoin: 'round'
  }).addTo(map);

  // Add destination marker
  const destIcon = L.divIcon({
    className: 'dest-marker',
    html: `<div style="width:22px;height:22px;background:#d93025;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;"><i class="fas fa-flag"></i></div>`,
    iconSize: [22, 22], iconAnchor: [11, 11]
  });
  L.marker([a.Latitude, a.Longitude], { icon: destIcon }).addTo(map);

  // Fit map bounds
  map.fitBounds(L.latLngBounds(r.coords), {
    padding: [60, 60],
    paddingTopLeft: [430, 60]
  });

  // Build turn-by-turn steps
  const stepsEl = $('dirSteps');

  // Simulated Landmarks based on city locations for professional look
  const landmarks = [
    "Pass by Yamaha Motor Showroom",
    "Pass by Nalli Silk Sarees",
    "Pass by Ecospace Business Park",
    "Pass by Central Mall",
    "Pass by HP Petrol Pump",
    "Pass by HSR Layout Police Station",
    "Pass by Marathahalli Bridge"
  ];

  if (r.steps.length > 0) {
    stepsEl.innerHTML = r.steps.map((step, i) => {
      const dist = step.distance > 1000
        ? `${(step.distance / 1000).toFixed(1)} km`
        : `${Math.round(step.distance)} m`;
      const iconClass = getManeuverIcon(step.type, step.modifier);

      const landmarkText = (i > 0 && i % 3 === 0) ? landmarks[i % landmarks.length] : "";

      return `
      <div class="dir-step" data-step="${i}">
        <div class="dir-step-line">
          <div class="dir-step-icon"><i class="fas ${iconClass}"></i></div>
          ${i < r.steps.length - 1 ? '<div class="dir-step-path"></div>' : ''}
        </div>
        <div class="dir-step-content">
          <div class="dir-step-text">${step.text || 'Continue'}</div>
          ${landmarkText ? `
            <div class="dir-step-landmark">
              <i class="fas fa-info-circle"></i>
              <span>${landmarkText} (on the right in ${Math.round(step.distance / 2)} m)</span>
            </div>` : ''}
          <div class="dir-step-meta">
            <span>${step.distance > 0 ? dist : ''}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    // Click step to zoom
    stepsEl.querySelectorAll('.dir-step').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.step);
        const step = r.steps[idx];
        if (step && step.location) {
          map.setView([step.location[1], step.location[0]], 17);
        }
      });
    });
  } else {
    stepsEl.innerHTML = `
      <div class="dir-step">
        <div class="dir-step-line"><div class="dir-step-icon"><i class="fas fa-play"></i></div><div class="dir-step-path"></div></div>
        <div class="dir-step-content"><div class="dir-step-text">Head towards ${a.Title}</div></div>
      </div>
      <div class="dir-step">
        <div class="dir-step-line"><div class="dir-step-icon"><i class="fas fa-flag-checkered"></i></div></div>
        <div class="dir-step-content"><div class="dir-step-text">Arrive at ${a.Title}</div></div>
      </div>`;
  }
}

function exitDirectionsMode() {
  clearRoute();
  allModeRoutes = {};
  pendingAutoStart = false;
  setMode('normal');
}

function clearRoute() {
  if (routingControl) {
    map.removeLayer(routingControl);
    routingControl = null;
  }
  // Also remove any destination markers
  map.eachLayer(layer => {
    if (layer instanceof L.Marker && layer.options.icon && layer.options.icon.options.className === 'dest-marker') {
      map.removeLayer(layer);
    }
  });
}

function getManeuverText(maneuver) {
  if (!maneuver) return 'Continue';
  const type = maneuver.type || '';
  const mod = maneuver.modifier || '';

  if (type === 'depart') return 'Head out';
  if (type === 'arrive') return 'Arrive at destination';
  if (type === 'turn') return `Turn ${mod}`;
  if (type === 'new name') return 'Continue';
  if (type === 'merge') return `Merge ${mod}`;
  if (type === 'fork') return `Keep ${mod}`;
  if (type === 'roundabout') return `At roundabout, take exit`;
  if (type === 'rotary') return `At rotary, take exit`;
  if (type === 'end of road') return `Turn ${mod}`;
  return mod ? `Go ${mod}` : 'Continue';
}

function getManeuverIcon(type, modifier) {
  if (!type) return 'fa-arrow-up';
  const t = type.toLowerCase();
  const m = (modifier || '').toLowerCase();

  if (t === 'arrive' || t.includes('destination')) return 'fa-flag-checkered';
  if (t === 'depart') return 'fa-play';
  if (t === 'roundabout' || t === 'rotary') return 'fa-sync-alt';
  if (t === 'merge') return 'fa-compress-arrows-alt';
  if (t === 'fork') return 'fa-code-branch';

  if (m.includes('sharp') && m.includes('left')) return 'fa-arrow-left';
  if (m.includes('sharp') && m.includes('right')) return 'fa-arrow-right';
  if (m.includes('slight') && m.includes('left')) return 'fa-arrow-left';
  if (m.includes('slight') && m.includes('right')) return 'fa-arrow-right';
  if (m.includes('left')) return 'fa-arrow-left';
  if (m.includes('right')) return 'fa-arrow-right';
  if (m.includes('uturn')) return 'fa-undo';
  if (m.includes('straight')) return 'fa-arrow-up';

  return 'fa-arrow-up';
}

// ============= IN-APP NAVIGATION MODE =============
function startNavigation() {
  if (!userLocation || !selectedCharger) return;

  const r = allModeRoutes[activeMode];
  if (!r) {
    alert('Please wait for route calculation to complete.');
    return;
  }

  setMode('navigation');
  const a = selectedCharger.AddressInfo;

  // Set initial display
  $('navRemDist').textContent = `${r.distKm} km`;
  $('navRemTime').textContent = formatDuration(r.timeMins);
  $('navETA').textContent = r.etaStr;

  // Populate mode buttons with times
  ['driving', 'walking', 'cycling', 'transit'].forEach(mode => {
    const modeRoute = allModeRoutes[mode];
    const timeEl = $(`navModeTime-${mode}`);
    if (timeEl && modeRoute) {
      timeEl.textContent = formatDuration(modeRoute.timeMins);
    }
  });

  // Setup mode switching during navigation
  document.querySelectorAll('.nav-mode-btn').forEach(btn => {
    btn.onclick = () => switchNavMode(btn.dataset.mode);
  });

  // Show route on map
  clearRoute();
  const modeColors = { driving: '#4285f4', walking: '#7B1FA2', cycling: '#00897B', transit: '#FF6D00' };
  routingControl = L.polyline(r.coords, {
    color: modeColors[activeMode] || '#4285f4',
    weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round'
  }).addTo(map);

  // Show first instruction
  routeSteps = r.steps;
  routeSteps._totalDist = r.distKm;
  routeSteps._totalTime = r.timeMins;
  routeSteps._eta = r.etaStr;
  routeSteps._coordinates = r.coords.map(c => ({ lat: c[0], lng: c[1] }));

  currentStepIndex = 0;
  if (routeSteps.length > 0) {
    updateNavStep(0);
  } else {
    $('navStreet').textContent = `Head to ${a.Title}`;
    $('navDistNext').textContent = `${r.distKm} km`;
    $('navIcon').innerHTML = '<i class="fas fa-arrow-up"></i>';
  }

  // Center on user and place car marker
  map.setView(userLocation, 17);
  placeCarMarker(userLocation[0], userLocation[1]);

  // ---------- HISTORY LOGGING ------------
  try {
    if (typeof currentUser !== 'undefined' && currentUser) {
      if (!currentUser.recentVisits) currentUser.recentVisits = [];
      const visit = {
        stationName: selectedCharger.AddressInfo.Title || 'EV Charging Station',
        location: [selectedCharger.AddressInfo.Town, selectedCharger.AddressInfo.State].filter(Boolean).join(', ') || 'Unknown Location',
        timestamp: new Date().toISOString()
      };

      // Avoid duplicate consecutive entries
      if (currentUser.recentVisits.length === 0 || currentUser.recentVisits[0].stationName !== visit.stationName) {
        currentUser.recentVisits.unshift(visit);

        const usersStr = localStorage.getItem('evcharger_users_db');
        const users = usersStr ? JSON.parse(usersStr) : [];
        const idx = users.findIndex(u => u.email === currentUser.email);
        if (idx !== -1) {
          users[idx].recentVisits = currentUser.recentVisits;
          localStorage.setItem('evcharger_users_db', JSON.stringify(users));
        }
        if (typeof saveAuthState !== 'undefined') saveAuthState(currentUser, authToken);
      }
    }
  } catch (err) { console.error('Failed to save history', err); }
  // ---------------------------------------

  // Live GPS tracking
  if (navigator.geolocation) {
    navWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const heading = pos.coords.heading || 0;
        userLocation = [lat, lng];
        placeUserMarker();
        map.setView(userLocation, 17, { animate: true });
        updateNavigationProgress(lat, lng);
        placeCarMarker(lat, lng, heading);
      },
      () => { },
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
  }
}

function updateNavStep(idx) {
  if (idx >= routeSteps.length) {
    $('navStreet').textContent = '🎉 You have arrived!';
    $('navDistNext').textContent = '';
    $('navIcon').innerHTML = '<i class="fas fa-flag-checkered"></i>';
    $('navNextHint').textContent = '';
    announceText('You have arrived at your destination.');
    return;
  }

  const step = routeSteps[idx];
  const iconClass = getManeuverIcon(step.type, step.modifier);
  $('navIcon').innerHTML = `<i class="fas ${iconClass}"></i>`;
  $('navStreet').textContent = step.text || 'Continue driving';

  const dist = step.distance > 1000
    ? `${(step.distance / 1000).toFixed(1)} km`
    : `${Math.round(step.distance)} m`;
  $('navDistNext').textContent = dist;

  // Show next next turn hint
  const nextStep = routeSteps[idx + 1];
  if (nextStep) {
    $('navNextHint').textContent = `Then ${nextStep.text || 'continue'}`;
  } else {
    $('navNextHint').textContent = 'Approaching destination';
  }

  // Voice announcement
  if (idx === 0) {
    announceText(`Starting navigation. ${step.text || 'Continue driving'} for ${dist}.`);
  } else {
    let announceStr = `${step.text || 'Continue driving'} for ${dist}.`;
    if (nextStep && step.distance < 500) {
      announceStr += ` Then, ${nextStep.text || 'continue'}.`;
    }
    announceText(announceStr);
  }
}

function updateNavigationProgress(lat, lng) {
  if (!routeSteps._coordinates || routeSteps.length === 0) return;

  const a = selectedCharger.AddressInfo;
  const distToDest = haversineDistance(lat, lng, a.Latitude, a.Longitude);

  // Update remaining 
  $('navRemDist').textContent = formatDistance(distToDest);
  const speedFactors = { driving: 2, walking: 12, cycling: 5 };
  const estMins = Math.round(distToDest * (speedFactors[activeMode] || 2));
  $('navRemTime').textContent = formatDuration(estMins);

  // Update ETA
  const now = new Date();
  now.setMinutes(now.getMinutes() + estMins);
  $('navETA').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Check if near next step
  if (currentStepIndex < routeSteps.length) {
    const step = routeSteps[currentStepIndex];
    if (step.location) {
      const distToStep = haversineDistance(lat, lng, step.location[1], step.location[0]);
      if (distToStep < 0.03) {
        currentStepIndex++;
        updateNavStep(currentStepIndex);
      }
    }
  }

  // Arrived
  if (distToDest < 0.05) {
    $('navStreet').textContent = '🎉 You have arrived at your destination!';
    $('navDistNext').textContent = '';
    $('navIcon').innerHTML = '<i class="fas fa-flag-checkered"></i>';
    if (navWatchId !== null) {
      navigator.geolocation.clearWatch(navWatchId);
      navWatchId = null;
    }
  }
}

function switchNavMode(newMode) {
  if (newMode === activeMode || !allModeRoutes[newMode]) return;

  const modeRoute = allModeRoutes[newMode];
  activeMode = newMode;

  // Update button states
  document.querySelectorAll('.nav-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === newMode);
  });

  // Update navigation display
  $('navRemDist').textContent = `${modeRoute.distKm} km`;
  $('navRemTime').textContent = formatDuration(modeRoute.timeMins);
  $('navETA').textContent = modeRoute.etaStr;

  // Update route on map
  clearRoute();
  const modeColors = { driving: '#4285f4', walking: '#7B1FA2', cycling: '#00897B', transit: '#FF6D00' };
  routingControl = L.polyline(modeRoute.coords, {
    color: modeColors[newMode] || '#4285f4',
    weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round'
  }).addTo(map);

  // Update route steps
  routeSteps = modeRoute.steps;
  routeSteps._totalDist = modeRoute.distKm;
  routeSteps._totalTime = modeRoute.timeMins;
  routeSteps._eta = modeRoute.etaStr;
  routeSteps._coordinates = modeRoute.coords.map(c => ({ lat: c[0], lng: c[1] }));

  // Reset to first step
  currentStepIndex = 0;
  if (routeSteps.length > 0) {
    updateNavStep(0);
  } else {
    $('navStreet').textContent = `Head to destination`;
    $('navDistNext').textContent = `${modeRoute.distKm} km`;
    $('navIcon').innerHTML = '<i class="fas fa-arrow-up"></i>';
  }
}

function exitNavigation() {
  if (navWatchId !== null) {
    navigator.geolocation.clearWatch(navWatchId);
    navWatchId = null;
  }
  clearRoute();
  allModeRoutes = {};
  if (carMarker) {
    map.removeLayer(carMarker);
    carMarker = null;
  }
  setMode('normal');
  if (userLocation) map.setView(userLocation, 14);
}

// ============= GALLERY =============
function setupGallery(charger) {
  galleryIndex = 0;
  const slides = $('gallerySlides');
  const dots = $('galleryDots');
  const idx = charger._idx || 0;

  let imgs = [];
  // Use real photos if available from the API (limit to 5)
  if (charger.Media && charger.Media.length > 0) {
    imgs = charger.Media.slice(0, 5);
  } else {
    // Fallback to placeholders
    for (let i = 0; i < 3; i++) imgs.push(stationImages[(idx + i) % stationImages.length]);
  }

  charger._images = imgs;

  slides.innerHTML = imgs.map((src, i) =>
    `<div class="gallery-slide"><img src="${src}" alt="Station photo ${i + 1}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1593941707882-a5bba14938cb?auto=format&fit=crop&w=600&q=80'"></div>`
  ).join('');

  dots.innerHTML = imgs.map((_, i) =>
    `<div class="gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`
  ).join('');

  dots.querySelectorAll('.gallery-dot').forEach(d => {
    d.addEventListener('click', () => {
      galleryIndex = parseInt(d.dataset.index);
      updateGalleryPos(charger);
    });
  });
  updateGalleryPos(charger);
}

function slideGallery(dir) {
  if (!selectedCharger?._images) return;
  galleryIndex = (galleryIndex + dir + selectedCharger._images.length) % selectedCharger._images.length;
  updateGalleryPos(selectedCharger);
}

function updateGalleryPos(ch) {
  $('gallerySlides').style.transform = `translateX(-${galleryIndex * 100}%)`;
  $('galleryCount').textContent = `${galleryIndex + 1} / ${ch._images.length}`;
  $('galleryDots').querySelectorAll('.gallery-dot').forEach((d, i) =>
    d.classList.toggle('active', i === galleryIndex)
  );
}

// ============= UTILITIES =============
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateDistances() {
  if (!userLocation) return;
  chargersData.forEach(c => {
    const a = c.AddressInfo;
    c._distance = haversineDistance(userLocation[0], userLocation[1], a.Latitude, a.Longitude);
  });
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function formatDuration(mins) {
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

function updateStationCount() {
  $('stationCountNum').textContent = chargersData.length;
}

function showLoading(msg) {
  loadingText.textContent = msg || 'Loading...';
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

function debounce(fn, delay) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}

// ============= USER LOCATION =============
function setupUserLocation() {
  const locBtn = $('currentLocationBtn');
  if (locBtn) {
    locBtn.addEventListener('click', () => detectUserLocation(true));
  }
  // Initial detection
  setTimeout(() => detectUserLocation(false), 2000);
}

window.userLocationMarker = null;
window.userLocationCircle = null;

async function detectUserLocation(moveMap = false) {
  if (!navigator.geolocation) {
    console.warn('Geolocation not supported');
    return;
  }

  if (moveMap) showLoading('Locating you...');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const latlng = [latitude, longitude];

      if (window.userLocationMarker) {
        window.userLocationMarker.setLatLng(latlng);
        window.userLocationCircle.setLatLng(latlng).setRadius(accuracy);
      } else {
        const pulseIcon = L.divIcon({
          className: 'user-location-marker',
          html: '<div class="pulse-ring"></div><div class="dot"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        window.userLocationMarker = L.marker(latlng, { icon: pulseIcon, zIndexOffset: 1000 }).addTo(map);
        window.userLocationCircle = L.circle(latlng, {
          radius: accuracy,
          color: '#1a73e8',
          fillColor: '#1a73e8',
          fillOpacity: 0.1,
          weight: 1
        }).addTo(map);
      }

      if (moveMap) {
        map.flyTo(latlng, 15, { animate: true, duration: 1.5 });
        fetchChargersAtLocation(latitude, longitude, 10);
      }
      if (moveMap) hideLoading();
    },
    (err) => {
      console.error('Location error:', err);
      if (moveMap) {
        hideLoading();
        alert('Could not determine your location. Please check permissions.');
      }
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}