import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    console.log("🔘 Cheer controller connected to button")

    // Track animation state
    this.isAnimating = false
    this.clickQueue = []

    // Initialize audio context for jingle bell sound
    this.audioContext = null
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      console.log("🔔 Audio context not available:", e)
    }

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

    // Play jingle bell sound
    this.playBellSound()

    // IMMEDIATE optimistic update - synchronous, no waiting
    const event = new CustomEvent("button:smash", { bubbles: true })
    document.dispatchEvent(event)
    console.log("🔘 Dispatched button:smash event")

    // Trigger confetti celebration immediately (score will be updated by gauge controller)
    // The gauge controller will handle confetti with the correct score
    const confettiContainer = document.querySelector("[data-controller*='confetti']")
    if (confettiContainer) {
      // Get current score from gauge if available, otherwise default
      const gaugeElement = document.querySelector("[data-controller*='gauge']")
      let currentScore = 50 // default
      if (gaugeElement && gaugeElement.dataset.gaugeScoreValue) {
        currentScore = parseInt(gaugeElement.dataset.gaugeScoreValue) || 50
      }
      confettiContainer.dispatchEvent(new CustomEvent("cheer:celebrate", {
        detail: { score: currentScore }
      }))
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

  playBellSound() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      } catch (e) {
        return // Audio not available
      }
    }

    // Resume audio context if suspended (required for user interaction)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }

    // Create a jingle bell sound using Web Audio API
    // Multiple tones to create a "jingle" effect
    const frequencies = [523.25, 659.25, 783.99] // C5, E5, G5 - a pleasant chord
    const duration = 0.3 // 300ms
    const gainNode = this.audioContext.createGain()
    gainNode.connect(this.audioContext.destination)
    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime) // 30% volume
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration)

    // Play multiple tones in quick succession for jingle effect
    frequencies.forEach((freq, index) => {
      const oscillator = this.audioContext.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime)

      const toneGain = this.audioContext.createGain()
      toneGain.gain.setValueAtTime(0, this.audioContext.currentTime)
      toneGain.gain.linearRampToValueAtTime(0.2, this.audioContext.currentTime + 0.01)
      toneGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration + (index * 0.05))

      oscillator.connect(toneGain)
      toneGain.connect(gainNode)

      oscillator.start(this.audioContext.currentTime + (index * 0.05))
      oscillator.stop(this.audioContext.currentTime + duration + (index * 0.05))
    })
  }

  async getCurrentPosition() {
    if (!navigator.geolocation) {
      throw new Error("Geolocation not supported")
    }

    // Check permission state first
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' })

        if (permissionStatus.state === 'denied') {
          throw new Error("Geolocation permission denied")
        }

        if (permissionStatus.state === 'prompt') {
          // Permission hasn't been asked yet - this will trigger the prompt
          console.log("📍 Requesting geolocation permission...")
        }
      } catch (e) {
        // Permissions API might not be supported, continue anyway
        console.log("📍 Permissions API not available, proceeding with geolocation request")
      }
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) => {
          // Provide more specific error messages
          if (error.code === error.PERMISSION_DENIED) {
            console.log("📍 Geolocation permission denied by user")
            reject(new Error("Permission denied"))
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            console.log("📍 Geolocation position unavailable")
            reject(new Error("Position unavailable"))
          } else if (error.code === error.TIMEOUT) {
            console.log("📍 Geolocation request timed out")
            reject(new Error("Request timeout"))
          } else {
            console.log("📍 Geolocation error:", error.message)
            reject(error)
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 0 // Don't use cached location - always request fresh permission if needed
        }
      )
    })
  }
}
