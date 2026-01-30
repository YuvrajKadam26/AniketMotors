// Load vehicles and trainers
async function loadVehiclesAndTrainers() {
  try {
    const [vehiclesRes, trainersRes] = await Promise.all([
      fetch('/api/vehicles'),
      fetch('/api/trainers')
    ]);
    
    const vehicles = await vehiclesRes.json();
    const trainers = await trainersRes.json();
    
    const vehicleSelect = document.getElementById('vehicleSelect');
    const trainerSelect = document.getElementById('trainerSelect');
    
    vehicleSelect.innerHTML = '<option value="">Select a vehicle</option>';
    vehicles.forEach(v => {
      const option = document.createElement('option');
      option.value = v.id;
      option.textContent = `${v.name} (${v.number})`;
      vehicleSelect.appendChild(option);
    });
    
    trainerSelect.innerHTML = '<option value="">Select a trainer</option>';
    trainers.forEach(t => {
      const option = document.createElement('option');
      option.value = t.id;
      option.textContent = `${t.name} (${t.experience})`;
      trainerSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading vehicles/trainers:', error);
  }
}

// Check availability when date/time changes
let availabilityCheckTimeout;
async function checkAvailability() {
  const date = document.getElementById('appointmentDate').value;
  const time = document.getElementById('appointmentTime').value;
  const vehicleId = document.getElementById('vehicleSelect').value;
  const trainerId = document.getElementById('trainerSelect').value;
  const statusDiv = document.getElementById('availabilityStatus');
  
  if (!date || !time) {
    statusDiv.style.display = 'none';
    return;
  }
  
  clearTimeout(availabilityCheckTimeout);
  availabilityCheckTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/availability?date=${date}&time=${time}`);
      const data = await res.json();
      
      statusDiv.style.display = 'block';
      
      if (vehicleId && trainerId) {
        const vehicleBooked = data.bookedVehicles.includes(vehicleId);
        const trainerBooked = data.bookedTrainers.includes(trainerId);
        
        if (vehicleBooked || trainerBooked) {
          statusDiv.innerHTML = '<strong style="color: #d32f2f;">⚠️ Slot is Full!</strong><br>This vehicle or trainer is already booked for the selected time. Please choose a different time, vehicle, or trainer.';
          statusDiv.style.background = 'rgba(211, 47, 47, 0.1)';
          statusDiv.style.border = '2px solid #d32f2f';
          statusDiv.style.color = '#d32f2f';
        } else {
          statusDiv.innerHTML = '<strong style="color: var(--color-secondary);">✓ Available</strong><br>This slot is available for booking.';
          statusDiv.style.background = 'rgba(156, 163, 175, 0.1)';
          statusDiv.style.border = '2px solid var(--color-secondary)';
          statusDiv.style.color = 'var(--color-secondary)';
        }
      } else {
        const availableCount = data.availableVehicles.length;
        const trainerCount = data.availableTrainers.length;
        statusDiv.innerHTML = `<strong>Availability:</strong> ${availableCount} vehicle(s) and ${trainerCount} trainer(s) available for this time slot.`;
        statusDiv.style.background = 'rgba(156, 163, 175, 0.1)';
        statusDiv.style.border = '2px solid var(--color-secondary)';
        statusDiv.style.color = 'var(--text-medium)';
      }
    } catch (error) {
      console.error('Error checking availability:', error);
    }
  }, 500);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadVehiclesAndTrainers();
  
  const dateInput = document.getElementById('appointmentDate');
  const timeInput = document.getElementById('appointmentTime');
  const vehicleSelect = document.getElementById('vehicleSelect');
  const trainerSelect = document.getElementById('trainerSelect');
  
  if (dateInput) dateInput.addEventListener('change', checkAvailability);
  if (timeInput) timeInput.addEventListener('change', checkAvailability);
  if (vehicleSelect) vehicleSelect.addEventListener('change', checkAvailability);
  if (trainerSelect) trainerSelect.addEventListener('change', checkAvailability);
});

// Form submission
document.getElementById('appointmentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const msg = document.getElementById('formMessage');
  const statusDiv = document.getElementById('availabilityStatus');
  
  msg.textContent = '';
  msg.className = '';
  
  try {
    const res = await fetch('/api/appointments', {
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify(data)
    });
    const json = await res.json();
    
    if (res.ok) { 
      msg.textContent = 'Appointment requested successfully! Admin will contact you to confirm.'; 
      msg.className = 'success';
      form.reset();
      statusDiv.style.display = 'none';
      loadVehiclesAndTrainers(); // Reload to refresh availability
    } else { 
      msg.textContent = json.error || 'Error submitting appointment'; 
      msg.className = 'error';
      if (json.error && json.error.includes('Slot is full')) {
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = '<strong style="color: #d32f2f;">⚠️ ' + json.error + '</strong>';
        statusDiv.style.background = 'rgba(211, 47, 47, 0.1)';
        statusDiv.style.border = '2px solid #d32f2f';
        statusDiv.style.color = '#d32f2f';
      }
    }
  } catch (error) {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'error';
  }
});