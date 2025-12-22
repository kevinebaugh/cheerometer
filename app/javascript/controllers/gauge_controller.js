import { Controller } from "@hotwired/stimulus"
import { createConsumer } from "@rails/actioncable"

console.log("📦 Gauge controller module loaded")

export default class extends Controller {
  static values = {
    score: Number
  }

  connect() {
    console.log("🔌 Gauge controller connected, setting up ActionCable...")
    console.log("🔌 Initial score value:", this.scoreValue)

    // Initialize local score from initial value
    this.localScore = this.scoreValue || 0
    console.log("🔌 Local score initialized to:", this.localScore)

    try {
      this.consumer = createConsumer()
      console.log("✅ ActionCable consumer created")

      this.subscription = this.consumer.subscriptions.create(
        { channel: "CheerometerChannel" },
        {
          connected: () => {
            console.log("✅ ActionCable connected to CheerometerChannel")
          },
          disconnected: () => {
            console.warn("⚠️ ActionCable disconnected from CheerometerChannel")
          },
          rejected: () => {
            console.error("❌ ActionCable subscription rejected")
          },
          received: (data) => {
          console.log("🎉 SMASH! New cheer received, score:", data.score)

          // Trigger confetti celebration
          const confettiContainer = document.querySelector("[data-controller*='confetti']")
          if (confettiContainer) {
            confettiContainer.dispatchEvent(new CustomEvent("cheer:celebrate"))
          }

          if (data.location) {
            console.log("📍 Location:", {
              city: data.location.city || "unknown",
              country: data.location.country || "unknown",
              source: data.location.source || "unknown"
            })
          }
          if (data.debug) {
            console.log("🔍 Location Debug Info:", data.debug)
          }
          if (data.recent_cheers) {
            console.log("📋 Recent cheers received:", data.recent_cheers)
            console.log("📋 Recent cheers type:", typeof data.recent_cheers)
            console.log("📋 Recent cheers is array?", Array.isArray(data.recent_cheers))
            if (data.recent_cheers.length > 0) {
              console.log("📋 First cheer sample:", data.recent_cheers[0])
            }
          } else {
            console.warn("⚠️ No recent_cheers in data:", data)
          }
          // Update score immediately without delay
          this.updateScore(data.score)
          if (data.recent_cheers) {
            console.log("🔄 Calling updateRecentCheers with", data.recent_cheers.length, "cheers")
            this.updateRecentCheers(data.recent_cheers)
          }
        }
      }
      )
      console.log("✅ ActionCable subscription created")
    } catch (error) {
      console.error("❌ Error setting up ActionCable:", error)
    }

    this.updateGauge(this.localScore)

    // Listen for button press events for optimistic updates
    this.buttonPressHandler = (event) => {
      console.log("🔘 Button smash event received, incrementing optimistically")
      this.incrementScoreOptimistically()
    }
    document.addEventListener("button:smash", this.buttonPressHandler)
    console.log("✅ Button smash event listener added")

    // Listen for score update events (fallback for immediate updates)
    this.scoreUpdateHandler = (event) => {
      if (event.detail && event.detail.score !== undefined) {
        console.log("📊 Score update event received:", event.detail.score)
        this.updateScore(event.detail.score)
        this.localScore = event.detail.score
      }
    }
    document.addEventListener("score:update", this.scoreUpdateHandler)

    // Initialize existing locations to fly in after a short delay
    setTimeout(() => {
      this.initializeExistingLocations()
    }, 500)

    // Periodically fetch the current score to handle score decay over time
    // Poll more frequently for smooth degradation
    this.scoreInterval = setInterval(() => {
      this.fetchCurrentScore()
    }, 500) // Update every 500ms for smooth degradation
  }

  initializeExistingLocations() {
    const list = document.querySelector(".recent-cheers-list")
    if (!list) {
      console.log("No recent-cheers-list found for initialization")
      return
    }

    const items = list.querySelectorAll("li[data-location]")
    console.log(`Initializing ${items.length} existing locations`)

    items.forEach((item, index) => {
      const location = item.getAttribute("data-location")
      if (location && location.trim()) {
        // Stagger the initial animations
        setTimeout(() => {
          this.createFlyingLocation(location)
        }, index * 150)
      }
    })
  }

