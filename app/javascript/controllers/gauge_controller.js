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

    // Track unique locations and their timestamps (persist for 2 hours)
    this.uniqueLocations = new Map() // Map of location -> { element, timestamp }
    this.locationExpiryTime = 2 * 60 * 60 * 1000 // 2 hours in milliseconds

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

          // Trigger confetti celebration with current score
          const confettiContainer = document.querySelector("[data-controller*='confetti']")
          if (confettiContainer) {
            const currentScore = this.localScore !== undefined ? this.localScore : (this.scoreValue || 0)
            confettiContainer.dispatchEvent(new CustomEvent("cheer:celebrate", {
              detail: { score: currentScore }
            }))
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
    // Poll more frequently for smooth gradual decay
    this.scoreInterval = setInterval(() => {
      this.fetchCurrentScore()
    }, 200) // Update every 200ms for smooth gradual decay

    // Also do gradual local decay between server updates for ultra-smooth experience
    this.decayInterval = setInterval(() => {
      this.gradualDecay()
    }, 100) // Update every 100ms for continuous decay

    // Periodically clean up expired locations
    this.locationCleanupInterval = setInterval(() => {
      this.cleanupExpiredLocations()
    }, 60000) // Check every minute for expired locations
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
    if (this.decayInterval) {
      clearInterval(this.decayInterval)
    }
    if (this.locationCleanupInterval) {
      clearInterval(this.locationCleanupInterval)
    }
    if (this.scoreUpdateHandler) {
      document.removeEventListener("score:update", this.scoreUpdateHandler)
    }
    if (this.buttonPressHandler) {
      document.removeEventListener("button:smash", this.buttonPressHandler)
    }
  }

  incrementScoreOptimistically() {
    // Get the CURRENT displayed score (even if animation is in progress)
    const scoreText = this.element.querySelector(".gauge-score")
    let currentScore = this.localScore !== undefined ? this.localScore : (this.scoreValue || 0)

    // If there's a displayed score, use that (it might be mid-animation)
    if (scoreText && scoreText.textContent) {
      const displayedScore = parseInt(scoreText.textContent)
      if (!isNaN(displayedScore)) {
        currentScore = displayedScore
      }
    }

    console.log("📈 Optimistic update - current score:", currentScore)

    // Don't do optimistic score increment - the server calculation is complex
    // (logarithmic scaling, exponential decay, progressive penalties)
    // We can't accurately predict it on the client, so just fetch immediately
    // This eliminates the mismatch between optimistic and server-side updates

    // Trigger confetti immediately (but minimal since score hasn't changed)
    const confettiContainer = document.querySelector("[data-controller*='confetti']")
    if (confettiContainer) {
      confettiContainer.dispatchEvent(new CustomEvent("cheer:celebrate", {
        detail: { score: currentScore }
      }))
    }

    // Sync with server immediately to get accurate score
    // Don't wait - get the real score as fast as possible
    this.fetchCurrentScore()
  }

  gradualDecay() {
    // Gradually decay the score locally between server updates
    // This creates a smooth continuous decay effect with variable speed
    const currentScore = this.localScore !== undefined ? this.localScore : (this.scoreValue || 0)

    // Only decay if score is above 0
    if (currentScore > 0) {
      // Track when we first hit 100 to add a delay before decay starts
      if (currentScore >= 100 && !this.reached100At) {
        this.reached100At = Date.now()
        return // Stay at 100 for a bit
      }

      // If we're at 100, check if we should start decaying
      if (currentScore >= 100 && this.reached100At) {
        const timeAt100 = Date.now() - this.reached100At
        const holdTime = 5000 // Stay at 100 for 5 seconds
        if (timeAt100 < holdTime) {
          return // Still holding at 100
        }
      }

      // Reset the 100 flag if we're below 100
      if (currentScore < 100) {
        this.reached100At = null
      }

      // Variable decay rate based on score range
      // 100-99: slowest (0.002 per 100ms)
      // 99-90: slow (0.005 per 100ms)
      // 90-50: medium (0.01 per 100ms)
      // 50-10: relatively fast (0.02 per 100ms)
      // 10-0: fast (0.03 per 100ms)
      let decayRate
      if (currentScore >= 99) {
        decayRate = 0.002 // Slowest: 100-99
      } else if (currentScore >= 90) {
        decayRate = 0.005 // Slow: 99-90
      } else if (currentScore >= 50) {
        decayRate = 0.01 // Medium: 90-50
      } else if (currentScore >= 10) {
        decayRate = 0.02 // Relatively fast: 50-10
      } else {
        decayRate = 0.03 // Fast: 10-0
      }

      const newScore = Math.max(0, currentScore - decayRate)

      // Only update if there's a meaningful change (avoid micro-updates)
      if (Math.abs(newScore - currentScore) >= 0.05) {
        // Update gauge smoothly without triggering full animation
        this.updateGaugeSmoothly(newScore)
      }
    } else {
      // Reset the 100 flag when at 0
      this.reached100At = null
    }
  }

  updateGaugeSmoothly(targetScore) {
    // Smooth update without full animation - for gradual decay
    const gauge = this.element.querySelector(".gauge-fill")
    const scoreText = this.element.querySelector(".gauge-score")

    // Update local score
    this.localScore = targetScore
    this.scoreValue = targetScore

    // Update gauge visual smoothly
    if (gauge) {
      const arcLength = 314.16
      const targetOffset = arcLength - (targetScore / 100) * arcLength

      // Calculate color based on score - very light green at 0 to bright green at 100
      const colorIntensity = targetScore / 100
      const lightColor = { r: 200, g: 250, b: 230 } // Very light green at 0
      const brightColor = { r: 16, g: 185, b: 129 } // Bright green #10b981 at 100
      const r = Math.round(lightColor.r + (brightColor.r - lightColor.r) * colorIntensity)
      const g = Math.round(lightColor.g + (brightColor.g - lightColor.g) * colorIntensity)
      const b = Math.round(lightColor.b + (brightColor.b - lightColor.b) * colorIntensity)
      const color = `rgb(${r}, ${g}, ${b})`

      // Use a longer, smoother transition for decay
      gauge.style.transition = "stroke-dashoffset 0.3s linear, stroke 0.3s linear"
      gauge.style.strokeDashoffset = targetOffset
      gauge.style.stroke = color
      gauge.style.filter = `drop-shadow(0 0 10px rgba(${r}, ${g}, ${b}, 0.5))`
    }

    // Update score text smoothly (round to nearest integer)
    if (scoreText) {
      scoreText.textContent = Math.round(targetScore)
    }
  }

  async fetchCurrentScore() {
    try {
      const response = await fetch("/cheerometer.json")
      const data = await response.json()
      if (data.score !== undefined) {
        // Sync with server score, but only if there's a significant difference
        // This prevents jarring jumps when server score differs from local decay
        const currentScore = this.localScore !== undefined ? this.localScore : (this.scoreValue || 0)
        const scoreDiff = Math.abs(data.score - currentScore)

        // Only update if server score is significantly different (more than 2 points)
        // This allows local gradual decay to work smoothly
        if (scoreDiff > 2) {
          this.updateScore(data.score)
        } else {
          // Small difference - just sync the local score without animation
          this.localScore = data.score
          this.scoreValue = data.score
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
    console.log("✅ Cheers data:", JSON.stringify(cheers, null, 2))

    // Get the newest cheer (first in the array)
    if (cheers.length > 0) {
      const newestCheer = cheers[0]
      console.log("✅ Newest cheer object:", newestCheer)
      console.log("✅ Newest cheer keys:", Object.keys(newestCheer || {}))

      // Try multiple possible property names
      const location = newestCheer.formatted_location ||
                       newestCheer.location ||
                       newestCheer.formattedLocation ||
                       (newestCheer.city && newestCheer.country ? `${newestCheer.city}, ${newestCheer.country}` : null) ||
                       "unknown location"

      console.log("✅ Creating flying location:", location)

      // Create a flying location element
      if (location && location !== "unknown location") {
        this.createFlyingLocation(location)
      } else {
        console.warn("⚠️ No valid location found in cheer data")
      }
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

    // Check if this location already exists
    const existingLocation = this.uniqueLocations.get(location)
    const isNewLocation = !existingLocation
    const now = Date.now()

    if (existingLocation) {
      // Location already exists - update its timestamp and refresh it
      existingLocation.timestamp = now
      // Make it briefly more visible to show it's been updated
      existingLocation.element.style.opacity = "1"
      existingLocation.element.style.transform = "scale(1.1)"
      setTimeout(() => {
        if (existingLocation.element.parentNode) {
          existingLocation.element.style.transform = "scale(1)"
        }
      }, 300)
      return
    }

    // Create the element for a new unique location
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

    // Calculate safe zones around both gauge and button to avoid blocking
    const gaugeCenterX = viewportWidth / 2
    const gaugeCenterY = viewportHeight * 0.25 // Gauge is in top portion
    const buttonCenterX = viewportWidth / 2
    const buttonCenterY = viewportHeight * 0.75 // Button is in bottom portion

    // Calculate safe zones - larger on mobile to ensure no overlap
    const gaugeRadius = Math.min(viewportWidth, viewportHeight) * 0.35 // Increased radius
    const buttonRadius = Math.min(viewportWidth, viewportHeight) * 0.35 // Button safe zone
    const gaugeSafeZone = gaugeRadius + Math.max(actualWidth, actualHeight) + 40 // Extra padding
    const buttonSafeZone = buttonRadius + Math.max(actualWidth, actualHeight) + 40 // Extra padding

    // Use actual measured dimensions with safety margin
    const margin = 10
    const maxX = viewportWidth - actualWidth - margin
    const maxY = viewportHeight - actualHeight - margin

    // Generate random position with much better distribution
    // Use a more random approach - divide screen into many small zones
    let x, y
    let attempts = 0
    const maxAttempts = 500 // Increased attempts for better randomness

    // Create many more zones for truly random distribution
    // Divide screen into a grid of potential positions
    const gridCols = 8 // 8 columns
    const gridRows = 6 // 6 rows
    const zones = []

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const xStart = margin + (col / gridCols) * (maxX - margin)
        const xEnd = margin + ((col + 1) / gridCols) * (maxX - margin)
        const yStart = margin + (row / gridRows) * (maxY - margin)
        const yEnd = margin + ((row + 1) / gridRows) * (maxY - margin)

        // Only add zone if it's valid and outside safe zones
        if (xStart < xEnd && yStart < yEnd) {
          zones.push({ xRange: [xStart, xEnd], yRange: [yStart, yEnd] })
        }
      }
    }

    // Filter out zones that are too close to gauge or button
    const validZones = zones.filter(zone => {
      const zoneCenterX = (zone.xRange[0] + zone.xRange[1]) / 2
      const zoneCenterY = (zone.yRange[0] + zone.yRange[1]) / 2
      const distanceToGauge = Math.sqrt(Math.pow(zoneCenterX - gaugeCenterX, 2) + Math.pow(zoneCenterY - gaugeCenterY, 2))
      const distanceToButton = Math.sqrt(Math.pow(zoneCenterX - buttonCenterX, 2) + Math.pow(zoneCenterY - buttonCenterY, 2))
      return distanceToGauge >= gaugeSafeZone && distanceToButton >= buttonSafeZone
    })

    // If no valid zones, fallback to full screen with safe zone check
    if (validZones.length === 0) {
      // Fallback: try random positions across entire screen
      do {
        x = Math.random() * (maxX - margin) + margin
        y = Math.random() * (maxY - margin) + margin

        const distanceToGauge = Math.sqrt(Math.pow(x + actualWidth/2 - gaugeCenterX, 2) + Math.pow(y + actualHeight/2 - gaugeCenterY, 2))
        const distanceToButton = Math.sqrt(Math.pow(x + actualWidth/2 - buttonCenterX, 2) + Math.pow(y + actualHeight/2 - buttonCenterY, 2))

        attempts++
        if (distanceToGauge >= gaugeSafeZone && distanceToButton >= buttonSafeZone) {
          break
        }
      } while (attempts < maxAttempts)
    } else {
      // Pick a random valid zone
      const randomZone = validZones[Math.floor(Math.random() * validZones.length)]

      // Generate position within the selected zone with some randomness
      // Add extra randomness within the zone
      const zoneWidth = randomZone.xRange[1] - randomZone.xRange[0]
      const zoneHeight = randomZone.yRange[1] - randomZone.yRange[0]
      x = randomZone.xRange[0] + Math.random() * zoneWidth
      y = randomZone.yRange[0] + Math.random() * zoneHeight

      // Ensure it's within bounds
      x = Math.max(margin, Math.min(maxX, x))
      y = Math.max(margin, Math.min(maxY, y))
    }

    // Final bounds check with actual dimensions
    x = Math.max(margin, Math.min(maxX, x))
    y = Math.max(margin, Math.min(maxY, y))

    element.style.left = `${x}px`
    element.style.top = `${y}px`

    container.appendChild(element)

    // Store in unique locations map with timestamp
    this.uniqueLocations.set(location, { element: element, timestamp: now })

    // Animate flying in
    requestAnimationFrame(() => {
      element.style.transition = "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)"
      element.style.opacity = "1"
      element.style.transform = "scale(1)"
    })

    // For unique locations, keep them visible for 2 hours instead of 5 seconds
    // Schedule removal after 2 hours
    setTimeout(() => {
      const locationData = this.uniqueLocations.get(location)
      if (locationData && locationData.element === element) {
        // Check if timestamp is still valid (hasn't been refreshed)
        const age = Date.now() - locationData.timestamp
        if (age >= this.locationExpiryTime) {
          // Fade out and remove
          element.style.transition = "all 1s ease-out"
          element.style.opacity = "0"
          element.style.transform = "scale(0.8) translateY(-20px)"
          setTimeout(() => {
            if (element.parentNode) {
              element.parentNode.removeChild(element)
            }
            this.uniqueLocations.delete(location)
          }, 1000)
        }
      }
    }, this.locationExpiryTime)
  }

  cleanupExpiredLocations() {
    // Periodically clean up expired locations
    const now = Date.now()
    for (const [location, data] of this.uniqueLocations.entries()) {
      const age = now - data.timestamp
      if (age >= this.locationExpiryTime) {
        // Remove expired location
        if (data.element.parentNode) {
          data.element.style.transition = "all 1s ease-out"
          data.element.style.opacity = "0"
          data.element.style.transform = "scale(0.8) translateY(-20px)"
          setTimeout(() => {
            if (data.element.parentNode) {
              data.element.parentNode.removeChild(data.element)
            }
            this.uniqueLocations.delete(location)
          }, 1000)
        } else {
          this.uniqueLocations.delete(location)
        }
      }
    }
  }

  updateScore(newScore) {
    this.scoreValue = newScore
    this.localScore = newScore
    this.updateGauge(newScore)
  }

  updateGauge(targetScore) {
    const gauge = this.element.querySelector(".gauge-fill")
    const scoreText = this.element.querySelector(".gauge-score")

    // Cancel any existing animation
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
    if (this.scoreAnimationInterval) {
      clearInterval(this.scoreAnimationInterval)
      this.scoreAnimationInterval = null
    }

    // Get current displayed score from text element if available, otherwise use localScore
    let startScore = this.localScore !== undefined ? this.localScore : (this.scoreValue || 0)
    if (scoreText && scoreText.textContent) {
      const displayedScore = parseInt(scoreText.textContent)
      if (!isNaN(displayedScore)) {
        startScore = displayedScore
      }
    }

    // Update local score immediately
    this.localScore = targetScore
    this.scoreValue = targetScore

    // Calculate score difference first
    const scoreDiff = targetScore - startScore

    // Smooth animation for all changes, including decay
    const startTime = Date.now()
    let duration
    if (scoreDiff < 0) {
      // Smooth decay - slower for better visual experience
      duration = Math.max(800, Math.abs(scoreDiff) * 60) // 60ms per point for decay, min 800ms
    } else if (Math.abs(scoreDiff) <= 2) {
      // Quick update for very small changes
      duration = Math.max(300, Math.abs(scoreDiff) * 50) // 50ms per point, min 300ms
    } else {
      // Smooth animation for larger increases
      const baseDuration = 1000 // 1 second base
      duration = Math.max(500, Math.min(baseDuration, Math.abs(scoreDiff) * 50)) // 50ms per point, min 500ms, max 1s
    }

    // Animate the gauge SVG smoothly
    if (gauge) {
      const arcLength = 314.16
      const targetOffset = arcLength - (targetScore / 100) * arcLength

      // Calculate color based on score - very light green at 0 to bright green at 100
      // Start with very light green and get brighter/more saturated at 100
      const colorIntensity = targetScore / 100 // 0 to 1
      const lightColor = { r: 200, g: 250, b: 230 } // Very light green at 0
      const brightColor = { r: 16, g: 185, b: 129 } // Bright green #10b981 at 100

      // Interpolate between very light and bright green
      const r = Math.round(lightColor.r + (brightColor.r - lightColor.r) * colorIntensity)
      const g = Math.round(lightColor.g + (brightColor.g - lightColor.g) * colorIntensity)
      const b = Math.round(lightColor.b + (brightColor.b - lightColor.b) * colorIntensity)

      const color = `rgb(${r}, ${g}, ${b})`

      // Add smooth transition to the gauge - match duration with score animation
      gauge.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.4, 0, 0.2, 1), stroke ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`
      gauge.style.strokeDashoffset = targetOffset
      gauge.style.stroke = color

      // Update drop shadow color to match
      gauge.style.filter = `drop-shadow(0 0 10px rgba(${r}, ${g}, ${b}, 0.5))`
    }

    // Animate the score number to show every integer
    // Use a more efficient approach: only animate if difference is significant
    if (scoreText && Math.abs(scoreDiff) > 0) {
      // For small changes, just update directly
      if (Math.abs(scoreDiff) <= 3) {
        scoreText.textContent = targetScore
        this.localScore = targetScore
        this.scoreValue = targetScore
      } else {
        // For larger changes, animate but throttle updates
        let lastDisplayedScore = startScore
        let lastUpdateTime = startTime
        const minUpdateInterval = 16 // ~60fps max

        const animateScore = () => {
          const now = Date.now()
          const elapsed = now - startTime
          const progress = Math.min(elapsed / duration, 1)

          // Only update if enough time has passed (throttle to ~60fps)
          if (now - lastUpdateTime >= minUpdateInterval || progress >= 1) {
            // Easing function for smooth animation
            const easeOutCubic = 1 - Math.pow(1 - progress, 3)
            const currentScore = Math.round(startScore + (scoreDiff * easeOutCubic))

            // Only update if the score has changed by at least 1
            if (currentScore !== lastDisplayedScore) {
              scoreText.textContent = currentScore
              lastDisplayedScore = currentScore
              lastUpdateTime = now
            }
          }

          if (progress < 1) {
            this.animationFrame = requestAnimationFrame(animateScore)
          } else {
            scoreText.textContent = targetScore
            this.localScore = targetScore
            this.scoreValue = targetScore
            this.animationFrame = null
          }
        }

        this.animationFrame = requestAnimationFrame(animateScore)
      }
    } else if (scoreText) {
      // No animation needed, just update directly
      scoreText.textContent = targetScore
      this.localScore = targetScore
      this.scoreValue = targetScore
    }
  }

  scoreValueChanged() {
    this.updateGauge(this.scoreValue)
  }
}
