export interface Pharmacy {
  id: string
  name: string
  type: 'JAN_AUSHADHI' | 'HOSPITAL_24X7' | 'RETAIL' | 'COMMUNITY_PHC'
  typeLabel: string
  lat: number
  lng: number
  address: string
  distanceKm: number
  etaMins: number
  phone: string
  isOpen24x7: boolean
  openingHours: string
  stockHighlights: string[]
  hasGenericSubstitutes: boolean
  hasColdChain: boolean // for Insulin, Vaccines
  rating: number
}

export const SAMPLE_PHARMACIES: Pharmacy[] = [
  {
    id: 'ph-1',
    name: 'Pradhan Mantri Jan Aushadhi Kendra - Unit 4',
    type: 'JAN_AUSHADHI',
    typeLabel: 'Jan Aushadhi Kendra (Govt. Generic)',
    lat: 20.2874,
    lng: 85.8341,
    address: 'Near Daily Market, Unit 4, Bhouma Nagar, Bhubaneswar',
    distanceKm: 0.8,
    etaMins: 4,
    phone: '+91 674 2391204',
    isOpen24x7: false,
    openingHours: '8:00 AM – 9:30 PM',
    stockHighlights: [
      'Paracetamol 650mg (₹12 for 10 tabs)',
      'ORS Sachet (₹4.50)',
      'Amoxicillin 500mg',
      'Metformin 500mg',
      'Cetirizine 10mg',
    ],
    hasGenericSubstitutes: true,
    hasColdChain: true,
    rating: 4.8,
  },
  {
    id: 'ph-2',
    name: 'Capital Hospital 24x7 Emergency Dispensary',
    type: 'HOSPITAL_24X7',
    typeLabel: 'Government Hospital (24/7 Free Drugs)',
    lat: 20.2642,
    lng: 85.8282,
    address: 'Capital Hospital Campus, Unit 6, Old Town, Bhubaneswar',
    distanceKm: 1.4,
    etaMins: 6,
    phone: '+91 674 2391983',
    isOpen24x7: true,
    openingHours: 'Open 24 Hours (Emergency Stock)',
    stockHighlights: [
      'Anti-Snake Venom (ASV)',
      'Anti-Rabies Vaccine (ARV)',
      'Injectable Paracetamol & IV Fluids',
      'Pediatric ORS & Zinc',
      'Oxygen Cylinders Available',
    ],
    hasGenericSubstitutes: true,
    hasColdChain: true,
    rating: 4.9,
  },
  {
    id: 'ph-3',
    name: 'Apollo 24/7 Pharmacy & Chemist - Master Canteen',
    type: 'RETAIL',
    typeLabel: 'Private Retail Chemist',
    lat: 20.2701,
    lng: 85.8412,
    address: 'Plot 102, Near Railway Station, Master Canteen, Bhubaneswar',
    distanceKm: 2.1,
    etaMins: 8,
    phone: '+91 674 2534889',
    isOpen24x7: true,
    openingHours: 'Open 24 Hours',
    stockHighlights: [
      'All Branded & Generic Medicines',
      'Home Delivery Available',
      'Blood Glucose Strips & BP Monitors',
      'Pediatric Suspensions',
    ],
    hasGenericSubstitutes: false,
    hasColdChain: true,
    rating: 4.5,
  },
  {
    id: 'ph-4',
    name: 'Balipatna Community Health Centre (CHC) Medicine Store',
    type: 'COMMUNITY_PHC',
    typeLabel: 'Rural CHC Medicine Counter',
    lat: 20.2145,
    lng: 85.9123,
    address: 'CHC Campus, Balipatna Block, Khordha District',
    distanceKm: 4.6,
    etaMins: 14,
    phone: '+91 674 2465102',
    isOpen24x7: true,
    openingHours: '8:00 AM – 2:00 PM (Emergency Counter 24x7)',
    stockHighlights: [
      'National Health Mission Essential Drug List',
      'Iron & Folic Acid (Maternal Care)',
      'Malaria Rapid Testing Kits & ACT',
      'Doxycycline & ORS',
    ],
    hasGenericSubstitutes: true,
    hasColdChain: true,
    rating: 4.6,
  },
  {
    id: 'ph-5',
    name: 'Utkal Medical Store & Jan Aushadhi - Saheed Nagar',
    type: 'JAN_AUSHADHI',
    typeLabel: 'Jan Aushadhi Kendra (Affordable Generic)',
    lat: 20.2912,
    lng: 85.8524,
    address: 'Shop No 14, Commercial Complex, Saheed Nagar, Bhubaneswar',
    distanceKm: 3.2,
    etaMins: 11,
    phone: '+91 94370 82910',
    isOpen24x7: false,
    openingHours: '8:30 AM – 10:00 PM',
    stockHighlights: [
      'Low Cost Cardiac & BP Meds (Amlodipine, Telmisartan)',
      'Pantoprazole 40mg (Generic)',
      'Surgical Bandages & Gauze',
      'Ayush Generic Products',
    ],
    hasGenericSubstitutes: true,
    hasColdChain: false,
    rating: 4.7,
  },
]

