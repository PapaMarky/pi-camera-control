/**
 * Camera Settings Utilities
 * Utilities for processing camera settings data
 */

/**
 * Strip ability fields from camera settings, keeping only values
 * @param {Object} settings - Full camera settings object
 * @returns {Object} Settings with only value fields
 */
export function stripAbilityFields(settings) {
  if (!settings || typeof settings !== "object") {
    return null;
  }

  const stripped = {};

  for (const [key, data] of Object.entries(settings)) {
    if (data && typeof data === "object") {
      // Check if this is a setting object with value/ability structure
      if (data.hasOwnProperty("value")) {
        // Keep only the value, discard ability
        stripped[key] = { value: data.value };
      } else {
        // For nested objects without value field, recurse
        // (e.g., picturestyle objects with multiple nested fields)
        const nested = {};
        let hasNonAbility = false;

        for (const [nestedKey, nestedData] of Object.entries(data)) {
          if (nestedKey !== "ability") {
            nested[nestedKey] = nestedData;
            hasNonAbility = true;
          }
        }

        if (hasNonAbility) {
          stripped[key] = nested;
        }
      }
    } else {
      // Primitive value, keep as is
      stripped[key] = data;
    }
  }

  return stripped;
}
