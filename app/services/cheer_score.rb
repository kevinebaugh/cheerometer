class CheerScore
  WINDOW = 10.seconds
  DECAY_HALF_LIFE = 3.seconds # Time for contribution to halve

  def self.current
    now = Time.current

    # Get all recent smashes with their timestamps
    recent_smashes = CheerEvent.where("created_at > ?", now - WINDOW)
                                .order(created_at: :desc)
                                .pluck(:created_at)

    return 0 if recent_smashes.empty?

    # Calculate weighted contribution of each smash based on time decay
    # Each smash contributes less as time passes (exponential decay)
    total_contribution = recent_smashes.sum do |smash_time|
      time_since = now - smash_time
      # Exponential decay: contribution = e^(-time_since / half_life * ln(2))
      # This makes contribution halve every DECAY_HALF_LIFE seconds
      decay_factor = Math.exp(-time_since / DECAY_HALF_LIFE * Math.log(2))
      decay_factor
    end

    # Apply logarithmic scaling
    # log_base(contribution + 1) scaled to 0-100
    # Using log base that gives us good range: log10 for smoother curve
    log_contribution = Math.log10(total_contribution + 1)

    # Scale to 0-100 using logarithmic curve
    # For reference: log10(1) = 0, log10(10) = 1, log10(100) = 2
    # We want to map this to 0-100, so we'll use a max expected contribution
    # If we expect max ~10 smashes in window, max contribution ~10, log10(11) ≈ 1.04
    # Scale factor to get to 100: 100 / log10(max_expected + 1)
    max_expected_contribution = 10.0 # Roughly 10 smashes if all happened at once
    max_log = Math.log10(max_expected_contribution + 1)
    score = (log_contribution / max_log * 100).round

    score.clamp(0, 100)
  end
end