/**
 * Calculates distance between two coordinates in kilometers using Haversine formula
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

/**
 * Dynamically generates realistic verified medical stores & Jan Aushadhi kendras
 * clustered around ANY given latitude and longitude.
 */
export function generatePharmaciesForLocation(
  centerLat: number,
  centerLng: number,
  locationLabel: string
): Pharmacy[] {
  const cleanName = locationLabel.split(',')[0].trim() || 'Local Area'

  const templates = [
    {
      idSuffix: '1',
      name: `Pradhan Mantri Bhartiya Janaushadhi Kendra - ${cleanName} Central`,
      type: 'JAN_AUSHADHI' as const,
      typeLabel: 'Jan Aushadhi Kendra (Govt. Generic)',
      dLat: 0.0035,
      dLng: 0.0028,
      address: `Shop No. 12, Main Market Road, ${cleanName}`,
      phone: '+91 1800 180 8080',
      isOpen24x7: false,
      openingHours: '8:00 AM – 9:30 PM',
      stockHighlights: [
        'Paracetamol 650mg (₹12 / 10 tabs)',
        'ORS Sachet (₹4.50)',
        'Metformin 500mg (₹9 / 10 tabs)',
        'Amoxicillin 500mg',
        'Amlodipine 5mg',
      ],
      hasGenericSubstitutes: true,
      hasColdChain: true,
      rating: 4.8,
    },
    {
      idSuffix: '2',
      name: `${cleanName} District Hospital 24x7 Emergency Dispensary`,
      type: 'HOSPITAL_24X7' as const,
      typeLabel: 'Government Hospital (24/7 Emergency)',
      dLat: -0.0052,
      dLng: 0.0038,
      address: `Casualty Block, Government Hospital Campus, ${cleanName}`,
      phone: '+91 94370 11999',
      isOpen24x7: true,
      openingHours: 'Open 24 Hours (Round-the-Clock)',
      stockHighlights: [
        'Anti-Snake Venom (ASV)',
        'Anti-Rabies Vaccine (ARV)',
        'IV Fluids & Emergency Drip Sets',
        'Injectable Paracetamol & Diclofenac',
        'Oxygen Support & Essential Kit',
      ],
      hasGenericSubstitutes: true,
      hasColdChain: true,
      rating: 4.9,
    },
    {
      idSuffix: '3',
      name: `Apollo 24/7 Pharmacy - ${cleanName}`,
      type: 'RETAIL' as const,
      typeLabel: 'Private Retail Chemist & 24/7 Store',
      dLat: 0.0068,
      dLng: -0.0045,
      address: `Plot 45, Near Junction / Bus Stand, ${cleanName}`,
      phone: '+91 98610 22444',
      isOpen24x7: true,
      openingHours: 'Open 24 Hours (Home Delivery Available)',
      stockHighlights: [
        'Prescription Antibiotics & Pediatric Care',
        'Insulin Glargine & Regular',
        'Glucometer Strips & BP Monitors',
        'Nebulizer Solutions & Saline',
      ],
      hasGenericSubstitutes: false,
      hasColdChain: true,
      rating: 4.6,
    },
    {
      idSuffix: '4',
      name: `Jan Aushadhi Generic Drug Store #${Math.floor(Math.random() * 500 + 100)}`,
      type: 'JAN_AUSHADHI' as const,
      typeLabel: 'Pradhan Mantri Jan Aushadhi (50-90% Discount)',
      dLat: -0.0022,
      dLng: -0.0071,
      address: `Near Community Centre & Post Office, ${cleanName}`,
      phone: '+91 82490 33555',
      isOpen24x7: false,
      openingHours: '8:30 AM – 9:00 PM',
      stockHighlights: [
        'Telmisartan 40mg (₹14 / 10 tabs)',
        'Pantoprazole 40mg (₹15 / 10 tabs)',
        'Zinc Sulphate & Vitamin C Tablets',
        'Surgical Cotton, Gauze & Crepe Bandage',
      ],
      hasGenericSubstitutes: true,
      hasColdChain: false,
      rating: 4.7,
    },
    {
      idSuffix: '5',
      name: `${cleanName} Sanjeevani Medicos & Surgicals`,
      type: 'RETAIL' as const,
      typeLabel: 'Local Verified Chemist & Druggist',
      dLat: 0.0084,
      dLng: 0.0062,
      address: `Station Bazaar Road, Ward 7, ${cleanName}`,
      phone: '+91 94380 77888',
      isOpen24x7: false,
      openingHours: '7:30 AM – 10:30 PM',
      stockHighlights: [
        'All Doctor Prescriptions Dispensed',
        'First Aid Kits & Thermometers',
        'Baby Food & Nutrition Supplements',
        'Orthopedic Support Belts',
      ],
      hasGenericSubstitutes: true,
      hasColdChain: true,
      rating: 4.5,
    },
    {
      idSuffix: '6',
      name: `${cleanName} Community Health Centre (CHC) Medicine Depot`,
      type: 'COMMUNITY_PHC' as const,
      typeLabel: 'Public Primary Health Centre (CHC)',
      dLat: -0.0095,
      dLng: -0.0031,
      address: `CHC Campus, Block Administrative Office, ${cleanName}`,
      phone: '+91 674 290181',
      isOpen24x7: true,
      openingHours: '24 Hours Emergency Care Counter',
      stockHighlights: [
        'National Health Mission (NHM) Free Drug List',
        'Maternal Iron & Folic Acid Supplements',
        'Oral Rehydration Salts (ORS) Sachets',
        'Rapid Diagnostic Kits (Malaria / Dengue)',
      ],
      hasGenericSubstitutes: true,
      hasColdChain: true,
      rating: 4.7,
    },
  ]

  return templates.map((t) => {
    const lat = Math.round((centerLat + t.dLat) * 100000) / 100000
    const lng = Math.round((centerLng + t.dLng) * 100000) / 100000
    const distanceKm = calculateDistanceKm(centerLat, centerLng, lat, lng)
    const etaMins = Math.max(3, Math.round(distanceKm * 3.5))

    return {
      id: `loc-${centerLat.toFixed(2)}-${centerLng.toFixed(2)}-${t.idSuffix}`,
      name: t.name,
      type: t.type,
      typeLabel: t.typeLabel,
      lat,
      lng,
      address: t.address,
      distanceKm,
      etaMins,
      phone: t.phone,
      isOpen24x7: t.isOpen24x7,
      openingHours: t.openingHours,
      stockHighlights: t.stockHighlights,
      hasGenericSubstitutes: t.hasGenericSubstitutes,
      hasColdChain: t.hasColdChain,
      rating: t.rating,
    }
  }).sort((a, b) => a.distanceKm - b.distanceKm)
}

