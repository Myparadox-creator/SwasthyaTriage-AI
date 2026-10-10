/**
 * Permissions manager for SwasthyaTriage AI.
 * Handles Location (GPS), Emergency Notifications, and Microphone access.
 */

export type PermissionState = 'prompt' | 'granted' | 'denied'

export interface AppPermissionsStatus {
  completed: boolean
  location: PermissionState
  notifications: PermissionState
  microphone: PermissionState
  coords: [number, number] | null
}

const STORAGE_KEYS = {
  COMPLETED: 'swasthya_permissions_completed',
  LOCATION: 'swasthya_perm_location',
  NOTIFICATIONS: 'swasthya_perm_notifications',
  MICROPHONE: 'swasthya_perm_mic',
  COORDS: 'swasthya_perm_coords',
}

export function getStoredPermissions(): AppPermissionsStatus {
  try {
    const completed = localStorage.getItem(STORAGE_KEYS.COMPLETED) === 'true'
    const loc = (localStorage.getItem(STORAGE_KEYS.LOCATION) as PermissionState) || 'prompt'
    const notif = (localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) as PermissionState) || 'prompt'
    const mic = (localStorage.getItem(STORAGE_KEYS.MICROPHONE) as PermissionState) || 'prompt'

    let coords: [number, number] | null = null
    const storedCoords = localStorage.getItem(STORAGE_KEYS.COORDS)
    if (storedCoords) {
      try {
        coords = JSON.parse(storedCoords)
      } catch {
        coords = null
      }
    }

    return {
      completed,
      location: loc,
      notifications: notif,
      microphone: mic,
      coords,
    }
  } catch {
    return {
      completed: false,
      location: 'prompt',
      notifications: 'prompt',
      microphone: 'prompt',
      coords: null,
    }
  }
}

export function markPermissionsCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.COMPLETED, 'true')
  } catch {
    /* ignore */
  }
}

function getBrowserPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

/**
 * Fallback: IP-based Geolocation when browser hardware GPS or Windows Location Service is unavailable
 */
export async function fetchIpLocation(): Promise<{ coords: [number, number]; locationName: string } | null> {
  try {
    const res = await fetch('https://ipapi.co/json/')
    if (res.ok) {
      const data = await res.json()
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        const city = data.city || data.region || 'Your Area'
        const region = data.region || data.country_name || ''
        const locationName = region && region !== city ? `${city}, ${region}` : city
        return {
          coords: [data.latitude, data.longitude],
          locationName,
        }
      }
    }
  } catch {
    /* ignore and try secondary */
  }

  try {
    const res2 = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client')
    if (res2.ok) {
      const data2 = await res2.json()
      if (typeof data2.latitude === 'number' && typeof data2.longitude === 'number') {
        const city = data2.city || data2.locality || data2.principalSubdivision || 'Your Area'
        const region = data2.principalSubdivision || ''
        const locationName = region && region !== city ? `${city}, ${region}` : city
        return {
          coords: [data2.latitude, data2.longitude],
          locationName,
        }
      }
    }
  } catch {
    /* ignore */
  }

  return null
}

/**
 * Reverse geocode coordinates to human-readable area / city name
 */
export async function reverseGeocodeCoords(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`,
      { headers: { 'Accept-Language': 'en' } }
    )
    if (res.ok) {
      const data = await res.json()
      const addr = data.address || {}
      const area =
        addr.suburb ||
        addr.neighbourhood ||
        addr.city ||
        addr.town ||
        addr.county ||
        addr.state_district
      const state = addr.state
      if (area) {
        return state && state !== area ? `${area}, ${state}` : area
      }
      if (data.display_name) {
        return data.display_name.split(',').slice(0, 2).join(',').trim()
      }
    }
  } catch {
    /* ignore */
  }
  return 'Your Live Coordinates'
}

export async function requestLocationPermission(): Promise<{
  status: PermissionState
  coords?: [number, number]
  error?: string
  source?: 'gps_high_accuracy' | 'gps_standard' | 'ip_network'
  locationName?: string
}> {
  const hasGeo = typeof navigator !== 'undefined' && Boolean(navigator.geolocation)

  if (hasGeo) {
    // Stage 1: Try High-Accuracy Hardware GPS (5s timeout)
    try {
      const pos = await getBrowserPosition({
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000,
      })
      const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
      try {
        localStorage.setItem(STORAGE_KEYS.LOCATION, 'granted')
        localStorage.setItem(STORAGE_KEYS.COORDS, JSON.stringify(coords))
      } catch {}
      return { status: 'granted', coords, source: 'gps_high_accuracy' }
    } catch (err1: any) {
      // If code !== 1 (TIMEOUT or POSITION_UNAVAILABLE), try Stage 2 Standard Accuracy
      if (err1?.code !== 1) {
        try {
          const pos2 = await getBrowserPosition({
            enableHighAccuracy: false,
            timeout: 6000,
            maximumAge: 300000,
          })
          const coords: [number, number] = [pos2.coords.latitude, pos2.coords.longitude]
          try {
            localStorage.setItem(STORAGE_KEYS.LOCATION, 'granted')
            localStorage.setItem(STORAGE_KEYS.COORDS, JSON.stringify(coords))
          } catch {}
          return { status: 'granted', coords, source: 'gps_standard' }
        } catch {
          // Fall through to Stage 3
        }
      }
    }
  }

  // Stage 3: IP-based Network Geolocation Fallback
  const ipResult = await fetchIpLocation()
  if (ipResult) {
    try {
      localStorage.setItem(STORAGE_KEYS.LOCATION, 'granted')
      localStorage.setItem(STORAGE_KEYS.COORDS, JSON.stringify(ipResult.coords))
    } catch {}
    return {
      status: 'granted',
      coords: ipResult.coords,
      source: 'ip_network',
      locationName: ipResult.locationName,
    }
  }

  try {
    localStorage.setItem(STORAGE_KEYS.LOCATION, 'denied')
  } catch {}
  return {
    status: 'denied',
    error: 'Location could not be determined. Please enable location permissions or search your city.',
  }
}

export async function requestNotificationPermission(): Promise<{ status: PermissionState }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    try {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, 'denied')
    } catch {
      /* ignore */
    }
    return { status: 'denied' }
  }

  try {
    const res = await Notification.requestPermission()
    const state: PermissionState = res === 'granted' ? 'granted' : res === 'denied' ? 'denied' : 'prompt'
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, state)
    return { status: state }
  } catch {
    return { status: 'prompt' }
  }
}

export async function requestMicrophonePermission(): Promise<{ status: PermissionState; error?: string }> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    try {
      localStorage.setItem(STORAGE_KEYS.MICROPHONE, 'denied')
    } catch {
      /* ignore */
    }
    return { status: 'denied', error: 'Microphone not supported by browser' }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Immediately stop tracks so recording indicator doesn't remain active
    stream.getTracks().forEach((track) => track.stop())
    localStorage.setItem(STORAGE_KEYS.MICROPHONE, 'granted')
    return { status: 'granted' }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Microphone permission rejected'
    localStorage.setItem(STORAGE_KEYS.MICROPHONE, 'denied')
    return { status: 'denied', error: errorMsg }
  }
}
