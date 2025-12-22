import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    // Add touch event handlers for 3D press effect on mobile
    this.element.addEventListener("touchstart", this.handleTouchStart.bind(this), { passive: true })
    this.element.addEventListener("touchend", this.handleTouchEnd.bind(this), { passive: true })
    this.element.addEventListener("touchcancel", this.handleTouchEnd.bind(this), { passive: true })
  }

  disconnect() {
    this.element.removeEventListener("touchstart", this.handleTouchStart)
    this.element.removeEventListener("touchend", this.handleTouchEnd)
    this.element.removeEventListener("touchcancel", this.handleTouchEnd)
  }

  handleTouchStart(e) {
    this.element.classList.add("pressed")
  }

  handleTouchEnd(e) {
    this.element.classList.remove("pressed")
  }

  async smash() {
    // Trigger confetti celebration
    const confettiContainer = document.querySelector("[data-controller*='confetti']")
    if (confettiContainer) {
      confettiContainer.dispatchEvent(new CustomEvent("cheer:celebrate"))
    }

    // Try to get geolocation, fallback to IP-based
    let locationData = null

    try {
      const position = await this.getCurrentPosition()
      locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }
    } catch (error) {
      // Geolocation not available or denied, will fallback to IP-based
      console.log("Geolocation not available, using IP-based location")
    }

    const headers = {
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""
    }

    const options = {
      method: "POST",
      headers: headers
    }

    // Only send body if we have location data
    if (locationData) {
      headers["Content-Type"] = "application/json"
      options.body = JSON.stringify(locationData)
    }

    fetch("/cheer", options)
  }

  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"))
        return
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 60000 // Cache for 1 minute
        }
      )
    })
  }
}
