class CheerScore
  # Time constants
  DECAY_WINDOW = 45.seconds      # Events older than this contribute 0
  LOOKBACK_WINDOW = 50.seconds    # How far back to look for events
  RECENT_THRESHOLD = 10.seconds   # Recent activity threshold for score increases

  # Scoring constants
  BASE_SCORE_MULTIPLIER = 1.2     # Multiplier for base score (0-95 range)
  TWO_DEVICE_MULTIPLIER = 0.4     # Multiplier for 2-device bonus (95-100 range) - harder
  THREE_PLUS_DEVICE_MULTIPLIER = 0.8  # Multiplier for 3+ device bonus (95-100 range) - easier
  DECAY_HALF_LIFE = 20.0          # Half-life in seconds for exponential decay
  SINGLE_DEVICE_CAP = 95           # Maximum score for single device
  MAX_SCORE = 100                  # Maximum possible score
  MIN_SCORE_THRESHOLD = 1          # Minimum score to display (below this = 0)

  def self.current
    now = Time.current
    window_start = now - LOOKBACK_WINDOW

    # Fetch events from store
    events = CheerEventStore.recent_since(window_start)
    return 0 if events.empty?

    # Pre-process events: convert to time objects and filter by age
    # This avoids processing events that will contribute 0 anyway
    processed_events = events.filter_map do |event|
      event_time = Time.at(event["created_at"])
      age_seconds = now - event_time

      # Skip events older than decay window (they contribute 0)
      next if age_seconds > DECAY_WINDOW

      {
        time: event_time,
        age: age_seconds,
        device_id: event["device_id"]
      }
    end

    return 0 if processed_events.empty?

    # Calculate decay factors once for all events
    # Exponential decay: e^(-age/half_life)
    processed_events.each do |event|
      event[:decay_factor] = Math.exp(-event[:age] / DECAY_HALF_LIFE)
    end

    # Group by device for efficient multi-device calculation
    device_groups = processed_events.group_by { |e| e[:device_id] }
    unique_device_count = device_groups.length

    # Calculate base score (0-95 range) from all events
    total_weighted_contribution = processed_events.sum { |e| e[:decay_factor] }
    base_score = (total_weighted_contribution * BASE_SCORE_MULTIPLIER).floor.clamp(0, SINGLE_DEVICE_CAP)

    # Single device: hard cap at 95
    if unique_device_count == 1
      return finalize_score(base_score)
    end

    # Multiple devices: check for recent activity
    # Score can only increase/stay high if there's recent activity
    has_recent_activity = processed_events.any? { |e| e[:age] <= RECENT_THRESHOLD }

    # If no recent activity, only allow decay (return base score)
    unless has_recent_activity
      return finalize_score(base_score)
    end

    # Multiple devices with recent activity: calculate bonus for 95-100 range
    # Only count contributions from devices beyond the first one
    first_device_id = device_groups.keys.first
    multi_device_contribution = processed_events.sum do |event|
      # Only count events from devices other than the first
      event[:device_id] != first_device_id ? event[:decay_factor] : 0.0
    end

    # Use different multipliers based on device count
    # 2 devices: harder (lower multiplier)
    # 3+ devices: easier (higher multiplier, like current 2-device experience)
    multiplier = unique_device_count >= 3 ? THREE_PLUS_DEVICE_MULTIPLIER : TWO_DEVICE_MULTIPLIER

    # Convert multi-device contribution to bonus points (0-5 range)
    bonus_points = (multi_device_contribution * multiplier).floor.clamp(0, MAX_SCORE - SINGLE_DEVICE_CAP)

    # Final score: base (capped at 95) + bonus (0-5)
    score = base_score.clamp(0, SINGLE_DEVICE_CAP) + bonus_points

    finalize_score(score)
  end

  private

  def self.finalize_score(score)
    # Clamp to valid range
    score = score.clamp(0, MAX_SCORE)

    # Hide scores below threshold (only show meaningful activity)
    score = 0 if score < MIN_SCORE_THRESHOLD

    score
  end
end
