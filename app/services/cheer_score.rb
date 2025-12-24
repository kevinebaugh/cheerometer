class CheerScore
  WINDOW = 10.seconds
  DECAY_HALF_LIFE = 2.seconds # Time for contribution to halve (faster decay = harder to reach 100)

  def self.current
    now = Time.current
    window_start = now - WINDOW

    # Get all recent smashes with their timestamps, IP addresses, and device identifiers
    recent_events = CheerEventStore.recent_since(window_start)
    recent_smashes = recent_events.map { |e|
      {
        time: Time.at(e["created_at"]),
        ip: e["ip_address"],
        device_id: e["device_id"] # Device identifier (IP + User-Agent hash)
      }
    }

    return 0 if recent_smashes.empty?

    # Count unique IPs for bonus weighting
    unique_ips = recent_smashes.map { |s| s[:ip] }.compact.uniq
    unique_ip_count = unique_ips.length

    # Count unique devices for additional bonus weighting
    unique_devices = recent_smashes.map { |s| s[:device_id] }.compact.uniq
    unique_device_count = unique_devices.length

    # Calculate weighted contribution of each smash based on time decay
    # Each smash contributes less as time passes (exponential decay)
    # Also apply bonus multiplier for unique IPs
    base_contribution = recent_smashes.sum do |smash|
      time_since = now - smash[:time]
      # Exponential decay: contribution = e^(-time_since / half_life * ln(2))
      # This makes contribution halve every DECAY_HALF_LIFE seconds
      decay_factor = Math.exp(-time_since / DECAY_HALF_LIFE * Math.log(2))
      decay_factor
    end

    # Apply bonus multiplier for unique IPs
    # More unique IPs = higher multiplier, encouraging distributed participation
    # Formula: 1.0 + (unique_ips - 1) * 0.2
    # 1 IP: 1.0x (no bonus)
    # 2 IPs: 1.2x (20% bonus)
    # 3 IPs: 1.4x (40% bonus)
    # 5 IPs: 1.8x (80% bonus)
    # 10 IPs: 2.8x (180% bonus)
    ip_bonus_multiplier = 1.0 + [(unique_ip_count - 1) * 0.2, 2.0].min # Cap at 3.0x (10+ IPs)

    # Apply additional bonus multiplier for unique devices
    # Different devices (even from same IP) get bonus
    # Formula: 1.0 + (unique_devices - 1) * 0.15
    # 1 device: 1.0x (no bonus)
    # 2 devices: 1.15x (15% bonus)
    # 3 devices: 1.3x (30% bonus)
    # 5 devices: 1.6x (60% bonus)
    # 10 devices: 2.35x (135% bonus)
    device_bonus_multiplier = 1.0 + [(unique_device_count - 1) * 0.15, 1.5].min # Cap at 2.5x (10+ devices)

    # Combine both bonuses
    total_contribution = base_contribution * ip_bonus_multiplier * device_bonus_multiplier

    # Apply logarithmic scaling with steeper curve
    # Using a higher log base for more aggressive scaling
    # log_base(contribution + 1) scaled to 0-100
    log_contribution = Math.log10(total_contribution + 1)

    # Scale to 0-100 using logarithmic curve
    # Much easier to reach 100 now
    max_expected_contribution = 200.0 # Even lower threshold - makes 100 much easier to reach
    max_log = Math.log10(max_expected_contribution + 1)

    # Apply logarithmic scaling - this makes it exponentially harder as you go up
    score = (log_contribution / max_log * 100).round

    # Apply minimal penalties - make it much easier to get to 100
    if score > 98
      # Above 98, moderate difficulty - 40% of excess counts (was 20%)
      excess = score - 98
      score = 98 + (excess * 0.4).round
    elsif score > 95
      # Above 95, easier - 60% of excess counts (was 40%)
      excess = score - 95
      score = 95 + (excess * 0.6).round
    elsif score > 80
      # Above 80, very easy - 80% of excess counts (was 60%)
      excess = score - 80
      score = 80 + (excess * 0.8).round
    end
    # No penalty below 80 - makes it easier to get to 55-56

    score.clamp(0, 100)
  end
end
