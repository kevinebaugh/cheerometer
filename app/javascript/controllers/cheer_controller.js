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
    this.smash()
  }

  async smash() {
    console.log("🚀 [CHEER] Starting smash()")

    // Try to get geolocation with a short timeout - don't block too long
    let locationData = null

    try {
      console.log("📍 [CHEER] Requesting geolocation (with 300ms timeout)...")
      // Use Promise.race to timeout geolocation very quickly - don't block the request
      const position = await Promise.race([
        this.getCurrentPosition(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Geolocation timeout")), 300)) // 300ms timeout - very fast
      ])
      console.log("✅ [CHEER] Geolocation success:", position.coords.latitude, position.coords.longitude)
      locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }
    } catch (error) {
      console.log("⚠️ [CHEER] Geolocation not available quickly:", error.message, "- sending request immediately without it")
    }

    // Send request with location data if available
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
      console.log("📤 [CHEER] Sending request WITH geolocation data:", locationData)
    } else {
      console.log("📤 [CHEER] Sending request WITHOUT geolocation data (IP fallback)")
    }

    // Send request immediately - don't wait for anything
    try {
      const response = await fetch("/cheer", options)
      console.log("✅ [CHEER] Request completed, status:", response.status)
    } catch (error) {
      console.error("❌ [CHEER] Request failed:", error)
    }
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
          timeout: 2000, // Very short timeout - 2 seconds max
          maximumAge: 300000 // Cache for 5 minutes - use cached location if available
        }
      )
    })
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
}
