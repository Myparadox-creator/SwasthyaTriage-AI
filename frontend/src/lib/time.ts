/**
 * Time helpers. Clinical greetings must reflect Indian Standard Time (IST /
 * Asia/Kolkata, UTC+5:30), independent of the user's device timezone.
 */

export function indianGreeting(date: Date = new Date()): string {
  const hour = indianHour(date)
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Good night'
}

export function indianHour(date: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(date)
  const hour = Number.parseInt(formatted, 10)
  return Number.isNaN(hour) ? 0 : hour % 24
}
