// Nostr Auth for Wrestling Coach

let currentUser = null;
let nostrTools = null;

// Load nostr-tools from esm.sh (browser ES modules)
async function loadNostrTools() {
  if (nostrTools) return nostrTools;
  
  try {
    nostrTools = await import('https://esm.sh/nostr-tools@2.10.0');
    console.log('✅ Nostr-tools loaded');
    return nostrTools;
  } catch (e) {
    console.error('Failed to load nostr-tools:', e);
    throw e;
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthStatus();
});

// Show login modal
function showAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.add('show');
    modal.style.display = 'block';
  }
}

// Close auth modal
function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
}

// Click outside to close
document.addEventListener('click', (e) => {
  if (e.target?.id === 'authModal') {
    closeAuthModal();
  }
});

// Sign in with Nostr
async function signInWithNostr() {
  try {
    const { nip19, getPublicKey, finalizeEvent } = await loadNostrTools();
    
    // Get challenge from server
    const challengeResp = await fetch('/api/nostr/challenge');
    const { challengeId } = await challengeResp.json();
    console.log('Got challenge:', challengeId);
    
    let event;
    
    // Try browser extension (Alby, nos2x, etc.)
    if (window.nostr) {
      console.log('Using browser extension...');
      event = await window.nostr.signEvent({
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['challenge', challengeId]],
        content: `Authenticate: ${challengeId}`
      });
    } else {
      // Manual nsec entry
      const nsec = prompt(
        'Enter your nsec private key:\n\n' +
        '(Found in your Nostr app - Damus, Amethyst, Primal, etc.)\n\n' +
        'Example: nsec1...'
      );
      
      if (!nsec) {
        alert('No key provided.');
        return;
      }
      
      // Decode nsec
      let privateKeyBytes;
      try {
        const decoded = nip19.decode(nsec);
        if (decoded.type !== 'nsec') throw new Error('Not an nsec');
        privateKeyBytes = decoded.data;
      } catch (e) {
        alert('Invalid nsec key. Check and try again.');
        return;
      }
      
      // Build and sign event
      const unsignedEvent = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['challenge', challengeId]],
        content: `Authenticate: ${challengeId}`,
        pubkey: getPublicKey(privateKeyBytes)
      };
      
      event = finalizeEvent(unsignedEvent, privateKeyBytes);
    }
    
    console.log('Signed event:', event);
    
    // Send to server
    const authResp = await fetch('/api/nostr/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event })
    });
    
    const authData = await authResp.json();
    
    if (authData.success) {
      currentUser = authData.user;
      localStorage.setItem('wrestlingCoachNpub', currentUser.npub);
      closeAuthModal();
      updateAuthUI();
      alert('✅ Signed in!');
    } else {
      alert('❌ Failed: ' + authData.error);
    }
    
  } catch (error) {
    console.error('Auth error:', error);
    alert('❌ Error: ' + error.message);
  }
}

// Check if logged in
async function checkAuthStatus() {
  const storedNpub = localStorage.getItem('wrestlingCoachNpub');
  
  if (storedNpub) {
    try {
      const resp = await fetch('/api/nostr/authenticated', {
        headers: { 'x-npub': storedNpub }
      });
      const data = await resp.json();
      
      if (data.authenticated) {
        currentUser = data.user;
        updateAuthUI();
        return;
      }
    } catch (e) {
      console.error('Auth check error:', e);
    }
  }
  
  updateAuthUI();
}

