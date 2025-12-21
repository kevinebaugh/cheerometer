import { Controller } from "@hotwired/stimulus"
import { createConsumer } from "@rails/actioncable"

export default class extends Controller {
  static values = {
    score: Number
  }

  connect() {
    this.consumer = createConsumer()
    this.subscription = this.consumer.subscriptions.create(
      { channel: "CheerometerChannel" },
      {
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
          }
          this.updateScore(data.score)
          if (data.recent_cheers) {
            this.updateRecentCheers(data.recent_cheers)
          }
        }
      }
    )
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
      console.warn("Recent cheers list not found")
      return
    }

    console.log("Updating recent cheers list with", cheers.length, "cheers")

    // Use the formatted location from the server (already formatted consistently)
    list.innerHTML = cheers.map(cheer => {
      return `<li class="text-gray-700">🎉 Cheer from ${cheer.formatted_location}!</li>`
    }).join("")
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
