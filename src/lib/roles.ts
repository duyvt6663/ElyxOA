/**
 * DECISION RECAP — 002 Define JSON Data Model
 * - Rich role vocabulary RESOLVED (chosen over lean): 15 equipment / 7 specialist / 7 allied-health.
 * - Canonical names include `stationary-bike` (not spin-bike) and `squat-rack` (not strength-rig).
 * - ResourceRequirement matches by (kind, role); these arrays are the source of truth for role strings.
 */

/**
 * PSEUDO-ALGORITHM
 * N/A — pure constant declarations + derived union types.
 */

export const EQUIPMENT_ROLES = [
  'treadmill',
  'rower',
  'stationary-bike',
  'squat-rack',
  'dumbbells',
  'kettlebell',
  'cable-machine',
  'sauna',
  'ice-bath',
  'pool',
  'yoga-mat',
  'foam-roller',
  'bp-cuff',
  'glucose-monitor',
  'pulse-oximeter',
] as const;

export const SPECIALIST_ROLES = [
  'physician',
  'cardiologist',
  'endocrinologist',
  'sleep-physician',
  'dermatologist',
  'psychiatrist',
  'phlebotomist',
] as const;

export const ALLIED_HEALTH_ROLES = [
  'physiotherapist',
  'occupational-therapist',
  'dietitian',
  'speech-therapist',
  'massage-therapist',
  'personal-trainer',
  'health-coach',
] as const;

export type EquipmentRole = (typeof EQUIPMENT_ROLES)[number];
export type SpecialistRole = (typeof SPECIALIST_ROLES)[number];
export type AlliedHealthRole = (typeof ALLIED_HEALTH_ROLES)[number];
