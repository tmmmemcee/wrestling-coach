// Nostr Auth for Wrestling Coach

let currentUser = null;
let nostrTools = null;

// Load nostr-tools from CDN
async function loadNostrTools() {
  if (window.nostrTools) return;
  
  try {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/nostr-tools@2.0.0/index.min.js';
    script.onload = () => { 
      window.nostrTools = window.require('nostr-tools');
      nostrTools = window.nostrTools;
      console.log('Nostr-tools loaded');
    };
    document.head.appendChild(script);
  } catch (e) {
    console.error('Failed to load nostr-tools:', e);
  }
}

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadNostrTools();
  await checkAuthStatus();
  if (currentUser) {
    // If user is logged in, we might want to load their liked/bookmarked state
    // This can be done by individual pages
    console.log('User logged in, loading their state');
  }
});

// Show login modal
async function showAuthModal() {
  document.getElementById('authModal').classList.add('show');
  document.getElementById('authModal').style.display = 'block';
  
  if (!nostrTools) {
    await loadNostrTools();
  }
}

// Hide login modal (when outside clicked)
document.addEventListener('click', (e) => {
  const modal = document.getElementById('authModal');
  if (e.target === modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
});

// Sign in with Nostr
async function signInWithNostr() {
  if (!nostrTools) {
    alert('Nostr tools not loaded yet. Please try again.');
    return;
  }
  
  try {
    // Get challenge from server
    const challengeResp = await fetch('/api/nostr/challenge');
    const challengeData = await challengeResp.json();
    const challengeId = challengeData.challengeId;
    
    console.log('Challenge:', challengeId);
    
    // Try to sign with browser extension first
    let event;
    
    if (window.nostr) {
      // Use browser extension
      const { event: extEvent } = await window.nostr.signEvent({
        kind: 22242,
        tags: [['challenge', challengeId], ['app', 'wrestling-coach']],
        content: `Sign this to authenticate: ${challengeId}`,
        created_at: Math.floor(Date.now() / 1000)
      });
      event = extEvent;
    } else {
      // No extension - ask user for their nsec
      const nsec = prompt('Enter your nsec private key to sign in:\n(you can find this in your Nostr app)\n\nExample: nsec1...');
      
      if (!nsec) {
        alert('No key provided. Please enter your nsec.');
        return;
      }
      
      // Decode nsec
      const privateKey = nostrTools.nsecDecode(nsec).data;
      const publicKey = nostrTools.getPublicKey(privateKey);
      
      // Sign the event
      const sig = nostrTools.schnorr.Sign(
        nostrTools.sha256(new Uint8Array(Buffer.from(JSON.stringify([
          0,
          publicKey,
          Math.floor(Date.now() / 1000),
          22242,
          [['challenge', challengeId], ['app', 'wrestling-coach']],
          `Sign this to authenticate: ${challengeId}`
        ])))),
        privateKey
      );
      
      event = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: Buffer.from(publicKey).toString('hex'),
        tags: [['challenge', challengeId], ['app', 'wrestling-coach']],
        content: `Sign this to authenticate: ${challengeId}`,
        sig: Buffer.from(sig).toString('hex')
      };
    }
    
    // Send signed event to server
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
      alert('✅ Signed in successfully!');
    } else {
      alert('❌ Authentication failed: ' + authData.error);
    }
    
  } catch (error) {
    console.error('Auth error:', error);
    alert('❌ Error signing in: ' + error.message);
  }
}

// Check if user is logged in (from localStorage)
async function checkAuthStatus() {
  const storedNpub = localStorage.getItem('wrestlingCoachNpub');
  
  if (storedNpub) {
    const authResp = await fetch('/api/nostr/authenticated', {
      headers: { 'x-npub': storedNpub }
    });
    const data = await authResp.json();
    
    if (data.authenticated) {
      currentUser = data.user;
      updateAuthUI();
      return;
    }
  }
  
  // Not logged in, show login button
  updateAuthUI();
}

// Close auth modal
function closeAuthModal() {
  document.getElementById('authModal').classList.remove('show');
  document.getElementById('authModal').style.display = 'none';
}

