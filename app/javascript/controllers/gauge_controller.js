import { Controller } from "@hotwired/stimulus"
import { createConsumer } from "@rails/actioncable"

console.log("📦 Gauge controller module loaded")

export default class extends Controller {
  static values = {
    score: Number
  }

  connect() {
    console.log("🔌 Gauge controller connected, setting up ActionCable...")

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

    this.updateGauge(this.scoreValue)

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
  }

  async fetchCurrentScore() {
    try {
      const response = await fetch("/cheerometer.json")
      const data = await response.json()
      if (data.score !== undefined) {
        this.updateScore(data.score)
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
    `

    // Get viewport dimensions
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Calculate safe zone around the gauge (center area)
    const gaugeCenterX = viewportWidth / 2
    const gaugeCenterY = viewportHeight / 2 - 100 // Adjust for title
    const gaugeRadius = 350 // Approximate gauge radius
    const safeZone = gaugeRadius + 100 // Extra padding

    // Estimate text width (rough calculation: ~10px per character + padding)
    const estimatedTextWidth = (location.length + 3) * 10 + 32 // +3 for emoji, +32 for padding
    const estimatedHeight = 50 // Height including padding

    // Generate random position, avoiding the gauge center area and ensuring it stays on screen
    let x, y
    let attempts = 0
    const maxAttempts = 100

    do {
      // Ensure the element stays within viewport bounds
      // Account for text width on the right and height on the bottom
      const maxX = viewportWidth - estimatedTextWidth - 20 // 20px margin
      const maxY = viewportHeight - estimatedHeight - 20 // 20px margin

      x = Math.random() * (maxX - 20) + 20 // 20px margin on left
      y = Math.random() * (maxY - 20) + 20 // 20px margin on top

      attempts++
    } while (
      Math.sqrt(Math.pow(x - gaugeCenterX, 2) + Math.pow(y - gaugeCenterY, 2)) < safeZone &&
      attempts < maxAttempts
    )

    // If we couldn't find a good spot, place it in a corner area
    if (attempts >= maxAttempts) {
      // Try corners first
      const corners = [
        { x: 20, y: 20 }, // Top left
        { x: viewportWidth - estimatedTextWidth - 20, y: 20 }, // Top right
        { x: 20, y: viewportHeight - estimatedHeight - 20 }, // Bottom left
        { x: viewportWidth - estimatedTextWidth - 20, y: viewportHeight - estimatedHeight - 20 } // Bottom right
      ]

      // Find a corner that's not in the safe zone
      const validCorner = corners.find(corner => {
        const distance = Math.sqrt(Math.pow(corner.x - gaugeCenterX, 2) + Math.pow(corner.y - gaugeCenterY, 2))
        return distance >= safeZone
      })

      if (validCorner) {
        x = validCorner.x
        y = validCorner.y
      } else {
        // Fallback: place it safely on the edge
        x = Math.max(20, Math.min(viewportWidth - estimatedTextWidth - 20, viewportWidth / 4))
        y = Math.max(20, Math.min(viewportHeight - estimatedHeight - 20, viewportHeight / 4))
      }
    }

    // Ensure final position is within bounds
    x = Math.max(20, Math.min(viewportWidth - estimatedTextWidth - 20, x))
    y = Math.max(20, Math.min(viewportHeight - estimatedHeight - 20, y))

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
    this.updateGauge(newScore)
  }

  updateGauge(score) {
    const gauge = this.element.querySelector(".gauge-fill")
    const scoreText = this.element.querySelector(".gauge-score")

    if (gauge) {
      // Calculate the dash offset for the gauge arc
      // The arc length is approximately 314.16 (π * 100 radius)
      // We want to show the percentage of the arc
      const arcLength = 314.16
      const offset = arcLength - (score / 100) * arcLength
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
