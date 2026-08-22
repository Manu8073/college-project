/**
 * NETRA — Navigation Service (PLACEHOLDER)
 * ─────────────────────────────────────────────────────────────
 * OWNER: Member 2
 *
 * Future responsibilities:
 *  - Accept a destination string from the user
 *  - Use the Google Maps Directions API (VITE_GOOGLE_MAPS_API_KEY)
 *  - Return structured turn-by-turn instructions
 *  - Integrate with useLocation() for real-time position
 *
 * Current state:
 *  - Returns a hardcoded dummy navigation instruction
 *  - The Google Maps API key is NOT required to run the scaffold
 *
 * TODO (Member 2):
 *  1. npm install @googlemaps/js-api-loader
 *  2. Load the Maps JS API with VITE_GOOGLE_MAPS_API_KEY
 *  3. Replace getNextInstruction() with real Directions API calls
 */

/**
 * @typedef {object} NavigationInstruction
 * @property {string} instruction — human-readable turn instruction
 * @property {string} distance    — e.g. "50m"
 * @property {string} heading     — cardinal direction, e.g. "NE"
 */

const DUMMY_INSTRUCTIONS = [
  { instruction: 'Turn right in 50 meters',      distance: '50m',  heading: 'NE' },
  { instruction: 'Continue straight for 200 meters', distance: '200m', heading: 'N'  },
  { instruction: 'Turn left at the intersection', distance: '30m',  heading: 'W'  },
  { instruction: 'You have reached your destination', distance: '0m', heading: 'N'  },
];

/**
 * Simulates fetching the next navigation instruction.
 * @returns {Promise<NavigationInstruction>}
 */
export async function getNextInstruction(/* destination, currentPosition */) {
  await new Promise(resolve => setTimeout(resolve, 200));
  return DUMMY_INSTRUCTIONS[Math.floor(Math.random() * DUMMY_INSTRUCTIONS.length)];
}

/**
 * Returns a readable string from a NavigationInstruction.
 * @param {NavigationInstruction} instruction
 * @returns {string}
 */
export function describeInstruction(instruction) {
  return `${instruction.instruction}. In ${instruction.distance}.`;
}

/**
 * Checks if the Google Maps API key is configured.
 * Member 2 can use this guard before loading the map.
 * @returns {boolean}
 */
export function isGoogleMapsConfigured() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return !!(key && key.trim().length > 0);
}
