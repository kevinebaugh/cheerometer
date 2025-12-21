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

    // Periodically fetch the current score to handle score decay over time
    // Poll more frequently for smooth degradation
    this.scoreInterval = setInterval(() => {
      this.fetchCurrentScore()
    }, 500) // Update every 500ms for smooth degradation
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
    // Search from document since this.element is just the gauge container
    const list = document.querySelector(".recent-cheers-list")
    if (!list) {
      console.warn("⚠️ Recent cheers list not found in DOM")
      return
    }

    console.log("✅ Updating recent cheers list with", cheers.length, "cheers")
    console.log("✅ Cheers data:", JSON.stringify(cheers, null, 2))

    // Use the formatted location from the server (already formatted consistently)
    const html = cheers.map(cheer => {
      const location = cheer.formatted_location || "unknown location"
      console.log("✅ Rendering cheer with location:", location)
      return `<li class="text-gray-700">🎉 Cheer from ${location}!</li>`
    }).join("")

    console.log("✅ Generated HTML:", html)
    list.innerHTML = html
    console.log("✅ List updated, new innerHTML length:", list.innerHTML.length)
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
