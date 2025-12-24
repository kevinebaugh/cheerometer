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
    this.lastSyncedScore = this.scoreValue || 0 // Track last synced score for smoothing
    console.log("🔌 Local score initialized to:", this.localScore)

    // Track unique locations and their timestamps (fade out after 10 seconds)
    this.uniqueLocations = new Map() // Map of location -> { element, timestamp, fadeTimeout }
    this.locationExpiryTime = 10 * 1000 // 10 seconds in milliseconds

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
          console.log("🎉 [GAUGE] ActionCable message received")
          console.log("📊 [GAUGE] Score:", data.score)
          console.log("📦 [GAUGE] Full data:", JSON.stringify(data, null, 2))

          // Only trigger confetti if score increased to 100 (not if already at 100)
          // This prevents performance issues from repeated confetti at 100
          const confettiContainer = document.querySelector("[data-controller*='confetti']")
          if (confettiContainer) {
            const currentScore = this.localScore !== undefined ? this.localScore : (this.scoreValue || 0)
            const newScore = data.score || currentScore

            // Only trigger confetti if we just hit 100 (was below 100, now at 100)
            if (currentScore < 100 && newScore >= 100) {
              confettiContainer.dispatchEvent(new CustomEvent("cheer:celebrate", {
                detail: { score: newScore }
              }))
            }
          }

          // Check for recent_cheers
          if (data.recent_cheers) {
            console.log("✅ [GAUGE] recent_cheers exists")
            console.log("📋 [GAUGE] recent_cheers type:", typeof data.recent_cheers)
            console.log("📋 [GAUGE] recent_cheers is array?", Array.isArray(data.recent_cheers))
            console.log("📋 [GAUGE] recent_cheers length:", data.recent_cheers?.length)
            console.log("📋 [GAUGE] recent_cheers full:", JSON.stringify(data.recent_cheers, null, 2))

            if (data.recent_cheers.length > 0) {
              console.log("📋 [GAUGE] First cheer:", JSON.stringify(data.recent_cheers[0], null, 2))
              console.log("📋 [GAUGE] First cheer keys:", Object.keys(data.recent_cheers[0] || {}))
              console.log("📋 [GAUGE] First cheer formatted_location:", data.recent_cheers[0]?.formatted_location)
            } else {
              console.warn("⚠️ [GAUGE] recent_cheers array is empty")
            }
          } else {
            console.warn("❌ [GAUGE] No recent_cheers in data!")
            console.log("📦 [GAUGE] Available keys:", Object.keys(data || {}))
          }

          // ActionCable sync - always accept significant changes
          // Use same smoothing logic as polling to prevent jumps
          if (data.score !== undefined && data.score !== null) {
            const currentScore = this.localScore !== undefined ? this.localScore : (this.scoreValue || 0)
            const scoreDiff = data.score - currentScore

            // Only update if change is significant to prevent erratic jumps
            if (Math.abs(scoreDiff) > 0.5) {
              this.updateScore(data.score)
              this.lastSyncedScore = data.score
              console.log(`🔄 [GAUGE] ActionCable: ${currentScore} → ${data.score}`)
            }
          }

          // Process recent cheers
          if (data.recent_cheers && Array.isArray(data.recent_cheers) && data.recent_cheers.length > 0) {
            console.log("🔄 [GAUGE] Calling updateRecentCheers with", data.recent_cheers.length, "cheers")
            this.updateRecentCheers(data.recent_cheers)
          } else {
            console.warn("⚠️ [GAUGE] Not calling updateRecentCheers - invalid data")
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

    // SIMPLIFIED: Server is the single source of truth - poll frequently
    // All devices must stay in sync, so we poll every 100ms
    // This is the primary sync mechanism - simple and reliable
    // Server now responds instantly, so we can poll more frequently
    this.scoreInterval = setInterval(() => {
      this.fetchCurrentScore()
    }, 100) // Poll every 100ms for very close sync across all devices

    // Client-side decay is completely disabled - server handles everything
    // No local decay to cause drift

    // Periodically clean up expired locations (check every second for 10-second expiry)
    this.locationCleanupInterval = setInterval(() => {
      this.cleanupExpiredLocations()
    }, 1000) // Check every second for expired locations
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
    // SIMPLIFIED: No optimistic updates - just trigger confetti and let server handle score
    // This ensures all devices stay perfectly in sync
    console.log("📈 Button smashed - waiting for server response")

    // Trigger confetti immediately for visual feedback
    const confettiContainer = document.querySelector("[data-controller*='confetti']")
    if (confettiContainer) {
      const currentScore = this.localScore !== undefined ? this.localScore : (this.scoreValue || 0)
      confettiContainer.dispatchEvent(new CustomEvent("cheer:celebrate", {
        detail: { score: currentScore }
      }))
    }

    // Immediately fetch server score - polling will catch it within 200ms
    // This is simpler and more reliable than optimistic updates
    this.fetchCurrentScore()
  }

  gradualDecay() {
    // DISABLED - server handles all decay
    // No client-side decay to cause drift
    return
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
      if (data.score !== undefined && data.score !== null) {
        const currentScore = this.localScore !== undefined ? this.localScore : (this.scoreValue || 0)
        const scoreDiff = data.score - currentScore

        // Smooth out erratic jumps - only update if change is significant or consistent
        // This prevents rapid back-and-forth jumps while maintaining sync
        if (Math.abs(scoreDiff) > 0.5) {
          // Significant change - update immediately
          this.updateScore(data.score)
          this.lastSyncedScore = data.score
        } else if (Math.abs(scoreDiff) > 0.1) {
          // Small change - only update if it's in the same direction as last change
          // This prevents rapid oscillation
          const lastDiff = data.score - this.lastSyncedScore
          if (Math.abs(lastDiff) < 0.5 || (scoreDiff > 0 && lastDiff > 0) || (scoreDiff < 0 && lastDiff < 0)) {
            this.updateScore(data.score)
            this.lastSyncedScore = data.score
          }
        }
      }
    } catch (error) {
      console.error("Error fetching score:", error)
    }
  }

  updateRecentCheers(cheers) {
    console.log("🎯 [UPDATE] updateRecentCheers called")
    console.log("📥 [UPDATE] Input cheers:", JSON.stringify(cheers, null, 2))

    const container = document.querySelector(".flying-locations-container")
    if (!container) {
      console.error("❌ [UPDATE] Flying locations container not found in DOM")
      return
    }
    console.log("✅ [UPDATE] Container found")

    if (!cheers) {
      console.error("❌ [UPDATE] cheers is null/undefined")
      return
    }

    if (!Array.isArray(cheers)) {
      console.error("❌ [UPDATE] cheers is not an array, type:", typeof cheers)
      return
    }

    if (cheers.length === 0) {
      console.warn("⚠️ [UPDATE] cheers array is empty")
      return
    }

    console.log("✅ [UPDATE] Processing", cheers.length, "cheers")

    // Get the newest cheer (first in the array - most recent)
    const newestCheer = cheers[0]
    console.log("📋 [UPDATE] Newest cheer:", JSON.stringify(newestCheer, null, 2))
    console.log("📋 [UPDATE] Newest cheer keys:", Object.keys(newestCheer || {}))
    console.log("📋 [UPDATE] Newest cheer formatted_location:", newestCheer?.formatted_location)
    console.log("📋 [UPDATE] Newest cheer location:", newestCheer?.location)
    console.log("📋 [UPDATE] Newest cheer formattedLocation:", newestCheer?.formattedLocation)

    // Try multiple possible property names
    const formattedLocation = newestCheer?.formatted_location ||
                              newestCheer?.location ||
                              newestCheer?.formattedLocation ||
                              null

    console.log("🔍 [UPDATE] Extracted formattedLocation:", formattedLocation)
    console.log("🔍 [UPDATE] formattedLocation type:", typeof formattedLocation)
    console.log("🔍 [UPDATE] formattedLocation truthy?", !!formattedLocation)
    if (formattedLocation) {
      console.log("🔍 [UPDATE] formattedLocation.trim():", formattedLocation.trim())
      console.log("🔍 [UPDATE] formattedLocation.trim() length:", formattedLocation.trim().length)
    }

    // Show fly-in if we have a location
    if (formattedLocation && formattedLocation.trim()) {
      console.log("✅ [UPDATE] Creating flying location:", formattedLocation)
      this.createFlyingLocation(formattedLocation)
    } else {
      console.error("❌ [UPDATE] No valid location found!")
      console.error("   - formattedLocation:", formattedLocation)
      console.error("   - newestCheer:", JSON.stringify(newestCheer, null, 2))
    }
  }

  createFlyingLocation(location) {
    console.log("🎯 createFlyingLocation called with:", location)
    const container = document.querySelector(".flying-locations-container")
    if (!container) {
      console.warn("⚠️ Flying locations container not found")
      return
    }
    console.log("✅ Container found:", container)

    if (!location || !location.trim()) {
      console.warn("⚠️ No location provided to createFlyingLocation")
      return
    }

    // Check if this location already exists
    const existingLocation = this.uniqueLocations.get(location)
    const isNewLocation = !existingLocation
    const now = Date.now()

    console.log("📍 Location exists?", !!existingLocation, "isNew?", isNewLocation)

    if (existingLocation) {
      // Location already exists - cancel existing fade timeout and refresh it
      console.log("🔄 Updating existing location:", location)
      if (existingLocation.fadeTimeout) {
        clearTimeout(existingLocation.fadeTimeout)
      }

      // Reset timestamp and restart fade timer
      existingLocation.timestamp = now
      // Make it briefly more visible to show it's been updated
      // Preserve rotation angle from stored data
      const rotation = existingLocation.rotation || 0
      existingLocation.element.style.opacity = "1"
      existingLocation.element.style.transform = `scale(1.1) rotate(${rotation}deg)`
      setTimeout(() => {
        if (existingLocation.element.parentNode) {
          existingLocation.element.style.transform = `scale(1) rotate(${rotation}deg)`
        }
      }, 300)

      // Schedule new fade out after 10 seconds
      existingLocation.fadeTimeout = setTimeout(() => {
        this.fadeOutLocation(location, existingLocation.element)
      }, this.locationExpiryTime)

      return
    }

    // Create the element for a new unique location
    // Format: "Cheer from [location], [suffix]" (suffix is already included in location string)
    const element = document.createElement("div")
    element.className = "flying-location"
    element.textContent = `Cheer from ${location}`

    // Random rotation angle for visual variety (between -15 and +15 degrees for readability)
    const randomAngle = (Math.random() * 30) - 15 // -15 to +15 degrees

    // Check if mobile (viewport width < 768px)
    const isMobile = window.innerWidth < 768

    element.style.cssText = `
      position: absolute;
      font-size: ${isMobile ? '1rem' : '1.5rem'};
      font-weight: bold;
      color: white;
      text-shadow: 3px 3px 6px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5);
      ${isMobile ? 'white-space: normal; line-height: 1.2;' : 'white-space: nowrap;'}
      pointer-events: none;
      opacity: 0;
      transform: scale(0.5) rotate(${randomAngle}deg);
      background: rgba(0, 0, 0, 0.4);
      padding: ${isMobile ? '6px 10px' : '8px 16px'};
      border-radius: ${isMobile ? '12px' : '20px'};
      backdrop-filter: blur(4px);
      border: 2px solid rgba(255, 255, 255, 0.3);
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      width: ${isMobile ? 'auto' : 'auto'};
      max-width: ${isMobile ? '200px' : 'none'};
      min-width: fit-content;
      overflow: visible;
      text-align: center;
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

    console.log("✅ Adding element to container at position:", x, y, "text:", element.textContent)
    container.appendChild(element)

    // Store in unique locations map with timestamp and rotation angle
    const locationData = { element: element, timestamp: now, fadeTimeout: null, rotation: randomAngle }
    this.uniqueLocations.set(location, locationData)
    console.log("✅ Location added to uniqueLocations map. Total locations:", this.uniqueLocations.size)

    // Animate flying in with rotation
    requestAnimationFrame(() => {
      console.log("🎬 Animating element in")
      element.style.transition = "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)"
      element.style.opacity = "1"
      element.style.transform = `scale(1) rotate(${randomAngle}deg)`
      console.log("✅ Element should now be visible. Opacity:", element.style.opacity, "Transform:", element.style.transform)
    })

    // Schedule fade out after 10 seconds
    locationData.fadeTimeout = setTimeout(() => {
      this.fadeOutLocation(location, element)
    }, this.locationExpiryTime)
  }

  fadeOutLocation(location, element) {
    const locationData = this.uniqueLocations.get(location)
    if (!locationData || locationData.element !== element) {
      return // Location was already removed or refreshed
    }

    console.log("🌅 Fading out location:", location)

    // Fade out and remove
    element.style.transition = "all 1s ease-out"
    element.style.opacity = "0"
    element.style.transform = "scale(0.8) translateY(-20px)"

    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element)
      }
      this.uniqueLocations.delete(location)
      console.log("🗑️ Location removed:", location)
    }, 1000)
  }

  cleanupExpiredLocations() {
    // Periodically clean up expired locations (backup cleanup)
    const now = Date.now()
    for (const [location, data] of this.uniqueLocations.entries()) {
      const age = now - data.timestamp
      if (age >= this.locationExpiryTime) {
        // Cancel any existing timeout and fade out immediately
        if (data.fadeTimeout) {
          clearTimeout(data.fadeTimeout)
        }
        this.fadeOutLocation(location, data.element)
      }
    }
  }

  updateScore(newScore) {
    this.scoreValue = newScore
    this.localScore = newScore
    this.updateGauge(newScore)
  }

  updateGauge(targetScore) {
    // SIMPLIFIED: Always update immediately - no animations for perfect sync
    // This ensures all devices show the exact same score at the same time
    const gauge = this.element.querySelector(".gauge-fill")
    const scoreText = this.element.querySelector(".gauge-score")

    // Cancel any existing animations
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
    if (this.scoreAnimationInterval) {
      clearInterval(this.scoreAnimationInterval)
      this.scoreAnimationInterval = null
    }

    // Update local score immediately
    this.localScore = targetScore
    this.scoreValue = targetScore

    // Update gauge visual immediately - no transitions
    if (gauge) {
      const arcLength = 314.16
      const targetOffset = arcLength - (targetScore / 100) * arcLength

      // Calculate color
      const colorIntensity = targetScore / 100
      const lightColor = { r: 200, g: 250, b: 230 }
      const brightColor = { r: 16, g: 185, b: 129 }
      const r = Math.round(lightColor.r + (brightColor.r - lightColor.r) * colorIntensity)
      const g = Math.round(lightColor.g + (brightColor.g - lightColor.g) * colorIntensity)
      const b = Math.round(lightColor.b + (brightColor.b - lightColor.b) * colorIntensity)
      const color = `rgb(${r}, ${g}, ${b})`

      // Always update immediately - no transitions for sync accuracy
      gauge.style.transition = "none"
      gauge.style.strokeDashoffset = targetOffset
      gauge.style.stroke = color
      gauge.style.filter = `drop-shadow(0 0 10px rgba(${r}, ${g}, ${b}, 0.5))`
    }

    // Update score number immediately
    if (scoreText) {
      scoreText.textContent = Math.round(targetScore)
    }
  }

  scoreValueChanged() {
    this.updateGauge(this.scoreValue)
  }
}
