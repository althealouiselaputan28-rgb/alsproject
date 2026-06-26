(function() {
  const loadingFill = document.getElementById('loadingFill');
  const loadingPercent = document.getElementById('loadingPercent');
  const duration = 5000;
  const startTime = performance.now();

  function updateProgress(timestamp) {
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const percentage = Math.round(progress * 100);

    loadingFill.style.width = `${percentage}%`;
    loadingPercent.textContent = `${percentage}%`;

    if (progress < 1) {
      requestAnimationFrame(updateProgress);
    } else {
      window.location.href = 'main.html';
    }
  }

  requestAnimationFrame(updateProgress);
})();
