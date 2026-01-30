const loginBox = document.getElementById('loginBox');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const appointmentsList = document.getElementById('appointmentsList');

// Show message helper
function showMessage(element, message, type = 'error') {
  element.textContent = message;
  element.className = type;
  element.style.display = 'block';
  setTimeout(() => {
    element.style.display = 'none';
  }, 5000);
}

// Login form handler
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMessage(loginMessage, 'Logging in...', 'success');
  const data = Object.fromEntries(new FormData(loginForm));
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (res.ok) {
      loginBox.style.display = 'none';
      adminPanel.style.display = '';
      loadAppointments();
      loadCurrentLocation();
      loadVehicles();
      loadTrainers();
      updateStatistics();
    } else {
      showMessage(loginMessage, json.error || 'Login failed', 'error');
    }
  } catch (error) {
    showMessage(loginMessage, 'Network error. Please try again.', 'error');
  }
});

// Refresh and logout buttons
document.getElementById('refreshBtn').addEventListener('click', () => {
  loadAppointments();
  loadVehicles();
  loadTrainers();
  loadCurrentLocation();
  updateStatistics();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
    loginBox.style.display = '';
    adminPanel.style.display = 'none';
    appointmentsList.innerHTML = '';
    loginForm.reset();
  } catch (error) {
    console.error('Logout error:', error);
  }
});

// Tab switching functionality
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    
    // Remove active class from all tabs and contents
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Add active class to clicked tab and corresponding content
    btn.classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });
});

// Filter appointments by status
const filterStatus = document.getElementById('filterStatus');
if (filterStatus) {
  filterStatus.addEventListener('change', () => {
    loadAppointments();
  });
}