// Update UI
function updateAuthUI() {
  const nav = document.querySelector('.navbar-nav');
  if (!nav) return;
  
  // Remove existing auth elements
  nav.querySelectorAll('[data-auth]').forEach(el => el.remove());
  
  if (currentUser) {
    nav.insertAdjacentHTML('afterbegin', `
      <a class="nav-link" data-auth href="/my-likes.html"><i class="bi bi-heart"></i> Likes</a>
      <a class="nav-link" data-auth href="/my-bookmarks.html"><i class="bi bi-bookmark"></i> Bookmarks</a>
      <a class="nav-link" data-auth href="#" onclick="signOut(); return false;">
        <i class="bi bi-person"></i> ${currentUser.display_name || 'User'}
      </a>
    `);
  } else {
    nav.insertAdjacentHTML('afterbegin', `
      <a class="nav-link" data-auth href="#" onclick="showAuthModal(); return false;">
        <i class="bi bi-person-circle"></i> Sign in with Nostr
      </a>
    `);
  }
}

// Sign out
function signOut() {
  localStorage.removeItem('wrestlingCoachNpub');
  currentUser = null;
  window.location.reload();
}

// Auth header helper
function getAuthHeader() {
  return currentUser ? { 'x-npub': currentUser.npub } : {};
}

// Toggle like
async function toggleLike(videoId, btnElement) {
  if (!currentUser) {
    alert('Please sign in to like videos!');
    showAuthModal();
    return;
  }
  
  if (!btnElement) btnElement = document.getElementById(`likeBtn-${videoId}`);
  
  try {
    const resp = await fetch(`/api/like/${videoId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
    });
    const data = await resp.json();
    
    if (btnElement) {
      btnElement.classList.toggle('active', data.liked);
      btnElement.style.background = data.liked ? '#dc3545' : '';
      btnElement.innerHTML = data.liked ? '❤️ Liked' : '❤️ Like';
    }
  } catch (e) {
    console.error('Like error:', e);
  }
}

// Toggle bookmark
async function toggleBookmark(videoId, btnElement) {
  if (!currentUser) {
    alert('Please sign in to bookmark!');
    showAuthModal();
    return;
  }
  
  if (!btnElement) btnElement = document.getElementById(`bookmarkBtn-${videoId}`);
  
  try {
    const resp = await fetch(`/api/bookmark/${videoId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
    });
    const data = await resp.json();
    
    if (btnElement) {
      btnElement.classList.toggle('active', data.bookmarked);
      btnElement.style.background = data.bookmarked ? '#17a2b8' : '';
      btnElement.innerHTML = data.bookmarked ? '🔖 Saved' : '📑 Save';
    }
  } catch (e) {
    console.error('Bookmark error:', e);
  }
}

// Load user state for videos on page
async function loadUserVideoState(videoIds) {
  if (!currentUser || !videoIds?.length) return;
  
  try {
    const [likesResp, bookmarksResp] = await Promise.all([
      fetch('/api/user/likes', { headers: getAuthHeader() }),
      fetch('/api/user/bookmarks', { headers: getAuthHeader() })
    ]);
    
    const { likes = [] } = await likesResp.json();
    const { bookmarks = [] } = await bookmarksResp.json();
    
    const likedIds = new Set(likes.map(l => l.id));
    const bookmarkedIds = new Set(bookmarks.map(b => b.id));
    
    videoIds.forEach(id => {
      const likeBtn = document.getElementById(`likeBtn-${id}`);
      if (likeBtn && likedIds.has(id)) {
        likeBtn.classList.add('active');
        likeBtn.style.background = '#dc3545';
        likeBtn.innerHTML = '❤️ Liked';
      }
      
      const bookmarkBtn = document.getElementById(`bookmarkBtn-${id}`);
      if (bookmarkBtn && bookmarkedIds.has(id)) {
        bookmarkBtn.classList.add('active');
        bookmarkBtn.style.background = '#17a2b8';
        bookmarkBtn.innerHTML = '🔖 Saved';
      }
    });
  } catch (e) {
    console.error('Load state error:', e);
  }
}

// Expose globally
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.signInWithNostr = signInWithNostr;
window.signOut = signOut;
window.toggleLike = toggleLike;
window.toggleBookmark = toggleBookmark;
window.loadUserVideoState = loadUserVideoState;
window.getCurrentUser = () => currentUser;
