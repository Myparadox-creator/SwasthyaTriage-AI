import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Building2,
  Clock,
  Compass,
  Crosshair,
  ExternalLink,
  HeartPulse,
  Info,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Pill,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Zap,
} from 'lucide-react'
import {
  POPULAR_INDIAN_LOCATIONS,
  searchNearbyFacilities,
  type FacilityCategory,
  type HealthcareFacility,
} from '../../../lib/facilities'
import AppPermissionsModal from '../../../components/AppPermissionsModal'
import {
  getStoredPermissions,
  requestLocationPermission,
  type PermissionState,
} from '../../../lib/permissions'

// Helper to create modern SVG Leaflet icons
function createCustomPin(color: string, iconText: string) {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        background: ${color};
        color: white;
        width: 36px;
        height: 36px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        border: 2px solid white;
      ">
        <span style="transform: rotate(45deg); font-size: 15px; font-weight: bold;">
          ${iconText}
        </span>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -34],
  })
}

function createUserPin(title: string) {
  return L.divIcon({
    className: 'user-location-marker',
    html: `
      <div style="position: relative; width: 28px; height: 28px; cursor: pointer;" title="${title}">
        <div style="
          position: absolute;
          inset: -8px;
          border-radius: 9999px;
          background: rgba(13, 148, 136, 0.45);
          animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        "></div>
        <div style="
          width: 28px;
          height: 28px;
          border-radius: 9999px;
          background: #0f766e;
          border: 3px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 10px rgba(0,0,0,0.4);
          color: white;
          font-size: 14px;
        ">📍</div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -18],
  })
}

export default function NearbyPharmaciesPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<{ [key: string]: L.Marker }>({})
  const userMarkerRef = useRef<L.Marker | null>(null)

  // Current location coordinates & active list of facilities
  const [userLocation, setUserLocation] = useState<[number, number]>([20.287, 85.835]) // Default Bhubaneswar Capital area
  const [locationName, setLocationName] = useState('Bhubaneswar Central Area')
  const [facilities, setFacilities] = useState<HealthcareFacility[]>([])
  const [selectedFacility, setSelectedFacility] = useState<HealthcareFacility | null>(null)
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false)

  // Location search state
  const [locationSearchInput, setLocationSearchInput] = useState('')
  const [isSearchingLocation, setIsSearchingLocation] = useState(false)
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<FacilityCategory>('ALL')
  const [emergencyOnly, setEmergencyOnly] = useState(false)

  // Permissions state
  const [showPermissionsModal, setShowPermissionsModal] = useState(false)
  const [locationPermission, setLocationPermission] = useState<PermissionState>(() => getStoredPermissions().location)

  // Fetch facilities for coordinates or query
  const loadFacilities = async (opts: {
    lat?: number
    lng?: number
    query?: string
    category?: FacilityCategory
    emergencyOnly?: boolean
  }) => {
    setIsLoadingFacilities(true)
    try {
      const result = await searchNearbyFacilities({
        lat: opts.lat ?? userLocation[0],
        lng: opts.lng ?? userLocation[1],
        query: opts.query,
        category: opts.category ?? categoryFilter,
        emergencyOnly: opts.emergencyOnly ?? emergencyOnly,
        limit: 35,
      })

      if (result.facilities.length > 0) {
        setFacilities(result.facilities)
        setSelectedFacility(result.facilities[0] || null)
        if (result.location) {
          setLocationName(result.location.name)
          const newCoords: [number, number] = [result.location.lat, result.location.lng]
          setUserLocation(newCoords)
          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo(newCoords, 14, { duration: 1.2 })
          }
        }
      }
    } catch (err) {
      console.error('Failed to load healthcare facilities:', err)
    } finally {
      setIsLoadingFacilities(false)
    }
  }

  // Initial load: Check stored GPS or prompt
  useEffect(() => {
    const perms = getStoredPermissions()
    setLocationPermission(perms.location)

    if (perms.location === 'granted' && perms.coords) {
      setUserLocation(perms.coords)
      setLocationName('Your Live GPS Coordinates')
      void loadFacilities({ lat: perms.coords[0], lng: perms.coords[1] })
    } else if (typeof navigator !== 'undefined' && navigator.geolocation && perms.location === 'granted') {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
          setUserLocation(coords)
          setLocationName('Your Live GPS Coordinates')
          void loadFacilities({ lat: coords[0], lng: coords[1] })
        },
        () => {
          void loadFacilities({ lat: 20.287, lng: 85.835 })
        },
        { timeout: 7000 }
      )
    } else {
      // Default to initial view
      void loadFacilities({ lat: 20.287, lng: 85.835, query: 'Bhubaneswar' })
    }
  }, [])

  // Execute universal India location search via OpenStreetMap Nominatim
  const handleSearchLocation = async (queryText?: string) => {
    const q = (queryText ?? locationSearchInput).trim()
    if (!q) return

    setIsSearchingLocation(true)
    setSearchFeedback(null)

    try {
      // 1. Check quick preset match first for instant response
      const preset = POPULAR_INDIAN_LOCATIONS.find(
        (p) => p.name.toLowerCase() === q.toLowerCase() || p.query.toLowerCase() === q.toLowerCase()
      )

      if (preset) {
        const coords: [number, number] = [preset.lat, preset.lng]
        setUserLocation(coords)
        setLocationName(preset.name)
        await loadFacilities({ lat: preset.lat, lng: preset.lng, query: preset.query })
        setSearchFeedback(`✓ Located: ${preset.name}`)
      } else {
        // Query live backend / OSM geocoding
        await loadFacilities({ query: q })
        setSearchFeedback(`✓ Found results across India for: "${q}"`)
      }

      setTimeout(() => setSearchFeedback(null), 5000)
    } catch {
      setSearchFeedback(`Error finding "${q}". Please check city name or pincode.`)
    } finally {
      setIsSearchingLocation(false)
    }
  }

  // Trigger Live GPS
  const handleUseCurrentGPS = async () => {
    setIsSearchingLocation(true)
    setSearchFeedback('Requesting GPS satellite coordinates...')

    const res = await requestLocationPermission()
    setLocationPermission(res.status)

    if (res.status === 'granted' && res.coords) {
      setUserLocation(res.coords)
      setLocationName('Your Live GPS Coordinates')
      await loadFacilities({ lat: res.coords[0], lng: res.coords[1] })
      setSearchFeedback('✓ Live GPS location locked successfully!')
      setTimeout(() => setSearchFeedback(null), 4000)
    } else {
      setSearchFeedback('Location access was not granted. You can search any city across India below.')
      setShowPermissionsModal(true)
    }
    setIsSearchingLocation(false)
  }

  // Re-fetch when category filter or emergency toggle changes
  const handleCategoryChange = (cat: FacilityCategory) => {
    setCategoryFilter(cat)
    void loadFacilities({ lat: userLocation[0], lng: userLocation[1], category: cat, emergencyOnly })
  }

  const handleToggleEmergency = () => {
    const nextVal = !emergencyOnly
    setEmergencyOnly(nextVal)
    void loadFacilities({ lat: userLocation[0], lng: userLocation[1], category: categoryFilter, emergencyOnly: nextVal })
  }

  // Filtered facilities based on search query inside card attributes
  const filteredFacilities = useMemo(() => {
    return facilities.filter((f) => {
      if (categoryFilter !== 'ALL' && f.category !== categoryFilter) return false
      if (emergencyOnly && !f.isOpen24x7) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = f.name.toLowerCase().includes(q)
        const matchAddr = f.address.toLowerCase().includes(q)
        const matchTag = f.typeTag.toLowerCase().includes(q)
        const matchHighlights = f.stockHighlights.some((h) => h.toLowerCase().includes(q))
        return matchName || matchAddr || matchTag || matchHighlights
      }
      return true
    })
  }, [facilities, categoryFilter, emergencyOnly, searchQuery])

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: userLocation,
        zoom: 14,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)

      // Interactive Click Anywhere on Map to find healthcare facilities across India
      map.on('click', async (e: L.LeafletMouseEvent) => {
        const clickedCoords: [number, number] = [e.latlng.lat, e.latlng.lng]
        setUserLocation(clickedCoords)
        const clickedName = `Map Point (${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)})`
        setLocationName(clickedName)
        void loadFacilities({ lat: clickedCoords[0], lng: clickedCoords[1] })
        map.flyTo(clickedCoords, 14, { duration: 1.0 })
      })

      mapInstanceRef.current = map
    }

    const map = mapInstanceRef.current

    // Update user reference pin
    if (userMarkerRef.current) {
      userMarkerRef.current.remove()
    }

    const userPin = createUserPin(locationName)
    userMarkerRef.current = L.marker(userLocation, { icon: userPin })
      .addTo(map)
      .bindPopup(
        `<div style="font-family: inherit; font-size: 12px; padding: 2px;">
          <b style="color: #0f766e;">📍 Searched Reference Point</b><br/>
          <span style="color: #334155; font-size: 11px;">${locationName}</span>
        </div>`
      )

    // Clear old markers
    Object.values(markersRef.current).forEach((m) => m.remove())
    markersRef.current = {}

    // Add markers for current facilities
    filteredFacilities.forEach((f) => {
      const pinColor =
        f.category === 'HOSPITAL'
          ? '#dc2626' // Red
          : f.category === 'CLINIC'
          ? '#7c3aed' // Purple
          : '#059669' // Emerald for Jan Aushadhi & Pharmacy

      const pinIcon =
        f.category === 'HOSPITAL'
          ? '🏥'
          : f.category === 'CLINIC'
          ? '🩺'
          : '💊'

      const icon = createCustomPin(pinColor, pinIcon)

      const marker = L.marker([f.lat, f.lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: inherit; max-width: 220px;">
            <b style="font-size: 13px; color: #0f172a; display: block; line-height: 1.2;">${f.name}</b>
            <span style="font-size: 11px; color: ${pinColor}; font-weight: 700; display: block; margin-top: 2px;">
              ${f.categoryLabel}
            </span>
            <div style="font-size: 11px; margin-top: 4px; color: #475569;">
              📍 <b>${f.distanceKm} km</b> away · ETA: ~${f.etaMins} mins<br/>
              ⏰ <b>${f.isOpen24x7 ? '🟢 24x7 Emergency Active' : f.openingHours}</b><br/>
              📞 <a href="tel:${f.phone.replace(/[\s-]+/g, '')}" style="color: #0f766e; font-weight: bold; text-decoration: underline;">${f.phone}</a>
            </div>
            <div style="margin-top: 8px; display: flex; gap: 8px;">
              <a href="tel:${f.phone.replace(/[\s-]+/g, '')}" style="font-size: 11px; font-weight: bold; background: #0f766e; color: white; padding: 3px 8px; border-radius: 6px; text-decoration: none;">
                📞 Call
              </a>
              <a href="https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}" target="_blank" style="font-size: 11px; font-weight: bold; color: #2563eb; padding: 3px 6px; text-decoration: underline;">
                Directions ➔
              </a>
            </div>
          </div>
        `)

      marker.on('click', () => {
        setSelectedFacility(f)
      })

      markersRef.current[f.id] = marker
    })

    if (selectedFacility && markersRef.current[selectedFacility.id]) {
      map.panTo([selectedFacility.lat, selectedFacility.lng])
      markersRef.current[selectedFacility.id].openPopup()
    }
  }, [filteredFacilities, userLocation, locationName, selectedFacility])

  const handleSelectFacility = (fac: HealthcareFacility) => {
    setSelectedFacility(fac)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([fac.lat, fac.lng], 15, { duration: 1.2 })
      if (markersRef.current[fac.id]) {
        markersRef.current[fac.id].openPopup()
      }
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* GPS Permission Callout Banner (if not granted) */}
      {locationPermission !== 'granted' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-white p-4 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-200/80 text-amber-800">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950 sm:text-sm">
                Device GPS Permission Not Enabled
              </h4>
              <p className="text-[11px] text-amber-800">
                Enable GPS permission to automatically discover verified nearby clinics, hospitals & pharmacies at your exact spot, or search any city across India below.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleUseCurrentGPS}
              className="flex items-center gap-1.5 rounded-xl bg-amber-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-800 transition active:scale-95"
            >
              <LocateFixed className="h-4 w-4" />
              <span>Enable Live GPS</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPermissionsModal(true)}
              className="flex items-center gap-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100/60 transition"
            >
              <ShieldCheck className="h-4 w-4 text-amber-700" />
              <span className="hidden sm:inline">Permissions</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Header Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-bold text-teal-800">
              <HeartPulse className="h-3.5 w-3.5 text-teal-600" />
              <span>All-India Healthcare Network Radar (OSM Live GIS)</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              Nearby Clinics, Hospitals & Medicine Stores
            </h1>
            <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
              <MapPin className="h-3.5 w-3.5 text-teal-600 shrink-0" />
              <span>
                Active Location:{' '}
                <b className="text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md font-bold">
                  {locationName}
                </b>
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-teal-700 font-semibold">
                {isLoadingFacilities ? 'Updating live facilities...' : `${filteredFacilities.length} facilities verified`}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleEmergency}
              className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold shadow-sm transition ${
                emergencyOnly
                  ? 'bg-rose-600 text-white shadow-rose-700/20'
                  : 'bg-white border border-rose-200 text-rose-700 hover:bg-rose-50'
              }`}
            >
              <Zap className="h-4 w-4" />
              <span>{emergencyOnly ? '✓ 24x7 Emergency Active' : '🚨 24x7 Emergency Only'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPermissionsModal(true)}
              className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              title="Review App Device Permissions"
            >
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              <span className="hidden sm:inline">Permissions</span>
            </button>
          </div>
        </div>

        {/* 🗺️ UNIVERSAL INDIA LOCATION SEARCH BAR */}
        <div className="mt-6 rounded-2xl border-2 border-teal-300 bg-gradient-to-r from-teal-50/70 via-emerald-50/40 to-white p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="flex items-center gap-1.5 text-xs font-extrabold text-teal-900">
              <Compass className="h-4 w-4 text-teal-700" />
              <span>Search ANY City, Town, Village, Pincode or Landmark Across India:</span>
            </span>
            <span className="text-[11px] text-teal-700 font-medium hidden sm:inline">
              Real OpenStreetMap & Overpass Health Data
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSearchLocation()
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <div className="relative flex-1">
              <Crosshair className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-700" />
              <input
                type="text"
                value={locationSearchInput}
                onChange={(e) => setLocationSearchInput(e.target.value)}
                placeholder="Enter any location (e.g. Cuttack, Patia, AIIMS Delhi, Puri, Patna, Mumbai, 751024)..."
                className="w-full rounded-xl border border-teal-200 bg-white pl-10 pr-4 py-2.5 text-xs font-medium text-slate-900 placeholder-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition shadow-inner"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSearchingLocation}
                className="flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800 disabled:opacity-50 active:scale-95"
              >
                {isSearchingLocation ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    <span>Locate Place</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleUseCurrentGPS}
                disabled={isSearchingLocation}
                className="flex items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-3.5 py-2.5 text-xs font-bold text-teal-800 shadow-xs hover:bg-teal-100 transition whitespace-nowrap active:scale-95"
                title="Use live GPS location"
              >
                <LocateFixed className="h-4 w-4 text-teal-700" />
                <span className="hidden sm:inline">Use Live GPS</span>
              </button>
            </div>
          </form>

          {/* Quick Location Preset Pills */}
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
            <span className="text-slate-500 font-semibold shrink-0">India Quick Jumps:</span>
            {POPULAR_INDIAN_LOCATIONS.map((loc) => (
              <button
                key={loc.name}
                type="button"
                onClick={() => {
                  setLocationSearchInput(loc.name)
                  void handleSearchLocation(loc.name)
                }}
                className="rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1 font-semibold text-slate-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-900 transition whitespace-nowrap shrink-0 shadow-2xs"
              >
                📍 {loc.name}
              </button>
            ))}
          </div>

          {searchFeedback && (
            <div className="mt-2 text-xs font-bold text-teal-800 animate-fadeIn flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-teal-600" />
              <span>{searchFeedback}</span>
            </div>
          )}
        </div>

        {/* Category Filter Chips & Keywords Search */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by facility name, medicine (Paracetamol, Insulin, ORS, ASV), or service (ICU, OPD, Casualty)..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none transition"
            />
          </div>

          {/* Core Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleCategoryChange('ALL')}
              className={`rounded-xl px-3 py-2 whitespace-nowrap transition ${
                categoryFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              All Healthcare ({facilities.length})
            </button>

            <button
              type="button"
              onClick={() => handleCategoryChange('HOSPITAL')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 whitespace-nowrap transition ${
                categoryFilter === 'HOSPITAL'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white border border-rose-200 text-rose-800 hover:bg-rose-50'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Hospitals (Multi-Speciality)</span>
            </button>

            <button
              type="button"
              onClick={() => handleCategoryChange('CLINIC')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 whitespace-nowrap transition ${
                categoryFilter === 'CLINIC'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-white border border-purple-200 text-purple-800 hover:bg-purple-50'
              }`}
            >
              <Stethoscope className="h-3.5 w-3.5" />
              <span>Clinics & Doctors (PHC/CHC)</span>
            </button>

            <button
              type="button"
              onClick={() => handleCategoryChange('PHARMACY')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 whitespace-nowrap transition ${
                categoryFilter === 'PHARMACY'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50'
              }`}
            >
              <Pill className="h-3.5 w-3.5" />
              <span>Medicine Stores & Jan Aushadhi</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Facility Cards List (42%) + Right Interactive Leaflet Map (58%) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* LEFT COLUMN: Verified Healthcare Facilities Cards */}
        <div className="space-y-3 lg:col-span-5 max-h-[740px] overflow-y-auto pr-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
            <span>
              Real Healthcare Facilities Near {locationName.split(',')[0]} ({filteredFacilities.length})
            </span>
            <span>Sorted by Live Proximity</span>
          </div>

          {isLoadingFacilities ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500 space-y-3">
              <Loader2 className="mx-auto h-8 w-8 text-teal-600 animate-spin" />
              <p className="text-xs font-bold text-slate-700">Connecting to live OpenStreetMap GIS database...</p>
              <p className="text-[11px] text-slate-400">Locating hospitals, clinics & medicine stores across {locationName}</p>
            </div>
          ) : filteredFacilities.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              <Info className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold">No facilities found for this filter</p>
              <p className="text-xs text-slate-400">Try clearing the search box or selecting "All Healthcare".</p>
            </div>
          ) : (
            filteredFacilities.map((facility) => {
              const isSelected = selectedFacility?.id === facility.id
              const isHospital = facility.category === 'HOSPITAL'
              const isClinic = facility.category === 'CLINIC'
              const isPharmacy = facility.category === 'PHARMACY'

              return (
                <div
                  key={facility.id}
                  onClick={() => handleSelectFacility(facility)}
                  className={`cursor-pointer rounded-3xl border p-5 transition-all shadow-xs ${
                    isSelected
                      ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {/* Facility Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                            isHospital
                              ? 'bg-rose-100 text-rose-800'
                              : isClinic
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {facility.category === 'HOSPITAL'
                            ? '🏥 ' + facility.typeTag
                            : facility.category === 'CLINIC'
                            ? '🩺 ' + facility.typeTag
                            : '💊 ' + facility.typeTag}
                        </span>

                        {facility.isOpen24x7 && (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-bold text-white animate-pulse">
                            24/7 OPEN
                          </span>
                        )}

                        {facility.hasColdChain && isPharmacy && (
                          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[9px] font-bold text-cyan-800">
                            ❄️ Cold Chain (Insulin/Vaccines)
                          </span>
                        )}
                      </div>

                      <h3 className="mt-1.5 text-sm font-extrabold text-slate-900 leading-snug">
                        {facility.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{facility.address}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="inline-flex items-center gap-1 font-extrabold text-teal-800 text-xs bg-teal-100/70 px-2 py-0.5 rounded-lg">
                        <Navigation className="h-3 w-3 text-teal-700" />
                        <span>{facility.distanceKm} km</span>
                      </div>
                      <span className="block text-[10px] text-slate-400 mt-0.5 font-medium">
                        ~{facility.etaMins} mins
                      </span>
                    </div>
                  </div>

                  {/* Highlights / Services / Meds */}
                  <div className="mt-3 rounded-2xl bg-slate-50/90 p-3 border border-slate-100 text-[11px]">
                    <span className="font-bold text-slate-700 block mb-1">
                      {isHospital
                        ? 'Emergency & Hospital Facilities:'
                        : isClinic
                        ? 'Clinical Consultation & OPD Services:'
                        : 'Available Medicines & Generic Discount:'}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {facility.stockHighlights.slice(0, 4).map((h, i) => (
                        <span
                          key={i}
                          className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-slate-700 font-medium text-[10px]"
                        >
                          ✓ {h}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Card Actions Footer: REAL PHONE NUMBER & Turn-by-Turn Navigation */}
                  <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>{facility.openingHours}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* REAL WORKING PHONE NUMBER CALL BUTTON */}
                      <a
                        href={`tel:${facility.phone.replace(/[\s-]+/g, '')}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 rounded-xl border border-teal-300 bg-white px-2.5 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50 transition shadow-2xs active:scale-95"
                        title={`Call ${facility.name} (${facility.phone})`}
                      >
                        <Phone className="h-3.5 w-3.5 text-teal-600" />
                        <span>Call: {facility.phone}</span>
                      </a>

                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-teal-800 transition active:scale-95"
                      >
                        <span>Navigate</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* RIGHT COLUMN: Leaflet Interactive Map Container */}
        <div className="space-y-4 lg:col-span-7 sticky top-20">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-md">
            {/* Top Interactive Map Hint Badge */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-xl bg-slate-900/80 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md backdrop-blur-md">
              <Compass className="h-3.5 w-3.5 text-teal-300 animate-spin" />
              <span>Click anywhere on the map across India to discover nearby facilities!</span>
            </div>

            {/* Map Canvas */}
            <div
              ref={mapContainerRef}
              className="h-[540px] w-full z-0 cursor-crosshair"
              style={{ minHeight: '500px' }}
            />

            {/* Floating Map Legend Overlay */}
            <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-md backdrop-blur-md border border-slate-200">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
                🏥 Hospital (24/7)
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />
                🩺 Clinic / PHC / CHC
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                💊 Medicine Store / Jan Aushadhi
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-700" />
                📍 Search Point
              </span>
            </div>
          </div>

          {/* Selected Facility Detailed Highlight Preview Box */}
          {selectedFacility && (
            <div className="rounded-3xl border border-teal-200 bg-gradient-to-r from-teal-50/90 via-emerald-50/50 to-white p-5 shadow-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-teal-700 px-2.5 py-0.5 text-[10px] font-bold text-white">
                      Selected Facility
                    </span>
                    <span className="font-semibold text-xs text-slate-600">
                      {selectedFacility.categoryLabel}
                    </span>
                    {selectedFacility.isOpen24x7 && (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-bold text-white">
                        24x7 Emergency
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 text-base font-black text-slate-900">
                    {selectedFacility.name}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">{selectedFacility.address}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* REAL DIRECT PHONE CALL */}
                  <a
                    href={`tel:${selectedFacility.phone.replace(/[\s-]+/g, '')}`}
                    className="flex items-center gap-1.5 rounded-2xl border border-teal-300 bg-white px-4 py-2.5 text-xs font-bold text-teal-800 shadow-xs hover:bg-teal-50 transition"
                  >
                    <Phone className="h-4 w-4 text-teal-700" />
                    <span>Call: {selectedFacility.phone}</span>
                  </a>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedFacility.lat},${selectedFacility.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-2xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-teal-800 transition"
                  >
                    <Navigation className="h-4 w-4" />
                    <span>Turn-by-Turn GPS</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Permissions Modal */}
      <AppPermissionsModal
        isOpen={showPermissionsModal}
        onClose={() => setShowPermissionsModal(false)}
        onComplete={(res) => {
          setLocationPermission(res.location)
          if (res.coords) {
            setUserLocation(res.coords)
            setLocationName('Your Live GPS Coordinates')
            void loadFacilities({ lat: res.coords[0], lng: res.coords[1] })
          }
        }}
      />
    </div>
  )
}
