let map;
let marker;

// Initialize map
async function initMap() {
  try {
    // Get location data from server
    const response = await fetch('/api/location');
    const locationData = await response.json();
    
    const defaultLocation = {
      lat: locationData.latitude || 28.6139,
      lng: locationData.longitude || 77.2090
    };
    
    // Create map
    map = new google.maps.Map(document.getElementById('map'), {
      center: defaultLocation,
      zoom: locationData.zoom || 15,
      styles: [
        {
          featureType: 'all',
          elementType: 'geometry',
          stylers: [{ color: '#d1d5db' }]
        },
        {
          featureType: 'water',
          elementType: 'geometry',
          stylers: [{ color: '#9ca3af' }]
        }
      ]
    });
    
    // Add marker
    marker = new google.maps.Marker({
      position: defaultLocation,
      map: map,
      title: locationData.name || 'Aniket Motor Training School',
      animation: google.maps.Animation.DROP
    });
    
    // Update location info
    updateLocationInfo(locationData);
  } catch (error) {
    console.error('Error loading map:', error);
    // Fallback: show message if map fails to load
    document.getElementById('map').innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-medium);">Map loading failed. Please check your connection.</div>';
    
    // Still try to load location info
    fetch('/api/location')
      .then(res => res.json())
      .then(data => updateLocationInfo(data))
      .catch(err => {
        document.getElementById('locationAddress').textContent = 'Location information unavailable';
      });
  }
}

// Update location information display
function updateLocationInfo(locationData) {
  const addressEl = document.getElementById('locationAddress');
  const phoneEl = document.getElementById('locationPhone');
  const hoursEl = document.getElementById('locationHours');
  
  if (addressEl) {
    addressEl.textContent = locationData.address || 'Address not set';
  }
  
  if (phoneEl) {
    phoneEl.textContent = locationData.phone ? `Phone: ${locationData.phone}` : '';
  }
  
  if (hoursEl) {
    hoursEl.textContent = locationData.hours ? `Hours: ${locationData.hours}` : '';
  }
}

// Fallback if Google Maps API is not available
if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
  // Use OpenStreetMap as fallback
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const response = await fetch('/api/location');
      const locationData = await response.json();
      updateLocationInfo(locationData);
      
      // Create a simple iframe map using OpenStreetMap
      const mapContainer = document.getElementById('map');
      if (mapContainer && locationData.latitude && locationData.longitude) {
        const lat = locationData.latitude;
        const lng = locationData.longitude;
        mapContainer.innerHTML = `
          <iframe 
            width="100%" 
            height="100%" 
            frameborder="0" 
            scrolling="no" 
            marginheight="0" 
            marginwidth="0" 
            src="https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.01},${lat-0.01},${lng+0.01},${lat+0.01}&layer=mapnik&marker=${lat},${lng}"
            style="border: 2px solid var(--color-light); border-radius: 12px;">
          </iframe>
        `;
      }
    } catch (error) {
      console.error('Error loading location:', error);
    }
  });
}



