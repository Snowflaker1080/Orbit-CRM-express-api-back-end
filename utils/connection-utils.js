// utils/connection-utils.js
function computeNextDue({ lastConnectedAt, frequencyDays }) {
  if (!frequencyDays) return null;
  const base = lastConnectedAt ? new Date(lastConnectedAt) : new Date(); // if never connected, start today
  const next = new Date(base);
  next.setDate(next.getDate() + Number(frequencyDays));
  return next;
}

module.exports = { computeNextDue };