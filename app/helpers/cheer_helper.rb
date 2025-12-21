module CheerHelper
  FALLBACK_LOCATIONS = [
    "Rudolph's favorite city",
    "the North Pole",
    "a cozy winter wonderland",
    "where the menorah glows",
    "a place filled with light",
    "the land of eight nights",
    "where kinara candles shine",
    "a community of unity",
    "where gifts are shared",
    "a festive gathering place",
    "the workshop of joy",
    "where snowflakes dance",
    "a magical winter realm",
    "where traditions unite",
    "the home of celebration",
    "a place of togetherness",
    "where spirits are bright",
    "the heart of the season",
    "a corner of cheer",
    "where memories are made",
    "the source of warmth",
    "a haven of happiness",
    "where laughter echoes",
    "the realm of merriment",
    "a spot of pure joy",
    "where candles flicker",
    "the land of giving",
    "where families gather",
    "the home of hope",
    "a sanctuary of smiles",
    "where dreams take flight",
    "the cradle of cheer",
    "a beacon of light",
    "where songs are sung",
    "the garden of goodwill",
    "where gratitude flows",
    "the wellspring of wonder",
    "a haven of harmony",
    "where stories are told",
    "the nest of nostalgia",
    "the forge of friendship",
    "where hearts connect in celebration",
    "where heritage honors the season",
    "a realm of festive renewal",
    "where the spirit of giving thrives",
    "a corner of cozy celebration",
    "where traditions light the path",
    "the home of holiday happiness",
    "where the magic never fades",
    "a place where cheer multiplies"
  ].freeze

  LOCATION_SUFFIXES = [
    "one of Rudolph's favorite places",
    "where the yuletide is gay",
    "where the menorah glows bright",
    "where kinara candles light the way",
    "a beacon of holiday cheer",
    "where traditions come alive",
    "a place of festive wonder",
    "where the season shines",
    "one of Santa's favorite stops",
    "where eight nights of light begin",
    "a community of celebration",
    "where unity and joy meet",
    "a haven of winter warmth",
    "where snowflakes tell stories",
    "the heart of holiday magic",
    "where gifts of love are shared",
    "a corner of pure merriment",
    "where families gather in light",
    "a sanctuary of seasonal joy",
    "where candles dance in windows",
    "the home of timeless traditions",
    "where heritage and hope unite",
    "a realm of cultural celebration",
    "where songs of joy are sung",
    "the garden of goodwill",
    "where dreams of peace take flight",
    "a place where spirits brighten",
    "where laughter fills the air",
    "the forge of festive friendship",
    "where memories are made bright",
    "a beacon of togetherness",
    "where the season's magic lives",
    "a haven of holiday harmony",
    "where gratitude flows freely",
    "the wellspring of winter wonder",
    "where hearts connect in celebration",
    "a place of reflection and light",
    "where bonds of joy are strengthened",
    "the crossroads of cultural cheer",
    "where heritage honors the season",
    "a realm of renewal and hope",
    "where the spirit of giving thrives",
    "a corner of cozy celebration",
    "where traditions light the path",
    "the home of holiday happiness",
    "where the magic never fades",
    "a place where cheer multiplies",
    "where the season's essence glows",
    "the heart of festive fellowship",
    "where winter wonder never ends"
  ].freeze

  def random_fallback_location
    FALLBACK_LOCATIONS.sample
  end

  def format_location(city, country, cheer_id = nil)
    location_text = [city, country].compact.join(", ")

    if location_text.present?
      # Use cheer_id to add variety - each cheer gets a different suffix even for same location
      seed = if cheer_id
        cheer_id.is_a?(String) ? cheer_id.hash : cheer_id.to_i
      else
        location_text.hash
      end

      # Always add a suffix for variety - use cheer_id hash to pick different suffix for each cheer
      suffix_index = seed.abs % LOCATION_SUFFIXES.length
      "#{location_text}, #{LOCATION_SUFFIXES[suffix_index]}"
    else
      # For unknown locations, use cheer_id for deterministic selection
      # If no ID provided, fall back to a simple hash
      seed = if cheer_id
        # Convert to integer if it's a string, or use hash if it's a complex string
        cheer_id.is_a?(String) ? cheer_id.hash : cheer_id.to_i
      else
        Time.current.to_i
      end
      fallback_index = seed.abs % FALLBACK_LOCATIONS.length
      FALLBACK_LOCATIONS[fallback_index]
    end
  end
end