// Update auth UI based on login status
function updateAuthUI() {
  const nav = document.querySelector('.navbar-nav');
  
  if (currentUser) {
    // User is logged in
    const html = `
      <a class="nav-link" href="/my-likes.html">
        <i class="bi bi-heart"></i> My Likes
      </a>
      <a class="nav-link" href="/my-bookmarks.html">
        <i class="bi bi-bookmark"></i> Bookmarks
      </a>
      <a class="nav-link badge bg-primary" href="#" onclick="signOut(); return false;">
        <i class="bi bi-person"></i> ${currentUser.display_name}
      </a>
    `;
    nav.innerHTML = html + nav.innerHTML;
  } else {
    // User not logged in
    const html = `
      <a class="nav-link badge bg-primary" href="#" onclick="showAuthModal(); return false;">
        <i class="bi bi-person-circle"></i> Sign in with Nostr
      </a>
    `;
    
    // Find the sign-in button and replace it
    const existingAuth = document.querySelector('a[href="#"], a[onclick*="showAuthModal"]');
    if (existingAuth) {
      existingAuth.outerHTML = html;
    } else {
      nav.innerHTML = html + nav.innerHTML;
    }
  }
}

// Sign out
function signOut() {
  localStorage.removeItem('wrestlingCoachNpub');
  currentUser = null;
  updateAuthUI();
  alert('Logged out successfully!');
}

// Helper: Get current auth header
function getAuthHeader() {
  if (!currentUser) return {};
  return { 'x-npub': currentUser.npub };
}

// Helper: Toggle like (persisted)
async function toggleLike(videoId, btnElement) {
  if (!currentUser) {
    alert('Please sign in with Nostr to like videos!');
    showAuthModal();
    return;
  }
  
  // If btnElement wasn't passed, try to find it
  if (!btnElement) {
    btnElement = document.getElementById(`likeBtn-${videoId}`);
  }
  
  const res = await fetch(`/api/like/${videoId}`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeader()
    }
  });
  
  const data = await res.json();
  
  if (data.liked) {
    btnElement.classList.add('active');
    btnElement.style.background = '#dc3545';
    btnElement.style.borderColor = '#dc3545';
    btnElement.innerHTML = '❤️ Liked';
  } else {
    btnElement.classList.remove('active');
    btnElement.style.background = '';
    btnElement.style.borderColor = '';
    btnElement.innerHTML = '❤️ Like';
  }
}

// Helper: Toggle bookmark (persisted)
async function toggleBookmark(videoId, element) {
  if (!currentUser) {
    alert('Please sign in with Nostr to bookmark!');
    showAuthModal();
    return;
  }
  
  const res = await fetch(`/api/bookmark/${videoId}`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeader()
    }
  });
  
  const data = await res.json();
  
  if (data.bookmarked) {
    element.classList.add('active');
    element.innerHTML = '<i class="bi bi-bookmark-fill"></i> Saved';
    alert('💾 Saved to bookmarks!');
  } else {
    element.classList.remove('active');
    element.innerHTML = '<i class="bi bi-bookmark"></i> Save';
    alert('Bookmark removed!');
  }
}

// Helper: Update video like count in UI
function updateVideoLikeCount(videoId, delta) {
  const likeButton = document.querySelector(`button[data-video-id="${videoId}"][data-type="up"]`);
  if (likeButton) {
    const countEl = likeButton.querySelector('.count');
    const current = parseInt(countEl.textContent) || 0;
    countEl.textContent = current + delta;
  }
}

// Load user's liked/video state for all videos on page
async function loadUserVideoState(videoIds) {
  if (!currentUser || !videoIds?.length) return;
  
  // Load liked videos
  const res = await fetch('/api/user/likes', {
    headers: { 'x-npub': currentUser.npub }
  });
  const data = await res.json();
  const likedIds = new Set(data.likes.map(l => l.id));
  
  // Load bookmarked videos
  const bookmarkRes = await fetch('/api/user/bookmarks', {
    headers: { 'x-npub': currentUser.npub }
  });
  const bookmarkData = await bookmarkRes.json();
  const bookmarkedIds = new Set(bookmarkData.bookmarks.map(b => b.id));
  
  // Update UI for liked buttons
  videoIds.forEach(id => {
    const likeBtn = document.getElementById(`likeBtn-${id}`);
    if (likeBtn && likedIds.has(id)) {
      likeBtn.classList.add('active');
      likeBtn.style.background = '#dc3545';
      likeBtn.style.borderColor = '#dc3545';
      likeBtn.innerHTML = '❤️ ' + (likeBtn.innerHTML.replace(/[\d]/g, ''));
    }
    
    const bookmarkBtn = document.getElementById(`bookmarkBtn-${id}`);
    if (bookmarkBtn && bookmarkedIds.has(id)) {
      bookmarkBtn.classList.add('active');
      bookmarkBtn.style.background = '#17a2b8';
      bookmarkBtn.style.borderColor = '#17a2b8';
      bookmarkBtn.innerHTML = '<i class="bi bi-bookmark-fill"></i> Saved';
    }
  });
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showAuthModal,
    signInWithNostr,
    signOut,
    toggleLike,
    toggleBookmark,
    getAuthHeader,
    checkAuthStatus,
    loadUserVideoState
  };
}