  disconnect() {
    if (this.subscription) {
      this.subscription.unsubscribe()
    }
    if (this.scoreInterval) {
      clearInterval(this.scoreInterval)
    }
    if (this.scoreUpdateHandler) {
      document.removeEventListener("score:update", this.scoreUpdateHandler)
    }
    if (this.buttonPressHandler) {
      document.removeEventListener("button:smash", this.buttonPressHandler)
    }
  }

  incrementScoreOptimistically() {
    // Immediately increase score locally for instant feedback
    const currentScore = this.localScore !== undefined ? this.localScore : (this.scoreValue || 0)
    console.log("📈 Optimistic update - current score:", currentScore)
    const newScore = Math.min(currentScore + 5, 100) // Add 5 points, cap at 100
    console.log("📈 Optimistic update - new score:", newScore)
    this.localScore = newScore
    this.updateGauge(newScore)

    // Sync with server after a brief delay
    setTimeout(() => {
      console.log("🔄 Syncing with server after optimistic update")
      this.fetchCurrentScore()
    }, 200)
  }

  async fetchCurrentScore() {
    try {
      const response = await fetch("/cheerometer.json")
      const data = await response.json()
      if (data.score !== undefined) {
        // Only update if server score is different (avoids unnecessary updates)
        if (data.score !== this.localScore) {
          this.updateScore(data.score)
        }
      }
      // Don't update recent cheers on periodic polling - only on new smashes
    } catch (error) {
      console.error("Error fetching score:", error)
    }
  }

  updateRecentCheers(cheers) {
    const container = document.querySelector(".flying-locations-container")
    if (!container) {
      console.warn("⚠️ Flying locations container not found in DOM")
      return
    }

    console.log("✅ Creating flying locations for", cheers.length, "cheers")

    // Get the newest cheer (first in the array)
    if (cheers.length > 0) {
      const newestCheer = cheers[0]
      const location = newestCheer.formatted_location || "unknown location"

      console.log("✅ Creating flying location:", location)

      // Create a flying location element
      this.createFlyingLocation(location)
    }
  }

