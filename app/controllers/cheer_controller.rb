class CheerController < ApplicationController
  protect_from_forgery with: :null_session

  def button
  end

  def create
    ip = request.remote_ip
    country = nil
    city = nil
    location_source = nil
    debug_info = {}

    # Try to use geolocation data from request body first
    if request.content_type&.include?("application/json") && request.body.present?
      begin
        location_data = JSON.parse(request.body.read)
        debug_info[:geolocation_received] = { lat: location_data["latitude"], lng: location_data["longitude"] }

        if location_data["latitude"] && location_data["longitude"]
          location = Geocoder.search([location_data["latitude"], location_data["longitude"]]).first
          debug_info[:geocoder_result] = location&.data
          country = location&.country
          city = location&.city
          location_source = "geolocation"
        end
      rescue JSON::ParserError => e
        debug_info[:json_error] = e.message
      end
    else
      debug_info[:no_geolocation] = "No geolocation data in request"
    end

    # Fallback to IP-based geocoding if geolocation wasn't available
    if country.nil? && city.nil?
      debug_info[:falling_back_to_ip] = true
      debug_info[:ip_address] = ip
      location = Geocoder.search(ip).first
      debug_info[:ip_geocoder_result] = location&.data
      country = location&.country
      city = location&.city
      location_source = "ip"
    end

    debug_info[:final_location] = { country: country, city: city, source: location_source }

    Rails.logger.debug "Cheer location debug: #{debug_info.inspect}"

    cheer_event = CheerEvent.create!(
      ip_address: ip,
      country: country,
      city: city
    )

    # Broadcast the updated score with location debug info and recent cheers
    score = CheerScore.current
    recent_cheers = CheerEvent.order(created_at: :desc).limit(5).map do |cheer|
      { formatted_location: helpers.format_location(cheer.city, cheer.country, cheer.id) }
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
    @recent_cheers = CheerEvent.order(created_at: :desc).limit(5)

    respond_to do |format|
      format.html
      format.json do
        recent_cheers = @recent_cheers.map { |cheer| { formatted_location: helpers.format_location(cheer.city, cheer.country, cheer.id) } }
        render json: { score: @score, recent_cheers: recent_cheers }
      end
    end
  end
end
