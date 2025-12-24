class CheerController < ApplicationController
  protect_from_forgery with: :null_session

  def index
    @score = CheerScore.current
    @recent_cheers_data = CheerEventStore.recent(limit: 5) || []
  end

  def create
    # Get IP address
    ip = request.headers["X-Forwarded-For"]&.split(",")&.first&.strip ||
         request.headers["X-Real-IP"] ||
         request.remote_ip

    # Generate device ID
    user_agent = request.headers["User-Agent"] || ""
    device_id = Digest::MD5.hexdigest("#{ip}-#{user_agent}")

    # Parse location data from request body if present
    location_data = nil
    if request.content_type&.include?("application/json") && request.body.present?
      begin
        location_data = JSON.parse(request.body.read)
      rescue JSON::ParserError
        # Ignore JSON parse errors
      end
    end

    # Store cheer event IMMEDIATELY without location (for instant score update)
    cheer_event = CheerEventStore.create(
      ip_address: ip,
      country: nil,  # Will be filled asynchronously
      city: nil,     # Will be filled asynchronously
      device_id: device_id
    )

    # Calculate score and get recent cheers IMMEDIATELY
    score = CheerScore.current
    recent_cheers_raw = CheerEventStore.recent(limit: 5)

    # Format locations for broadcast (may be nil for new event, that's OK)
    recent_cheers = format_recent_cheers(recent_cheers_raw)

    # Broadcast IMMEDIATELY with score (location will come later)
    ActionCable.server.broadcast("cheerometer", {
      score: score,
      recent_cheers: recent_cheers
    })

    # Do ALL geocoding asynchronously (doesn't block response)
    perform_geocoding_async(cheer_event["id"], ip, location_data)

    head :ok
  end

  def meter
    @score = CheerScore.current
    @recent_cheers_data = CheerEventStore.recent(limit: 5) || []

    respond_to do |format|
      format.json do
        recent_cheers = format_recent_cheers(@recent_cheers_data)
        render json: { score: @score, recent_cheers: recent_cheers }
      end
    end
  end

  private

  def format_recent_cheers(cheers)
    helper = Object.new.extend(CheerHelper)
    cheers.map do |cheer|
      cheer_id = cheer["id"] || cheer["created_at"]
      cheer_city = cheer["city"]
      cheer_country = cheer["country"]
      formatted = helper.format_location(cheer_city, cheer_country, cheer_id)
      { formatted_location: formatted }
    end
  end

  def perform_geocoding_async(event_id, ip, location_data)
    Thread.new(event_id, ip, location_data) do |thread_event_id, thread_ip, thread_location_data|
      begin
        Rails.logger.info "🌍 [SERVER] Starting background geocoding for event: #{thread_event_id}"
        country = nil
        city = nil

        # Try reverse geocoding first if we have coordinates
        if thread_location_data && thread_location_data["latitude"] && thread_location_data["longitude"]
          begin
            location = Geocoder.search([thread_location_data["latitude"], thread_location_data["longitude"]]).first
            country = location&.country
            city = location&.city
            Rails.logger.info "🌍 [SERVER] Reverse geocoding: city=#{city.inspect}, country=#{country.inspect}"
          rescue => e
            Rails.logger.warn "⚠️ [SERVER] Reverse geocoding error: #{e.class} - #{e.message}"
          end
        end

        # Fallback to IP geocoding
        if country.nil? && city.nil?
          begin
            location = Geocoder.search(thread_ip).first
            country = location&.country
            city = location&.city
            Rails.logger.info "🌍 [SERVER] IP geocoding: city=#{city.inspect}, country=#{country.inspect}"
          rescue => e
            Rails.logger.warn "⚠️ [SERVER] IP geocoding error: #{e.class} - #{e.message}"
          end
        end

        # Update event with location if we got it
        if (country || city) && CheerEventStore.update_location(thread_event_id, country: country, city: city)
          Rails.logger.info "✅ [SERVER] Location updated: city=#{city.inspect}, country=#{country.inspect}"

          # Broadcast updated location
          updated_score = CheerScore.current
          helper = Object.new.extend(CheerHelper)
          updated_recent_cheers = CheerEventStore.recent(limit: 5).map do |cheer|
            cheer_id = cheer["id"] || cheer["created_at"]
            cheer_city = cheer["city"]
            cheer_country = cheer["country"]
            formatted = helper.format_location(cheer_city, cheer_country, cheer_id)
            { formatted_location: formatted }
          end

          ActionCable.server.broadcast("cheerometer", {
            score: updated_score,
            recent_cheers: updated_recent_cheers
          })
          Rails.logger.info "✅ [SERVER] Location update broadcast sent"
        end
      rescue => e
        Rails.logger.error "❌ [SERVER] Background geocoding error: #{e.class} - #{e.message}"
        Rails.logger.error e.backtrace.first(10).join("\n")
      end
    end
  end
end
