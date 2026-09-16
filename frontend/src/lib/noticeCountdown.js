export function noticeCountdown(lastWorkingDay) {
  if (!lastWorkingDay) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const last = new Date(`${lastWorkingDay}T00:00:00`);
  if (Number.isNaN(last.getTime())) return null;
  const days = Math.round((last - today) / 86400000);
  const label = days < 0 ? "Notice period over" : days === 0 ? "Last day today" : `${days} day${days === 1 ? "" : "s"} left`;
  return { days, label, urgent: days <= 7 };
}
