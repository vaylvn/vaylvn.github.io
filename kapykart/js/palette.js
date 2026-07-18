// Central color budget. Retuning the look later is a one-file change.

// Same curated hue set used across the site's Twitch chat games (see zombie/js/palette.js).
export const KART_PALETTE = [
  '#E63946', '#F1A208', '#FFD23F', '#06D6A0', '#118AB2',
  '#4361EE', '#7209B7', '#F72585', '#4CC9F0', '#FF7B00',
];

export const CAPYBARA_COLOR = '#B08968';
export const CAPYBARA_EAR_COLOR = '#8C6845';
export const STROKE_COLOR = '#0A0A0A';

// Shows wherever the floor canvas has no track content drawn - either the
// custom track image ran out, or (for the built-in track) it's literally
// the grass background. A placeholder for a real repeating ground texture
// later - sampled directly from assets/track1.png's own grass corners
// (~#357607-#448107 across several samples) so the "ran out of unique
// track art" edge reads as more grass continuing, not a wall.
export const GROUND_COLOR = '#3b7a08';
export const ROAD_COLOR = '#3A3A3A';
export const ROAD_EDGE_COLOR = 'rgba(242,242,242,0.5)';
export const CHECKER_A = '#F2F2F2';
export const CHECKER_B = '#141414';
export const BOOST_COLOR = '#06D6A0';
export const HAZARD_COLOR = '#F1C40F';
export const ACCENT_COLOR = '#06D6A0';