  createFlyingLocation(location) {
    const container = document.querySelector(".flying-locations-container")
    if (!container) {
      console.warn("⚠️ Flying locations container not found")
      return
    }

    if (!location || !location.trim()) {
      console.warn("⚠️ No location provided to createFlyingLocation")
      return
    }

    // Create the element
    const element = document.createElement("div")
    element.className = "flying-location"
    element.textContent = `🎉 ${location}`
    element.style.cssText = `
      position: absolute;
      font-size: 1.5rem;
      font-weight: bold;
      color: white;
      text-shadow: 3px 3px 6px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5);
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transform: scale(0.5);
      background: rgba(0, 0, 0, 0.4);
      padding: 8px 16px;
      border-radius: 20px;
      backdrop-filter: blur(4px);
      border: 2px solid rgba(255, 255, 255, 0.3);
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
    `

    // Get viewport dimensions
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Calculate safe zone around the gauge (center area) - smaller on mobile
    const gaugeCenterX = viewportWidth / 2
    const gaugeCenterY = viewportHeight / 2
    const gaugeRadius = Math.min(viewportWidth, viewportHeight) * 0.25 // Responsive radius
    const safeZone = gaugeRadius + 50 // Extra padding

    // Temporarily add element to measure actual size
    element.style.visibility = "hidden"
    element.style.position = "absolute"
    element.style.left = "-9999px"
    container.appendChild(element)

    // Measure actual dimensions
    const rect = element.getBoundingClientRect()
    const actualWidth = rect.width
    const actualHeight = rect.height

    // Remove temporarily added element
    container.removeChild(element)
    element.style.visibility = ""

    // Use actual measured dimensions with safety margin
    const margin = 10
    const maxX = viewportWidth - actualWidth - margin
    const maxY = viewportHeight - actualHeight - margin

    // Generate random position with better distribution
    let x, y
    let attempts = 0
    const maxAttempts = 200

    // Create zones for better distribution (especially on mobile) - ensure they're within bounds
    const zones = [
      { xRange: [margin, Math.min(viewportWidth * 0.3, maxX)], yRange: [margin, Math.min(viewportHeight * 0.3, maxY)] }, // Top left
      { xRange: [Math.max(viewportWidth * 0.7, margin), maxX], yRange: [margin, Math.min(viewportHeight * 0.3, maxY)] }, // Top right
      { xRange: [margin, Math.min(viewportWidth * 0.3, maxX)], yRange: [Math.max(viewportHeight * 0.7, margin), maxY] }, // Bottom left
      { xRange: [Math.max(viewportWidth * 0.7, margin), maxX], yRange: [Math.max(viewportHeight * 0.7, margin), maxY] }, // Bottom right
      { xRange: [margin, maxX], yRange: [margin, Math.min(viewportHeight * 0.25, maxY)] }, // Top edge
      { xRange: [margin, maxX], yRange: [Math.max(viewportHeight * 0.75, margin), maxY] }, // Bottom edge
    ]

    // Filter out invalid zones
    const validZones = zones.filter(zone =>
      zone.xRange[0] < zone.xRange[1] &&
      zone.yRange[0] < zone.yRange[1] &&
      zone.xRange[1] <= maxX &&
      zone.yRange[1] <= maxY
    )

    // Randomly pick a zone for better distribution
    const randomZone = validZones.length > 0
      ? validZones[Math.floor(Math.random() * validZones.length)]
      : { xRange: [margin, maxX], yRange: [margin, maxY] } // Fallback to full screen

    do {
      // Generate position within the selected zone
      x = Math.random() * (randomZone.xRange[1] - randomZone.xRange[0]) + randomZone.xRange[0]
      y = Math.random() * (randomZone.yRange[1] - randomZone.yRange[0]) + randomZone.yRange[0]

      // Ensure it's within bounds
      x = Math.max(margin, Math.min(maxX, x))
      y = Math.max(margin, Math.min(maxY, y))

      attempts++

      // Check if position is outside safe zone
      const distance = Math.sqrt(Math.pow(x - gaugeCenterX, 2) + Math.pow(y - gaugeCenterY, 2))
      if (distance >= safeZone) {
        break
      }

      // If we've tried too many times, try a different zone
      if (attempts > 50 && attempts % 50 === 0 && validZones.length > 1) {
        const newZone = validZones[Math.floor(Math.random() * validZones.length)]
        randomZone.xRange = newZone.xRange
        randomZone.yRange = newZone.yRange
      }
    } while (attempts < maxAttempts)

    // Final bounds check with actual dimensions
    x = Math.max(margin, Math.min(maxX, x))
    y = Math.max(margin, Math.min(maxY, y))

    element.style.left = `${x}px`
    element.style.top = `${y}px`

    container.appendChild(element)

    // Animate flying in
    requestAnimationFrame(() => {
      element.style.transition = "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)"
      element.style.opacity = "1"
      element.style.transform = "scale(1)"
    })

    // Fade out and remove after 5 seconds
    setTimeout(() => {
      element.style.transition = "all 1s ease-out"
      element.style.opacity = "0"
      element.style.transform = "scale(0.8) translateY(-20px)"
      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element)
        }
      }, 1000)
    }, 5000)
  }

  updateScore(newScore) {
    this.scoreValue = newScore
    this.localScore = newScore
    this.updateGauge(newScore)
  }

  updateGauge(score) {
    const gauge = this.element.querySelector(".gauge-fill")
    const scoreText = this.element.querySelector(".gauge-score")

    if (gauge) {
      // Calculate the dash offset for the gauge arc
      const arcLength = 314.16
      const offset = arcLength - (score / 100) * arcLength
      // Update immediately - no transition delay
      gauge.style.strokeDashoffset = offset
    }

    if (scoreText) {
      scoreText.textContent = score
    }
  }

  scoreValueChanged() {
    this.updateGauge(this.scoreValue)
  }
}
