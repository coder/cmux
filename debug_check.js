// Paste this in browser console to debug:

// Check localStorage state
const workspaceId = Object.keys(localStorage).find(k => k.endsWith('-autoRetry'))?.replace('-autoRetry', '');
console.log('Workspace ID:', workspaceId);

if (workspaceId) {
  const autoRetry = localStorage.getItem(`${workspaceId}-autoRetry`);
  const retryState = localStorage.getItem(`${workspaceId}-retryState`);
  
  console.log('autoRetry:', autoRetry);
  console.log('retryState:', JSON.parse(retryState || '{}'));
  
  if (retryState) {
    const state = JSON.parse(retryState);
    const delay = Math.min(1000 * Math.pow(2, state.attempt), 60000);
    const timeSince = Date.now() - state.retryStartTime;
    const timeUntil = delay - timeSince;
    
    console.log('Attempt:', state.attempt);
    console.log('Delay (ms):', delay);
    console.log('Time since last retry (ms):', timeSince);
    console.log('Time until next retry (ms):', timeUntil);
    console.log('Should be eligible:', timeSince >= delay);
  }
}
