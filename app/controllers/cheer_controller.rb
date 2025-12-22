class CheerController < ApplicationController
  protect_from_forgery with: :null_session

  def index
  end

  def button
  end

  def create
    # Try to get the real IP address (Fly.io and other proxies set X-Forwarded-For)
    ip = request.headers["X-Forwarded-For"]&.split(",")&.first&.strip ||
         request.headers["X-Real-IP"] ||
         request.remote_ip

    country = nil
    city = nil
    location_source = nil
    debug_info = {}

    debug_info[:request_ip] = ip
    debug_info[:request_remote_ip] = request.remote_ip
    debug_info[:request_headers] = {
      content_type: request.content_type,
      x_forwarded_for: request.headers["X-Forwarded-For"],
      x_real_ip: request.headers["X-Real-IP"],
      remote_addr: request.remote_addr,
      all_headers: request.headers.to_h.select { |k, v| k.start_with?("X-") || k.start_with?("HTTP_") }
    }

    # Try to use geolocation data from request body first
    if request.content_type&.include?("application/json") && request.body.present?
      begin
        location_data = JSON.parse(request.body.read)
        debug_info[:geolocation_received] = { lat: location_data["latitude"], lng: location_data["longitude"] }

        if location_data["latitude"] && location_data["longitude"]
          location = Geocoder.search([location_data["latitude"], location_data["longitude"]]).first
          debug_info[:geocoder_result] = location&.data
          debug_info[:geocoder_full_result] = location&.inspect
          country = location&.country
          city = location&.city
          location_source = "geolocation"
          debug_info[:geolocation_success] = { country: country, city: city }
        else
          debug_info[:geolocation_missing_coords] = true
        end
      rescue JSON::ParserError => e
        debug_info[:json_error] = e.message
      end
    else
      debug_info[:no_geolocation] = "No geolocation data in request"
      debug_info[:content_type] = request.content_type
      debug_info[:body_present] = request.body.present?
    end

    # Fallback to IP-based geocoding if geolocation wasn't available
    if country.nil? && city.nil?
      debug_info[:falling_back_to_ip] = true
      debug_info[:ip_address] = ip
      debug_info[:ip_for_geocoding] = ip

      begin
        location = Geocoder.search(ip).first
        debug_info[:ip_geocoder_result] = location&.data
        debug_info[:ip_geocoder_full_result] = location&.inspect
        debug_info[:ip_geocoder_methods] = location&.methods&.grep(/country|city|location/) if location
        country = location&.country
        city = location&.city
        debug_info[:ip_geocoding_success] = { country: country, city: city }
        location_source = "ip"
      rescue => e
        debug_info[:ip_geocoding_error] = e.message
        debug_info[:ip_geocoding_error_class] = e.class.name
      end
    end

    debug_info[:final_location] = { country: country, city: city, source: location_source }

    Rails.logger.info "🔍 CHEER LOCATION DEBUG: #{debug_info.inspect}"
    puts "🔍 CHEER LOCATION DEBUG: #{debug_info.inspect}"

    # Store cheer event in cache
    cheer_event = CheerEventStore.create(
      ip_address: ip,
      country: country,
      city: city
    )

    # Broadcast the updated score with location debug info and recent cheers
    score = CheerScore.current
    recent_cheers = CheerEventStore.recent(limit: 5).map do |cheer|
      cheer_id = cheer["id"] || cheer["created_at"]
      { formatted_location: helpers.format_location(cheer["city"], cheer["country"], cheer_id) }
    end

    ActionCable.server.broadcast("cheerometer", {
      score: score,
      location: { country: country, city: city, source: location_source },
      recent_cheers: recent_cheers,
      debug: debug_info
    })

    head :ok
  end

  def meter
    @score = CheerScore.current
    @recent_cheers_data = CheerEventStore.recent(limit: 5)

    respond_to do |format|
      format.html
      format.json do
        recent_cheers = @recent_cheers_data.map do |cheer|
          cheer_id = cheer["id"] || cheer["created_at"]
          { formatted_location: helpers.format_location(cheer["city"], cheer["country"], cheer_id) }
        end
        render json: { score: @score, recent_cheers: recent_cheers }
      end
    end
  end

  def combined
    @score = CheerScore.current
    @recent_cheers_data = CheerEventStore.recent(limit: 5)
  end
end
