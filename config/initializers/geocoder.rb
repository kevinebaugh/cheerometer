Geocoder.configure(
  # Use ipinfo_io for IP lookups
  ip_lookup: :ipinfo_io,
   # Use free Nominatim (OpenStreetMap) for reverse geocoding (coordinates to address)
  # Geocoder will automatically use this when you pass coordinates
  lookup: :nominatim,
  timeout: 5,
  # Nominatim is free, no API key needed, but has rate limits
  # For production, consider using a different service or adding a user agent
  http_headers: {
    "User-Agent" => "Cheerometer App"
  }
)
