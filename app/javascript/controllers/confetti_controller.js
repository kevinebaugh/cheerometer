import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    // Listen for cheer events
    this.element.addEventListener("cheer:celebrate", this.celebrate.bind(this))
  }

  disconnect() {
    this.element.removeEventListener("cheer:celebrate", this.celebrate.bind(this))
  }

  celebrate(event) {
    // Get score from event detail, default to 50 if not provided
    const score = event.detail?.score ?? 50
    this.createConfettiBurst(score)
  }

  createConfettiBurst(score) {
    const container = this.element

    // Minimal emojis until 100 is hit
    // At 100, show a big celebration
    let confettiCount
    if (score >= 100) {
      // Big celebration at 100!
      confettiCount = 100
    } else {
      // No emojis until 100 is reached - keep it minimal
      confettiCount = 0
    }

    // Batch creation to reduce setTimeout overhead
    const batchSize = 5
    let created = 0

    const createBatch = () => {
      const batchEnd = Math.min(created + batchSize, confettiCount)
      for (let i = created; i < batchEnd; i++) {
        this.createConfettiPiece(container)
      }
      created = batchEnd

      if (created < confettiCount) {
        setTimeout(createBatch, 50) // Create next batch after 50ms
      }
    }

    createBatch()
  }

  createConfettiPiece(container) {
    const piece = document.createElement("div")
    const types = ["❄️", "✨", "🎉", "⭐", "💫"]
    const type = types[Math.floor(Math.random() * types.length)]

    // Use CSS variables and transform for better performance
    const startX = Math.random() * 100
    const rotation = Math.random() * 360
    const duration = 3 + Math.random() * 4
    const endRotation = rotation + 360 + Math.random() * 360

    piece.textContent = type
    piece.style.cssText = `
      position: absolute;
      font-size: ${20 + Math.random() * 20}px;
      left: ${startX}%;
      top: -20px;
      pointer-events: none;
      opacity: ${0.6 + Math.random() * 0.4};
      will-change: transform, opacity;
      transform: translateZ(0) rotate(${rotation}deg);
      z-index: 0;
    `

    // Add animation keyframes if not already added (only once)
    if (!document.getElementById("confetti-styles")) {
      const style = document.createElement("style")
      style.id = "confetti-styles"
      style.textContent = `
        @keyframes confetti-fall {
          to {
            transform: translateY(100vh) translateZ(0) rotate(720deg);
            opacity: 0;
          }
        }
      `
      document.head.appendChild(style)
    }

    container.appendChild(piece)

    // Use CSS animation instead of JavaScript for better performance
    piece.style.animation = `confetti-fall ${duration}s linear forwards`

    // Remove after animation completes (use animationend event for accuracy)
    const removePiece = () => {
      if (piece.parentNode) {
        piece.parentNode.removeChild(piece)
      }
      piece.removeEventListener('animationend', removePiece)
    }
    piece.addEventListener('animationend', removePiece)

    // Fallback timeout in case animationend doesn't fire
    setTimeout(() => {
      if (piece.parentNode) {
        piece.parentNode.removeChild(piece)
      }
      piece.removeEventListener('animationend', removePiece)
    }, (duration * 1000) + 100)
  }
}