// Load appointments
async function loadAppointments() {
  appointmentsList.innerHTML = 'Loading...';
  try {
    const [appointmentsRes, vehiclesRes, trainersRes] = await Promise.all([
      fetch('/api/appointments'),
      fetch('/api/vehicles/all'),
      fetch('/api/trainers/all')
    ]);
    
    if (!appointmentsRes.ok) {
      appointmentsList.innerHTML = '<div class="small" style="color: var(--text-medium);">Unable to load — maybe not logged in</div>';
      return;
    }
    
    const list = await appointmentsRes.json();
    const vehicles = await vehiclesRes.json();
    const trainers = await trainersRes.json();
    
    // Create lookup maps
    const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
    const trainerMap = new Map(trainers.map(t => [t.id, t]));
    
    // Add vehicle and trainer names to appointments
    list.forEach(apt => {
      if (apt.vehicleId && vehicleMap.has(apt.vehicleId)) {
        apt.vehicleName = vehicleMap.get(apt.vehicleId).name;
      }
      if (apt.trainerId && trainerMap.has(apt.trainerId)) {
        apt.trainerName = trainerMap.get(apt.trainerId).name;
      }
    });
    
    // Filter by status if filter is set
    const statusFilter = filterStatus ? filterStatus.value : 'all';
    let filteredList = list;
    if (statusFilter !== 'all') {
      filteredList = list.filter(apt => apt.status === statusFilter);
    }
    
    // Update statistics
    updateStatisticsWithData(list, vehicles, trainers);
    
    if (!filteredList.length) {
      appointmentsList.innerHTML = '<div class="small" style="color: var(--text-medium);">No appointments found.</div>';
      return;
    }
    appointmentsList.innerHTML = '';
    filteredList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach(a => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div style='flex:1'>
          <strong style="color: var(--color-primary);">${a.name}</strong> 
          <div style="margin-top: 4px; color: var(--text-medium);">
            Phone: ${a.phone || 'N/A'} | Email: ${a.email}
          </div>
          <div class='small' style="margin-top: 8px;">
            ${a.date} at ${a.time} • Status: <span style="font-weight: 600; color: ${a.status === 'confirmed' ? 'var(--color-secondary)' : a.status === 'cancelled' ? '#d32f2f' : 'var(--color-primary)'}">${a.status}</span>
          </div>
          ${a.vehicleId || a.trainerId ? `<div class='small' style="margin-top: 4px; color: var(--text-medium);">
            ${a.vehicleId ? `🚗 Vehicle: ${a.vehicleName || a.vehicleId}` : ''} ${a.vehicleId && a.trainerId ? '•' : ''} ${a.trainerId ? `👨‍🏫 Trainer: ${a.trainerName || a.trainerId}` : ''}
          </div>` : ''}
          ${a.note ? `<div class='small' style="margin-top: 4px; font-style: italic;">Note: ${a.note}</div>` : ''}
        </div>
        <div class='actions'>
          <button data-id='${a.id}' data-action='confirm'>Confirm</button>
          <button data-id='${a.id}' data-action='cancel'>Cancel</button>
          <button data-id='${a.id}' data-action='delete'>Delete</button>
        </div>
      `;
      appointmentsList.appendChild(row);
    });
    
    // Add event listeners to action buttons
    appointmentsList.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        const action = e.target.dataset.action;
        
        if (action === 'delete') {
          if (!confirm('Are you sure you want to delete this appointment?')) return;
          try {
            await fetch('/api/appointments/' + id, { method: 'DELETE' });
            loadAppointments();
            loadVehicles();
            loadTrainers();
            updateStatistics();
          } catch (error) {
            alert('Error deleting appointment');
          }
          return;
        }
        
        const status = action === 'confirm' ? 'confirmed' : 'cancelled';
        try {
          const res = await fetch('/api/appointments/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
          });
          const json = await res.json();
          if (!res.ok && json.error) {
            alert(json.error);
          } else {
            loadAppointments();
            loadVehicles();
            loadTrainers();
            updateStatistics();
          }
        } catch (error) {
          alert('Error updating appointment');
        }
      });
    });
  } catch (error) {
    appointmentsList.innerHTML = '<div class="small" style="color: var(--text-medium);">Error loading appointments</div>';
  }
}

// Location Management
const locationForm = document.getElementById('locationForm');
const locationMessage = document.getElementById('locationMessage');
const currentLocationInfo = document.getElementById('currentLocationInfo');

// Update map preview in admin panel
function updateAdminMapPreview(lat, lng, zoom) {
  const adminMapPreview = document.getElementById('adminMapPreview');
  if (adminMapPreview && lat && lng) {
    const bboxSize = 0.01 * (20 - (zoom || 15)) / 5;
    const bbox = `${lng - bboxSize},${lat - bboxSize},${lng + bboxSize},${lat + bboxSize}`;
    
    adminMapPreview.innerHTML = `
      <iframe 
        width="100%" 
        height="100%" 
        frameborder="0" 
        scrolling="no" 
        marginheight="0" 
        marginwidth="0" 
        src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}"
        style="border: none; border-radius: 12px;"
        loading="lazy"
        title="Location Preview">
      </iframe>
    `;
  }
}

// Load current location when admin panel is shown
function loadCurrentLocation() {
  fetch('/api/location')
    .then(res => res.json())
    .then(data => {
      currentLocationInfo.innerHTML = `
        <p><strong>Address:</strong> ${data.address || 'Not set'}</p>
        <p><strong>Phone:</strong> ${data.phone || 'Not set'}</p>
        <p><strong>Hours:</strong> ${data.hours || 'Not set'}</p>
        <p><strong>Coordinates:</strong> ${data.latitude || 'N/A'}, ${data.longitude || 'N/A'}</p>
        <p><strong>Zoom:</strong> ${data.zoom || 15}</p>
      `;
      
      // Pre-fill form
      if (locationForm) {
        locationForm.address.value = data.address || '';
        locationForm.phone.value = data.phone || '';
        locationForm.hours.value = data.hours || '';
        locationForm.latitude.value = data.latitude || '';
        locationForm.longitude.value = data.longitude || '';
        locationForm.zoom.value = data.zoom || 15;
        
        // Update map preview
        if (data.latitude && data.longitude) {
          updateAdminMapPreview(
            parseFloat(data.latitude),
            parseFloat(data.longitude),
            parseInt(data.zoom) || 15
          );
        }
      }
    })
    .catch(error => {
      currentLocationInfo.innerHTML = '<p style="color: #d32f2f;">Error loading location data</p>';
    });
}

// Update location form handler
if (locationForm) {
  // Update map preview when coordinates change
  const latitudeInput = document.getElementById('latitudeInput');
  const longitudeInput = document.getElementById('longitudeInput');
  const zoomInput = document.getElementById('zoomInput');
  
  function updatePreviewFromInputs() {
    const lat = parseFloat(latitudeInput?.value);
    const lng = parseFloat(longitudeInput?.value);
    const zoom = parseInt(zoomInput?.value) || 15;
    
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      updateAdminMapPreview(lat, lng, zoom);
    }
  }
  
  if (latitudeInput && longitudeInput) {
    latitudeInput.addEventListener('input', updatePreviewFromInputs);
    longitudeInput.addEventListener('input', updatePreviewFromInputs);
    if (zoomInput) {
      zoomInput.addEventListener('input', updatePreviewFromInputs);
    }
  }
  
  locationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(locationForm));
    
    // Validate coordinates
    const lat = parseFloat(data.latitude);
    const lng = parseFloat(data.longitude);
    
    if (isNaN(lat) || lat < -90 || lat > 90) {
      showMessage(locationMessage, 'Invalid latitude. Must be between -90 and 90.', 'error');
      return;
    }
    
    if (isNaN(lng) || lng < -180 || lng > 180) {
      showMessage(locationMessage, 'Invalid longitude. Must be between -180 and 180.', 'error');
      return;
    }
    
    showMessage(locationMessage, 'Updating location...', 'success');
    
    try {
      const res = await fetch('/api/location', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: data.address,
          phone: data.phone,
          hours: data.hours,
          latitude: lat,
          longitude: lng,
          zoom: parseInt(data.zoom) || 15
        })
      });
      
      const json = await res.json();
      if (res.ok) {
        showMessage(locationMessage, 'Location updated successfully! The map on the public site will be updated.', 'success');
        loadCurrentLocation();
        setTimeout(() => {
          locationMessage.style.display = 'none';
        }, 5000);
      } else {
        showMessage(locationMessage, json.error || 'Failed to update location', 'error');
      }
    } catch (error) {
      showMessage(locationMessage, 'Network error. Please try again.', 'error');
    }
  });
}

// Vehicle Management
async function loadVehicles() {
  const vehiclesList = document.getElementById('vehiclesList');
  if (!vehiclesList) return;
  
  try {
    const res = await fetch('/api/vehicles/all');
    if (!res.ok) {
      vehiclesList.innerHTML = '<div class="small" style="color: var(--text-medium);">Unable to load vehicles</div>';
      return;
    }
    const vehicles = await res.json();
    
    if (!vehicles.length) {
      vehiclesList.innerHTML = '<div class="small" style="color: var(--text-medium);">No vehicles added yet.</div>';
      return;
    }
    
    vehiclesList.innerHTML = '';
    vehicles.forEach(v => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.marginBottom = '12px';
      row.innerHTML = `
        <div style='flex:1'>
          <strong style="color: var(--color-primary);">${v.name}</strong>
          <div style="margin-top: 4px; color: var(--text-medium);">
            Number: ${v.number} • Type: ${v.type} • Status: <span style="color: ${v.status === 'active' ? 'var(--color-secondary)' : '#d32f2f'}">${v.status}</span>
          </div>
        </div>
        <div class='actions'>
          <button data-id='${v.id}' data-action='toggle-vehicle' style='padding: 8px 16px; font-size: 14px; margin: 0;'>
            ${v.status === 'active' ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      `;
      vehiclesList.appendChild(row);
    });
    
    vehiclesList.querySelectorAll('button[data-action="toggle-vehicle"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        const vehicle = vehicles.find(v => v.id === id);
        const newStatus = vehicle.status === 'active' ? 'inactive' : 'active';
        
        try {
          await fetch('/api/vehicles/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          });
          loadVehicles();
          updateStatistics();
        } catch (error) {
          alert('Error updating vehicle');
        }
      });
    });
  } catch (error) {
    vehiclesList.innerHTML = '<div class="small" style="color: var(--text-medium);">Error loading vehicles</div>';
  }
}

// Trainer Management
async function loadTrainers() {
  const trainersList = document.getElementById('trainersList');
  if (!trainersList) return;
  
  try {
    const res = await fetch('/api/trainers/all');
    if (!res.ok) {
      trainersList.innerHTML = '<div class="small" style="color: var(--text-medium);">Unable to load trainers</div>';
      return;
    }
    const trainers = await res.json();
    
    if (!trainers.length) {
      trainersList.innerHTML = '<div class="small" style="color: var(--text-medium);">No trainers added yet.</div>';
      return;
    }
    
    trainersList.innerHTML = '';
    trainers.forEach(t => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.marginBottom = '12px';
      row.innerHTML = `
        <div style='flex:1'>
          <strong style="color: var(--color-primary);">${t.name}</strong>
          <div style="margin-top: 4px; color: var(--text-medium);">
            Phone: ${t.phone} • Experience: ${t.experience || 'N/A'} • Status: <span style="color: ${t.status === 'active' ? 'var(--color-secondary)' : '#d32f2f'}">${t.status}</span>
          </div>
        </div>
        <div class='actions'>
          <button data-id='${t.id}' data-action='toggle-trainer' style='padding: 8px 16px; font-size: 14px; margin: 0;'>
            ${t.status === 'active' ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      `;
      trainersList.appendChild(row);
    });
    
    trainersList.querySelectorAll('button[data-action="toggle-trainer"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        const trainer = trainers.find(t => t.id === id);
        const newStatus = trainer.status === 'active' ? 'inactive' : 'active';
        
        try {
          await fetch('/api/trainers/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          });
          loadTrainers();
          updateStatistics();
        } catch (error) {
          alert('Error updating trainer');
        }
      });
    });
  } catch (error) {
    trainersList.innerHTML = '<div class="small" style="color: var(--text-medium);">Error loading trainers</div>';
  }
}

// Vehicle form handler
const vehicleForm = document.getElementById('vehicleForm');
if (vehicleForm) {
  vehicleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(vehicleForm));
    const vehicleMessage = document.getElementById('vehicleMessage');
    
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      
      if (res.ok) {
        showMessage(vehicleMessage, 'Vehicle added successfully!', 'success');
        vehicleForm.reset();
        loadVehicles();
        updateStatistics();
      } else {
        showMessage(vehicleMessage, json.error || 'Failed to add vehicle', 'error');
      }
    } catch (error) {
      showMessage(vehicleMessage, 'Network error. Please try again.', 'error');
    }
  });
}

// Trainer form handler
const trainerForm = document.getElementById('trainerForm');
if (trainerForm) {
  trainerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(trainerForm));
    const trainerMessage = document.getElementById('trainerMessage');
    
    try {
      const res = await fetch('/api/trainers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      
      if (res.ok) {
        showMessage(trainerMessage, 'Trainer added successfully!', 'success');
        trainerForm.reset();
        loadTrainers();
        updateStatistics();
      } else {
        showMessage(trainerMessage, json.error || 'Failed to add trainer', 'error');
      }
    } catch (error) {
      showMessage(trainerMessage, 'Network error. Please try again.', 'error');
    }
  });
}

// Update Dashboard Statistics
async function updateStatistics() {
  try {
    const [appointmentsRes, vehiclesRes, trainersRes] = await Promise.all([
      fetch('/api/appointments'),
      fetch('/api/vehicles/all'),
      fetch('/api/trainers/all')
    ]);
    
    if (!appointmentsRes.ok) return;
    
    const appointments = await appointmentsRes.json();
    const vehicles = await vehiclesRes.json();
    const trainers = await trainersRes.json();
    
    updateStatisticsWithData(appointments, vehicles, trainers);
  } catch (error) {
    console.error('Error updating statistics:', error);
  }
}

function updateStatisticsWithData(appointments, vehicles, trainers) {
  // Total appointments
  document.getElementById('statTotalAppointments').textContent = appointments.length;
  
  // Confirmed appointments
  const confirmed = appointments.filter(a => a.status === 'confirmed').length;
  document.getElementById('statConfirmed').textContent = confirmed;
  
  // Pending appointments
  const pending = appointments.filter(a => a.status === 'pending').length;
  document.getElementById('statPending').textContent = pending;
  
  // Active vehicles
  const activeVehicles = vehicles.filter(v => v.status === 'active').length;
  document.getElementById('statVehicles').textContent = activeVehicles;
  
  // Active trainers
  const activeTrainers = trainers.filter(t => t.status === 'active').length;
  document.getElementById('statTrainers').textContent = activeTrainers;
  
  // Today's appointments
  const today = new Date().toISOString().split('T')[0];
  const todayAppointments = appointments.filter(a => a.date === today).length;
  document.getElementById('statTodayAppointments').textContent = todayAppointments;
  
  // Store data globally for modal access
  window.dashboardData = { appointments, vehicles, trainers };
}

// Stat Details Modal Functionality
const statModal = document.getElementById('statDetailsModal');
const statModalTitle = document.getElementById('statModalTitle');
const statModalBody = document.getElementById('statModalBody');
const statModalClose = document.querySelector('.stat-modal-close');// Close modal handlers
if (statModalClose) {
  statModalClose.addEventListener('click', () => {
    statModal.classList.remove('active');
  });
}

if (statModal) {
  statModal.addEventListener('click', (e) => {
    if (e.target === statModal) {
      statModal.classList.remove('active');
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && statModal.classList.contains('active')) {
      statModal.classList.remove('active');
    }
  });
}

// Handle stat card clicks
document.addEventListener('click', async (e) => {
  const infoBtn = e.target.closest('.stat-info-btn');
  const statCard = e.target.closest('.clickable-stat');
  
  if (infoBtn || statCard) {
    e.stopPropagation();
    const card = infoBtn ? infoBtn.closest('.clickable-stat') : statCard;
    if (!card) return;
    
    const statType = card.dataset.stat;
    await showStatDetails(statType);
  }
});

async function showStatDetails(statType) {
  if (!window.dashboardData) {
    // Load data if not available
    try {
      const [appointmentsRes, vehiclesRes, trainersRes] = await Promise.all([
        fetch('/api/appointments'),
        fetch('/api/vehicles/all'),
        fetch('/api/trainers/all')
      ]);
      
      if (appointmentsRes.ok) {
        window.dashboardData = {
          appointments: await appointmentsRes.json(),
          vehicles: await vehiclesRes.json(),
          trainers: await trainersRes.json()
        };
      }
    } catch (error) {
      console.error('Error loading data:', error);
      statModalBody.innerHTML = '<p style="color: var(--text-medium);">Error loading details. Please try again.</p>';
      statModal.classList.add('active');
      return;
    }
  }
  
  const { appointments, vehicles, trainers } = window.dashboardData;
  let title = '';
  let content = '';
  
  switch(statType) {
    case 'total':
      title = '📅 All Appointments';
      const sortedAppointments = appointments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      content = sortedAppointments.slice(0, 10).map(apt => {
        const date = new Date(apt.date).toLocaleDateString();
        return `
          <div class="stat-detail-item">
            <strong>${apt.name}</strong>
            <p>📧 ${apt.email} | 📞 ${apt.phone || 'N/A'}</p>
            <p>📅 ${date} at ${apt.time}</p>
            <p>Status: <span style="color: ${apt.status === 'confirmed' ? 'var(--color-secondary)' : apt.status === 'cancelled' ? '#d32f2f' : 'var(--color-primary)'}">${apt.status}</span></p>
            ${apt.note ? `<p>Note: ${apt.note}</p>` : ''}
          </div>
        `;
      }).join('');
      if (appointments.length > 10) {
        content += `<p style="text-align: center; color: var(--text-medium); margin-top: 16px;">Showing 10 of ${appointments.length} appointments</p>`;
      }
      break;
      
    case 'confirmed':
      title = '✅ Confirmed Appointments';
      const confirmed = appointments.filter(a => a.status === 'confirmed');
      content = confirmed.slice(0, 10).map(apt => {
        const date = new Date(apt.date).toLocaleDateString();
        return `
          <div class="stat-detail-item">
            <strong>${apt.name}</strong>
            <p>📧 ${apt.email} | 📞 ${apt.phone || 'N/A'}</p>
            <p>📅 ${date} at ${apt.time}</p>
          </div>
        `;
      }).join('');
      if (confirmed.length > 10) {
        content += `<p style="text-align: center; color: var(--text-medium); margin-top: 16px;">Showing 10 of ${confirmed.length} confirmed appointments</p>`;
      }
      break;
      
    case 'pending':
      title = '⏳ Pending Appointments';
      const pending = appointments.filter(a => a.status === 'pending');
      content = pending.slice(0, 10).map(apt => {
        const date = new Date(apt.date).toLocaleDateString();
        return `
          <div class="stat-detail-item">
            <strong>${apt.name}</strong>
            <p>📧 ${apt.email} | 📞 ${apt.phone || 'N/A'}</p>
            <p>📅 ${date} at ${apt.time}</p>
            ${apt.note ? `<p>Note: ${apt.note}</p>` : ''}
          </div>
        `;
      }).join('');
      if (pending.length > 10) {
        content += `<p style="text-align: center; color: var(--text-medium); margin-top: 16px;">Showing 10 of ${pending.length} pending appointments</p>`;
      }
      break;
      
    case 'vehicles':
      title = '🚗 Active Vehicles';
      const activeVehicles = vehicles.filter(v => v.status === 'active');
      content = activeVehicles.map(v => `
        <div class="stat-detail-item">
          <strong>${v.name}</strong>
          <p>🚗 Number: ${v.number}</p>
          <p>Type: ${v.type}</p>
          <p>Status: <span style="color: var(--color-secondary);">${v.status}</span></p>
        </div>
      `).join('');
      if (activeVehicles.length === 0) {
        content = '<p style="color: var(--text-medium); text-align: center;">No active vehicles</p>';
      }
      break;
      
    case 'trainers':
      title = '👨‍🏫 Active Trainers';
      const activeTrainers = trainers.filter(t => t.status === 'active');
      content = activeTrainers.map(t => `
        <div class="stat-detail-item">
          <strong>${t.name}</strong>
          <p>📞 Phone: ${t.phone}</p>
          <p>Experience: ${t.experience || 'N/A'}</p>
          <p>Status: <span style="color: var(--color-secondary);">${t.status}</span></p>
        </div>
      `).join('');
      if (activeTrainers.length === 0) {
        content = '<p style="color: var(--text-medium); text-align: center;">No active trainers</p>';
      }
      break;
      
    case 'today':
      title = '📊 Today\'s Appointments';
      const today = new Date().toISOString().split('T')[0];
      const todayAppts = appointments.filter(a => a.date === today);
      content = todayAppts.map(apt => {
        return `
          <div class="stat-detail-item">
            <strong>${apt.name}</strong>
            <p>📧 ${apt.email} | 📞 ${apt.phone || 'N/A'}</p>
            <p>⏰ ${apt.time}</p>
            <p>Status: <span style="color: ${apt.status === 'confirmed' ? 'var(--color-secondary)' : apt.status === 'cancelled' ? '#d32f2f' : 'var(--color-primary)'}">${apt.status}</span></p>
            ${apt.note ? `<p>Note: ${apt.note}</p>` : ''}
          </div>
        `;
      }).join('');
      if (todayAppts.length === 0) {
        content = '<p style="color: var(--text-medium); text-align: center;">No appointments scheduled for today</p>';
      }
      break;
      
    default:
      title = 'Details';
      content = '<p style="color: var(--text-medium);">No details available</p>';
  }
  
  statModalTitle.textContent = title;
  statModalBody.innerHTML = content || '<p style="color: var(--text-medium); text-align: center;">No data available</p>';
  statModal.classList.add('active');
}
