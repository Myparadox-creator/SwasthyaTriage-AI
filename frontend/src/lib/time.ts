/**
 * Time helpers for SwasthyaFlow AI.
 * Clinical greetings strictly synchronize with Indian Standard Time (IST / Asia/Kolkata, UTC+5:30),
 * ensuring patients and healthcare teams always receive the exact time-accurate greeting
 * regardless of client device timezone or browser settings.
 */

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night'

/**
 * Returns the effective clinical hour (0 - 23) in Indian Standard Time (IST / Asia/Kolkata).
 */
export function indianHour(date: Date = new Date()): number {
  // 1. Primary: Explicit Indian Standard Time (Asia/Kolkata) using Intl standard 24h cycle
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date)
    const hp = parts.find((p) => p.type === 'hour')
    if (hp) {
      const parsed = Number.parseInt(hp.value, 10)
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed < 24) {
        return parsed
      }
    }
  } catch {
    // fallback to mathematical calculation
  }

  // 2. Secondary: Mathematical IST calculation (+5:30 offset = 19,800,000 ms from UTC epoch)
  try {
    const istMs = date.getTime() + 5.5 * 60 * 60 * 1000
    const h = new Date(istMs).getUTCHours()
    if (!Number.isNaN(h) && h >= 0 && h < 24) {
      return h
    }
  } catch {
    // fallback to local hour
  }

  // 3. Fallback: local device hour
  const local = date.getHours()
  return Number.isNaN(local) ? 12 : local % 24
}

/**
 * Returns the period of the day based on the clinical hour:
 * - 05:00 to 11:59 -> morning ("Good morning")
 * - 12:00 to 16:59 -> afternoon ("Good afternoon")
 * - 17:00 to 20:59 -> evening ("Good evening")
 * - 21:00 to 04:59 -> night ("Good night")
 */
export function getTimePeriod(date: Date = new Date()): TimePeriod {
  const hour = indianHour(date)
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

/**
 * Returns a time-appropriate clinical greeting.
 * Supports English ('en'), Hindi ('hi'), and Odia ('od').
 *
 * Example:
 * - At 1:52 PM (hour 13) or 3:30 PM (hour 15) -> "Good afternoon"
 */
export function indianGreeting(date: Date = new Date(), lang: string = 'en'): string {
  const period = getTimePeriod(date)
  const l = (lang || 'en').toLowerCase().slice(0, 2)

  if (l === 'hi') {
    switch (period) {
      case 'morning':
        return 'शुभ प्रभात'
      case 'afternoon':
        return 'शुभ दोपहर'
      case 'evening':
        return 'शुभ संध्या'
      case 'night':
        return 'शुभ रात्रि'
    }
  }

  if (l === 'od') {
    switch (period) {
      case 'morning':
        return 'ଶୁଭ ସକାଳ'
      case 'afternoon':
        return 'ଶୁଭ ଅପରାହ୍ନ'
      case 'evening':
        return 'ଶୁଭ ସନ୍ଧ୍ୟା'
      case 'night':
        return 'ଶୁଭ ରାତ୍ରି'
    }
  }

  switch (period) {
    case 'morning':
      return 'Good morning'
    case 'afternoon':
      return 'Good afternoon'
    case 'evening':
      return 'Good evening'
    case 'night':
      return 'Good night'
  }
}
