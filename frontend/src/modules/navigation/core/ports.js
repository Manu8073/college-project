/**
 * Core domain contracts and types for Netra Navigation.
 * (Converted from TypeScript interfaces to JSDoc definitions)
 */

/**
 * @typedef {Object} LatLng
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} GeoFix
 * @property {number} lat
 * @property {number} lng
 * @property {number} accuracyM
 * @property {number | null} headingDeg
 * @property {number | null} speedMps
 * @property {number} timestamp
 */

/**
 * @typedef {Object} Destination
 * @property {string} name
 * @property {string} address
 * @property {LatLng} location
 */

/**
 * @typedef {Object} RouteStep
 * @property {string} instruction
 * @property {string} maneuver
 * @property {number} distanceM
 * @property {number} durationS
 * @property {LatLng} start
 * @property {LatLng} end
 * @property {LatLng[]} path
 */

/**
 * @typedef {Object} Route
 * @property {number} distanceM
 * @property {number} durationS
 * @property {RouteStep[]} steps
 * @property {LatLng[]} path
 */

/**
 * @typedef {Object} Detection
 * @property {string} label
 * @property {number} score
 * @property {{ x: number, y: number, w: number, h: number }} box
 */

/**
 * @typedef {'vehicle' | 'person' | 'obstacle' | 'traffic-light'} HazardKind
 */

/**
 * @typedef {Object} Hazard
 * @property {HazardKind} kind
 * @property {string} label
 * @property {'left' | 'ahead' | 'right'} direction
 * @property {'far' | 'near' | 'close'} proximity
 * @property {boolean} approaching
 * @property {number} score
 */

/**
 * @typedef {'signal' | 'zebra' | 'marked' | 'unmarked'} CrossingKind
 */

/**
 * @typedef {Object} Crossing
 * @property {LatLng} location
 * @property {CrossingKind} kind
 */

export const HAZARD_KINDS = ['vehicle', 'person', 'obstacle', 'traffic-light'];
export const CROSSING_KINDS = ['signal', 'zebra', 'marked', 'unmarked'];
