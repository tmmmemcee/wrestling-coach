// Wrestling Coach App JS
// Handles search, filters, and UI interactions

document.addEventListener('DOMContentLoaded', function() {
    // Auto-search if URL has query params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('q') || urlParams.get('move_type')) {
        if (document.getElementById('searchInput')) {
            document.getElementById('searchInput').value = urlParams.get('q') || '';
            searchVideos();
        }
    }
});
