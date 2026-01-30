const loginBox = document.getElementById('loginBox');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const logoutBtn = document.getElementById('logoutBtn');

const IS_GITHUB_PAGES = location.hostname.includes('github.io');

function showMessage(el, msg, type = 'error') {
  el.textContent = msg;
  el.className = type;
  el.style.display = 'block';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // ✅ DEMO MODE FOR GITHUB PAGES
  if (IS_GITHUB_PAGES) {
    loginBox.style.display = 'none';
    adminPanel.style.display = 'block';
    alert('Admin panel is running in DEMO mode on GitHub Pages');
    return;
  }

  // ✅ REAL BACKEND LOGIN (LOCAL / CLOUD)
  const data = Object.fromEntries(new FormData(loginForm));

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });

    const json = await res.json();

    if (res.ok) {
      loginBox.style.display = 'none';
      adminPanel.style.display = 'block';
    } else {
      showMessage(loginMessage, json.error || 'Login failed');
    }
  } catch {
    showMessage(loginMessage, 'Server not reachable');
  }
});

logoutBtn.addEventListener('click', () => {
  adminPanel.style.display = 'none';
  loginBox.style.display = 'block';
  loginForm.reset();
});
