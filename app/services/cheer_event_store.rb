require "securerandom"

class CheerEventStore
  CACHE_KEY = "cheer_events"
  MAX_EVENTS = 1000 # Keep last 1000 events to avoid memory issues

  def self.create(ip_address:, country: nil, city: nil)
    now = Time.current
    event_id = "#{now.to_f}-#{SecureRandom.hex(4)}"

    event_data = {
      "id" => event_id,
      "ip_address" => ip_address,
      "country" => country,
      "city" => city,
      "created_at" => now.to_f
    }

    # Get existing events, add new one, and save back
    events = Rails.cache.fetch(CACHE_KEY) { [] }
    events << event_data

    # Keep only the most recent MAX_EVENTS
    events = events.last(MAX_EVENTS) if events.length > MAX_EVENTS

    # Store back in cache (no expiration - we manage cleanup ourselves)
    Rails.cache.write(CACHE_KEY, events)

    event_data
  end

  def self.recent(limit: 5)
    events = Rails.cache.fetch(CACHE_KEY) { [] }
    # Return most recent events (they're already in chronological order)
    events.last(limit).reverse
  end

  def self.recent_since(time)
    events = Rails.cache.fetch(CACHE_KEY) { [] }
    # Filter events since the given time
    events.select { |e| e["created_at"] >= time.to_f }
  end

  def self.count_since(time)
    recent_since(time).count
  end
end
