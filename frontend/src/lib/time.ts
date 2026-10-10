/**
 * Time helpers for SwasthyaFlow AI.
 * Clinical greetings accurately reflect local time and Indian Standard Time (IST / Asia/Kolkata, UTC+5:30).
 */

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night'

/**
 * Returns the effective clinical hour (0 - 23).
 * Prioritizes the user's local device clock (what the user actually observes on their system/tray),
 * with fallback to exact mathematical Indian Standard Time (UTC + 5:30).
 */
export function indianHour(date: Date = new Date()): number {
  // 1. Direct device local hour:
  // If the user's clock shows 1:52 PM, date.getHours() returns 13.
  const localHour = date.getHours()

  // 2. Exact IST calculation (+5:30 offset from UTC):
  let istHour: number | null = null
  try {
    const istMs = date.getTime() + 5.5 * 60 * 60 * 1000
    const h = new Date(istMs).getUTCHours()
    if (!Number.isNaN(h) && h >= 0 && h < 24) {
      istHour = h
    }
  } catch {
    istHour = null
  }

  // 3. Robust Intl extraction with explicit 24h cycle:
  let intlHour: number | null = null
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
        intlHour = parsed
      }
    }
  } catch {
    intlHour = null
  }

  // If local device is set to UTC (e.g. headless container / CI), use IST:
  const tzOffset = date.getTimezoneOffset() // 0 for UTC, -330 for IST
  if (tzOffset === 0 && (istHour !== null || intlHour !== null)) {
    return istHour ?? intlHour ?? 12
  }

  // Otherwise, if localHour is a valid number, use the user's device clock:
  if (typeof localHour === 'number' && !Number.isNaN(localHour) && localHour >= 0 && localHour < 24) {
    return localHour
  }

  return intlHour ?? istHour ?? 12
}

/**
 * Returns the period of the day based on the clinical hour:
 * - 05:00 to 11:59 -> morning
 * - 12:00 to 16:59 -> afternoon (e.g. 1:52 PM is hour 13 -> afternoon)
 * - 17:00 to 20:59 -> evening
 * - 21:00 to 04:59 -> night
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
 * - At 1:52 PM (hour 13) -> "Good afternoon"
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
