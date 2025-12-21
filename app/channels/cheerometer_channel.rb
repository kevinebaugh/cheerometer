class CheerometerChannel < ApplicationCable::Channel
  def subscribed
    stream_from "cheerometer"
  end

  def unsubscribed
    # Any cleanup needed when channel is unsubscribed
  end
end
