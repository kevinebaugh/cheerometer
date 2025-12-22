import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    console.log("🔘 Cheer controller connected to button")

    // Track animation state
    this.isAnimating = false
    this.clickQueue = []

    // Add touch event handlers for 3D press effect on mobile
    this.element.addEventListener("touchstart", (e) => {
      console.log("🔘 touchstart fired")
      this.handleTouchStart(e)
    }, { passive: true })
    this.element.addEventListener("touchend", (e) => {
      console.log("🔘 touchend fired")
      this.handleTouchEnd(e)
    }, { passive: true })
    this.element.addEventListener("touchcancel", (e) => {
      console.log("🔘 touchcancel fired")
      this.handleTouchEnd(e)
    }, { passive: true })

    // Use pointerdown for immediate response (fires before click)
    this.element.addEventListener("pointerdown", (e) => {
      const timestamp = Date.now()
      console.log("🔘 pointerdown fired at", timestamp, "pointerType:", e.pointerType)
      console.log("🔘 Is animating?", this.isAnimating)

      // Fire immediately - pointerdown fires before any transitions
      this.handleSmash()
    }, { passive: true })

    // Also listen on click as backup
    this.element.addEventListener("click", (e) => {
      const timestamp = Date.now()
      console.log("🔘 Click event fired at", timestamp)
      console.log("🔘 Is animating?", this.isAnimating)

      // Fire immediately regardless of animation state
      this.handleSmash()
    }, { passive: true, capture: true })

    // Also listen on mousedown for immediate feedback
    this.element.addEventListener("mousedown", (e) => {
      console.log("🔘 mousedown fired")
      this.handleSmash()
    }, { passive: true })

    // Listen for transition end to track animation state
    this.element.addEventListener("transitionend", (e) => {
      console.log("🔘 transitionend fired for property:", e.propertyName)
      if (e.propertyName === "transform" || e.propertyName === "all") {
        this.isAnimating = false
        console.log("🔘 Animation complete, processing queued clicks:", this.clickQueue.length)
        // Process any queued clicks
        this.clickQueue.forEach(() => this.handleSmash())
        this.clickQueue = []
      }
    })

    console.log("🔘 Event listeners attached")
  }

  disconnect() {
    this.element.removeEventListener("touchstart", this.handleTouchStart)
    this.element.removeEventListener("touchend", this.handleTouchEnd)
    this.element.removeEventListener("touchcancel", this.handleTouchEnd)
  }

  handleTouchStart(e) {
    console.log("🔘 handleTouchStart - adding pressed class")
    this.isAnimating = true
    this.element.classList.add("pressed")
  }

  handleTouchEnd(e) {
    console.log("🔘 handleTouchEnd - removing pressed class")
    this.element.classList.remove("pressed")
    // Animation will complete when transition ends
  }

  handleSmash() {
    console.log("🔘 Button smashed!")

    // IMMEDIATE optimistic update - synchronous, no waiting
    const event = new CustomEvent("button:smash", { bubbles: true })
    document.dispatchEvent(event)
    console.log("🔘 Dispatched button:smash event")

    // Trigger confetti celebration immediately
    const confettiContainer = document.querySelector("[data-controller*='confetti']")
    if (confettiContainer) {
      confettiContainer.dispatchEvent(new CustomEvent("cheer:celebrate"))
    }

    // Do async work (geolocation + fetch) in background, don't block
    this.performSmash()
  }

  async performSmash() {
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

    const response = await fetch("/cheer", options)

    // Fetch updated score after smash as fallback
    if (response.ok) {
      // Fetch score after a brief delay to ensure server processed
      setTimeout(async () => {
        try {
          const scoreResponse = await fetch("/cheerometer.json")
          const scoreData = await scoreResponse.json()
          if (scoreData.score !== undefined) {
            // Dispatch event for gauge controller to update
            const event = new CustomEvent("score:update", { detail: { score: scoreData.score } })
            document.dispatchEvent(event)
          }
        } catch (error) {
          console.error("Error fetching score after smash:", error)
        }
      }, 50)
    }
  }

  // Keep this for Stimulus data-action binding if it's used
  async smash() {
    this.handleSmash()
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
