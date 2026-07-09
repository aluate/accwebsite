// Minimal Google Maps Places type declarations for IntakeForm autocomplete.
// Full types available via @types/google.maps if needed later.

interface Window {
  google?: {
    maps?: {
      places?: {
        Autocomplete: new (
          input: HTMLInputElement,
          opts?: {
            types?: string[];
            componentRestrictions?: { country: string | string[] };
            fields?: string[];
          }
        ) => {
          addListener: (event: string, handler: () => void) => void;
          getPlace: () => {
            formatted_address?: string;
            address_components?: Array<{ types: string[]; long_name: string; short_name: string }>;
          };
        };
      };
    };
  };
  __initGooglePlaces?: () => void;
}
