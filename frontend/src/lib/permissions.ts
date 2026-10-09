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

export async function requestLocationPermission(): Promise<{
  status: PermissionState
  coords?: [number, number]
  error?: string
}> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    localStorage.setItem(STORAGE_KEYS.LOCATION, 'denied')
    return { status: 'denied', error: 'Geolocation not supported by browser' }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        try {
          localStorage.setItem(STORAGE_KEYS.LOCATION, 'granted')
          localStorage.setItem(STORAGE_KEYS.COORDS, JSON.stringify(coords))
        } catch {
          /* ignore */
        }
        resolve({ status: 'granted', coords })
      },
      (err) => {
        try {
          localStorage.setItem(STORAGE_KEYS.LOCATION, 'denied')
        } catch {
          /* ignore */
        }
        resolve({ status: 'denied', error: err.message })
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    )
  })
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
